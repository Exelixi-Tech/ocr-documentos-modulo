import type { DocType, DocumentState } from '../types';
import { ocrIndicaPlacaExtranjera } from './placa-tipo';

type CertOcr = {
  tipoCarnet?: string;
  tipo_carnet?: string;
  tipoPlaca?: string;
  placa?: string;
  linea?: string;
  cilindrada?: string;
  serialMotor?: string;
  vin?: string;
  numeroMotor?: string;
};

function sanitizeOcrString(value?: string | null): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  const u = s.toUpperCase();
  if (u === 'NULL' || u === 'N/A' || u === 'NA' || u === 'NONE') return '';
  return s;
}

function looksLikeCoPlaca(placa?: string | null): boolean {
  const p = String(placa ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!p) return false;
  // Colombia: AAA000 o AAA00A (letra al final obligatoria en formato moderno)
  // Venezuela antigua: AB123 (2 letras + 3 digitos) o AC124KB (2+3+2 nuevo)
  // Para evitar falsos positivos con VE viejas (ABC-123) exigimos letra al final.
  return /^[A-Z]{3}\d{2,3}[A-Z]$/.test(p);
}

/**
 * Documento/vehículo colombiano (Licencia de Tránsito, placa CO) → extranjero.
 * No confundir con binacional (vehículo venezolano hacia Colombia).
 */
export function isExtranjeroCarnet(cert?: CertOcr | null): boolean {
  if (!cert || typeof cert !== 'object') return false;

  const tipoRaw = String(cert.tipoCarnet || cert.tipo_carnet || '').toLowerCase().trim();
  const placaTipo = String(cert.tipoPlaca || '').toLowerCase().trim();

  // Si el servidor ya lo clasificó explícitamente, confiamos en eso.
  if (tipoRaw === 'nacional' || placaTipo === 'nacional') return false;
  if (tipoRaw === 'binacional' || placaTipo === 'binacional') return false;

  if (tipoRaw === 'extranjero') return true;
  if (placaTipo === 'extranjera') return true;

  const placaNorm = String(cert.placa || '').replace(/[\s-]/g, '').toUpperCase();
  if (looksLikeCoPlaca(placaNorm)) return true;
  if (tipoRaw === 'colombia' || tipoRaw === 'colombiano') return true;

  const hasLinea = Boolean(sanitizeOcrString(cert.linea));
  const hasCilindrada = Boolean(sanitizeOcrString(cert.cilindrada));
  const hasVin = Boolean(sanitizeOcrString(cert.vin));
  const hasSerialMotor = Boolean(
    sanitizeOcrString(cert.serialMotor) || sanitizeOcrString(cert.numeroMotor),
  );

  return hasLinea && (hasCilindrada || hasVin || hasSerialMotor);
}

/** Vehículo venezolano binacional hacia Colombia — no incluye docs/placas colombianas. */
export function isBinacionalCarnet(cert?: CertOcr | null): boolean {
  if (!cert || typeof cert !== 'object') return false;
  if (isExtranjeroCarnet(cert)) return false;

  const tipoRaw = String(cert.tipoCarnet || cert.tipo_carnet || '').toLowerCase().trim();
  const placaTipo = String(cert.tipoPlaca || '').toLowerCase().trim();
  return tipoRaw === 'binacional' || placaTipo === 'binacional';
}

export function resolveTipoPlacaFromCert(
  cert?: CertOcr | null,
): 'nacional' | 'extranjera' | 'binacional' {
  if (!cert) return 'nacional';
  if (isExtranjeroCarnet(cert)) return 'extranjera';
  if (isBinacionalCarnet(cert)) return 'binacional';
  if (ocrIndicaPlacaExtranjera(cert)) return 'extranjera';
  return 'nacional';
}

/**
 * Con carnet binacional (VE hacia CO) o documento vehicular extranjero (Licencia de
 * Tránsito CO): solo el certificado es obligatorio; cédula y licencia pasan a opcionales.
 * El propietario (nombre e identificación) se toma del mismo documento.
 */
export function adjustDocsForBinacionalCarnet(
  requiredDocs: DocType[],
  optionalDocs: DocType[],
  documents: Record<DocType, DocumentState>,
  hasVehicle: boolean,
  carnetBinacionalMode = false,
): { requiredDocs: DocType[]; optionalDocs: DocType[] } {
  if (!hasVehicle) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }

  const certState = documents.certificado;
  const cert = certState?.ocr as CertOcr | undefined;
  const certDone = certState?.status === 'done';

  const soloCertificado = carnetBinacionalMode || isBinacionalCarnet(cert) || isExtranjeroCarnet(cert);
  if (!certDone || !soloCertificado) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }

  const required = requiredDocs.filter((d) => d !== 'cedula' && d !== 'licencia');
  if (!required.includes('certificado')) required.push('certificado');

  const optionalSet = new Set(optionalDocs);
  if (requiredDocs.includes('cedula')) optionalSet.add('cedula');
  if (requiredDocs.includes('licencia')) optionalSet.add('licencia');

  return {
    requiredDocs: required,
    optionalDocs: [...optionalSet],
  };
}
