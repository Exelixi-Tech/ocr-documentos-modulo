'use strict';

/**
 * Archivos con varios documentos (p. ej. PDF de 2 páginas: RIF de la empresa en la 1 y la cédula
 * de una persona en la 2), solo en el esquema «cédula o RIF» (`cedula_rif`).
 *
 * Gemini devuelve en los campos principales el RIF jurídico (J/G/C) si lo hay y cada otro documento
 * de identidad en `documentosAdicionales`. Aquí se limpia ese arreglo (sin llamar a Gemini) y, en
 * los espacios de persona natural (titular/asegurado/beneficiario de funerario), se vuelve a poner
 * como principal la persona natural para no rechazar el archivo por traer también un RIF jurídico.
 *
 * Caso real: póliza 7-7-7000003208 (Salud), tomador SUPERMERCADO RIO VIDA CA (J-50058503-9); el
 * monitor de expedientes de Nexus comparaba la cédula de la página 2 con el asegurado.
 */

const CAMPOS = ['tipoDoc', 'identificacion', 'rif', 'nombre', 'apellido', 'razonSocial'];
const TIPOS = new Set(['V', 'E', 'J', 'G', 'C', 'P']);
const JURIDICOS = new Set(['J', 'G', 'C']);
/** Tope de documentos adicionales por archivo. */
const MAX_ADICIONALES = 4;

function vacio(v) {
  if (v == null) return true;
  const s = String(v).trim();
  if (!s) return true;
  const u = s.toUpperCase();
  return u === 'NULL' || u === 'N/A' || u === 'NA' || u === 'NONE' || u === 'ND' || u === 'N/D';
}

function texto(v) {
  return vacio(v) ? null : String(v).trim();
}

/** Primera letra de un RIF o documento con prefijo («J-50058503-9» → «J»). */
function tipoDePrefijo(v) {
  const m = String(v || '').trim().toUpperCase().match(/^([VEJGCP])[-\s.]*\d/);
  return m ? m[1] : null;
}

/**
 * Un documento adicional limpio: solo los 6 campos, sin vacíos; identificación en dígitos (salvo
 * pasaporte), RIF en mayúsculas y tipo de documento deducido del prefijo. null si no trae número.
 */
function normalizarDocumento(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = {};
  for (const k of CAMPOS) {
    const v = texto(raw[k]);
    if (v) d[k] = v;
  }
  if (d.rif) d.rif = d.rif.toUpperCase();
  let tipo = d.tipoDoc ? d.tipoDoc.toUpperCase().slice(0, 1) : null;
  if (!tipo || !TIPOS.has(tipo)) tipo = tipoDePrefijo(d.rif) || tipoDePrefijo(d.identificacion);
  if (d.identificacion && tipo !== 'P') {
    const digitos = d.identificacion.replace(/\D/g, '');
    if (digitos) d.identificacion = digitos;
    else delete d.identificacion;
  }
  if (!d.identificacion && d.rif) {
    const digitos = d.rif.replace(/\D/g, '');
    if (digitos) d.identificacion = digitos;
  }
  if (!d.identificacion && !d.rif) return null;
  if (!tipo && d.identificacion) tipo = 'V';
  if (tipo) d.tipoDoc = tipo;
  else delete d.tipoDoc;
  if (d.razonSocial && !d.nombre) d.nombre = d.razonSocial;
  return d;
}

function numero(d) {
  return String((d && (d.identificacion || d.rif)) || '').replace(/\D/g, '');
}

/**
 * Limpia `documentosAdicionales` de una lectura ya normalizada: descarta lo vacío, lo que repite
 * el documento principal y los repetidos entre sí. Sin adicionales, el campo no se devuelve (la
 * lectura queda igual que antes). Modifica y devuelve `fields`.
 */
function limpiarDocumentosAdicionales(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const lista = Array.isArray(fields.documentosAdicionales) ? fields.documentosAdicionales : [];
  delete fields.documentosAdicionales;
  const principal = numero(fields);
  const vistos = new Set(principal ? [principal] : []);
  const out = [];
  for (const raw of lista) {
    const d = normalizarDocumento(raw);
    if (!d) continue;
    const n = numero(d);
    if (n && vistos.has(n)) continue;
    if (n) vistos.add(n);
    out.push(d);
    if (out.length >= MAX_ADICIONALES) break;
  }
  if (out.length) fields.documentosAdicionales = out;
  return fields;
}

/**
 * Espacio de persona natural (rifSoloNatural): si la lectura principal es un RIF jurídico pero el
 * archivo trae además el documento de una persona natural, esa persona pasa a ser la principal (el
 * RIF queda como adicional). Así el titular/asegurado/beneficiario no se rechaza por el RIF de la
 * empresa en otra página. Devuelve true si cambió algo.
 */
function priorizarPersonaNatural(fields) {
  if (!fields || typeof fields !== 'object') return false;
  const tipo = String(fields.tipoDoc || '').toUpperCase();
  if (!JURIDICOS.has(tipo)) return false;
  const lista = Array.isArray(fields.documentosAdicionales) ? fields.documentosAdicionales : [];
  const natural = lista.find((d) => d && !JURIDICOS.has(String(d.tipoDoc || '').toUpperCase()));
  if (!natural) return false;
  const juridico = {};
  for (const k of CAMPOS) if (fields[k] != null) juridico[k] = fields[k];
  for (const k of CAMPOS) delete fields[k];
  // Datos propios del RIF que no son de la persona.
  for (const k of [
    'direccionFiscal', 'estadoFiscal', 'zonaPostal', 'fechaInscripcion', 'fechaVencimiento',
    'fechaActualizacion', 'nComprobante',
  ]) delete fields[k];
  Object.assign(fields, natural);
  if (natural.rif == null) fields.rif = null;
  if (natural.razonSocial == null) fields.razonSocial = null;
  fields.documentoTipo = String(natural.tipoDoc || '').toUpperCase() === 'P' ? 'pasaporte' : 'cedula';
  fields.documentosAdicionales = [juridico, ...lista.filter((d) => d !== natural)];
  return true;
}

module.exports = {
  limpiarDocumentosAdicionales,
  priorizarPersonaNatural,
  normalizarDocumento,
  MAX_ADICIONALES,
};
