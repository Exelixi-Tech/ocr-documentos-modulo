/**
 * Rutas del modulo OCR.
 *
 * Solo expone los endpoints relacionados con la lectura de documentos.
 * No tiene dependencias con otros modulos: el response es un contrato
 * estable que el frontend transforma en un mensaje de bus si se desea.
 */
const express = require('express');
const fs      = require('fs/promises');
const crypto  = require('crypto');
const multer  = require('multer');
const path    = require('path');
const sharp   = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { validateDocument, runOcr, VALID_DOC_TYPES } = require('../services/documentService');
const expedienteFs = require('../lib/expedienteFs');

const router = express.Router();

function resolveEmpresaNombre(req) {
  const fromReq = req.empresa?.nombre;
  const fromBody = req.body?.empresaNombre;
  const fallback = process.env.EXPEDIENTE_EMPRESA_FALLBACK || '';
  return expedienteFs.sanitizeFolderName(
    fromReq || fromBody || fallback,
    req.empresa?.id ? `empresa-${req.empresa.id}` : 'empresa-sin-nombre',
  );
}

function cedulaFromOcrFields(fields) {
  if (!fields || typeof fields !== 'object') return '';
  return expedienteFs.sanitizeCedula(
    fields.identificacion ?? fields.cedula ?? fields.numeroDocumento ?? fields.rif,
  );
}

