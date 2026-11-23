/**
 * Archivo con varios documentos en el espacio «cédula o RIF» (falsa alarma de prod 7-7-7000003208:
 * PDF con el RIF de la empresa tomadora en la página 1 y la cédula del titular en la 2). Gemini
 * devuelve el RIF jurídico en los campos principales y la cédula en `documentosAdicionales`.
 * Sin llamadas reales a Gemini (proveedor simulado), como certificado-origen.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.OCR_PROVIDER = 'gemini';

const {
  limpiarDocumentosAdicionales,
  priorizarPersonaNatural,
  normalizarDocumento,
} = require('../src/lib/documentosAdicionales');

// normalizeCedulaFields real (requiere @google/genai instalado; si no, se omite). Se carga antes
// de reemplazar el proveedor por el simulado.
const gpPath = require.resolve('../src/services/geminiProvider');
let normalizeCedulaFields = null;
try {
  ({ normalizeCedulaFields } = require('../src/services/geminiProvider')._internal);
} catch {
  normalizeCedulaFields = null;
}
delete require.cache[gpPath];

// geminiProvider simulado (el real requiere @google/genai y red).
let respuesta = null;
require.cache[gpPath] = {
  id: gpPath,
  filename: gpPath,
  loaded: true,
  exports: { extract: async () => structuredClone(respuesta) },
};
const { runOcr } = require('../src/services/documentService');

const FILE = { path: path.join(__dirname, 'no-existe.pdf'), mimetype: 'application/pdf', size: 4096 };
const META = { model: 'gemini-test', elapsedMs: 1, chainAttempts: [] };

const RIF = {
  documentoTipo: 'rif',
  tipoDoc: 'J',
  rif: 'J-50058503-9',
  identificacion: '500585039',
  razonSocial: 'SUPERMERCADO RIO VIDA C.A',
  nombre: 'SUPERMERCADO RIO VIDA C.A',
  apellido: null,
  direccionFiscal: 'AV PRINCIPAL',
};
const CEDULA = { tipoDoc: 'V', identificacion: '17671805', nombre: 'JHON', apellido: 'PEREZ GARCIA' };

test('limpiar: normaliza la cédula adicional (dígitos, tipo) y la deja aparte', () => {
  const f = limpiarDocumentosAdicionales({
    ...RIF,
    documentosAdicionales: [
      { identificacion: 'V-17.671.805', nombre: ' JHON ', apellido: 'PEREZ GARCIA', rif: 'null' },
    ],
  });
  assert.equal(f.rif, 'J-50058503-9');
  assert.deepEqual(f.documentosAdicionales, [CEDULA]);
});

test('limpiar: un solo documento → sin documentosAdicionales (lectura igual que antes)', () => {
  const f = limpiarDocumentosAdicionales({ ...CEDULA, documentosAdicionales: [] });
  assert.equal('documentosAdicionales' in f, false);
  assert.deepEqual(f, CEDULA);
  const g = limpiarDocumentosAdicionales({ ...CEDULA });
  assert.equal('documentosAdicionales' in g, false);
});

test('limpiar: descarta vacíos, el que repite el principal y los repetidos', () => {
  const f = limpiarDocumentosAdicionales({
    ...RIF,
    documentosAdicionales: [
      { tipoDoc: 'J', rif: 'J500585039' },
      { nombre: 'SIN NUMERO' },
      'basura',
      CEDULA,
      { ...CEDULA, nombre: 'OTRA LECTURA' },
    ],
  });
  assert.deepEqual(f.documentosAdicionales, [CEDULA]);
});

test('normalizarDocumento: RIF jurídico adicional → tipo J, identificación en dígitos, nombre = razón social', () => {
  assert.deepEqual(normalizarDocumento({ rif: 'j-50058503-9', razonSocial: 'SUPERMERCADO RIO VIDA CA' }), {
    rif: 'J-50058503-9',
    razonSocial: 'SUPERMERCADO RIO VIDA CA',
    identificacion: '500585039',
    tipoDoc: 'J',
    nombre: 'SUPERMERCADO RIO VIDA CA',
  });
  assert.equal(normalizarDocumento({ tipoDoc: 'P', identificacion: 'EM2849387' }).identificacion, 'EM2849387');
});

test('priorizar: espacio de persona natural con RIF J + cédula → manda la cédula; el RIF queda como adicional', () => {
  const f = { ...RIF, documentosAdicionales: [CEDULA] };
  assert.equal(priorizarPersonaNatural(f), true);
  assert.equal(f.documentoTipo, 'cedula');
  assert.equal(f.tipoDoc, 'V');
  assert.equal(f.identificacion, '17671805');
  assert.equal(f.nombre, 'JHON');
  assert.equal(f.rif, null);
  assert.equal(f.razonSocial, null);
  assert.equal(f.direccionFiscal, undefined);
  assert.equal(f.documentosAdicionales[0].rif, 'J-50058503-9');
});

test('priorizar: sin persona natural adicional, o principal ya natural → no cambia nada', () => {
  const soloRif = { ...RIF };
  assert.equal(priorizarPersonaNatural(soloRif), false);
  assert.deepEqual(soloRif, RIF);
  const natural = { ...CEDULA, documentosAdicionales: [{ tipoDoc: 'J', rif: 'J-1' }] };
  assert.equal(priorizarPersonaNatural(natural), false);
  assert.equal(natural.identificacion, '17671805');
});

test('runOcr (tomador, cédula o RIF): RIF + cédula → RIF principal y documentosAdicionales sin cambios', async () => {
  respuesta = { fields: { ...RIF, documentosAdicionales: [CEDULA] }, meta: META };
  const r = await runOcr(FILE, 'cedula', null, { aceptaRif: true });
  assert.equal(r.mismatch, undefined);
  assert.equal(r.fields.tipoDoc, 'J');
  assert.deepEqual(r.fields.documentosAdicionales, [CEDULA]);
  assert.equal('documentoTipo' in r.fields, false);
});

test('runOcr (tomador persona natural, una sola cédula) → igual que antes, sin documentosAdicionales', async () => {
  respuesta = { fields: { documentoTipo: 'cedula', ...CEDULA }, meta: META };
  const r = await runOcr(FILE, 'cedula', null, { aceptaRif: true });
  assert.equal(r.mismatch, undefined);
  assert.deepEqual(r.fields, CEDULA);
});

test('runOcr (titular, rifSoloNatural): RIF J + cédula → no se rechaza; manda la cédula', async () => {
  respuesta = { fields: { ...RIF, documentosAdicionales: [CEDULA] }, meta: META };
  const r = await runOcr(FILE, 'cedula', null, { aceptaRif: true, rifSoloNatural: true });
  assert.equal(r.mismatch, undefined);
  assert.equal(r.fields.identificacion, '17671805');
  assert.equal(r.fields.tipoDoc, 'V');
});

test('runOcr (titular, rifSoloNatural): solo el RIF J → se rechaza como antes', async () => {
  respuesta = { fields: { ...RIF }, meta: META };
  const r = await runOcr(FILE, 'cedula', null, { aceptaRif: true, rifSoloNatural: true });
  assert.equal(r.fields, null);
  assert.equal(r.mismatch.detectedLabel, 'RIF de empresa');
});

test('normalizeCedulaFields: RIF + cédula → principales del RIF y la cédula limpia en documentosAdicionales', { skip: !normalizeCedulaFields }, () => {
  const f = normalizeCedulaFields({
    documentoTipo: 'rif',
    tipoDoc: 'J',
    rif: 'J-50058503-9',
    identificacion: '500585039',
    razonSocial: 'SUPERMERCADO RIO VIDA C.A',
    documentosAdicionales: [{ tipoDoc: 'V', identificacion: '17.671.805', nombre: 'JHON', apellido: 'PEREZ GARCIA' }],
  });
  assert.equal(f.rif, 'J-50058503-9');
  assert.equal(f.nombre, 'SUPERMERCADO RIO VIDA C.A');
  assert.deepEqual(f.documentosAdicionales, [CEDULA]);
});

test('normalizeCedulaFields: una sola cédula → sin documentosAdicionales', { skip: !normalizeCedulaFields }, () => {
  const f = normalizeCedulaFields({ documentoTipo: 'cedula', ...CEDULA, documentosAdicionales: [] });
  assert.equal('documentosAdicionales' in f, false);
  assert.equal(f.identificacion, '17671805');
});
