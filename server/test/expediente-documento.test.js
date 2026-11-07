/**
 * Monitor de expedientes: POST /api/internal/expedientes/documento (Nexus → OCR).
 * Clave interna obligatoria, misma validación que /documents/upload, guarda sin pisar
 * en la carpeta de la póliza (o pendiente/) y devuelve la lectura OCR.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'expedientes-'));
process.env.EXPEDIENTES_ROOT = ROOT;
process.env.OCR_PROVIDER = 'mock';
delete process.env.EXPEDIENTE_EMPRESA_FALLBACK;
delete process.env.EXPEDIENTE_INTERNAL_KEY;
delete process.env.UPLOAD_MAX_SIZE_MB;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const documentService = require('../src/services/documentService');
const router = require('../src/routes/expedienteDocumento');

const KEY = 'clave-de-prueba';
const EMPRESA = 'La Mundial de Seguros';
const CEDULA = '12345678';
const POLIZA_DIR = path.join(ROOT, EMPRESA, CEDULA, '2321234-26-11-1100015737');

const app = express();
app.use('/api/internal/expedientes', router);
let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/internal/expedientes/documento`;
});
test.after(() => {
  server.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

function pdf(size = 4096) {
  return Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(size, 0x20)]);
}

function form(fields = {}, file = { buf: pdf(), type: 'application/pdf', name: 'doc.pdf' }) {
  const fd = new FormData();
  if (file) fd.append('file', new Blob([file.buf], { type: file.type }), file.name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const campos = { tipo: 'cedula', cnpoliza: '1100015737', cnrecibo: '2321234', documento: 'V-12.345.678', empresaId: '1' };

async function post(fd, key = KEY) {
  const headers = key ? { 'x-expediente-key': key } : {};
  const res = await fetch(base, { method: 'POST', body: fd, headers });
  return { status: res.status, body: await res.json() };
}

function tmpVacio() {
  const dir = path.join(ROOT, '_tmp');
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
}

test('sin EXPEDIENTE_INTERNAL_KEY responde 503', async () => {
  const r = await post(form(campos));
  assert.equal(r.status, 503);
  assert.equal(r.body.ok, false);
});

test('clave incorrecta o ausente → 401', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  assert.equal((await post(form(campos), 'otra')).status, 401);
  assert.equal((await post(form(campos), '')).status, 401);
});

test('tipo inválido → 400 y no deja temporales', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post(form({ ...campos, tipo: 'selfie' }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'TIPO_INVALIDO');
  assert.ok(tmpVacio());
});

test('MIME no permitido → 400', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post(form(campos, { buf: Buffer.alloc(4096, 0x41), type: 'text/plain', name: 'x.txt' }));
  assert.equal(r.status, 400);
});

test('archivo vacío o corrupto → 422 (misma validación que /documents/upload)', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post(form(campos, { buf: Buffer.from('%PDF-1.4'), type: 'application/pdf', name: 'x.pdf' }));
  assert.equal(r.status, 422);
  assert.ok(tmpVacio());
});

test('más de 25 MB → 413', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post(form(campos, { buf: pdf(25 * 1024 * 1024 + 10), type: 'application/pdf', name: 'big.pdf' }));
  assert.equal(r.status, 413);
});

test('sin cnpoliza o documento → 400', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post(form({ ...campos, documento: '' }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'DATOS_FALTANTES');
});

test('póliza archivada: guarda en su carpeta sin pisar el archivo existente y devuelve la lectura OCR', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  fs.mkdirSync(POLIZA_DIR, { recursive: true });
  fs.writeFileSync(path.join(POLIZA_DIR, 'cedula.pdf'), 'ORIGINAL');
  t.mock.method(documentService, 'runOcr', async () => ({
    provider: 'gemini',
    fields: { identificacion: CEDULA, nombre: 'Ana', apellido: 'Pérez' },
    meta: { chainAttempts: [{ model: 'm', criticalOk: true }] },
  }));

  const r = await post(form(campos));
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.ubicacion, 'poliza');
  assert.match(r.body.ref, /^La Mundial de Seguros\/12345678\/2321234-26-11-1100015737\/cedula-\d+\.pdf$/);
  assert.deepEqual(r.body.ocr, {
    extraido: { identificacion: CEDULA, nombre: 'Ana', apellido: 'Pérez' },
    confianza: 1,
    proveedor: 'gemini',
  });
  assert.equal(fs.readFileSync(path.join(POLIZA_DIR, 'cedula.pdf'), 'utf8'), 'ORIGINAL');
  assert.ok(fs.existsSync(path.join(ROOT, ...r.body.ref.split('/'))));
  assert.ok(tmpVacio());
});

test('sin carpeta de póliza: guarda en pendiente/', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  t.mock.method(documentService, 'runOcr', async () => ({
    provider: 'gemini', fields: { numeroLicencia: 'L-1' }, meta: { chainAttempts: [{ criticalOk: true }] },
  }));
  const r = await post(form({ ...campos, tipo: 'licencia', cnpoliza: '999', documento: '87654321' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.ubicacion, 'pendiente');
  assert.equal(r.body.ref, 'La Mundial de Seguros/87654321/pendiente/licencia.pdf');
});

test('OCR caído: el archivo queda guardado y la lectura viene con confianza 0 y motivo', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  t.mock.method(documentService, 'runOcr', async () => ({ provider: 'gemini', fields: {}, ocrFailed: true, error: 'x' }));
  const r = await post(form({ ...campos, tipo: 'certificado' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.ocr.confianza, 0);
  assert.equal(r.body.ocr.extraido, null);
  assert.ok(r.body.ocr.motivo);
  assert.ok(fs.existsSync(path.join(ROOT, ...r.body.ref.split('/'))));
});

test('documento que no coincide con el tipo: guardado, confianza 0 con el motivo del OCR', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  t.mock.method(documentService, 'runOcr', async () => ({
    provider: 'gemini', fields: null, mismatch: { message: 'Parece una licencia' },
  }));
  const r = await post(form(campos));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.ocr, { extraido: null, confianza: 0, motivo: 'Parece una licencia', proveedor: 'gemini' });
});

test('OCR simulado (mock) nunca devuelve datos para validar', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post(form({ ...campos, documento: '55555555' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.ocr.extraido, null);
  assert.equal(r.body.ocr.confianza, 0);
});
