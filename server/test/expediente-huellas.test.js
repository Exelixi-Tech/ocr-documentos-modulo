/**
 * Monitor de expedientes: POST /api/internal/expedientes/huellas (Nexus → OCR).
 * Solo lectura y sin IA: sha256 de hasta 100 archivos ya guardados, «no existe» si no están.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'expedientes-huellas-'));
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
const REL = 'La Mundial de Seguros/12345678/pendiente/cedula.pdf';
const ABS = path.join(ROOT, ...REL.split('/'));
const CONTENIDO = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 0x20)]);
const HASH = crypto.createHash('sha256').update(CONTENIDO).digest('hex');
const SECRETO = path.join(BASE_DIR, 'secreto.pdf');

const app = express();
app.use('/api/internal/expedientes', router);
let server;
let url;

test.before(async () => {
  fs.mkdirSync(path.dirname(ABS), { recursive: true });
  fs.writeFileSync(ABS, CONTENIDO);
  fs.writeFileSync(SECRETO, CONTENIDO);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  url = `http://127.0.0.1:${server.address().port}/api/internal/expedientes/huellas`;
});
test.after(() => {
  server.close();
  fs.rmSync(BASE_DIR, { recursive: true, force: true });
});

async function post(body, key = KEY) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-expediente-key'] = key;
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers });
  return { status: res.status, body: await res.json() };
}

test('sin clave 503; clave incorrecta 401', async () => {
  assert.equal((await post({ refs: [REL] })).status, 503);
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  assert.equal((await post({ refs: [REL] }, 'otra')).status, 401);
});

test('devuelve sha256 o «no existe» por ref, sin IA y sin tocar nada', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const ocr = t.mock.method(documentService, 'runOcr', async () => ({}));
  const url2 = `/ocr/files/${REL.split('/').map(encodeURIComponent).join('/')}`;
  const r = await post({ refs: [REL, url2, 'La Mundial de Seguros/otro/no-esta.pdf'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.resultados, [
    { ref: REL, existe: true, hash: HASH },
    { ref: url2, existe: true, hash: HASH },
    { ref: 'La Mundial de Seguros/otro/no-esta.pdf', existe: false, hash: null },
  ]);
  assert.equal(ocr.mock.calls.length, 0);
  assert.ok(fs.readFileSync(ABS).equals(CONTENIDO));
});

test('rutas fuera de la raíz y enlaces simbólicos: no existe', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const enlace = path.join(ROOT, 'enlace.pdf');
  let hayEnlace = true;
  try {
    fs.symlinkSync(SECRETO, enlace);
  } catch {
    hayEnlace = false;
  }
  const refs = ['../secreto.pdf', '/etc/passwd', 'C:\Windows\win.ini', ...(hayEnlace ? ['enlace.pdf'] : [])];
  const r = await post({ refs });
  assert.equal(r.status, 200);
  for (const x of r.body.resultados) assert.deepEqual([x.existe, x.hash], [false, null]);
});

test('valida refs: lista de 1 a 100 textos', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ refs: [] })).status, 400);
  assert.equal((await post({ refs: [1] })).status, 400);
  assert.equal((await post({ refs: Array.from({ length: 101 }, (_, i) => `a${i}`) })).status, 400);
  assert.equal((await post({ refs: Array.from({ length: 100 }, (_, i) => `a${i}`) })).status, 200);
});
