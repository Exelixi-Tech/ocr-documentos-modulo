/**
 * Nombre o apellido que en realidad es otro campo o un rótulo del documento (24-nov-2026).
 *
 * Con la foto de la cédula girada, el modelo a veces devuelve el valor de «Sexo» o «Estado civil»
 * (o un rótulo impreso) en `nombre` / `apellido`. El wizard lo precargaba y la póliza se registró con
 * el nombre «Masculino» (RCV 18-1-0000139376). Aquí se deja el campo vacío para que se pida.
 *
 * Lista cerrada y comparación del VALOR COMPLETO: un nombre compuesto o una razón social que
 * contenga una de estas palabras («Venezolana de Instrumentación…», «María Soltero») no se toca.
 */

/** Valores que nunca son un nombre ni un apellido. */
const NO_ES_DATO = new Set([
  // Sexo
  'M', 'F', 'MASC', 'FEM', 'MASCULINO', 'FEMENINO', 'SEXO',
  // Estado civil
  'SOLTERO A', 'CASADO A', 'DIVORCIADO A', 'VIUDO A', 'CONCUBINO A',
  'SOLTERA', 'CASADA', 'DIVORCIADO', 'DIVORCIADA', 'VIUDO', 'VIUDA', 'CONCUBINO', 'CONCUBINA',
  'ESTADO CIVIL', 'EDO CIVIL', 'E CIVIL',
  // Nacionalidad
  'VENEZOLANO', 'VENEZOLANA', 'VENEZOLANO A', 'EXTRANJERO', 'EXTRANJERA', 'EXTRANJERO A', 'NACIONALIDAD',
  // Rótulos de la cédula
  'NOMBRE', 'NOMBRES', 'APELLIDO', 'APELLIDOS', 'NOMBRES Y APELLIDOS', 'NOMBRE Y APELLIDO',
  'APELLIDOS Y NOMBRES', 'CEDULA', 'CEDULA DE IDENTIDAD', 'IDENTIFICACION',
  'REPUBLICA BOLIVARIANA DE VENEZUELA', 'FIRMA', 'FIRMA TITULAR', 'FIRMA DEL TITULAR', 'TITULAR',
  'DIRECTOR', 'FECHA DE NACIMIENTO', 'F NACIMIENTO', 'F EXPEDICION', 'F VENCIMIENTO',
]);

/** «Soltero» y «Casado» son también apellidos reales: en `apellido` se respetan; en `nombre` no. */
const SOLO_EN_NOMBRE = new Set(['SOLTERO', 'CASADO']);

function normalizar(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim();
}

/**
 * @param {unknown} valor
 * @param {'nombre'|'apellido'} [campo]
 * @returns {boolean} true si el valor completo es sexo, estado civil, nacionalidad o un rótulo.
 */
function noEsNombre(valor, campo = 'nombre') {
  const n = normalizar(valor);
  if (!n) return false;
  if (NO_ES_DATO.has(n)) return true;
  return campo === 'nombre' && SOLO_EN_NOMBRE.has(n);
}

/**
 * Deja en null `nombre` / `apellido` cuando no son un dato (muta y devuelve `fields`). No aplica a
 * personas jurídicas (J/G/C): ahí `nombre` es la razón social.
 */
function limpiarNombres(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const tipo = String(fields.tipoDoc || '').trim().toUpperCase();
  const rif = String(fields.rif || '').trim().toUpperCase();
  if (['J', 'G', 'C'].includes(tipo) || /^[JGC]/.test(rif)) return fields;
  for (const campo of ['nombre', 'apellido']) {
    if (fields[campo] != null && noEsNombre(fields[campo], campo)) fields[campo] = null;
  }
  return fields;
}

module.exports = { noEsNombre, limpiarNombres };
