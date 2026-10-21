/** Normaliza número de cédula/RIF: solo dígitos (sin V-, puntos ni espacios). */
export function normalizeIdentificacionDigits(raw?: string | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** Inferir V/E/J/P desde prefijo en texto OCR (ej. "V-12.345.678"). */
export function inferTipoDocFromRaw(raw?: string | null): string | null {
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
  const tipo = String(tipoDoc ?? 'V').trim().toUpperCase() || 'V';
  return `${tipo}-${digits}`;
}
