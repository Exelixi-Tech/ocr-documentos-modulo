'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { aplicarGuardRif, parseRifText } = require('../src/services/rifNormalizer');

const FIX = path.join(__dirname, 'fixtures');
const esperado = JSON.parse(fs.readFileSync(path.join(FIX, 'rif-esperado.json'), 'utf8'));
const CAMPOS = [
  'documentoTipo', 'tipoDoc', 'rif', 'identificacion', 'razonSocial', 'nombre', 'apellido',
  'direccionFiscal', 'estadoFiscal', 'zonaPostal', 'fechaInscripcion', 'fechaActualizacion',
  'fechaVencimiento', 'nComprobante',
];

let normalizeCedulaFields = null;
let validateCriticalFields = null;
try {
  ({ normalizeCedulaFields, validateCriticalFields } = require('../src/services/geminiProvider')._internal);
} catch {
  // Sin node_modules (@google/genai) se prueba solo el guard puro.
}

for (const [nombre, exp] of Object.entries(esperado)) {
  test(`parseRifText ${nombre}`, () => {
    const texto = fs.readFileSync(path.join(FIX, `${nombre}.txt`), 'utf8');
    const out = parseRifText(texto);
    for (const k of CAMPOS) assert.equal(out[k], exp[k], `campo ${k}`);
    assert.notEqual(out.identificacion, exp._noDebeSer.identificacion);
  });

  test(`guard corrige salida errónea de Gemini ${nombre}`, () => {
    const firma = exp._noDebeSer.identificacion;
    const gemini = {
      documentoTipo: 'cedula',
      tipoDoc: null,
      rif: `${firma}-XYZ`,
      identificacion: firma,
      razonSocial: exp.razonSocial,
      nombre: null,
      apellido: 'CA',
      sexo: 'Masculino',
      estadoCivil: 'Soltero(a)',
      fechaNacimiento: '2000-01-01',
      direccionFiscal: `${exp.direccionFiscal} ${exp.estadoFiscal} ZONA POSTAL ${exp.zonaPostal}`,
      fechaInscripcion: exp.fechaInscripcion.split('-').reverse().join('/'),
      nComprobante: exp.nComprobante,
    };
    const out = normalizeCedulaFields ? normalizeCedulaFields(gemini) : aplicarGuardRif(gemini);
    assert.equal(out.tipoDoc, 'J');
    assert.equal(out.identificacion, exp.identificacion);
    assert.equal(out.rif, exp.rif);
    assert.equal(out.nombre, exp.razonSocial);
    assert.equal(out.apellido, null);
    assert.equal(out.sexo, null);
    assert.equal(out.estadoCivil, null);
    assert.equal(out.fechaNacimiento, null);
    assert.equal(out.direccionFiscal, exp.direccionFiscal);
    assert.equal(out.estadoFiscal, exp.estadoFiscal);
    assert.equal(out.zonaPostal, exp.zonaPostal);
    assert.equal(out.fechaInscripcion, exp.fechaInscripcion);
  });
}

test('guard no toca cédula colombiana de 10 dígitos (persona natural)', () => {
  const out = aplicarGuardRif({ documentoTipo: 'cedula', tipoDoc: 'E', identificacion: '1007028627', nombre: 'ANA', apellido: 'PEREZ' });
  assert.equal(out.identificacion, '1007028627');
  assert.equal(out.apellido, 'PEREZ');
});

test('guard: J con 8 dígitos sin DV se descarta (exige 9)', () => {
  const out = aplicarGuardRif({ documentoTipo: 'rif', tipoDoc: 'J', identificacion: '31300549', razonSocial: 'X C.A.' });
  assert.equal(out.identificacion, null);
});

// Bug QA 02-nov: "Cédula o RIF del tomador" con RIF clásico SENIAT (UNISA) devolvía datos vacíos.
// Gemini dejó el RIF pegado a la razón social y el comprobante en identificacion.
// Orden obligatorio: normalizar (guard) → validar campos críticos (cedula_rif).
test('cedula_rif clásico: normalizar recupera el RIF de la razón social y luego la validación pasa', () => {
  const linea = fs.readFileSync(path.join(FIX, 'rif-seniat-clasico-unisa.txt'), 'utf8')
    .split(/\r?\n/).find((l) => /^J313005495/.test(l));
  const gemini = {
    documentoTipo: 'rif',
    tipoDoc: null,
    rif: null,
    identificacion: '201609L0000030994895',
    razonSocial: linea,
    nombre: null,
    apellido: null,
    nComprobante: '201609L0000030994895',
  };
  const out = normalizeCedulaFields ? normalizeCedulaFields({ ...gemini }) : aplicarGuardRif({ ...gemini });
  assert.equal(out.tipoDoc, 'J');
  assert.equal(out.identificacion, '313005495');
  assert.equal(out.rif, 'J-31300549-5');
  assert.equal(out.razonSocial, 'UNIDAD INTEGRAL DE SALUD UNISA, C.A.');
  assert.equal(out.nombre, 'UNIDAD INTEGRAL DE SALUD UNISA, C.A.');
  assert.equal(out.apellido, null);
  if (validateCriticalFields) {
    assert.deepEqual(validateCriticalFields('cedula_rif', out), { ok: true, missing: [] });
    // Sin normalizar, la misma salida de Gemini no pasa (identificacion = comprobante, 18 dígitos).
    assert.equal(validateCriticalFields('cedula_rif', { ...gemini, identificacion: null }).ok, false);
  }
});

test('cedula_rif: razón social sin apellido es válida (nombre = razón social antes de validar)', () => {
  const out = aplicarGuardRif({ documentoTipo: 'rif', tipoDoc: 'J', rif: 'J-50697333-2', identificacion: null, razonSocial: 'EXELIXI TECH, C.A.', nombre: null, apellido: null });
  assert.equal(out.identificacion, '506973332');
  assert.equal(out.nombre, 'EXELIXI TECH, C.A.');
  if (validateCriticalFields) assert.equal(validateCriticalFields('cedula_rif', out).ok, true);
});
