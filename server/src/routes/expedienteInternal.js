/**
 * Commit de expediente llamado por emision-api (localhost).
 * No usa nexusAuth: el token de emisión es de otro submódulo.
 */
const express = require('express');
const expedienteFs = require('../lib/expedienteFs');

const router = express.Router();

function isLoopback(req) {
  const ip = String(req.socket?.remoteAddress || req.ip || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function allowInternal(req) {
  const key = process.env.EXPEDIENTE_INTERNAL_KEY || '';
  if (key && req.headers['x-expediente-key'] === key) return true;
  return isLoopback(req);
}

function resolveEmpresaNombre(req, body) {
  return expedienteFs.sanitizeFolderName(
    body.empresaNombre || process.env.EXPEDIENTE_EMPRESA_FALLBACK,
    'empresa-sin-nombre',
  );
}

router.post('/', (req, res, next) => {
  if (!allowInternal(req)) {
    return res.status(403).json({
      success: false,
      code: 'EXPEDIENTE_FORBIDDEN',
      message: 'Commit de expediente solo desde emision-api (localhost).',
    });
  }
  return next();
}, async (req, res) => {
  try {
    const body = req.body || {};
    const empresaNombre = resolveEmpresaNombre(req, body);
    const cedula = expedienteFs.sanitizeCedula(body.cedula);
    const nomenclatura = body.nomenclatura || expedienteFs.buildNomenclatura(body);
    const result = await expedienteFs.commitExpediente({
      empresaNombre,
      cedula,
      nomenclatura,
      files: body.files,
    });
    console.log(
      `[modulo-ocr/expediente] ${empresaNombre}/${cedula}/${nomenclatura} saved=${result.saved.length} skipped=${result.skipped}`,
    );
    return res.status(200).json({
      success: true,
      destDir: result.destDir,
      nomenclatura,
      saved: result.saved,
      skipped: result.skipped,
    });
  } catch (err) {
    const code = err.code || 'EXPEDIENTE_COMMIT_ERROR';
    const status = code === 'EXPEDIENTE_CEDULA_REQUIRED' ? 400 : 500;
    console.error('[modulo-ocr/commit-expediente]', err.message || err);
    return res.status(status).json({
      success: false,
      code,
      message: err.message || 'No se pudo archivar el expediente.',
    });
  }
});

module.exports = router;
