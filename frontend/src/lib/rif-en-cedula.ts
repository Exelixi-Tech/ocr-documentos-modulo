import { getProductId } from './product';
import { readStoredBuilderProduct } from './builder-catalog';
import { readSsoProductInfo } from './sso-metadata';

/**
 * Productos donde el slot de cédula acepta también RIF de empresa (persona jurídica).
 * Patrimoniales y RCV (persona jurídica toma el RIF en el slot de cédula).
 * Personas (funerario/vida/viajero): el tomador acepta RIF de empresa o personal; titular,
 * asegurado y beneficiario solo RIF personal V/E (ver rifSoloNaturalEnSlot).
 * Ampliable sin código con VITE_OCR_RIF_EN_CEDULA_PRODUCTOS (ids separados por coma).
 */
const EXTRA_PRODUCTOS = new Set(
  String(import.meta.env.VITE_OCR_RIF_EN_CEDULA_PRODUCTOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const PATRIMONIAL_KEY = 'exelixi_rif_en_cedula';

/** Nexus manda `?product=patrimoniales`; getProductId() solo conoce rcv/funerario. */
function isPatrimonialSession(): boolean {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('product');
    if (fromUrl === 'patrimoniales') {
      sessionStorage.setItem(PATRIMONIAL_KEY, '1');
      return true;
    }
    if (fromUrl) sessionStorage.removeItem(PATRIMONIAL_KEY);
    return sessionStorage.getItem(PATRIMONIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function aceptaRifEnCedula(): boolean {
  const id = String(getProductId());
  if (id === 'patrimoniales' || EXTRA_PRODUCTOS.has(id)) return true;
  if (isPatrimonialSession()) return true;
  const builder = readStoredBuilderProduct();
  if (builder?.branch === 'PATRIMONIAL') return true;
  // RCV: solo el flujo RCV (sin producto del builder o con ramo de vehículo); nunca personas/funerario.
  if (id === 'rcv') return !builder || builder.branch === 'RCV_OBLIGATORIO';
  // Personas: RIF en el slot de cédula (J/G/C solo tomador; V/E = persona natural).
  if (id === 'funerario') return true;
  return false;
}

/**
 * Beneficiario jurídico (J/G/C, parentesco «Socio») en personas salvo funerario (cproducto 57),
 * igual que la lista «Beneficiarios» del Formulario: p. ej. Vida con una empresa al 100 %.
 */
function beneficiarioJuridicoPermitido(): boolean {
  const { cproducto, xproducto } = readSsoProductInfo();
  return cproducto !== '57' && !/funer/i.test(xproducto);
}

/** Slots de persona natural en personas: el RIF solo vale si es V/E (no empresa). */
export function rifSoloNaturalEnSlot(docType: string): boolean {
  if (String(getProductId()) !== 'funerario' || docType === 'cedula') return false;
  if (docType === 'cedula_beneficiario' && beneficiarioJuridicoPermitido()) return false;
  return true;
}

/** "Cédula del tomador" → "Cédula o RIF del tomador". */
export function labelConRif(label: string): string {
  return label.replace(/^Cédula/, 'Cédula o RIF');
}
