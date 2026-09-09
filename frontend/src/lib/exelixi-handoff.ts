import type { DocType, DocumentState, PersonData } from '../types';
import type { BuilderCatalogProduct } from '../types/builder-catalog';
import type { DiligenciaState } from './diligencia';
import { persistBuilderProduct, useBuilderCatalog } from './builder-catalog';
import { getProductId } from './product';
import { shouldUseTarjetaPublicApi } from '../features/activacion-tarjeta/flow';

export const EXELIXI_OCR_HANDOFF_KEY = 'exelixi_ocr_handoff';

export type OcrDocType =
  | 'cedula'
  | 'cedula_titular'
  | 'cedula_beneficiario'
  | 'licencia'
  | 'certificado'
  | 'rif'
  | 'pasaporte'
  | 'factura';

export interface OcrFields {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  linea?: string;
  anio?: string;
  año?: string;
  serial?: string;
  serialMotor?: string;
  cilindrada?: string;
  color?: string;
  tipoCarnet?: 'nacional' | 'binacional';
  tipoPlaca?: 'nacional' | 'extranjera' | 'binacional';
  rif?: string;
  razonSocial?: string;
  fechaNacimiento?: string;
  sexo?: string;
  estadoCivil?: string;
  numeroLicencia?: string;
  propietario?: string;
  identificacionPropietario?: string;
  tipoDocPropietario?: string;
}

export interface ExelixiOcrHandoff {
  productId: string;
  product?: BuilderCatalogProduct;
  ocrData: Partial<Record<OcrDocType, OcrFields>>;
  itipoDiligencia?: 'S' | 'C';
  documentosRequeridos?: DocType[];
  documentHashes?: Partial<Record<DocType, string>>;
  diligencia?: DiligenciaState | null;
  hasDriver?: boolean;
  conductor?: Partial<PersonData>;
  sameInsured?: boolean;
  asegurado?: Partial<PersonData>;
  savedAt: number;
  tarjeta?: import('../features/activacion-tarjeta/types').TarjetaActivacion | null;
}

function mapDocOcr(doc?: DocumentState): OcrFields | undefined {
  if (!doc?.ocr || typeof doc.ocr !== 'object') return undefined;
  return doc.ocr as OcrFields;
}

export function buildOcrHandoff(
  productId: string,
  documents: Record<DocType, DocumentState>,
  product?: BuilderCatalogProduct,
  diligencia?: DiligenciaState | null,
  personRoles?: {
    hasDriver?: boolean;
    conductor?: Partial<PersonData>;
    sameInsured?: boolean;
    asegurado?: Partial<PersonData>;
    tarjeta?: import('../features/activacion-tarjeta/types').TarjetaActivacion | null;
  },
): ExelixiOcrHandoff {
  const ocrData: Partial<Record<OcrDocType, OcrFields>> = {};
  const types: OcrDocType[] = [
    'cedula',
    'cedula_titular',
    'cedula_beneficiario',
    'licencia',
    'certificado',
    'rif',
    'pasaporte',
    'factura',
  ];
  const documentHashes: Partial<Record<DocType, string>> = {};

  for (const type of types) {
    const mapped = mapDocOcr(documents[type]);
    if (mapped) ocrData[type] = mapped;
    if (documents[type]?.hash) documentHashes[type] = documents[type]!.hash;
  }

  return {
    productId,
    product,
    ocrData,
    itipoDiligencia: diligencia?.itipoDiligencia,
    documentosRequeridos: diligencia?.documentosRequeridos,
    documentHashes,
    diligencia: diligencia ?? null,
    hasDriver: personRoles?.hasDriver,
    conductor: personRoles?.conductor,
    sameInsured: personRoles?.sameInsured,
    asegurado: personRoles?.asegurado,
    tarjeta: personRoles?.tarjeta ?? null,
    savedAt: Date.now(),
  };
}

export function persistOcrHandoff(handoff: ExelixiOcrHandoff): void {
  sessionStorage.setItem(EXELIXI_OCR_HANDOFF_KEY, JSON.stringify(handoff));
}

