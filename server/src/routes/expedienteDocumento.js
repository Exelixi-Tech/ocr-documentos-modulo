/**
 * Monitor de expedientes Marketplace — carga interna de un documento al expediente de una póliza
 * ya emitida (Nexus reenvía lo que sube el asegurado por su enlace o el vendedor desde el monitor).
 *
 * POST /api/internal/expedientes/documento  (multipart: file, tipo, cnpoliza, cnrecibo, documento, empresaId)
 *   - Solo servidor a servidor: header x-expediente-key = EXPEDIENTE_INTERNAL_KEY (sin variable → 503).
 *   - Misma validación que /api/documents/upload: tipo, MIME y tamaño (UPLOAD_MAX_SIZE_MB, 25 MB por defecto).
 *   - Guarda en {empresa}/{cédula}/{recibo-aa-mes-póliza}/ o, si esa carpeta no existe, en
 *     {empresa}/{cédula}/pendiente/. Nunca borra ni pisa archivos del expediente.
 *   - Ejecuta la extracción OCR existente y responde { ok, ref, hash, ocr: { extraido, confianza } }.
 *     Recibir un archivo no lo valida: la comparación con la póliza la hace Nexus.
 *
 * POST /api/internal/expedientes/analizar  (JSON: { ref, tipo, aceptaRif? })
 *   - Validación automática con IA: lee un archivo YA guardado en EXPEDIENTES_ROOT/ref (sin path
 *     traversal), ejecuta la misma extracción OCR y responde { ok, ref, hash, ocr }.
 *     No copia, no mueve y no borra nada.
 *
 * POST /api/internal/expedientes/localizar  (JSON: { cnpoliza, cnrecibo?, cedulas: string[] })
 *   - Conciliación de pólizas registradas sin datos del expediente: busca la carpeta de la póliza
 *     (número exacto; luego últimos 8 dígitos si es única) o {cédula}/pendiente y responde
 *     { ok, ubicacion: poliza|pendiente|null, carpeta, documentos: { [clave]: ref } }. Solo lectura.
 *
 * ocr.falla (opcional): 'tecnica' = no hubo lectura real (Gemini caído, OCR simulado, formato no
 * soportado por el proveedor); 'tipo_documento' = el documento no es del tipo pedido.
 *
 * No usa nexusAuth (lo llama Nexus, no el navegador). No loguea datos personales.
 */
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const documentService = require('../services/documentService');
const gemini = require('../services/geminiProvider');
const expedienteFs = require('../lib/expedienteFs');
const { uploadPipeline } = require('./ocr');

const router = express.Router();

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest();
}

