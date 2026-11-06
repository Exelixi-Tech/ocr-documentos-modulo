import { useProductConfig } from './useProductConfig';
import { decodeJwtPayload } from '../config/configPanelContext';
import { getNexusToken } from '../lib/nexus-token-client';
import { isOcrOpcionalForActor } from '../lib/ocr-opcional';
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

export function useOcrOpcional(productId: string): boolean {
  const metadataCanal = useWizardStore((s) => s.metadataCanal);
  const { config } = useProductConfig(resolveEmpresaIdFromToken(), productId, 'ocr');
  return isOcrOpcionalForActor(config, metadataCanal);
}
