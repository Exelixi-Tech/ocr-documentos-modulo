/**
 * Monitor de expedientes Marketplace — carga interna de un documento al expediente de una póliza
 * ya emitida (Nexus reenvía lo que sube el asegurado por su enlace o el vendedor desde el monitor).
 *
 * POST /api/internal/expedientes/documento  (multipart: file, tipo, cnpoliza, cnrecibo, documento, empresaId)
 *   - Solo servidor a servidor: header x-expediente-key = EXPEDIENTE_INTERNAL_KEY (sin variable → 503).
 *   - Misma validación que /api/documents/upload: tipo, MIME y tamaño (UPLOAD_MAX_SIZE_MB, 25 MB por defecto).
 *   - Guarda en {empresa}/{cédula}/{recibo-aa-mes-póliza}/ o, si esa carpeta no existe, en
 *     {empresa}/{cédula}/pendiente/. Nunca borra ni pisa archivos del expediente.
 *   - Ejecuta la extracción OCR existente y responde { ok, ref, ocr: { extraido, confianza } }.
 *     Recibir un archivo no lo valida: la comparación con la póliza la hace Nexus.
 *
 * No usa nexusAuth (lo llama Nexus, no el navegador). No loguea datos personales.
 */
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const documentService = require('../services/documentService');
const expedienteFs = require('../lib/expedienteFs');
const { uploadPipeline } = require('./ocr');

const router = express.Router();

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest();
}

/** x-expediente-key obligatorio; sin EXPEDIENTE_INTERNAL_KEY el endpoint queda apagado (503). */
function requireInternalKey(req, res, next) {
  const key = String(process.env.EXPEDIENTE_INTERNAL_KEY || '').trim();
  if (!key) {
    return res.status(503).json({
      ok: false,
      code: 'EXPEDIENTE_KEY_NO_CONFIGURADA',
      message: 'Carga interna de expedientes deshabilitada (falta EXPEDIENTE_INTERNAL_KEY).',
    });
  }
  const got = String(req.headers['x-expediente-key'] || '');
  if (!got || !crypto.timingSafeEqual(sha256(got), sha256(key))) {
    return res.status(401).json({ ok: false, code: 'EXPEDIENTE_KEY_INVALIDA', message: 'Clave interna inválida.' });
  }
  return next();
}

/** Multer de /documents/upload con respuesta propia de este endpoint. */
function receiveFile(req, res, next) {
  uploadPipeline.upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, code: 'ARCHIVO_MUY_GRANDE', message: 'Archivo supera el límite permitido.' });
    }
    return res.status(400).json({ ok: false, code: 'ARCHIVO_INVALIDO', message: err.message });
  });
}

/**
 * Carpetas de empresa donde buscar el expediente, en orden: nombre explícito (opcional),
 * EXPEDIENTE_EMPRESA_FALLBACK (mismo default que nexusAuth) y empresa-<id>.
 */