/** SHA-256 (hex) del contenido de un archivo, por flujo. */
function hashArchivo(absPath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(absPath)
      .on('error', reject)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * Tipo de requisito del expediente → esquema OCR. El pasaporte y las cédulas de titular o
 * beneficiario se leen con el esquema de cédula (el OCR acepta pasaporte en ese slot: MRZ).
 */
const TIPO_OCR = {
  pasaporte: 'cedula',
  cedula_titular: 'cedula',
  cedula_beneficiario: 'cedula',
};

function tipoOcrDe(tipo) {
  return TIPO_OCR[tipo] || tipo;
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
 * Auditoría: qué modelo de Gemini leyó (modelo) y qué se intentó en la cadena (modelos).
 * Solo con lectura real de Gemini (meta.model) o con la cadena agotada (ocrFailed + intentos).
 */
function auditoriaModelo(r) {
  const meta = r && typeof r.meta === 'object' && r.meta ? r.meta : null;
  if (!meta) return {};
  const intentos = Array.isArray(meta.chainAttempts) ? meta.chainAttempts : [];
  const conModelo = typeof meta.model === 'string' && meta.model;
  if (!conModelo && !(r.ocrFailed && intentos.length)) return {};
  const out = {};
  if (conModelo) out.modelo = meta.model;
  const modelos = intentos
    .filter((a) => a && typeof a.model === 'string')
    .map((a) => ({
      modelo: a.model,
      resultado: a.error ? 'error' : a.criticalOk === false ? 'parcial' : 'ok',
    }));
  if (modelos.length) out.modelos = modelos;
  return out;
}

/**
 * Extracción OCR existente (documentService.runOcr) resumida para Nexus.
 * Monitor de expedientes: cadena de modelos PROPIA (GEMINI_MODELS_EXPEDIENTES; default
 * gemini-3.1-pro-preview → gemini-3.6-flash). El escaneo de emisión no cambia.
 * confianza: 1 = Gemini leyó los campos críticos y el tipo coincide;
 *            0.5 = lectura parcial (faltan campos críticos o tipo dudoso aceptado);
 *            0 = sin lectura útil (tipo no coincide, OCR caído u OCR simulado).
 * falla: 'tecnica' (sin lectura real: Nexus reintenta, no lo marca ilegible) |
 *        'tipo_documento' (el archivo no es del tipo pedido).
 */
async function extraer(file, tipo, opts) {
  try {
    const r = await documentService.runOcr(file, tipoOcrDe(tipo), null, {
      ...opts,
      modelChain: gemini.getExpedientesModelChain(),
    });
    const proveedor = r?.provider || null;
    const audit = auditoriaModelo(r);
    const rechazo = r?.mismatch || r?.planMismatch || r?.facturaInvalida;
    if (rechazo) {
      return {
        extraido: null,
        confianza: 0,
        motivo: rechazo.message || 'El documento no coincide con el tipo.',
        proveedor,
        falla: 'tipo_documento',
        ...audit,
      };
    }
    if (r?.ocrFailed) {
      return { extraido: null, confianza: 0, motivo: 'No se pudo leer el documento (OCR no disponible).', proveedor, falla: 'tecnica', ...audit };
    }
    if (proveedor !== 'gemini') {
      return { extraido: null, confianza: 0, motivo: 'OCR simulado: sin lectura real.', proveedor, falla: 'tecnica' };
    }
    const attempts = Array.isArray(r.meta?.chainAttempts) ? r.meta.chainAttempts : [];
    const last = attempts[attempts.length - 1];
    const confianza = last && last.criticalOk === false ? 0.5 : 1;
    return { extraido: r.fields || null, confianza, proveedor, ...audit };
  } catch {
    return { extraido: null, confianza: 0, motivo: 'Error al leer el documento.', proveedor: null, falla: 'tecnica' };
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
    const hash = await hashArchivo(placed.absPath).catch(() => null);
    console.log(
      `[modulo-ocr/expediente-documento] tipo=${tipo} ubicacion=${ubicacion} proveedor=${ocr.proveedor || '-'} modelo=${ocr.modelo || '-'} confianza=${ocr.confianza} falla=${ocr.falla || '-'}`,
    );
    return res.status(200).json({ ok: true, ref, hash, ubicacion, ocr });
  } catch (err) {
    await descartar();
    // Solo el código: los mensajes de fs traen rutas con la cédula.
    console.error('[modulo-ocr/expediente-documento] error:', err?.code || err?.name || 'Error');
    return res.status(500).json({ ok: false, code: 'EXPEDIENTE_DOCUMENTO_ERROR', message: 'No se pudo guardar el documento.' });
  }
});

/**
 * @openapi
 * /api/internal/expedientes/analizar:
 *   post:
 *     tags: [Documentos]
 *     summary: (Interno) Analiza con OCR un documento ya guardado en el expediente
 *     description: |
 *       Servidor a servidor (Nexus → OCR), para la validación automática con IA del monitor de
 *       expedientes. Requiere `x-expediente-key` = `EXPEDIENTE_INTERNAL_KEY`. Lee el archivo en
 *       `EXPEDIENTES_ROOT/ref` (ruta relativa o URL /files/...; nunca fuera de EXPEDIENTES_ROOT),
 *       ejecuta la misma extracción OCR que la carga y devuelve la lectura con el SHA-256 del archivo.
 *       No copia, no mueve ni borra nada.
 *     parameters:
 *       - in: header
 *         name: x-expediente-key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ref, tipo]
 *             properties:
 *               ref:       { type: string, description: 'Ruta relativa a EXPEDIENTES_ROOT o URL /files/...' }
 *               tipo:      { type: string, enum: [cedula, cedula_titular, cedula_beneficiario, licencia, certificado, rif, pasaporte, factura] }
 *               aceptaRif: { type: boolean, description: 'Cédula o RIF en el mismo documento (patrimoniales).' }
 *     responses:
 *       200:
 *         description: '{ ok, ref, hash, ocr: { extraido, confianza (0-1), motivo?, proveedor, falla?, modelo?, modelos? } }'
 *       400: { description: 'Tipo inválido o ref inválido / fuera de EXPEDIENTES_ROOT' }
 *       401: { description: Clave interna inválida }
 *       404: { description: El archivo no existe }
 *       503: { description: EXPEDIENTE_INTERNAL_KEY no configurada }
 */
router.post('/analizar', requireInternalKey, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tipo = String(body.tipo || '').trim();
    if (!documentService.VALID_DOC_TYPES.includes(tipoOcrDe(tipo))) {
      return res.status(400).json({ ok: false, code: 'TIPO_INVALIDO', message: `Tipo inválido: ${tipo || '(vacío)'}` });
    }
    const ref = typeof body.ref === 'string' ? body.ref.trim() : '';
    if (!ref) {
      return res.status(400).json({ ok: false, code: 'REF_REQUERIDA', message: 'Indique ref (ruta del documento).' });
    }
    const abs = expedienteFs.resolveExpedienteRef(ref);
    if (!abs) {
      return res.status(400).json({
        ok: false,
        code: 'REF_INVALIDA',
        message: 'La ruta del documento no es válida o queda fuera de los expedientes.',
      });
    }
    const st = await fs.promises.stat(abs).catch(() => null);
    if (!st || !st.isFile()) {
      return res.status(404).json({ ok: false, code: 'ARCHIVO_NO_ENCONTRADO', message: 'El documento no existe en el expediente.' });
    }

    const hash = await hashArchivo(abs);
    const mimetype = expedienteFs.mimeFromPath(abs);
    const file = { path: abs, mimetype, size: st.size, originalname: path.basename(abs) };
    let ocr;
    const validation = mimetype ? documentService.validateDocument(file, tipoOcrDe(tipo)) : { valid: false };
    if (!mimetype) {
      ocr = { extraido: null, confianza: 0, motivo: 'Formato de archivo no soportado por el OCR.', proveedor: null, falla: 'tecnica' };
    } else if (!validation.valid) {
      // Archivo vacío o casi vacío: no hay nada que leer (Nexus lo marca ilegible).
      ocr = { extraido: null, confianza: 0, motivo: validation.message || 'Archivo vacío o dañado.', proveedor: null };
    } else {
      ocr = await extraer(file, tipo, { aceptaRif: body.aceptaRif === true || String(body.aceptaRif ?? '') === '1' });
    }
    console.log(
      `[modulo-ocr/expediente-analizar] tipo=${tipo} proveedor=${ocr.proveedor || '-'} modelo=${ocr.modelo || '-'} confianza=${ocr.confianza} falla=${ocr.falla || '-'}`,
    );
    return res.status(200).json({ ok: true, ref, hash, ocr });
  } catch (err) {
    // Solo el código: los mensajes de fs traen rutas con la cédula.
    console.error('[modulo-ocr/expediente-analizar] error:', err?.code || err?.name || 'Error');
    return res.status(500).json({ ok: false, code: 'EXPEDIENTE_ANALISIS_ERROR', message: 'No se pudo analizar el documento.' });
  }
});

