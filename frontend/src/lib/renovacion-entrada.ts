/**
 * Entrada "Renovar": `/ocr/?nexus_token=…&renovar=<cnpoliza>`.
 * En renovación no se cargan documentos: OCR deja `renovacion` en la sesión del flujo y pasa
 * directo a Formulario, que consulta la póliza y precarga los datos. Sin `renovar` no hace nada.
 */
const CNPOLIZA_RE = /^[0-9A-Z][0-9A-Z-]{2,29}$/;

export function getRenovarParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const qs = new URLSearchParams(window.location.search);
    const raw = qs.get('renovar')
      || (qs.get('flujo') === 'renovacion' ? qs.get('cnpoliza') : null);
    const s = String(raw ?? '').trim().toUpperCase();
    return CNPOLIZA_RE.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** Estado inicial que Formulario completa (ver modulo-formulario lib/renovacion.ts). */
export function renovacionPendiente(cnpoliza: string) {
  return {
    flujo: 'renovacion' as const,
    cnpoliza_rel: cnpoliza,
    itipoEmi: 'NU' as const,
    estado: 'pendiente' as const,
  };
}
