'use strict';

/**
 * Normalización determinista del RIF (SENIAT) leído por OCR.
 *
 * Gemini a veces confunde el RIF con el código de "FIRMA AUTORIZADA / SISTEMA"
 * (10 dígitos + 3 letras, ej. 3313005495-IKX) o con el N° COMPROBANTE. Este
 * módulo no depende de Gemini: corrige/valida lo que venga y además ofrece
 * `parseRifText` para leer el texto plano de un RIF (clásico y RIF Digital v2.0).
 *
 * Reglas:
 *  - RIF = letra V/E/J/G/C/P + 9 dígitos (con o sin guiones, o tras "RIF:").
 *  - J/G/C exigen 9 dígitos (8 + dígito verificador).
 *  - El código `\d{10}-[A-Z]{3}` es la firma: primer dígito = tipo (1=V, 2=E,
 *    3=J, 4=P, 5=G) y los 9 restantes = RIF. Nunca se usa como identificación.
 *  - Persona jurídica: nombre = razón social, apellido/sexo/estado civil/fnac = null.
 */

const PJ_TIPOS = new Set(['J', 'G', 'C']);
const FIRMA_RE = /\b(\d{10})-?([A-Z]{3})\b/;
const FIRMA_TIPO = { 1: 'V', 2: 'E', 3: 'J', 4: 'P', 5: 'G' };

const ESTADOS_VE = [
  'DISTRITO CAPITAL', 'AMAZONAS', 'ANZOATEGUI', 'APURE', 'ARAGUA', 'BARINAS', 'BOLIVAR',
  'CARABOBO', 'COJEDES', 'DELTA AMACURO', 'FALCON', 'GUARICO', 'LARA', 'MERIDA', 'MIRANDA',
  'MONAGAS', 'NUEVA ESPARTA', 'PORTUGUESA', 'SUCRE', 'TACHIRA', 'TRUJILLO', 'LA GUAIRA',
  'VARGAS', 'YARACUY', 'ZULIA', 'DEPENDENCIAS FEDERALES',
];

function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (['NULL', 'N/A', 'NA', 'NONE', 'ND', 'N/D'].includes(u)) return null;
  return s;
}

