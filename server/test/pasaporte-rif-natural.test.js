'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMrz, aplicarPasaporte, checkDigit } = require('../src/services/mrzParser');
const { aplicarGuardRif } = require('../src/services/rifNormalizer');

// Caso real (3-nov): pasaporte China, HUANG ZHIZHONG, EM2849387, 24-FEB-1988, M, CHN.
function lineaDos() {
  const venc = '340315';
  const base = `EM28493875CHN8802244M${venc}${checkDigit(venc)}`;
  const personal = '<<<<<<<<<<<<<<';
  const sinComp = `${base}${personal}${checkDigit(personal)}`;
  const comp = sinComp.slice(0, 10) + sinComp.slice(13, 20) + sinComp.slice(21, 43);
  return `${sinComp}${checkDigit(comp)}`;
}
const L1 = 'POCHNHUANG<<ZHIZHONG'.padEnd(44, '<');

test('MRZ caso real: número, apellido, nombre, nacimiento, sexo, nacionalidad', () => {
  const r = parseMrz(`${L1}\n${lineaDos()}`);
  assert.equal(r.numero, 'EM2849387');
  assert.equal(r.numeroValido, true);
  assert.equal(r.apellido, 'HUANG');
  assert.equal(r.nombre, 'ZHIZHONG');
  assert.equal(r.fechaNacimiento, '1988-02-24');
  assert.equal(r.fechaNacimientoValida, true);
  assert.equal(r.sexo, 'M');
  assert.equal(r.nacionalidad, 'CHN');
});

test('MRZ con espacios y en una sola línea también se lee', () => {
  const r = parseMrz(`${L1} ${lineaDos()}`.replace(/(.{10})/g, '$1 '));
  assert.equal(r.numero, 'EM2849387');
});

test('aplicarPasaporte: MRZ manda sobre la lectura visual y conserva el número alfanumérico', () => {
  const f = aplicarPasaporte({
    documentoTipo: 'pasaporte', identificacion: 'EM 2849381', nombre: 'ZHI', apellido: 'HUANG',
    mrz: `${L1}\n${lineaDos()}`,
  });
  assert.equal(f.tipoDoc, 'P');
  assert.equal(f.identificacion, 'EM2849387');
  assert.equal(f.apellido, 'HUANG');
  assert.equal(f.nombre, 'ZHIZHONG');
  assert.equal(f.fechaNacimiento, '1988-02-24');
  assert.equal(f.sexo, 'Masculino');
  assert.equal(f.nacionalidad, 'CHN');
  assert.equal(f.mrzValida, true);
});

test('aplicarPasaporte: dígito de control inválido → no usa el número del MRZ', () => {
  const malo = lineaDos().replace('EM28493875', 'EM28493870');
  const f = aplicarPasaporte({ documentoTipo: 'pasaporte', identificacion: 'EM2849387', mrz: `${L1}\n${malo}` });
  assert.equal(f.identificacion, 'EM2849387');
  assert.equal(f.mrzValida, false);
});

test('aplicarPasaporte no toca una cédula', () => {
  const f = aplicarPasaporte({ documentoTipo: 'cedula', tipoDoc: 'V', identificacion: '12345678' });
  assert.equal(f.tipoDoc, 'V');
  assert.equal(f.identificacion, '12345678');
});

test('RIF V personal → persona natural con cédula de 8 dígitos (sin DV), no empresa', () => {
  const f = aplicarGuardRif({
    documentoTipo: 'rif', rif: 'V-12345678-9', identificacion: '123456789', tipoDoc: 'V',
    nombre: 'JUAN', apellido: 'PEREZ', direccionFiscal: 'AV. URDANETA CARACAS DISTRITO CAPITAL ZONA POSTAL 1010',
  });
  assert.equal(f.tipoDoc, 'V');
  assert.equal(f.identificacion, '12345678');
  assert.equal(f.rif, 'V-12345678-9');
  assert.equal(f.apellido, 'PEREZ');
  assert.equal(f.rifPersonaNatural, true);
  assert.equal(f.zonaPostal, '1010');
});

test('RIF E personal de extranjero → E con cédula sin DV; cero a la izquierda se quita', () => {
  const f = aplicarGuardRif({ documentoTipo: 'rif', rif: 'E-08412345-6', tipoDoc: 'E', nombre: 'ZHIZHONG HUANG' });
  assert.equal(f.tipoDoc, 'E');
  assert.equal(f.identificacion, '8412345');
});

test('RIF J sigue siendo jurídico con 9 dígitos', () => {
  const f = aplicarGuardRif({ documentoTipo: 'rif', rif: 'J-31300549-5', razonSocial: 'UNIDAD INTEGRAL CA', apellido: 'X' });
  assert.equal(f.tipoDoc, 'J');
  assert.equal(f.identificacion, '313005495');
  assert.equal(f.nombre, 'UNIDAD INTEGRAL CA');
  assert.equal(f.apellido, null);
  assert.equal(f.rifPersonaNatural, undefined);
});

test('cédula V de 8 dígitos sin RIF no se altera', () => {
  const f = aplicarGuardRif({ documentoTipo: 'cedula', tipoDoc: 'V', identificacion: '12345678', apellido: 'PEREZ' });
  assert.equal(f.identificacion, '12345678');
});

test('normalizeCedulaFields: pasaporte en slot de cédula conserva EM2849387 y nacionalidad', () => {
  let normalizeCedulaFields;
  try {
    ({ normalizeCedulaFields } = require('../src/services/geminiProvider')._internal);
  } catch {
    return; // sin node_modules
  }
  const f = normalizeCedulaFields({
    documentoTipo: 'pasaporte', tipoDoc: 'P', identificacion: 'EM2849387', nombre: 'ZHIZHONG',
    apellido: 'HUANG', nacionalidad: 'CHN', mrz: `${L1}\n${lineaDos()}`, sexo: 'Masculino',
  });
  assert.equal(f.identificacion, 'EM2849387');
  assert.equal(f.tipoDoc, 'P');
  assert.equal(f.nacionalidad, 'CHN');
  assert.equal(f.fechaNacimiento, '1988-02-24');
});

test('normalizeCedulaFields: RIF V personal en cedula_rif → cédula 8 dígitos', () => {
  let normalizeCedulaFields;
  try {
    ({ normalizeCedulaFields } = require('../src/services/geminiProvider')._internal);
  } catch {
    return;
  }
  const f = normalizeCedulaFields({ documentoTipo: 'rif', rif: 'V-12345678-9', identificacion: '123456789', tipoDoc: 'V', nombre: 'JUAN', apellido: 'PEREZ' });
  assert.equal(f.identificacion, '12345678');
  assert.equal(f.tipoDoc, 'V');
});