/**
 * @openapi
 * /api/internal/expedientes/localizar:
 *   post:
 *     tags: [Documentos]
 *     summary: (Interno) Localiza los documentos que el OCR guardó para una póliza
 *     description: |
 *       Servidor a servidor (Nexus → OCR), para la conciliación del monitor de expedientes con
 *       pólizas registradas sin datos del expediente. Requiere `x-expediente-key`.
 *       Busca la carpeta de la póliza (`{empresa}/{cédula}/{recibo-aa-mes-póliza}`: número exacto,
 *       luego últimos 8 dígitos si es única; después número exacto bajo otra cédula si es única)
 *       y, si no existe, `{empresa}/{cédula}/pendiente`. Solo lectura: no copia, no mueve ni borra.
 *     parameters:
 *       - in: header
 *         name: x-expediente-key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cnpoliza]
 *             properties:
 *               cnpoliza:      { type: string }
 *               cnrecibo:      { type: string }
 *               cedulas:       { type: array, items: { type: string } }
 *               empresaId:     { type: string }
 *               empresaNombre: { type: string }
 *     responses:
 *       200:
 *         description: '{ ok, ubicacion: poliza|pendiente|null, carpeta, documentos: { [clave]: ref } } (ref relativo a EXPEDIENTES_ROOT)'
 *       400: { description: Falta cnpoliza }
 *       401: { description: Clave interna inválida }
 *       503: { description: EXPEDIENTE_INTERNAL_KEY no configurada }
 */
router.post('/localizar', requireInternalKey, express.json({ limit: '16kb' }), (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const escalar = (v) => (typeof v === 'string' || typeof v === 'number' ? v : '');
    const cnpoliza = String(escalar(body.cnpoliza)).replace(/\D/g, '').slice(0, 30);
    if (!cnpoliza) {
      return res.status(400).json({ ok: false, code: 'DATOS_FALTANTES', message: 'Indique cnpoliza.' });
    }
    const cedulas = (Array.isArray(body.cedulas) ? body.cedulas : [])
      .slice(0, 10)
      .map((c) => expedienteFs.sanitizeCedula(escalar(c)))
      .filter(Boolean);
    const r = expedienteFs.localizarExpediente({
      cnpoliza,
      cnrecibo: escalar(body.cnrecibo),
      cedulas,
      empresas: empresaCandidates(body),
    });
    // Sin póliza, cédula ni rutas en el log.
    console.log(
      `[modulo-ocr/expediente-localizar] ubicacion=${r.ubicacion || '-'} documentos=${Object.keys(r.documentos).length}`,
    );
    return res.status(200).json({ ok: true, ...r });
  } catch (err) {
    console.error('[modulo-ocr/expediente-localizar] error:', err?.code || err?.name || 'Error');
    return res.status(500).json({
      ok: false,
      code: 'EXPEDIENTE_LOCALIZAR_ERROR',
      message: 'No se pudo localizar el expediente.',
    });
  }
});

module.exports = router;
module.exports._internal = { auditoriaModelo, empresaCandidates, extraer, tipoOcrDe };
