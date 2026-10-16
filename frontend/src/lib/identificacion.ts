import type { DocType, DocumentState } from '../types';
import { isCedulaOcrSlot } from './ocr-engine-doc';

/** Comprueba si un valor es nulo o equivalente textual ("null", "N/A", etc.). */
export function isNullishOcrValue(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  const u = s.toUpperCase();
  return (
    u === 'NULL' ||
    u === 'UNDEFINED' ||
    u === 'N/A' ||
    u === 'NA' ||
    u === 'NONE' ||
    u === 'ND' ||
    u === 'N/D' ||
    u === '—' ||
    u === '-'
  );
}

/** Retorna el string sanitizado o undefined si es nulo / nullish. */
export function sanitizeOcrString(value: unknown): string | undefined {
  if (isNullishOcrValue(value)) return undefined;
  return String(value).trim();
}

/** Normaliza número de cédula/RIF: solo dígitos (sin V-, puntos ni espacios). */
export function normalizeIdentificacionDigits(raw?: string | null): string {
  if (isNullishOcrValue(raw)) return '';
  return String(raw ?? '').replace(/\D/g, '');
}

/** Inferir V/E/J/P desde prefijo en texto OCR (ej. "V-12.345.678"). */
export function inferTipoDocFromRaw(raw?: string | null): string | null {
  if (isNullishOcrValue(raw)) return null;
  const m = String(raw ?? '').trim().toUpperCase().match(/^([VEJGP])[-\s.]*\d/);
  if (!m) return null;
  const t = m[1];
  if (t === 'G') return 'J'; // Backend lo trata como J
  return t;
}

/** Etiqueta V-12345678 solo si hay al menos 6 dígitos. */
export function formatDocumentoLabel(
  identificacion?: string | null,
  tipoDoc?: string | null,
): string {
  const digits = normalizeIdentificacionDigits(identificacion);
  if (digits.length < 6) return '';
  const rawTipo = sanitizeOcrString(tipoDoc);
  const tipo = (rawTipo ?? 'V').toUpperCase() || 'V';
  return `${tipo}-${digits}`;
}

/**
 * Valida si los datos extraídos de una Cédula o RIF contienen los datos mínimos
 * requeridos (identificación y nombre/razón social) y no son valores nulos.
 */
export function validateCedulaOcr(ocr?: Record<string, unknown> | null): {
  valid: boolean;
  hasId: boolean;
  hasName: boolean;
  identificacion?: string;
  nombre?: string;
  apellido?: string;
} {
  if (!ocr || typeof ocr !== 'object') {
    return { valid: false, hasId: false, hasName: false };
  }

  const rawId = sanitizeOcrString(ocr.identificacion || ocr.rif || ocr.cedula);
  const digits = normalizeIdentificacionDigits(rawId);
  const nombre = sanitizeOcrString(ocr.nombre);
  const apellido = sanitizeOcrString(ocr.apellido);
  const razonSocial = sanitizeOcrString(ocr.razonSocial);

  const hasId = Boolean(digits && digits.length >= 4);
  const hasName = Boolean(nombre || apellido || razonSocial);

  return {
    valid: hasId && hasName,
    hasId,
    hasName,
    identificacion: digits || undefined,
    nombre: nombre || razonSocial || undefined,
    apellido: apellido || undefined,
  };
}

/**
 * Verifica si un documento requerido está completado Y contiene datos OCR válidos
 * (es decir, no devolvió datos nulos / vacíos).
 */
export function isDocOcrDataValid(docType: DocType, docState?: DocumentState | null): boolean {
  if (!docState || docState.status !== 'done') return false;
  const ocr = docState.ocr;
  if (!ocr || typeof ocr !== 'object') return false;

  if (isCedulaOcrSlot(docType) || docType === 'rif') {
    return validateCedulaOcr(ocr as Record<string, unknown>).valid;
  }

  if (docType === 'certificado') {
    const placa = sanitizeOcrString(ocr.placa);
    return Boolean(placa && placa.length >= 3);
  }

  if (docType === 'licencia') {
    const numLic = sanitizeOcrString(ocr.numeroLicencia);
    const rawId = sanitizeOcrString(ocr.identificacion);
    const nombre = sanitizeOcrString(ocr.nombre || ocr.apellido);
    return Boolean(
      (numLic && numLic.length >= 3) ||
      (rawId && normalizeIdentificacionDigits(rawId).length >= 4) ||
      (nombre && nombre.length >= 2)
    );
  }

  if (docType === 'factura') {
    const nfactura = sanitizeOcrString(ocr.nfactura);
    return Boolean(nfactura && nfactura.length >= 1);
  }

  return true;
}