/** DD/MM/YYYY, DD-MM-YYYY o YYYY-MM-DD → YYYY-MM-DD (null si no es fecha válida). */
function toIsoDate(raw) {
  const s = clean(raw);
  if (!s) return null;
  let y; let m; let d;
  const iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (iso) [, y, m, d] = iso.map(Number);
  else if (dmy) [, d, m, y] = dmy.map(Number);
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Busca un RIF (letra + 9 dígitos) en un texto, ignorando la firma y el comprobante. */
function findRif(text) {
  const t = String(text || '').toUpperCase();
  const re = /(?:^|[^A-Z0-9])([VEJGCP])[-\s.]?(\d{8})[-\s.]?(\d)(?!\d)/g;
  let m;
  while ((m = re.exec(t))) {
    return { letra: m[1], digitos: `${m[2]}${m[3]}` };
  }
  return null;
}

function formatRif(letra, digitos) {
  if (!letra || !/^\d{9}$/.test(String(digitos || ''))) return null;
  return `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}`;
}

/** Separa el estado del final del domicilio fiscal (SENIAT lo imprime pegado). */
function splitEstado(direccion) {
  const dir = clean(direccion);
  if (!dir) return { direccion: null, estado: null };
  const plain = stripAccents(dir).toUpperCase();
  const candidatos = [...ESTADOS_VE].sort((a, b) => b.length - a.length);
  for (const est of candidatos) {
    if (plain.endsWith(` ${est}`) || plain === est) {
      const resto = dir.slice(0, dir.length - est.length).replace(/[\s,]+$/, '').trim();
      return { direccion: resto || null, estado: est };
    }
  }
  return { direccion: dir, estado: null };
}

/**
 * Lectura determinista del texto de un RIF (SENIAT clásico o RIF Digital v2.0).
 * Devuelve los mismos campos que el esquema Gemini `cedula_rif` / `rif`.
 */
function parseRifText(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = {
    documentoTipo: 'rif',
    tipoDoc: null,
    rif: null,
    identificacion: null,
    razonSocial: null,
    nombre: null,
    apellido: null,
    direccionFiscal: null,
    estadoFiscal: null,
    zonaPostal: null,
    fechaInscripcion: null,
    fechaActualizacion: null,
    fechaVencimiento: null,
    nComprobante: null,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const up = stripAccents(line).toUpperCase();
    if (FIRMA_RE.test(up) && /FIRMA|SISTEMA/.test(up)) continue;

    const comp = up.match(/COMPROBANTE[^A-Z0-9]*([0-9A-Z]{10,})/);
    if (comp) { out.nComprobante = comp[1]; continue; }

    if (!out.rif) {
      const tras = up.match(/^RIF\s*:?\s*(.*)$/);
      const objetivo = tras ? tras[1] : up;
      const r = findRif(objetivo);
      if (r && (tras || /^[VEJGCP][-\s.]?\d/.test(up))) {
        out.tipoDoc = r.letra;
        out.identificacion = r.digitos;
        out.rif = formatRif(r.letra, r.digitos);
        // Formato clásico: razón social a la derecha del RIF.
        const derecha = line.replace(/^(RIF\s*:?\s*)?[VEJGCP][-\s.]?\d{8}[-\s.]?\d\s*/i, '').trim();
        if (derecha) out.razonSocial = derecha;
        else if (lines[i + 1]) out.razonSocial = lines[i + 1]; // RIF Digital v2.0
        continue;
      }
    }

    const dom = line.match(/DOMICILIO\s+FISCAL\s*:?\s*(.*)$/i);
    if (dom) {
      let cuerpo = dom[1];
      const zp = cuerpo.match(/ZONA\s+POSTAL\s*:?\s*(\d{4})/i);
      if (zp) out.zonaPostal = zp[1];
      cuerpo = cuerpo.replace(/ZONA\s+POSTAL.*$/i, '').trim();
      const { direccion, estado } = splitEstado(cuerpo);
      out.direccionFiscal = direccion;
      out.estadoFiscal = estado;
      continue;
    }

    const fecha = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (fecha) {
      if (/INSCRIPCI/.test(up)) out.fechaInscripcion = toIsoDate(fecha[1]);
      else if (/ACTUALIZACI/.test(up)) out.fechaActualizacion = toIsoDate(fecha[1]);
      else if (/VENCIMIENTO/.test(up)) out.fechaVencimiento = toIsoDate(fecha[1]);
    }
  }

  if (out.tipoDoc && PJ_TIPOS.has(out.tipoDoc)) out.nombre = out.razonSocial;
  return out;
}

/**
 * Guard determinista sobre los campos que devolvió Gemini (muta y devuelve `fields`).
 * Solo actúa cuando el documento es un RIF o el tipo es J/G/C: no altera cédulas
 * de persona natural (V/E, incluida la colombiana de 10 dígitos).
 */
function aplicarGuardRif(fields) {
  if (!fields || typeof fields !== 'object') return fields;

  for (const k of ['direccionFiscal', 'estadoFiscal', 'zonaPostal', 'nComprobante', 'razonSocial']) {
    if (k in fields) fields[k] = clean(fields[k]);
  }
  for (const k of ['fechaInscripcion', 'fechaActualizacion', 'fechaVencimiento']) {
    if (k in fields) fields[k] = toIsoDate(fields[k]);
  }
  if (fields.zonaPostal) {
    const zp = String(fields.zonaPostal).match(/\d{4}/);
    fields.zonaPostal = zp ? zp[0] : null;
  }

  let tipo = clean(fields.tipoDoc)?.toUpperCase() || null;
  const esRif =
    fields.documentoTipo === 'rif' ||
    PJ_TIPOS.has(tipo) ||
    /^[JGC]/i.test(String(fields.rif || '')) ||
    FIRMA_RE.test(String(fields.rif || '').toUpperCase()) ||
    Boolean(fields.nComprobante) ||
    PJ_TIPOS.has(findRif(`${fields.razonSocial || ''} ${fields.nombre || ''}`)?.letra);
  if (!esRif) return fields;

  // 1) El campo rif puede traer la firma (3313005495-IKX): se descarta o se recupera.
  let rifLetra = null;
  let rifDigitos = null;
  const rifTxt = stripAccents(String(fields.rif || '')).toUpperCase();
  const firmaEnRif = rifTxt.match(FIRMA_RE);
  if (firmaEnRif) {
    rifLetra = FIRMA_TIPO[firmaEnRif[1][0]] || null;
    rifDigitos = firmaEnRif[1].slice(1);
  } else {
    const r = findRif(rifTxt);
    if (r) { rifLetra = r.letra; rifDigitos = r.digitos; }
  }
  // Formato clásico SENIAT ("J313005495 UNIDAD INTEGRAL ..."): Gemini a veces deja el RIF
  // pegado a la razón social / nombre o con la letra en identificacion. Se recupera de ahí.
  if (!rifDigitos) {
    for (const k of ['identificacion', 'razonSocial', 'nombre', 'apellido', 'textoCompleto', 'rawText']) {
      const txt = stripAccents(String(fields[k] || '')).toUpperCase();
      if (!txt || FIRMA_RE.test(txt)) continue;
      const r = findRif(txt);
      if (r) { rifLetra = r.letra; rifDigitos = r.digitos; break; }
    }
  }
  if (rifDigitos) {
    // La razón social / nombre no deben arrastrar el RIF.
    const rifPrefijo = new RegExp(
      `^(RIF\\s*:?\\s*)?[VEJGCP][-\\s.]?${rifDigitos.slice(0, 8)}[-\\s.]?${rifDigitos[8]}\\s*[-:]?\\s*`, 'i',
    );
    for (const k of ['razonSocial', 'nombre']) {
      if (fields[k]) fields[k] = String(fields[k]).replace(rifPrefijo, '').trim() || null;
    }
  }

  // 2) identificacion: 9 dígitos. 10 dígitos = firma (tipo + RIF); ≥11 = comprobante.
  let ident = String(fields.identificacion || '').replace(/\D/g, '');
  const nComp = String(fields.nComprobante || '').replace(/\D/g, '');
  if (ident && nComp && ident === nComp) ident = '';
  if (ident.length === 10 && FIRMA_TIPO[ident[0]]) {
    if (!rifDigitos) { rifDigitos = ident.slice(1); rifLetra = rifLetra || FIRMA_TIPO[ident[0]]; }
    ident = '';
  }
  if (ident.length > 10) ident = '';
  if (rifDigitos && ident !== rifDigitos) ident = rifDigitos;

  if (!tipo || !/^[VEJGCP]$/.test(tipo)) tipo = rifLetra || tipo;
  if (rifLetra && tipo !== rifLetra && PJ_TIPOS.has(rifLetra)) tipo = rifLetra;

  if (PJ_TIPOS.has(tipo) && ident.length !== 9) ident = '';
  fields.identificacion = ident || null;
  fields.tipoDoc = tipo || null;
  if (tipo && ident.length === 9) fields.rif = formatRif(tipo, ident);
  else if (firmaEnRif) fields.rif = null;

  // RIF de persona NATURAL (V/E): no es empresa. La identificación es la cédula del RIF
  // sin el dígito verificador (V-12345678-9 → 12345678; V-07123456-1 → 7123456).
  if ((tipo === 'V' || tipo === 'E') && ident.length === 9) {
    fields.identificacion = String(Number(ident.slice(0, 8)));
    fields.rifPersonaNatural = true;
    if (fields.razonSocial && !fields.nombre) fields.nombre = fields.razonSocial;
    fields.razonSocial = null;
  }

  // 3) La dirección no debe arrastrar el estado ni la zona postal.
  if (fields.direccionFiscal) {
    let dir = fields.direccionFiscal;
    const zp = dir.match(/ZONA\s+POSTAL\s*:?\s*(\d{4})/i);
    if (zp && !fields.zonaPostal) fields.zonaPostal = zp[1];
    dir = dir.replace(/ZONA\s+POSTAL.*$/i, '').trim();
    const { direccion, estado } = splitEstado(dir);
    fields.direccionFiscal = direccion;
    if (!fields.estadoFiscal && estado) fields.estadoFiscal = estado;
  }

  // 4) Persona jurídica: nombre = razón social; sin apellido ni datos de persona natural.
  if (PJ_TIPOS.has(tipo)) {
    if (fields.razonSocial) fields.nombre = fields.razonSocial;
    else if (fields.nombre) fields.razonSocial = fields.nombre;
    fields.apellido = null;
    fields.fechaNacimiento = null;
    fields.sexo = null;
    fields.estadoCivil = null;
  }
  return fields;
}

module.exports = { aplicarGuardRif, parseRifText, toIsoDate, findRif, splitEstado, PJ_TIPOS };
