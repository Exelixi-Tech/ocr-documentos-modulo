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
try {
  ({ normalizeCedulaFields } = require('../src/services/geminiProvider')._internal);
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
