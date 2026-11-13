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
 *     productores?: string[] // cproductor (ej. "1234"); ausente = ninguno
 *   }
 *
 * En runtime el actor llega en metadataCanal del token SSO
 * (cgestor / cgestor_in, ccanalalt / ccanalalt_in — ver sso-metadata.ts).
 * El productor llega como centidad = P + citem (o cproductor cuando la sesión no trae
 * canal ni punto). Una sesión de canal también trae un cproductor (el intermediario del
 * canal): ese NO cuenta, para que marcar un productor no relaje el OCR de un canal.
 */

export interface OcrOpcionalConfig {
  gestores?: unknown[];
  canales?: unknown[];
  productores?: unknown[];
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

function readLists(config: Record<string, unknown> | null | undefined): { gestores: string[]; canales: string[]; productores: string[] } {
  const oc = config?.ocrOpcional as OcrOpcionalConfig | undefined;
  if (!oc || typeof oc !== 'object') return { gestores: [], canales: [], productores: [] };
  return {
    gestores: (Array.isArray(oc.gestores) ? oc.gestores : []).map(norm).filter(Boolean),
    canales: (Array.isArray(oc.canales) ? oc.canales : []).map(norm).filter(Boolean),
    productores: (Array.isArray(oc.productores) ? oc.productores : []).map(norm).filter(Boolean),
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
      norm(meta['cgestor']) ||
      norm(meta['cgestor_in']) ||
      // El SSO de SysIP manda el punto también como csubitem (citem = canal, csubitem = punto).
      norm(meta['csubitem']) ||
      (centidad === 'G' ? citem : ''),
    ccanalalt:
      norm(meta['ccanalalt']) || norm(meta['ccanalalt_in']) || (centidad === 'C' ? citem : ''),
  };
}

/**
 * cproductor del actor SOLO cuando el actor es un productor: centidad = P (citem es su
 * código) o una sesión sin canal ni punto que trae cproductor. '' en cualquier otro caso.
 */
export function cproductorDelActor(metadataCanal: Record<string, unknown> | null | undefined): string {
  const meta = metadataCanal ?? {};
  const centidad = norm(meta['centidad']).toUpperCase();
  if (centidad === 'P') return norm(meta['citem']) || norm(meta['cproductor']);
  if (centidad) return '';
  const { cgestor, ccanalalt } = readActor(meta);
  if (cgestor || ccanalalt) return '';
  return norm(meta['cproductor']);
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
  const { gestores, canales, productores } = readLists(config);
  if (gestores.length === 0 && canales.length === 0 && productores.length === 0) return false;

  const { cgestor, ccanalalt } = readActor(metadataCanal);

  // Productor marcado (match exacto del cproductor). Canales y gestores siguen igual.
  const cproductor = productores.length > 0 ? cproductorDelActor(metadataCanal) : '';
  if (cproductor && productores.includes(cproductor)) return true;

  if (cgestor && matchGestor(gestores, cgestor)) return true;
  if (ccanalalt && canales.includes(ccanalalt)) return true;
  const heredado = norm(ccanalaltDelPunto);
  if (cgestor && heredado && canales.includes(heredado)) return true;
  return false;
}
