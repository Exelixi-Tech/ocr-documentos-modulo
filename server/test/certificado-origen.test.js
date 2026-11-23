/**
 * Certificado de Origen del INTT (vehículo nuevo, aún sin certificado de circulación) en el espacio
 * «Certificado de circulación» (falsa alarma 18-1-0000144296): si Gemini no lo clasifica como
 * certificado pero leyó la identidad del vehículo, vale y se compara igual que el certificado.
 * Otro tipo de documento sigue rechazado. Sin llamadas reales a Gemini (proveedor simulado).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.OCR_PROVIDER = 'gemini';

// geminiProvider simulado (el real requiere @google/genai y red).
let respuesta = null;
const gpPath = require.resolve('../src/services/geminiProvider');
require.cache[gpPath] = {
  id: gpPath,
  filename: gpPath,
  loaded: true,
  exports: { extract: async () => structuredClone(respuesta) },
};

const { runOcr } = require('../src/services/documentService');

const FILE = { path: path.join(__dirname, 'no-existe.jpg'), mimetype: 'image/jpeg', size: 4096 };
const META = { model: 'gemini-test', elapsedMs: 1, chainAttempts: [] };

const ORIGEN = {
  placa: 'AH1234B',
  serial: '8211MBCA2TDV01234',
  serialMotor: '162FMJ26012345',
  marca: 'BERA',
  modelo: 'BR250-GR',
  anio: '2026',
};

test('Certificado de Origen clasificado «desconocido» pero con placa/serial y marca → se acepta con sus datos', async () => {
  respuesta = { fields: { documentoTipo: 'desconocido', ...ORIGEN }, meta: META };
  const r = await runOcr(FILE, 'certificado', null, {});
  assert.equal(r.mismatch, undefined);
  assert.deepEqual(r.fields, ORIGEN);
});

test('solo con serial de carrocería (sin placa) y modelo → se acepta', async () => {
  const { placa: _p, marca: _m, ...sinPlaca } = ORIGEN;
  respuesta = { fields: { documentoTipo: 'desconocido', ...sinPlaca }, meta: META };
  const r = await runOcr(FILE, 'certificado', null, {});
  assert.equal(r.mismatch, undefined);
});

test('negativo: «desconocido» sin datos del vehículo → sigue rechazado (documento no reconocido)', async () => {
  respuesta = { fields: { documentoTipo: 'desconocido', placa: null, serial: null }, meta: META };
  const r = await runOcr(FILE, 'certificado', null, {});
  assert.ok(r.mismatch);
  assert.equal(r.mismatch.detected, 'desconocido');
  assert.match(r.mismatch.message, /documento no reconocido/);
  assert.equal(r.fields, null);
});

test('negativo: placa sin marca ni modelo → sigue rechazado', async () => {
  respuesta = { fields: { documentoTipo: 'desconocido', placa: 'AH1234B' }, meta: META };
  const r = await runOcr(FILE, 'certificado', null, {});
  assert.ok(r.mismatch);
});

test('negativo: otro tipo de documento (cédula) en el espacio del certificado → sigue rechazado', async () => {
  respuesta = { fields: { documentoTipo: 'cedula', ...ORIGEN }, meta: META };
  const r = await runOcr(FILE, 'certificado', null, {});
  assert.ok(r.mismatch);
  assert.equal(r.mismatch.detected, 'cedula');
});
