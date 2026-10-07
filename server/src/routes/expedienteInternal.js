/**
 * Commit de expediente llamado por emision-api (localhost).
 * No usa nexusAuth: el token de emisión es de otro submódulo.
 */
const express = require('express');
const fsp = require('fs/promises');
const path = require('path');
const expedienteFs = require('../lib/expedienteFs');

/** Link público del archivo: EXPEDIENTE_PUBLIC_BASE (ej. https://nexusqa.exelixitech.com/ocr) + /files/... */
function publicLink(absPath) {
  const base = String(process.env.EXPEDIENTE_PUBLIC_BASE || '').trim().replace(/\/$/, '');
  return `${base}${expedienteFs.publicFileUrl(absPath)}`;
}

/** Quita vacíos del bloque de links de la emisión. */
function cleanLinks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const s = String(v ?? '').trim();
    if (s) out[k] = s;
  }
  return out;
}

/**
 * documentos.json en la carpeta del expediente: links de archivos cargados + links de la emisión.
 * Fail-open: si no se puede escribir, el commit igual responde OK.
 */
async function writeDocumentosJson(destDir, data) {
  const archivos = {};
  const names = await fsp.readdir(destDir).catch(() => []);
  for (const name of names) {
    if (name === 'documentos.json') continue;
    archivos[name] = publicLink(path.join(destDir, name));
  }
  const doc = { ...data, archivos, actualizado: new Date().toISOString() };
  const jsonPath = path.join(destDir, 'documentos.json');
  try {
    await fsp.writeFile(jsonPath, JSON.stringify(doc, null, 2), 'utf8');
  } catch (err) {
    console.warn('[modulo-ocr/expediente] no se pudo escribir documentos.json:', err.message || err);
    return { archivos, documentosUrl: null };
  }
  return { archivos, documentosUrl: publicLink(jsonPath) };
}

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
    const { archivos, documentosUrl } = await writeDocumentosJson(result.destDir, {
      empresa: empresaNombre,
      cedula,
      nomenclatura,
      cnpoliza: body.cnpoliza ?? null,
      cnrecibo: body.cnrecibo ?? null,
      nfactura: body.nfactura ? String(body.nfactura) : null,
      emision: cleanLinks(body.emisionLinks),
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
      archivos,
      documentosUrl,
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
