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
  factura: 'factura',
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

/**
 * Carpeta de una póliza ya archivada: {empresa}/{cedula}/{recibo-aa-mes-poliza}.
 * Recorre las empresas en orden y devuelve la primera coincidencia. Dentro de una empresa
 * prefiere recibo + póliza; si no, solo póliza (la más reciente: renovaciones/otros recibos).
 * @param {string[]} empresas  nombres de carpeta de empresa (ya saneados)
 * @param {unknown} cedula
 * @param {unknown} cnpoliza
 * @param {unknown} [cnrecibo]
 * @returns {string|null} ruta absoluta o null si no existe
 */
function findPolicyDir(empresas, cedula, cnpoliza, cnrecibo) {
  const ci = sanitizeCedula(cedula);
  const poliza = String(cnpoliza || '').replace(/\D/g, '');
  const recibo = String(cnrecibo || '').replace(/\D/g, '');
  if (!ci || !poliza) return null;
  for (const empresa of empresas || []) {
    const base = expedienteDir(empresa, ci);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    let best = null;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const parts = entry.name.split('-');
      if (parts.length < 4 || parts[parts.length - 1] !== poliza) continue;
      const abs = path.join(base, entry.name);
      const score = recibo && parts[0] === recibo ? 1 : 0;
      let mtime = 0;
      try { mtime = fs.statSync(abs).mtimeMs; } catch { /* sin fecha */ }
      if (!best || score > best.score || (score === best.score && mtime > best.mtime)) {
        best = { abs, score, mtime };
      }
    }
    if (best) return best.abs;
  }
  return null;
}

/**
 * Guarda srcPath en destDir como {base}{ext} sin pisar ni borrar nada del expediente:
 * si el nombre existe usa {base}-{timestamp}{ext}. Solo elimina el temporal de origen.
 * @param {string} srcPath
 * @param {string} destDir
 * @param {string} baseName  tipo de documento (cedula, licencia…)
 * @returns {Promise<{ absPath: string, url: string }>}
 */
async function placeNoOverwrite(srcPath, destDir, baseName) {
  ensureDirSync(destDir);
  const ext = path.extname(srcPath) || '.webp';
  const key = String(baseName || '').replace(/[^\w-]/g, '');
  const base = DOC_FILE_NAMES[key] || key || 'documento';
  for (let i = 0; i < 6; i += 1) {
    const name = i === 0 ? `${base}${ext}` : `${base}-${Date.now()}${i > 1 ? `-${i}` : ''}${ext}`;
    const dest = path.join(destDir, name);
    try {
      // COPYFILE_EXCL: falla si el destino existe (nunca sobrescribe).
      await fsp.copyFile(srcPath, dest, fs.constants.COPYFILE_EXCL);
    } catch (err) {
      if (err && err.code === 'EEXIST') continue;
      throw err;
    }
    await fsp.unlink(srcPath).catch(() => {});
    return { absPath: dest, url: publicFileUrl(dest) };
  }
  const err = new Error('No se encontró un nombre libre para el documento.');
  err.code = 'EXPEDIENTE_NOMBRE_OCUPADO';
  throw err;
}

/** `rel` (resultado de path.relative) apunta dentro de la raíz y no es la raíz misma. */
function dentroDeRaiz(rel) {
  return Boolean(rel) && !path.isAbsolute(rel) && rel.split(path.sep)[0] !== '..';
}

/**
 * Ruta absoluta de un documento YA guardado en el expediente, a partir del `ref` que guarda Nexus:
 * ruta relativa a EXPEDIENTES_ROOT ({empresa}/{cédula}/{carpeta}/{archivo}) o URL pública
 * (/files/..., /ocr/files/..., https://host/ocr/files/...). Devuelve null si el ref es inválido o
 * si la ruta resuelta (también siguiendo enlaces simbólicos) sale de EXPEDIENTES_ROOT.
 * No crea, mueve ni borra nada; no comprueba que el archivo exista.
 * @param {unknown} ref
 * @returns {string|null}
 */
