import { useEffect, useState } from 'react';
import { useProductConfig } from './useProductConfig';
import { decodeJwtPayload } from '../config/configPanelContext';
import { moduleApiBase } from '../lib/app-base';
import { getNexusToken } from '../lib/nexus-token-client';
import { cgestorParaHeredarCanal, isOcrOpcionalForActor } from '../lib/ocr-opcional';
import { useWizardStore } from '../store/wizardStore';

const NEXUS_TOKEN_KEY = 'nexus_access_token_ocr';
const FALLBACK_EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1) || 1;

/**
 * El parametrizador guarda `ocrOpcional` en la empresa de su token, que puede
 * diferir de VITE_EMPRESA_ID. Por eso se lee aparte: mover toda la config del
 * flujo a esa empresa cambiaría los documentos exigidos.
 */
function resolveEmpresaIdFromToken(): number {
  const token = getNexusToken(NEXUS_TOKEN_KEY);
  const empresaId = Number(token ? decodeJwtPayload(token)?.empresaId : 0);
  return empresaId > 0 ? empresaId : FALLBACK_EMPRESA_ID;
}

// Canal de cada punto ya resuelto en esta sesión (solo respuestas válidas; los fallos se reintentan).
const canalPorGestor = new Map<string, Promise<string | null>>();

/** Canal alterno del punto según el catálogo del server OCR; null si no tiene o si falla (fail-safe). */
function fetchCanalDelPunto(cgestor: string): Promise<string | null> {
  const previo = canalPorGestor.get(cgestor);
  if (previo) return previo;
  const p = fetch(`${moduleApiBase()}/catalog/gestor-canal?cgestor=${encodeURIComponent(cgestor)}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      const ccanalalt = body?.success ? body.data?.ccanalalt : null;
      return ccanalalt != null && String(ccanalalt).trim() ? String(ccanalalt).trim() : null;
    })
    .catch(() => {
      canalPorGestor.delete(cgestor);
      return null;
    });
  canalPorGestor.set(cgestor, p);
  return p;
}

export function useOcrOpcional(productId: string): boolean {
  const metadataCanal = useWizardStore((s) => s.metadataCanal);
  const { config } = useProductConfig(resolveEmpresaIdFromToken(), productId, 'ocr');
  // Punto de comercialización sin marca propia: hereda el OCR opcional de su canal.
  const cgestor = cgestorParaHeredarCanal(config, metadataCanal);
  const [resuelto, setResuelto] = useState<{ cgestor: string; ccanalalt: string | null } | null>(null);

  useEffect(() => {
    if (!cgestor) return;
    let vigente = true;
    fetchCanalDelPunto(cgestor).then((ccanalalt) => {
      if (vigente) setResuelto({ cgestor, ccanalalt });
    });
    return () => { vigente = false; };
  }, [cgestor]);

  const ccanalaltDelPunto = cgestor && resuelto?.cgestor === cgestor ? resuelto.ccanalalt : null;
  return isOcrOpcionalForActor(config, metadataCanal, ccanalaltDelPunto);
}
