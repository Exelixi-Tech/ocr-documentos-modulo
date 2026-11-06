/**
 * OCR opcional por canal/gestor.
 *
 * La config del parametrizador (`ocrOpcional`) guarda los códigos de los
 * actores para los que el escaneo OCR es OPCIONAL. Todo actor no listado
 * queda obligatorio (fail-safe): lo nuevo entra estricto y se relaja a mano.
 *
 *   ocrOpcional: {
 *     gestores: string[]   // magestor.cgestor (ej. "215" o "215-28")
 *     canales:  string[]   // macanalalt.ccanalalt (ej. "1")
 *   }
 *
 * En runtime el actor llega en metadataCanal del token SSO
 * (cgestor / cgestor_in, ccanalalt / ccanalalt_in — ver sso-metadata.ts).
 */

export interface OcrOpcionalConfig {
  gestores?: unknown[];
  canales?: unknown[];
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Match EXACTO del cgestor. Nada de prefijos: los códigos del marketplace
 * comparten base (p. ej. "80080-1159-3002", "80080-1173-2782") y un match
 * parcial relajaría el OCR para familias enteras de gestores.
 */
function matchGestor(configurados: string[], runtime: string): boolean {
  if (!runtime) return false;
  return configurados.includes(runtime);
}

export function isOcrOpcionalForActor(
  config: Record<string, unknown> | null | undefined,
  metadataCanal: Record<string, unknown> | null | undefined,
): boolean {
  const oc = config?.ocrOpcional as OcrOpcionalConfig | undefined;
  if (!oc || typeof oc !== 'object') return false;

  const gestores = (Array.isArray(oc.gestores) ? oc.gestores : []).map(norm).filter(Boolean);
  const canales = (Array.isArray(oc.canales) ? oc.canales : []).map(norm).filter(Boolean);
  if (gestores.length === 0 && canales.length === 0) return false;

  const meta = metadataCanal ?? {};
  const cgestor = norm(meta['cgestor']) || norm(meta['cgestor_in']);
  const ccanalalt = norm(meta['ccanalalt']) || norm(meta['ccanalalt_in']);

  if (cgestor && matchGestor(gestores, cgestor)) return true;
  if (ccanalalt && canales.includes(ccanalalt)) return true;
  return false;
}
