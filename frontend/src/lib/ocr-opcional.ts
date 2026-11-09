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

function readLists(config: Record<string, unknown> | null | undefined): { gestores: string[]; canales: string[] } {
  const oc = config?.ocrOpcional as OcrOpcionalConfig | undefined;
  if (!oc || typeof oc !== 'object') return { gestores: [], canales: [] };
  return {
    gestores: (Array.isArray(oc.gestores) ? oc.gestores : []).map(norm).filter(Boolean),
    canales: (Array.isArray(oc.canales) ? oc.canales : []).map(norm).filter(Boolean),
  };
}

function readActor(metadataCanal: Record<string, unknown> | null | undefined): { cgestor: string; ccanalalt: string } {
  const meta = metadataCanal ?? {};
  // SysIP también identifica al actor como centidad + citem: G = punto de comercialización
  // (citem = cgestor, p. ej. 80080-1196-2597) y C = canal (citem = ccanalalt).
  const centidad = norm(meta['centidad']).toUpperCase();
  const citem = norm(meta['citem']);
  return {
    cgestor:
      norm(meta['cgestor']) || norm(meta['cgestor_in']) || (centidad === 'G' ? citem : ''),
    ccanalalt:
      norm(meta['ccanalalt']) || norm(meta['ccanalalt_in']) || (centidad === 'C' ? citem : ''),
  };
}

/**
 * Un punto de comercialización (magestor) que entra por SysIP o emisión directa trae solo su
 * cgestor. Devuelve ese cgestor cuando hace falta resolver su canal en el catálogo para heredar
 * el OCR opcional del canal; '' si el actor ya resuelve directo o no hay canales marcados.
 */
export function cgestorParaHeredarCanal(
  config: Record<string, unknown> | null | undefined,
  metadataCanal: Record<string, unknown> | null | undefined,
): string {
  const { canales } = readLists(config);
  if (canales.length === 0) return '';
  if (isOcrOpcionalForActor(config, metadataCanal)) return '';
  return readActor(metadataCanal).cgestor;
}

/**
 * @param ccanalaltDelPunto canal del cgestor resuelto por el catálogo (GET /api/catalog/gestor-canal).
 *   Solo se usa si el actor no está marcado directamente; sin él (o si el catálogo falló) el OCR
 *   queda obligatorio.
 */
export function isOcrOpcionalForActor(
  config: Record<string, unknown> | null | undefined,
  metadataCanal: Record<string, unknown> | null | undefined,
  ccanalaltDelPunto?: string | number | null,
): boolean {
  const { gestores, canales } = readLists(config);
  if (gestores.length === 0 && canales.length === 0) return false;

  const { cgestor, ccanalalt } = readActor(metadataCanal);

  if (cgestor && matchGestor(gestores, cgestor)) return true;
  if (ccanalalt && canales.includes(ccanalalt)) return true;
  const heredado = norm(ccanalaltDelPunto);
  if (cgestor && heredado && canales.includes(heredado)) return true;
  return false;
}
