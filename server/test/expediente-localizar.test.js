/**
 * Monitor de expedientes: POST /api/internal/expedientes/localizar (Nexus → OCR).
 * Conciliación de pólizas sin datos del expediente: carpeta de la póliza (exacta, luego últimos
 * 8 dígitos si es única), luego {cédula}/pendiente. Solo lectura y sin path traversal.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'expedientes-localizar-'));
const ROOT = path.join(BASE_DIR, 'root');
fs.mkdirSync(ROOT, { recursive: true });
process.env.EXPEDIENTES_ROOT = ROOT;
process.env.OCR_PROVIDER = 'mock';
delete process.env.EXPEDIENTE_INTERNAL_KEY;
delete process.env.EXPEDIENTE_EMPRESA_FALLBACK;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const router = require('../src/routes/expedienteDocumento');

const KEY = 'clave-de-prueba';
const LM = 'La Mundial de Seguros';

function escribir(rel, contenido = 'x') {
  const abs = path.join(ROOT, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contenido);
  return abs;
}

function listado(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(`${path.relative(ROOT, p)}/`, ...listado(p));
    else out.push(`${path.relative(ROOT, p)}:${fs.statSync(p).size}`);
  }
  return out.sort();
}

const app = express();
app.use('/api/internal/expedientes', router);
let server;
let base;

test.before(async () => {
  // RCV: carpeta exacta con varios documentos (y una copia posterior de la cédula).
  escribir(`${LM}/11111111/2321234-26-11-1100015737/cedula.webp`);
  escribir(`${LM}/11111111/2321234-26-11-1100015737/licencia.jpg`);
  escribir(`${LM}/11111111/2321234-26-11-1100015737/certificado.pdf`);
  escribir(`${LM}/11111111/2321234-26-11-1100015737/notas.txt`);
  escribir(`${LM}/11111111/pendiente/cedula.webp`);
  // Personas: solo pendiente.
  escribir(`${LM}/22222222/pendiente/cedula_titular.webp`);
  escribir(`${LM}/22222222/pendiente/cedula_titular-1730000000000.webp`);
  // Últimos 8 dígitos: única para la cédula 33333333.
  escribir(`${LM}/33333333/999-26-10-0900012345/cedula.webp`);
  // Ambigua por los últimos 8 dígitos: dos carpetas distintas.
  escribir(`${LM}/44444444/1-26-10-1000055555/cedula.webp`);
  escribir(`${LM}/44444444/2-26-10-2000055555/cedula.webp`);
  // Póliza exacta bajo otra cédula (el registro trae la del tomador).
  escribir(`empresa-7/55555555/77-26-9-1200000999/cedula.pdf`);
  // Fuera de EXPEDIENTES_ROOT.
  fs.writeFileSync(path.join(BASE_DIR, 'secreto.pdf'), 'x');
  // Más reciente para la clave cedula en la carpeta de 22222222.
  const viejo = new Date('2026-10-01T00:00:00Z');
  fs.utimesSync(path.join(ROOT, LM, '22222222', 'pendiente', 'cedula_titular.webp'), viejo, viejo);

  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/internal/expedientes/localizar`;
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

test('sin EXPEDIENTE_INTERNAL_KEY responde 503; clave incorrecta 401; sin póliza 400', async () => {
  assert.equal((await post({ cnpoliza: '1', cedulas: [] })).status, 503);
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  assert.equal((await post({ cnpoliza: '1' }, 'otra')).status, 401);
  assert.equal((await post({ cnpoliza: '1' }, '')).status, 401);
  assert.equal((await post({ cedulas: ['1'] })).status, 400);
  assert.equal((await post({ cnpoliza: { $gt: '' } })).status, 400);
});

test('carpeta exacta de la póliza: documentos por clave con ref relativo a la raíz', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const antes = listado(ROOT);
  const r = await post({ cnpoliza: '1100015737', cnrecibo: '2321234', cedulas: ['V-11.111.111'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {
    ok: true,
    ubicacion: 'poliza',
    carpeta: `${LM}/11111111/2321234-26-11-1100015737`,
    documentos: {
      cedula: `${LM}/11111111/2321234-26-11-1100015737/cedula.webp`,
      licencia: `${LM}/11111111/2321234-26-11-1100015737/licencia.jpg`,
      certificado: `${LM}/11111111/2321234-26-11-1100015737/certificado.pdf`,
    },
  });
  // Solo lectura.
  assert.deepEqual(listado(ROOT), antes);
});

test('sin carpeta de póliza: pendiente de la cédula, el más reciente por clave', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post({ cnpoliza: '1100099999', cedulas: ['00000000', '22222222'] });
  assert.equal(r.body.ubicacion, 'pendiente');
  assert.equal(r.body.carpeta, `${LM}/22222222/pendiente`);
  assert.deepEqual(r.body.documentos, {
    cedula_titular: `${LM}/22222222/pendiente/cedula_titular-1730000000000.webp`,
  });
});

test('la carpeta de la póliza tiene prioridad sobre pendiente', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post({ cnpoliza: '1100015737', cedulas: ['11111111'] });
  assert.equal(r.body.ubicacion, 'poliza');
});

test('últimos 8 dígitos: solo si la coincidencia es única', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const unica = await post({ cnpoliza: '1900012345', cedulas: ['33333333'] });
  assert.equal(unica.body.ubicacion, 'poliza');
  assert.equal(unica.body.carpeta, `${LM}/33333333/999-26-10-0900012345`);

  const ambigua = await post({ cnpoliza: '3000055555', cedulas: ['44444444'] });
  assert.equal(ambigua.body.ubicacion, null);
  assert.deepEqual(ambigua.body.documentos, {});
  // El recibo desempata.
  const conRecibo = await post({ cnpoliza: '3000055555', cnrecibo: '2', cedulas: ['44444444'] });
  assert.equal(conRecibo.body.carpeta, `${LM}/44444444/2-26-10-2000055555`);
});

test('número exacto bajo otra cédula u otra empresa', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post({ cnpoliza: '1200000999', cedulas: ['12345678'] });
  assert.equal(r.body.ubicacion, 'poliza');
  assert.deepEqual(r.body.documentos, { cedula: 'empresa-7/55555555/77-26-9-1200000999/cedula.pdf' });
});

test('sin rastro en el OCR: ubicacion null', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post({ cnpoliza: '1234567890', cedulas: ['99999999'] });
  assert.deepEqual(r.body, { ok: true, ubicacion: null, carpeta: null, documentos: {} });
  const sinCedulas = await post({ cnpoliza: '1234567890' });
  assert.equal(sinCedulas.body.ubicacion, null);
});

test('path traversal: las cédulas y la empresa no salen de EXPEDIENTES_ROOT', async () => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const r = await post({
    cnpoliza: '1234567890',
    cedulas: ['../..', '..\\..', '/etc', 'C:/Windows', { a: 1 }],
    empresaNombre: '../..',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ubicacion, null);
  for (const ref of Object.values(r.body.documentos)) assert.ok(!ref.includes('..'));
});

test('no sigue enlaces simbólicos fuera de la raíz', async (t) => {
  process.env.EXPEDIENTE_INTERNAL_KEY = KEY;
  const link = path.join(ROOT, LM, '66666666');
  try {
    fs.mkdirSync(path.join(BASE_DIR, 'fuera', '1-26-1-1300000001'), { recursive: true });
    fs.writeFileSync(path.join(BASE_DIR, 'fuera', '1-26-1-1300000001', 'cedula.webp'), 'x');
    fs.symlinkSync(path.join(BASE_DIR, 'fuera'), link, 'junction');
  } catch {
    t.skip('sin permiso para crear enlaces');
    return;
  }
  const r = await post({ cnpoliza: '1300000001', cedulas: ['66666666'] });
  assert.equal(r.body.ubicacion, null);
  fs.rmSync(link, { recursive: false, force: true });
});
