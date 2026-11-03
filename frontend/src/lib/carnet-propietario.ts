import { normalizeIdentificacionDigits, inferTipoDocFromRaw } from './identificacion';

type CertTomadorOcr = {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  propietario?: string;
  propietarioNombre?: string;
  propietarioApellido?: string;
  propietarioIdentificacion?: string;
  identificacionPropietario?: string;
  tipoDocPropietario?: string;
};

/**
 * El OCR del carnet a veces mete el serial NIV (ej. "8211MBCA6SD245116") como nombre o
 * apellido del propietario. Un token con dígitos o de >= 10 alfanuméricos se descarta
 * para que el campo quede vacío y el Formulario/Pagos lo pidan.
 */
export function looksLikeSerialToken(token: string): boolean {
  const t = (token ?? '').trim();
  if (!t) return true;
  if (/\d/.test(t)) return true;
  return /^[A-Za-z0-9]{10,}$/.test(t);
}

export function stripSerialTokens(text?: string): string {
  return (text ?? '')
    .trim()
    .split(/\s+/)
    .filter((tok) => tok && !looksLikeSerialToken(tok))
    .join(' ');
}

export function splitOwnerName(full: string, order: 'nombre_first' | 'apellido_first' = 'nombre_first'): { nombre: string; apellido: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombre: '', apellido: '' };
  if (parts.length === 1) return { nombre: '', apellido: parts[0] };
  const mid = Math.floor(parts.length / 2);
  const firstHalf = parts.slice(0, mid).join(' ');
  const secondHalf = parts.slice(mid).join(' ');
  
  if (order === 'nombre_first') {
    return { nombre: firstHalf, apellido: secondHalf };
  } else {
    return { apellido: firstHalf, nombre: secondHalf };
  }
}

export function extractTomadorFromCertificado(cert?: CertTomadorOcr | null): {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc: string;
} | null {
  if (!cert) return null;

  let nombre = stripSerialTokens(cert.nombre || cert.propietarioNombre || '');
  let apellido = stripSerialTokens(cert.apellido || cert.propietarioApellido || '');

  const propietarioLimpio = stripSerialTokens(cert.propietario);
  if (!nombre && !apellido && propietarioLimpio) {
    const isColombian = cert.tipoDocPropietario?.toUpperCase().includes('CC') || cert.tipoDocPropietario?.toUpperCase().includes('CE');
    const split = splitOwnerName(propietarioLimpio, isColombian ? 'apellido_first' : 'nombre_first');
    apellido = split.apellido;
    nombre = split.nombre;
  }

  const identificacion = normalizeIdentificacionDigits(
    cert.identificacion
    || cert.propietarioIdentificacion
    || cert.identificacionPropietario,
  );

  if (!nombre && !apellido && !identificacion) return null;

  let tipoDoc =
    cert.tipoDoc
    || inferTipoDocFromRaw(cert.identificacion)
    || inferTipoDocFromRaw(cert.identificacionPropietario)
    || 'V';
  if (cert.tipoDocPropietario) {
    const u = cert.tipoDocPropietario.toUpperCase();
    if (u.includes('NIT') || u === 'J') tipoDoc = 'J';
    else if (u.includes('CE') || u === 'E') tipoDoc = 'E';
    else if (u.includes('CC')) tipoDoc = 'E';           // Cédula Colombia → extranjero en VE
    else if (u === 'V' || u.includes('C.I') || u.includes('CI')) tipoDoc = 'V'; // Venezolano
  }

  return { nombre, apellido, identificacion, tipoDoc };
}