function empresaCandidates(body) {
  const id = String(body.empresaId ?? '').replace(/\D/g, '');
  const raw = [
    body.empresaNombre,
    process.env.EXPEDIENTE_EMPRESA_FALLBACK || 'La Mundial de Seguros',
    id ? `empresa-${id}` : '',
  ];
  const out = [];
  for (const r of raw) {
    const name = expedienteFs.sanitizeFolderName(r, '');
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Sin carpeta de póliza: pendiente/ en la primera empresa donde ya exista la cédula. */
function pendienteDir(empresas, cedula) {
  const empresa = empresas.find((e) => fs.existsSync(expedienteFs.expedienteDir(e, cedula))) || empresas[0];
  return expedienteFs.expedienteDir(empresa, cedula, 'pendiente');
}

/**
 * Extracción OCR existente (documentService.runOcr) resumida para Nexus.
 * confianza: 1 = Gemini leyó los campos críticos y el tipo coincide;
 *            0.5 = lectura parcial (faltan campos críticos o tipo dudoso aceptado);
 *            0 = sin lectura útil (tipo no coincide, OCR caído u OCR simulado).
 */
async function extraer(file, tipo, opts) {
  try {
    const r = await documentService.runOcr(file, tipo, null, opts);
    const proveedor = r?.provider || null;
    const rechazo = r?.mismatch || r?.planMismatch || r?.facturaInvalida;
    if (rechazo) return { extraido: null, confianza: 0, motivo: rechazo.message || 'El documento no coincide con el tipo.', proveedor };
    if (r?.ocrFailed) return { extraido: null, confianza: 0, motivo: 'No se pudo leer el documento (OCR no disponible).', proveedor };
    if (proveedor !== 'gemini') return { extraido: null, confianza: 0, motivo: 'OCR simulado: sin lectura real.', proveedor };
    const attempts = Array.isArray(r.meta?.chainAttempts) ? r.meta.chainAttempts : [];
    const last = attempts[attempts.length - 1];
    const confianza = last && last.criticalOk === false ? 0.5 : 1;
    return { extraido: r.fields || null, confianza, proveedor };
  } catch {
    return { extraido: null, confianza: 0, motivo: 'Error al leer el documento.', proveedor: null };
  }
}

/**
 * @openapi
 * /api/internal/expedientes/documento:
 *   post:
 *     tags: [Documentos]
 *     summary: (Interno) Carga un documento al expediente de una póliza emitida
 *     description: |
 *       Servidor a servidor (Nexus → OCR). Requiere `x-expediente-key` = `EXPEDIENTE_INTERNAL_KEY`.
 *       Guarda sin pisar archivos en la carpeta de la póliza (o `pendiente/`) y devuelve la lectura OCR.
 *     parameters:
 *       - in: header
 *         name: x-expediente-key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, tipo, cnpoliza, documento]
 *             properties:
 *               file:      { type: string, format: binary, description: 'JPG, PNG, WEBP, HEIC o PDF. Máx 25 MB.' }
 *               tipo:      { type: string, enum: [cedula, licencia, certificado, rif, pasaporte, factura] }
 *               cnpoliza:  { type: string }
 *               cnrecibo:  { type: string }
 *               documento: { type: string, description: 'Cédula del titular (carpeta del expediente).' }
 *               empresaId: { type: string }
 *     responses:
 *       200:
 *         description: 'Guardado. { ok, ref, ubicacion: poliza|pendiente, ocr: { extraido, confianza, motivo? } }'
 *       400: { description: Datos faltantes, tipo o MIME inválido }
 *       401: { description: Clave interna inválida }
 *       413: { description: Archivo supera el límite }
 *       422: { description: Archivo vacío o formato no soportado }
 *       503: { description: EXPEDIENTE_INTERNAL_KEY no configurada }
 */
router.post('/documento', requireInternalKey, receiveFile, async (req, res) => {
  const temporales = [];
  const descartar = () => uploadPipeline.discardUpload(...temporales);
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, code: 'SIN_ARCHIVO', message: 'No se recibió ningún archivo.' });
    }
    temporales.push(req.file.path);
    const body = req.body || {};

    const tipo = String(body.tipo || '').trim();
    if (!documentService.VALID_DOC_TYPES.includes(tipo)) {
      await descartar();
      return res.status(400).json({ ok: false, code: 'TIPO_INVALIDO', message: `Tipo inválido: ${tipo || '(vacío)'}` });
    }
    const cnpoliza = String(body.cnpoliza || '').replace(/\D/g, '');
    const documento = expedienteFs.sanitizeCedula(body.documento);
    if (!cnpoliza || !documento) {
      await descartar();
      return res.status(400).json({
        ok: false,
        code: 'DATOS_FALTANTES',
        message: 'Se requieren cnpoliza y documento (cédula del titular).',
      });
    }

    const normalized = await uploadPipeline.normalizeImage(req.file.path, req.file.mimetype);
    temporales.push(normalized.filePath);
    const file = { ...req.file, path: normalized.filePath, mimetype: normalized.mimetype };
    const validation = documentService.validateDocument(file, tipo);
    if (!validation.valid) {
      await descartar();
      return res.status(422).json({ ok: false, code: 'ARCHIVO_INVALIDO', message: validation.message });
    }

    const empresas = empresaCandidates(body);
    const polizaDir = expedienteFs.findPolicyDir(empresas, documento, cnpoliza, body.cnrecibo);
    const destDir = polizaDir || pendienteDir(empresas, documento);
    const placed = await expedienteFs.placeNoOverwrite(normalized.filePath, destDir, tipo);
    const ref = path.relative(expedienteFs.uploadRoot(), placed.absPath).split(path.sep).join('/');
    const ubicacion = polizaDir ? 'poliza' : 'pendiente';

    // El archivo ya quedó guardado: si el OCR falla, Nexus lo marca observado con el motivo.
    const ocr = await extraer({ ...file, path: placed.absPath }, tipo, {
      aceptaRif: String(body.aceptaRif ?? '') === '1',
      rifSoloNatural: String(body.rifSoloNatural ?? '') === '1',
    });
    console.log(
      `[modulo-ocr/expediente-documento] tipo=${tipo} ubicacion=${ubicacion} proveedor=${ocr.proveedor || '-'} confianza=${ocr.confianza}`,
    );
    return res.status(200).json({ ok: true, ref, ubicacion, ocr });
  } catch (err) {
    await descartar();
    // Solo el código: los mensajes de fs traen rutas con la cédula.
    console.error('[modulo-ocr/expediente-documento] error:', err?.code || err?.name || 'Error');
    return res.status(500).json({ ok: false, code: 'EXPEDIENTE_DOCUMENTO_ERROR', message: 'No se pudo guardar el documento.' });
  }
});

module.exports = router;
module.exports._internal = { empresaCandidates, extraer };