// Temporal: multer deja el archivo en _tmp; luego placePending lo mueve al expediente.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(expedienteFs.uploadRoot(), '_tmp');
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const fileFilter = (_req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/heic', 'image/heif',
    'application/pdf',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Usa JPG, PNG, HEIC o PDF.`));
};

const upload = multer({
  storage, fileFilter,
  limits: { fileSize: parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) * 1024 * 1024 || 25 * 1024 * 1024 },
});

// ── Normalizacion de imagen para OCR optimo ─────────────────────────────
async function normalizeImage(filePath, mimetype) {
  const HEIC = ['image/heic', 'image/heif'];
  const IMG  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', ...HEIC];
  if (!IMG.includes(mimetype)) return { filePath, mimetype };

  const out = filePath.replace(/(\.[^.]+)?$/, '_norm.webp');
  await sharp(filePath)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .normalise()
    .sharpen({ sigma: 0.6 })
    .webp({ quality: 80, effort: 6 })
    .toFile(out);

  if (filePath !== out) await fs.unlink(filePath).catch(() => {});
  return { filePath: out, mimetype: 'image/webp' };
}

async function discardUpload(...paths) {
  for (const p of paths) {
    if (!p) continue;
    try { await fs.unlink(p); } catch { /* ya no está */ }
  }
}

/**
 * @openapi
 * /api/documents/upload:
 *   post:
 *     tags: [Documentos]
 *     summary: Sube y analiza un documento con OCR
 *     description: |
 *       Recibe un archivo de imagen o PDF, lo normaliza (escala, contraste, orientación)
 *       y extrae los campos mediante Google Gemini 2.5 Pro.
 *
 *       **Tipos de documento soportados:**
 *       - `cedula` — Cédula de identidad venezolana (V / E)
 *       - `licencia` — Licencia de conducir
 *       - `certificado` — Certificado de circulación del vehículo
 *       - `rif` — RIF (persona natural o jurídica)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, docType]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Imagen (JPG, PNG, WEBP, HEIC) o PDF. Máx 25 MB.
 *               docType:
 *                 type: string
 *                 enum: [cedula, licencia, certificado, rif]
 *                 description: Tipo de documento que se está subiendo
 *     responses:
 *       200:
 *         description: Documento procesado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:     { type: boolean, example: true }
 *                 message:     { type: string, example: 'Documento procesado exitosamente.' }
 *                 docType:     { type: string, example: 'cedula' }
 *                 file:
 *                   $ref: '#/components/schemas/DocumentFile'
 *                 ocr:
 *                   $ref: '#/components/schemas/OcrResult'
 *                 ocrProvider: { type: string, example: 'gemini' }
 *                 ocrFailed:   { type: boolean, description: 'true si el OCR no pudo leer el documento' }
 *       400:
 *         description: Parámetros faltantes o inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       413:
 *         description: Archivo demasiado grande (supera 25 MB)
 *       422:
 *         description: El documento no coincide con el tipo declarado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:       { type: boolean, example: false }
 *                 code:          { type: string, example: 'DOC_TYPE_MISMATCH' }
 *                 message:       { type: string }
 *                 expected:      { type: string, example: 'cedula' }
 *                 detected:      { type: string, example: 'licencia' }
 *                 expectedLabel: { type: string, example: 'Cédula de identidad' }
 *                 detectedLabel: { type: string, example: 'Licencia de conducir' }
 *       503:
 *         description: Gemini no respondió (red, cuota o cadena agotada). El archivo no se guarda.
 *       500:
 *         description: Error interno del servidor
 */
router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibio ningun archivo.' });

    const { docType } = req.body;
    if (!docType) return res.status(400).json({ success: false, message: 'El campo docType es requerido.' });
    if (!VALID_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ success: false, message: `Tipo invalido: ${docType}` });
    }

    const normalized = await normalizeImage(req.file.path, req.file.mimetype);
    const file = { ...req.file, path: normalized.filePath, mimetype: normalized.mimetype };

    const validation = validateDocument(file, docType);
    if (!validation.valid) return res.status(422).json({ success: false, message: validation.message });

    const tarjetaHints = {
      cplan: req.body?.tarjetaCplan,
      cproducto: req.body?.tarjetaCproducto,
      nombreProducto: req.body?.tarjetaNombreProducto,
    };

    const ocrResult = await runOcr(file, docType, tarjetaHints);

    let fileHash = null;
    try {
      const buf = await fs.readFile(normalized.filePath);
      fileHash = crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
      /* hash opcional */
    }

    if (ocrResult.mismatch) {
      await discardUpload(normalized.filePath, req.file.path);
      return res.status(422).json({
        success: false,
        code: 'DOC_TYPE_MISMATCH',
        message: ocrResult.mismatch.message,
        expected: ocrResult.mismatch.expected,
        detected: ocrResult.mismatch.detected,
        expectedLabel: ocrResult.mismatch.expectedLabel,
        detectedLabel: ocrResult.mismatch.detectedLabel,
        ocrProvider: ocrResult.provider,
        ...(ocrResult.meta ? { ocrMeta: ocrResult.meta } : {}),
      });
    }

    if (ocrResult.planMismatch) {
      await discardUpload(normalized.filePath, req.file.path);
      return res.status(422).json({
        success: false,
        code: 'PLAN_VEHICLE_MISMATCH',
        message: ocrResult.planMismatch.message,
        planKind: ocrResult.planMismatch.planKind,
        ocrProvider: ocrResult.provider,
        ...(ocrResult.meta ? { ocrMeta: ocrResult.meta } : {}),
      });
    }

    if (ocrResult.ocrFailed) {
      await discardUpload(normalized.filePath, req.file.path);
      return res.status(503).json({
        success: false,
        code: 'OCR_PROVIDER_FAILED',
        message: 'No pudimos leer el documento. Revisa la conexión e inténtalo de nuevo.',
        ocrFailed: true,
        ocrProvider: ocrResult.provider,
        ...(ocrResult.error ? { ocrError: ocrResult.error } : {}),
        ...(ocrResult.meta ? { ocrMeta: ocrResult.meta } : {}),
      });
    }

    const empresaNombre = resolveEmpresaNombre(req);
    const cedula = expedienteFs.sanitizeCedula(req.body?.cedulaTitular)
      || cedulaFromOcrFields(ocrResult.fields);
    const placed = await expedienteFs.placePending(normalized.filePath, {
      empresaNombre,
      cedula,
      docType,
    });
    const carnetBinacional =
      docType === 'certificado'
      && ocrResult.fields?.tipoCarnet === 'binacional'
      && ocrResult.fields?.tipoPlaca === 'binacional';
    return res.status(200).json({
      success: true,
      message: 'Documento procesado exitosamente.',
      docType,
      file: {
        id: uuidv4(),
        name: req.file.originalname,
        size: req.file.size,
        mimeType: normalized.mimetype,
        url: placed.url,
      },
      ocr: ocrResult.fields,
      ocrProvider: ocrResult.provider,
      ...(fileHash ? { hash: fileHash, metadata: { docType, hash: fileHash, uploadedAt: new Date().toISOString() } } : {}),
      ...(carnetBinacional ? { carnetBinacional: true } : {}),
      ...(ocrResult.meta ? { ocrMeta: ocrResult.meta } : {}),
    });
  } catch (err) {
    console.error('[modulo-ocr/upload] error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Error interno.' });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Archivo supera el limite permitido.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  return res.status(400).json({ success: false, message: err.message });
});

module.exports = router;
