/**
 * Monitor de expedientes: POST /api/internal/expedientes/analizar (Nexus → OCR).
 * Validación automática con IA: lee un archivo ya guardado en EXPEDIENTES_ROOT/ref, sin path
 * traversal, ejecuta la extracción OCR existente y devuelve { ok, ref, hash, ocr }.
 * Nunca copia, mueve ni borra nada. Sin llamadas reales a Gemini (runOcr simulado).
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'expedientes-analizar-'));
const ROOT = path.join(BASE_DIR, 'root');
fs.mkdirSync(ROOT, { recursive: true });
process.env.EXPEDIENTES_ROOT = ROOT;
process.env.OCR_PROVIDER = 'mock';
delete process.env.EXPEDIENTE_INTERNAL_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const documentService = require('../src/services/documentService');
const router = require('../src/routes/expedienteDocumento');

const KEY = 'clave-de-prueba';
const REL = 'La Mundial de Seguros/12345678/2321234-26-11-1100015737/cedula.pdf';
const ABS = path.join(ROOT, ...REL.split('/'));
const CONTENIDO = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4096, 0x20)]);
const HASH = crypto.createHash('sha256').update(CONTENIDO).digest('hex');
// Fuera de EXPEDIENTES_ROOT: nunca debe leerse.
const SECRETO = path.join(BASE_DIR, 'secreto.pdf');

const app = express();
app.use('/api/internal/expedientes', router);
let server;
let base;

function listado(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listado(p));
    else out.push(`${path.relative(ROOT, p)}:${fs.statSync(p).size}`);
  }
  return out.sort();
}

test.before(async () => {
  fs.mkdirSync(path.dirname(ABS), { recursive: true });
  fs.writeFileSync(ABS, CONTENIDO);
  fs.writeFileSync(SECRETO, CONTENIDO);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/internal/expedientes/analizar`;
});
test.after(() => {
  server.close();
  fs.rmSync(BASE_DIR, { recursive: true, force: true });
});

async function post(body, key = KEY) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-expediente-key'] = key;
  const res = await fetch(base, { method: 'POST', body: JSON.stringify(body), headers });
  return { status: res.status, body: await res.json() };
}

const leido = {
  provider: 'gemini',
  fields: { identificacion: '12345678', tipoDoc: 'V', nombre: 'Ana', apellido: 'Pérez' },
  meta: { chainAttempts: [{ model: 'm', criticalOk: true }] },
};

test('sin EXPEDIENTE_INTERNAL_KEY responde 503; clave incorrecta 401', async () => {
  assert.equal((await post({ ref: REL, tipo: 'cedula' })).status, 503);
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  assert.equal((await post({ ref: REL, tipo: 'cedula' }, 'otra')).status, 401);
  assert.equal((await post({ ref: REL, tipo: 'cedula' }, '')).status, 401);
});

test('lee el archivo guardado y devuelve hash y lectura OCR sin tocar el expediente', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const antes = listado(ROOT);
  const ocr = t.mock.method(documentService, 'runOcr', async () => structuredClone(leido));
  const r = await post({ ref: REL, tipo: 'cedula' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {
    ok: true,
    ref: REL,
    hash: HASH,
    ocr: {
      extraido: { identificacion: '12345678', tipoDoc: 'V', nombre: 'Ana', apellido: 'Pérez' },
      confianza: 1,
      proveedor: 'gemini',
    },
  });
  const [file, tipo] = ocr.mock.calls[0].arguments;
  assert.equal(tipo, 'cedula');
  assert.equal(file.path, fs.realpathSync(ABS));
  assert.equal(file.mimetype, 'application/pdf');
  // No copia, no mueve, no borra.
  assert.deepEqual(listado(ROOT), antes);
  assert.ok(fs.readFileSync(ABS).equals(CONTENIDO));
});

test('acepta la URL pública /files/... (mesa técnica) y el prefijo /ocr', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  t.mock.method(documentService, 'runOcr', async () => structuredClone(leido));
  const url = `/ocr/files/${REL.split('/').map(encodeURIComponent).join('/')}`;
  const r = await post({ ref: url, tipo: 'cedula' });
  assert.equal(r.status, 200);
  assert.equal(r.body.hash, HASH);
  const full = await post({ ref: `https://qa.test${url}`, tipo: 'cedula' });
  assert.equal(full.status, 200);
});

test('path traversal rechazado: nunca lee fuera de EXPEDIENTES_ROOT', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const ocr = t.mock.method(documentService, 'runOcr', async () => structuredClone(leido));
  const intentos = [
    '../secreto.pdf',
    'La Mundial de Seguros/../../secreto.pdf',
    '/files/../../secreto.pdf',
    '/files/%2e%2e/secreto.pdf',
    'files/..%2Fsecreto.pdf',
    SECRETO,
    `file:${SECRETO}`,
    'C:/Windows/win.ini',
    '\\\\servidor\\c$\\secreto.pdf',
    '.',
    'a\u0000b',
  ];
  for (const ref of intentos) {
    const r = await post({ ref, tipo: 'cedula' });
    assert.ok([400, 404].includes(r.status), `ref ${JSON.stringify(ref)} → ${r.status}`);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.hash, undefined);
  }
  assert.equal(ocr.mock.callCount(), 0);
  assert.ok(fs.existsSync(SECRETO));
});

test('enlace simbólico que sale de EXPEDIENTES_ROOT: rechazado', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const link = path.join(ROOT, 'La Mundial de Seguros', 'enlace.pdf');
  try {
    fs.symlinkSync(SECRETO, link);
  } catch {
    t.skip('el sistema no permite crear enlaces simbólicos');
    return;
  }
  const ocr = t.mock.method(documentService, 'runOcr', async () => structuredClone(leido));
  const r = await post({ ref: 'La Mundial de Seguros/enlace.pdf', tipo: 'cedula' });
  assert.equal(r.status, 400);
  assert.equal(ocr.mock.callCount(), 0);
  fs.unlinkSync(link);
});

test('archivo inexistente → 404; tipo inválido o sin ref → 400', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post({ ref: 'La Mundial de Seguros/12345678/x/licencia.webp', tipo: 'licencia' });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'ARCHIVO_NO_ENCONTRADO');
  assert.equal((await post({ ref: REL, tipo: 'selfie' })).body.code, 'TIPO_INVALIDO');
  assert.equal((await post({ tipo: 'cedula' })).body.code, 'REF_REQUERIDA');
  // Una carpeta no es un documento.
  assert.equal((await post({ ref: 'La Mundial de Seguros', tipo: 'cedula' })).status, 404);
});

test('pasaporte se lee con el esquema de cédula (MRZ)', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const ocr = t.mock.method(documentService, 'runOcr', async () => structuredClone(leido));
  const r = await post({ ref: REL, tipo: 'pasaporte' });
  assert.equal(r.status, 200);
  assert.equal(ocr.mock.calls[0].arguments[1], 'cedula');
});

test('Gemini caído u OCR simulado: falla técnica (Nexus reintenta, no lo marca ilegible)', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const caido = await (async () => {
    const m = t.mock.method(documentService, 'runOcr', async () => ({ provider: 'gemini', fields: {}, ocrFailed: true }));
    const r = await post({ ref: REL, tipo: 'cedula' });
    m.mock.restore();
    return r;
  })();
  assert.equal(caido.status, 200);
  assert.equal(caido.body.hash, HASH);
  assert.equal(caido.body.ocr.falla, 'tecnica');
  assert.equal(caido.body.ocr.confianza, 0);

  const simulado = await post({ ref: REL, tipo: 'cedula' });
  assert.equal(simulado.body.ocr.falla, 'tecnica');
  assert.equal(simulado.body.ocr.extraido, null);
});

test('documento de otro tipo: falla tipo_documento con el motivo del OCR', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  t.mock.method(documentService, 'runOcr', async () => ({
    provider: 'gemini', fields: null, mismatch: { message: 'Parece una licencia' },
  }));
  const r = await post({ ref: REL, tipo: 'cedula' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ocr, {
    extraido: null, confianza: 0, motivo: 'Parece una licencia', proveedor: 'gemini', falla: 'tipo_documento',
  });
});

test('archivo vacío: sin lectura (ilegible), sin llamar al OCR', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const rel = 'La Mundial de Seguros/12345678/2321234-26-11-1100015737/licencia.webp';
  fs.writeFileSync(path.join(ROOT, ...rel.split('/')), Buffer.from('RIFF'));
  const ocr = t.mock.method(documentService, 'runOcr', async () => structuredClone(leido));
  const r = await post({ ref: rel, tipo: 'licencia' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ocr.confianza, 0);
  assert.equal(r.body.ocr.falla, undefined);
  assert.ok(r.body.ocr.motivo);
  assert.equal(ocr.mock.callCount(), 0);
});
