/**
 * Expediente en disco: {empresa}/{cedula}/{nomenclatura}/documentos.
 * La nomenclatura (recibo-aa-mes-poliza) se aplica al emitir; antes vive en pendiente/.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const UPLOAD_ROOT = path.resolve(
  process.env.EXPEDIENTES_ROOT || path.join(__dirname, '..', '..', 'uploads'),
);

const DOC_FILE_NAMES = {
  cedula: 'cedula',
  cedula_titular: 'cedula_titular',
  cedula_beneficiario: 'cedula_beneficiario',
  licencia: 'licencia',
  certificado: 'certificado',
  rif: 'rif',
  pasaporte: 'pasaporte',
};

/**
 * Quita caracteres inseguros para nombre de carpeta. Conserva el nombre real.
 * @param {unknown} raw
 * @param {string} fallback
 * @returns {string}
 */
function sanitizeFolderName(raw, fallback) {
  const cleaned = String(raw || '')
    .normalize('NFC')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * Cédula del titular: solo dígitos.
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeCedula(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 12);
}

/**
 * Nomenclatura recibo-aa-mes-poliza (ej. 2321234-25-1-1100015737).
 * @param {{ cnrecibo?: unknown, cnpoliza?: unknown, fanopol?: unknown, fmespol?: unknown }} parts
 * @returns {string}
 */