function getModuleTokenKey(): string {
  return 'nexus_access_token_ocr';
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function encodeHandoffForUrl(handoff: ExelixiOcrHandoff): string {
  const json = JSON.stringify(handoff);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isLocalAbsoluteUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(value);
}

function isProductionAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !isLocalAbsoluteUrl(value);
}

/** Siguiente paso: módulo formulario (misma cadena que La Mundial, rama Exélixi). */
export function getFormularioContinueUrl(): string {
  const configured = (import.meta.env.VITE_FORMULARIO_CONTINUE_BASE as string | undefined)?.replace(/\/$/, '') || '';
  let base = '/formulario';

  if (isLocalHost()) {
    base = configured && !configured.startsWith('/')
      ? configured
      : 'http://localhost:5182';
  } else if (configured) {
    if (isProductionAbsoluteUrl(configured)) {
      base = configured;
    } else if (!isLocalAbsoluteUrl(configured)
      && (configured.startsWith('/') || configured.startsWith('.'))) {
      base = configured;
    }
  }

  const params = new URLSearchParams();

  try {
    const current = new URL(window.location.href);
    const flow = current.searchParams.get('flow');
    const product =
      current.searchParams.get('product')
      || sessionStorage.getItem('exelixi_product')
      || 'rcv';

    // Conservar flujo Exélixi solo si ya venía así. La Mundial usa ?product=rcv|funerario.
    if (flow === 'exelixi-catalog' || flow === 'exelixi') {
      params.set('flow', 'exelixi-catalog');
    } else {
      params.set('product', product);
    }

    const sid = current.searchParams.get('sid');
    const nexusToken =
      current.searchParams.get('nexus_token')
      || sessionStorage.getItem(getModuleTokenKey());
    if (sid) params.set('sid', sid);
    if (nexusToken) params.set('nexus_token', nexusToken);
    if (shouldUseTarjetaPublicApi()) params.set('flujo', 'tarjeta');
  } catch {
    try {
      const stored = sessionStorage.getItem('exelixi_product');
      params.set('product', stored === 'funerario' ? 'funerario' : 'rcv');
    } catch {
      params.set('product', 'rcv');
    }
  }

  return `${base}/?${params.toString()}`;
}

export function continueToFormularioModule(handoff: ExelixiOcrHandoff): void {
  persistOcrHandoff(handoff);
  const catalog = useBuilderCatalog();
  if (catalog) persistBuilderProduct(handoff.product ?? null);

  if (isLocalHost()) {
    let url = getFormularioContinueUrl();
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('ocr_handoff', encodeHandoffForUrl(handoff));
      url = u.toString();
    } catch {
      /* ignore */
    }
    window.location.href = url;
    return;
  }

  const fallbackUrl = getFormularioContinueUrl();

  if (typeof window.__bridgeAdvance === 'function') {
    const startHref = window.location.href;
    const lmProduct =
      handoff.productId === 'funerario' || getProductId() === 'funerario'
        ? 'funerario'
        : getProductId();
    void window.__bridgeAdvance({
      ...(catalog
        ? { exelixiCatalogFlow: true, builderProduct: handoff.product }
        : { product: lmProduct, exelixiCatalogFlow: false }),
      productId: handoff.productId,
      hasDriver: handoff.hasDriver,
      conductor: handoff.conductor,
      sameInsured: handoff.sameInsured,
      asegurado: handoff.asegurado,
    }).catch(() => {
      window.location.href = fallbackUrl;
    });
    window.setTimeout(() => {
      if (window.location.href === startHref) {
        window.location.href = fallbackUrl;
      }
    }, 2500);
    return;
  }

  window.location.href = fallbackUrl;
}

/** @deprecated Usar continueToFormularioModule — product-builder es solo catálogo admin. */
export function continueToEmissionWizard(productId: string, handoff: ExelixiOcrHandoff): void {
  continueToFormularioModule({ ...handoff, productId });
}