function resolveExpedienteRef(ref) {
  const raw = typeof ref === 'string' ? ref.trim() : '';
  if (!raw || raw.length > 1000 || raw.includes('\0')) return null;
  let rel = raw;
  const esUrl = /^https?:\/\//i.test(rel);
  if (esUrl || /(^|\/)files\//.test(rel)) {
    try {
      if (esUrl) rel = new URL(rel).pathname;
      const idx = rel.indexOf('/files/');
      if (idx >= 0) rel = rel.slice(idx + '/files/'.length);
      else if (rel.startsWith('files/')) rel = rel.slice('files/'.length);
      rel = decodeURIComponent(rel);
    } catch {
      return null;
    }
  }
  if (!rel || rel.includes('\0') || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || /^[\\/]/.test(rel)) {
    return null;
  }
  const root = path.resolve(UPLOAD_ROOT);
  const abs = path.resolve(root, rel);
  if (!dentroDeRaiz(path.relative(root, abs))) return null;
  // Si existe, la ruta real (enlaces simbólicos resueltos) también debe quedar dentro.
  let real = null;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return abs;
  }
  let realRoot = root;
  try { realRoot = fs.realpathSync(root); } catch { /* raíz aún no creada */ }
  return dentroDeRaiz(path.relative(realRoot, real)) ? real : null;
}

const MIME_POR_EXTENSION = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/**
 * MIME de un documento del expediente por su extensión (los guardados son webp normalizado o PDF).
 * @param {string} filePath
 * @returns {string|null}
 */
function mimeFromPath(filePath) {
  return MIME_POR_EXTENSION[path.extname(String(filePath || '')).toLowerCase()] || null;
}

/** Claves de documento reconocidas por nombre de archivo ({clave}.ext o {clave}-{n}.ext), las largas primero. */
const CLAVES_DOCUMENTO = Object.keys(DOC_FILE_NAMES).sort((a, b) => b.length - a.length);

/** Subcarpetas reales (isDirectory() es false para enlaces simbólicos: nunca se sigue uno). */
function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function mtimeDe(abs) {
  try { return fs.statSync(abs).mtimeMs; } catch { return 0; }
}

/** Clave del documento a partir del nombre del archivo, o null si no es un documento del expediente. */
function claveDeArchivo(nombre) {
  if (!mimeFromPath(nombre)) return null;
  const base = path.basename(nombre, path.extname(nombre)).toLowerCase();
  for (const k of CLAVES_DOCUMENTO) {
    const nom = DOC_FILE_NAMES[k];
    if (base === nom || new RegExp(`^${nom}-\\d+(-\\d+)?$`).test(base)) return k;
  }
  return null;
}

/**
 * Documentos de una carpeta del expediente: { [clave]: ref }, ref relativo a EXPEDIENTES_ROOT.
 * Con varios de la misma clave (cedula.webp, cedula-<ts>.webp) toma el más reciente.
 * Solo archivos regulares (no enlaces) con extensión de documento. No modifica nada.
 */
function documentosDeCarpeta(absDir) {
  const root = path.resolve(UPLOAD_ROOT);
  const mejor = {};
  let entries = [];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return {};
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const clave = claveDeArchivo(e.name);
    if (!clave) continue;
    const abs = path.join(absDir, e.name);
    const mtime = mtimeDe(abs);
    if (!mejor[clave] || mtime > mejor[clave].mtime) mejor[clave] = { abs, mtime };
  }
  const out = {};
  for (const [clave, { abs }] of Object.entries(mejor)) {
    out[clave] = path.relative(root, abs).split(path.sep).join('/');
  }
  return out;
}

/**
 * Rastro de una póliza en los expedientes del OCR (solo lectura; no crea, mueve ni borra nada):
 *   1. Carpeta de la póliza {empresa}/{cédula}/{recibo-aa-mes-póliza} bajo las cédulas dadas:
 *      número exacto; si no hay, últimos 8 dígitos solo si es única (el recibo desempata).
 *   2. Carpeta con el número exacto bajo otra cédula (el registro puede traer la del tomador),
 *      solo si es única.
 *   3. {empresa}/{cédula}/pendiente para las cédulas dadas.
 * Empresas: primero las indicadas (en orden) y luego el resto de carpetas de la raíz.
 * Las cédulas se reducen a dígitos y las carpetas salen de readdir: no hay rutas del cliente.
 * @param {{ cnpoliza: unknown, cnrecibo?: unknown, cedulas?: unknown[], empresas?: string[] }} q
 * @returns {{ ubicacion: 'poliza'|'pendiente'|null, carpeta: string|null, documentos: Record<string,string> }}
 */
