/**
 * Entrada "Renovar": `/ocr/?nexus_token=…&renovar=<cnpoliza>`.
 * En renovación OCR no se muestra: deja `renovacion` en la sesión del flujo y pasa directo a Formulario
 * (con `renovar` en la URL y en sessionStorage, mismo origen). Sin `renovar` no hace nada y borra
 * cualquier renovación anterior de la pestaña, así el flujo normal queda igual.
 */
import { useWizardStore } from '../store/wizardStore';

const CNPOLIZA_RE = /^[0-9A-Z][0-9A-Z-]{2,29}$/;
export const RENOVAR_STORAGE_KEY = 'exelixi_renovar';

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

/** Se llama al cargar OCR: guarda el renovar del link o limpia uno viejo (flujo normal). */
export function recordarRenovar(): string | null {
  const renovar = getRenovarParam();
  try {
    if (renovar) sessionStorage.setItem(RENOVAR_STORAGE_KEY, renovar);
    else sessionStorage.removeItem(RENOVAR_STORAGE_KEY);
  } catch { /* ignore */ }
  return renovar;
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

export function marcarRenovacionError(mensaje: string) {
  const cnpoliza = getRenovarParam();
  if (!cnpoliza) return;
  console.warn('[renovacion]', mensaje);
  useWizardStore.setState({
    renovacion: { ...renovacionPendiente(cnpoliza), estado: 'error', mensaje },
  } as never);
}
