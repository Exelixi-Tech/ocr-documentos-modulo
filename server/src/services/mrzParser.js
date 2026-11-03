'use strict';

/**
 * Pasaporte (ICAO 9303, TD3): las dos líneas MRZ de 44 caracteres al pie del pasaporte.
 *   Línea 1: P + tipo + país emisor (3) + APELLIDOS<<NOMBRES
 *   Línea 2: número (9) + DV + nacionalidad (3) + nacimiento AAMMDD + DV + sexo + vencimiento AAMMDD + DV + …
 * Los dígitos de control (pesos 7-3-1) validan número, nacimiento y vencimiento; un campo con
 * DV inválido no se usa (se deja la lectura visual de Gemini).
 */

function charValue(c) {
  if (c === '<') return 0;
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return -1;
}

function checkDigit(str) {
  const pesos = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const v = charValue(str[i]);
    if (v < 0) return -1;
    sum += v * pesos[i % 3];
  }
  return sum % 10;
}

function dvOk(campo, dv) {
  return /^\d$/.test(dv) && checkDigit(campo) === Number(dv);
}

/** AAMMDD → YYYY-MM-DD. Nacimiento: un año mayor al actual es del siglo pasado. */
function mrzFecha(aammdd, { nacimiento = false } = {}) {
  if (!/^\d{6}$/.test(aammdd)) return null;
  const yy = Number(aammdd.slice(0, 2));
  const mm = aammdd.slice(2, 4);
  const dd = aammdd.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  const actual = new Date().getFullYear() % 100;
  const siglo = nacimiento ? (yy > actual ? 1900 : 2000) : 2000;
  return `${siglo + yy}-${mm}-${dd}`;
}

/** Saca las dos líneas TD3 de un texto libre (Gemini puede meter espacios o unirlas). */
function extraerLineas(texto) {
  const t = String(texto || '').toUpperCase().replace(/[«‹]/g, '<');
  let lineas = t
    .split(/\r?\n|\|/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length >= 30 && /^[A-Z0-9<]+$/.test(l));
  if (lineas.length === 1 && lineas[0].length >= 80) {
    lineas = [lineas[0].slice(0, 44), lineas[0].slice(44)];
  }
  if (lineas.length < 2) {
    const junto = t.replace(/\s+/g, '');
    const m = junto.match(/(P[A-Z<][A-Z<]{3}[A-Z<]{39})([A-Z0-9<]{44})/);
    if (m) lineas = [m[1], m[2]];
  }
  const i = lineas.findIndex((l, idx) => l[0] === 'P' && lineas[idx + 1]);
  if (i < 0) return null;
  return [lineas[i].padEnd(44, '<').slice(0, 44), lineas[i + 1].padEnd(44, '<').slice(0, 44)];
}

function limpiarNombre(s) {
  return String(s || '').replace(/<+/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

/**
 * @returns {null | {
 *   numero, numeroValido, apellido, nombre, nacionalidad, paisEmisor,
 *   fechaNacimiento, fechaNacimientoValida, sexo, fechaVencimiento
 * }}
 */
function parseMrz(texto) {
  const lineas = extraerLineas(texto);
  if (!lineas) return null;
  const [l1, l2] = lineas;

  const paisEmisor = l1.slice(2, 5).replace(/</g, '') || null;
  const nombres = l1.slice(5);
  const sep = nombres.indexOf('<<');
  const apellido = limpiarNombre(sep >= 0 ? nombres.slice(0, sep) : nombres);
  const nombre = sep >= 0 ? limpiarNombre(nombres.slice(sep + 2)) : null;

  const numCampo = l2.slice(0, 9);
  const numero = numCampo.replace(/</g, '') || null;
  const numeroValido = dvOk(numCampo, l2[9]);
  const nacionalidad = l2.slice(10, 13).replace(/</g, '') || null;
  const nacCampo = l2.slice(13, 19);
  const fechaNacimientoValida = dvOk(nacCampo, l2[19]);
  const sexoRaw = l2[20];
  const sexo = sexoRaw === 'M' || sexoRaw === 'F' ? sexoRaw : null;
  const vencCampo = l2.slice(21, 27);

  return {
    numero,
    numeroValido,
    apellido,
    nombre,
    nacionalidad,
    paisEmisor,
    fechaNacimiento: mrzFecha(nacCampo, { nacimiento: true }),
    fechaNacimientoValida,
    sexo,
    fechaVencimiento: dvOk(vencCampo, l2[27]) ? mrzFecha(vencCampo) : null,
  };
}

/**
 * Aplica la MRZ sobre los campos que devolvió Gemini (muta y devuelve `fields`).
 * Solo actúa si es pasaporte (documentoTipo 'pasaporte', tipoDoc 'P' o hay MRZ).
 */
function aplicarPasaporte(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const mrz = parseMrz(fields.mrz);
  const esPasaporte =
    fields.documentoTipo === 'pasaporte' || String(fields.tipoDoc || '').toUpperCase() === 'P' || Boolean(mrz);
  if (!esPasaporte) return fields;

  fields.documentoTipo = 'pasaporte';
  fields.tipoDoc = 'P';
  if (mrz) {
    if (mrz.numero && mrz.numeroValido) fields.identificacion = mrz.numero;
    if (mrz.apellido) fields.apellido = mrz.apellido;
    if (mrz.nombre) fields.nombre = mrz.nombre;
    if (mrz.fechaNacimiento && mrz.fechaNacimientoValida) fields.fechaNacimiento = mrz.fechaNacimiento;
    if (mrz.sexo) fields.sexo = mrz.sexo === 'F' ? 'Femenino' : 'Masculino';
    if (mrz.nacionalidad) fields.nacionalidad = mrz.nacionalidad;
    if (mrz.paisEmisor) fields.paisPasaporte = mrz.paisEmisor;
    if (mrz.fechaVencimiento) fields.fechaVencimientoPasaporte = mrz.fechaVencimiento;
    fields.mrzValida = mrz.numeroValido && mrz.fechaNacimientoValida;
  }
  // Pasaporte: número alfanumérico tal cual (sin puntos, guiones ni espacios).
  if (fields.identificacion) {
    fields.identificacion = String(fields.identificacion).toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
  }
  // El pasaporte no trae estado civil ni RIF.
  fields.estadoCivil = fields.estadoCivil || null;
  fields.rif = null;
  fields.paisEmisor = null;
  return fields;
}

module.exports = { parseMrz, aplicarPasaporte, checkDigit };
