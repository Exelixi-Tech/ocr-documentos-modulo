'use strict';

/**
 * RCV 18-1-0000139376 (foto de cédula girada): el modelo devolvió el sexo en `nombre` y el wizard
 * lo precargó. El OCR nunca devuelve sexo, estado civil, nacionalidad ni un rótulo como nombre o
 * apellido: deja el campo vacío. Lista cerrada y valor completo: los nombres reales no se tocan.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { noEsNombre, limpiarNombres } = require('../src/services/nombreNoEsDato');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test';
const { _internal } = require('../src/services/geminiProvider');

test('sexo, estado civil, nacionalidad y rótulos no son un nombre', () => {
  for (const v of [
    'Masculino', 'FEMENINO', 'M', 'f', 'Soltero(a)', 'SOLTERA', 'Casado', 'Divorciado(a)', 'VIUDA',
    'Venezolano', 'VENEZOLANA', 'Extranjero', 'NOMBRES', 'Apellidos', 'NOMBRES Y APELLIDOS',
    'CÉDULA DE IDENTIDAD', 'Estado Civil', 'República Bolivariana de Venezuela', 'FIRMA TITULAR',
  ]) {
    assert.equal(noEsNombre(v, 'nombre'), true, v);
  }
});

test('nombres y apellidos reales no se tocan (valor completo, sin prefijos)', () => {
  for (const [v, campo] of [
    ['Danry Fernando', 'nombre'], ['RODRIGUEZ PEÑA', 'apellido'], ['María de los Ángeles', 'nombre'],
    ['Casado', 'apellido'], ['SOLTERO', 'apellido'], ['Soltero Casado', 'apellido'],
    ['Viuda de Pérez', 'apellido'], ['Venezolana de Instrumentación Mecanica y Electricidad Venime', 'nombre'],
    ['Nacional de Seguros', 'nombre'], ['Mía', 'nombre'], ['Fe', 'nombre'], ['', 'nombre'], [null, 'nombre'],
  ]) {
    assert.equal(noEsNombre(v, campo), false, String(v));
  }
});

test('cédula girada: nombre «Masculino» → null y se conservan número y apellido', () => {
  const f = _internal.normalizeCedulaFields({
    documentoTipo: 'cedula',
    nombre: 'Masculino',
    apellido: 'RODRIGUEZ PEÑA',
    identificacion: 'V-13.307.292',
    sexo: 'Masculino',
    estadoCivil: 'Soltero(a)',
  });
  assert.equal(f.nombre, null);
  assert.equal(f.apellido, 'RODRIGUEZ PEÑA');
  assert.equal(f.identificacion, '13307292');
  assert.equal(f.sexo, 'Masculino');
});

test('cédula bien leída: sin cambios', () => {
  const f = _internal.normalizeCedulaFields({
    documentoTipo: 'cedula',
    nombre: 'DANRY FERNANDO',
    apellido: 'RODRIGUEZ PEÑA',
    identificacion: '13307292',
    sexo: 'Masculino',
  });
  assert.equal(f.nombre, 'DANRY FERNANDO');
  assert.equal(f.apellido, 'RODRIGUEZ PEÑA');
});

test('apellido «VENEZOLANO» y nombre «NOMBRES» → null los dos (sin datos críticos de nombre)', () => {
  const f = _internal.normalizeCedulaFields({
    documentoTipo: 'cedula',
    nombre: 'NOMBRES',
    apellido: 'VENEZOLANO',
    identificacion: '13307292',
  });
  assert.equal(f.nombre, null);
  assert.equal(f.apellido, null);
  assert.equal(_internal.validateCriticalFields('cedula', f).ok, false);
});

test('empresa (RIF J): la razón social no se toca aunque empiece por «Venezolana» o sea «Femenino»', () => {
  const a = limpiarNombres({
    tipoDoc: 'J',
    rif: 'J-30123456-7',
    nombre: 'Venezolana de Instrumentación Mecanica y Electricidad Venime',
  });
  assert.equal(a.nombre, 'Venezolana de Instrumentación Mecanica y Electricidad Venime');
  const b = limpiarNombres({ tipoDoc: 'J', rif: 'J-30123456-7', nombre: 'FEMENINO' });
  assert.equal(b.nombre, 'FEMENINO');
});

test('documentos adicionales del mismo archivo también se limpian', () => {
  const f = _internal.normalizeCedulaFields({
    documentoTipo: 'cedula',
    nombre: 'ANA',
    apellido: 'LOPEZ',
    identificacion: '8111222',
    documentosAdicionales: [
      { documentoTipo: 'cedula', nombre: 'Femenino', apellido: 'PEREZ', identificacion: '9222333', tipoDoc: 'V' },
    ],
  });
  const ad = (f.documentosAdicionales || [])[0];
  if (ad) {
    assert.equal(ad.nombre ?? null, null);
    assert.equal(ad.apellido, 'PEREZ');
  }
});