function buildNomenclatura(parts) {
  const recibo = String(parts.cnrecibo || '').replace(/\D/g, '');
  const poliza = String(parts.cnpoliza || '').replace(/\D/g, '');
  const now = new Date();
  const year = Number(parts.fanopol);
  const month = Number(parts.fmespol);
  const yy = Number.isFinite(year) && year > 0
    ? String(year).slice(-2)
    : String(now.getFullYear()).slice(-2);
  const mes = Number.isFinite(month) && month > 0
    ? String(month)
    : String(now.getMonth() + 1);
  const label = [recibo || 'sRecibo', yy, mes, poliza || 'sPoliza'].join('-');
  return sanitizeFolderName(label, 'sin-poliza');
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @returns {string}
 */
function uploadRoot() {
  ensureDirSync(UPLOAD_ROOT);
  return UPLOAD_ROOT;
}

/**
 * @param {string} empresaNombre
 * @param {string} [cedula]
 * @param {string} [leaf]
 * @returns {string}
 */
function expedienteDir(empresaNombre, cedula, leaf) {
  const empresa = sanitizeFolderName(empresaNombre, 'empresa-sin-nombre');
  const parts = [uploadRoot(), empresa];
  const ci = sanitizeCedula(cedula);
  if (ci) parts.push(ci);
  if (leaf) parts.push(sanitizeFolderName(leaf, 'pendiente'));
  return path.join(...parts);
}

/**
 * Convierte URL pública /files/... a ruta absoluta bajo uploads.
 * @param {string} fileUrl
 * @returns {string|null}
 */
function resolveLocalPathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  let rel = fileUrl.trim();
  try {
    if (/^https?:\/\//i.test(rel)) rel = new URL(rel).pathname;
  } catch { /* keep rel */ }
  rel = rel.replace(/^\/ocr(?=\/)/, '');
  const idx = rel.indexOf('/files/');
  if (idx >= 0) rel = rel.slice(idx + '/files/'.length);
  else if (rel.startsWith('/files')) rel = rel.slice('/files'.length).replace(/^\//, '');
  else rel = rel.replace(/^\//, '');
  if (!rel) return null;
  const decoded = decodeURIComponent(rel);
  const abs = path.resolve(uploadRoot(), decoded);
  const root = uploadRoot() + path.sep;
  if (abs !== uploadRoot() && !abs.startsWith(root)) return null;
  return abs;
}

/**
 * URL pública relativa para express.static /files.
 * @param {string} absPath
 * @returns {string}
 */
function publicFileUrl(absPath) {
  const rel = path.relative(uploadRoot(), absPath).split(path.sep).join('/');
  return `/files/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Mueve el archivo OCR a empresa/cedula/pendiente (o empresa/_inbox).
 * @param {string} srcPath
 * @param {{ empresaNombre: string, cedula?: string, docType: string }} opts
 * @returns {Promise<{ absPath: string, url: string }>}
 */
async function placePending(srcPath, opts) {
  const empresaNombre = opts.empresaNombre || 'empresa-sin-nombre';
  const cedula = sanitizeCedula(opts.cedula);
  const docType = String(opts.docType || 'doc').replace(/[^\w-]/g, '') || 'doc';
  const ext = path.extname(srcPath) || '.webp';
  const base = DOC_FILE_NAMES[docType] || docType;
  const destDir = cedula
    ? expedienteDir(empresaNombre, cedula, 'pendiente')
    : expedienteDir(empresaNombre, '', '_inbox');
  ensureDirSync(destDir);
  const destName = cedula ? `${base}${ext}` : `${base}-${path.basename(srcPath, ext)}${ext}`;
  const dest = path.join(destDir, destName);
  if (path.resolve(srcPath) !== path.resolve(dest)) {
    await fsp.rename(srcPath, dest).catch(async () => {
      await fsp.copyFile(srcPath, dest);
      await fsp.unlink(srcPath).catch(() => {});
    });
  }
  return { absPath: dest, url: publicFileUrl(dest) };
}

/**
 * Copia/mueve documentos a empresa/cedula/nomenclatura.
 * @param {{
 *   empresaNombre: string,
 *   cedula: string,
 *   nomenclatura: string,
 *   files?: Array<{ url?: string, docType?: string, name?: string }>
 * }} payload
 * @returns {Promise<{ destDir: string, saved: string[], skipped: number }>}
 */
async function commitExpediente(payload) {
  const cedula = sanitizeCedula(payload.cedula);
  if (!cedula) {
    const err = new Error('Cédula del titular requerida para archivar expediente.');
    err.code = 'EXPEDIENTE_CEDULA_REQUIRED';
    throw err;
  }
  const nomenclatura = sanitizeFolderName(payload.nomenclatura, 'sin-poliza');
  const destDir = expedienteDir(payload.empresaNombre, cedula, nomenclatura);
  ensureDirSync(destDir);

  const saved = [];
  let skipped = 0;
  const files = Array.isArray(payload.files) ? payload.files : [];

  for (const file of files) {
    const src = resolveLocalPathFromUrl(file.url || '');
    if (!src || !fs.existsSync(src)) {
      skipped += 1;
      continue;
    }
    const ext = path.extname(src) || path.extname(file.name || '') || '.webp';
    const key = String(file.docType || '').replace(/[^\w-]/g, '');
    const base = DOC_FILE_NAMES[key] || key || path.basename(src, ext);
    let dest = path.join(destDir, `${base}${ext}`);
    if (fs.existsSync(dest) && path.resolve(src) !== path.resolve(dest)) {
      dest = path.join(destDir, `${base}-${Date.now()}${ext}`);
    }
    if (path.resolve(src) !== path.resolve(dest)) {
      await fsp.rename(src, dest).catch(async () => {
        await fsp.copyFile(src, dest);
        await fsp.unlink(src).catch(() => {});
      });
    }
    saved.push(path.basename(dest));
  }

  const pendienteDir = expedienteDir(payload.empresaNombre, cedula, 'pendiente');
  if (fs.existsSync(pendienteDir)) {
    const leftovers = await fsp.readdir(pendienteDir);
    for (const name of leftovers) {
      const src = path.join(pendienteDir, name);
      const st = await fsp.stat(src).catch(() => null);
      if (!st || !st.isFile()) continue;
      const dest = path.join(destDir, name);
      if (fs.existsSync(dest)) continue;
      await fsp.rename(src, dest).catch(async () => {
        await fsp.copyFile(src, dest);
        await fsp.unlink(src).catch(() => {});
      });
      if (!saved.includes(name)) saved.push(name);
    }
    await fsp.rmdir(pendienteDir).catch(() => {});
  }

  return { destDir, saved, skipped };
}

module.exports = {
  UPLOAD_ROOT,
  uploadRoot,
  sanitizeFolderName,
  sanitizeCedula,
  buildNomenclatura,
  expedienteDir,
  resolveLocalPathFromUrl,
  publicFileUrl,
  placePending,
  commitExpediente,
};