function localizarExpediente(q) {
  const vacio = { ubicacion: null, carpeta: null, documentos: {} };
  const poliza = String(q.cnpoliza || '').replace(/\D/g, '');
  const recibo = String(q.cnrecibo || '').replace(/\D/g, '');
  if (!poliza) return vacio;
  const cedulas = [];
  for (const c of Array.isArray(q.cedulas) ? q.cedulas : []) {
    const ci = sanitizeCedula(c);
    if (ci && !cedulas.includes(ci)) cedulas.push(ci);
  }
  const root = path.resolve(UPLOAD_ROOT);
  const enRaiz = subdirs(root);
  const empresas = [];
  for (const e of [...(q.empresas || []), ...enRaiz]) {
    if (e && enRaiz.includes(e) && !empresas.includes(e)) empresas.push(e);
  }
  let realRoot = root;
  try { realRoot = fs.realpathSync(root); } catch { /* raíz aún no creada */ }
  /** La ruta real (con enlaces o junctions resueltos) sigue dentro de EXPEDIENTES_ROOT. */
  const dentroReal = (abs) => {
    try {
      return dentroDeRaiz(path.relative(realRoot, fs.realpathSync(abs)));
    } catch {
      return false;
    }
  };
  const cola8 = poliza.length >= 8 ? poliza.slice(-8) : null;

  /** Carpetas de póliza ({...}-{dígitos}) bajo {empresa}/{ci}. */
  const carpetasDe = (empresa, ci) => subdirs(path.join(root, empresa, ci)).flatMap((name) => {
    const parts = name.split('-');
    const num = parts[parts.length - 1];
    if (parts.length < 2 || !/^\d+$/.test(num)) return [];
    const abs = path.join(root, empresa, ci, name);
    if (!dentroReal(abs)) return [];
    return [{ abs, num, recibo: Boolean(recibo) && parts[0] === recibo, mtime: mtimeDe(abs) }];
  });
  const masReciente = (lista) =>
    [...lista].sort((a, b) => Number(b.recibo) - Number(a.recibo) || b.mtime - a.mtime)[0];
  const unica = (lista) => {
    if (lista.length === 1) return lista[0];
    const conRecibo = lista.filter((c) => c.recibo);
    return conRecibo.length === 1 ? conRecibo[0] : null;
  };
  const resultado = (abs, ubicacion) => ({
    ubicacion,
    carpeta: path.relative(root, abs).split(path.sep).join('/'),
    documentos: documentosDeCarpeta(abs),
  });

  const propias = cedulas.flatMap((ci) => empresas.flatMap((e) => carpetasDe(e, ci)));
  const exactas = propias.filter((c) => c.num === poliza);
  if (exactas.length) return resultado(masReciente(exactas).abs, 'poliza');
  const porCola = cola8 ? unica(propias.filter((c) => c.num.length >= 8 && c.num.slice(-8) === cola8)) : null;
  if (porCola) return resultado(porCola.abs, 'poliza');

  const otras = [];
  for (const empresa of empresas) {
    for (const ci of subdirs(path.join(root, empresa))) {
      if (cedulas.includes(ci) || !/^\d+$/.test(ci)) continue;
      otras.push(...carpetasDe(empresa, ci).filter((c) => c.num === poliza));
    }
  }
  const otra = unica(otras);
  if (otra) return resultado(otra.abs, 'poliza');

  for (const ci of cedulas) {
    for (const empresa of empresas) {
      const pend = path.join(root, empresa, ci, 'pendiente');
      if (subdirs(path.join(root, empresa, ci)).includes('pendiente') && dentroReal(pend)) {
        return resultado(pend, 'pendiente');
      }
    }
  }
  return vacio;
}

module.exports = {
  localizarExpediente,
  documentosDeCarpeta,
  UPLOAD_ROOT,
  resolveExpedienteRef,
  mimeFromPath,
  uploadRoot,
  sanitizeFolderName,
  sanitizeCedula,
  buildNomenclatura,
  expedienteDir,
  resolveLocalPathFromUrl,
  publicFileUrl,
  placePending,
  commitExpediente,
  findPolicyDir,
  placeNoOverwrite,
};
