import { readSsoProductInfo } from './sso-metadata';

/** Nombre comercial por cproducto (mismo catálogo que Emisión). */
const PERSONAS_PRODUCT_LABELS: Record<string, string> = {
  '14': 'Salud Individual',
  '15': 'Salud Familiar',
  '25': 'Viajero',
  '26': 'Viajero Local',
  '51': 'Combinado Familiar',
  '52': 'Funerario Familiar',
  '57': 'Funerario',
  '58': 'Combinado de Personas',
  '76': 'Póliza de Vida',
  '77': '4 en 1',
  '78': 'Accidentes Personales',
};

/**
 * Producto de personas que se está emitiendo (solo visual): xproducto del SSO;
 * si no, el nombre por cproducto; si no, cadena vacía (el texto queda genérico).
 */
export function resolvePersonasProductLabel(): string {
  const { xproducto, cproducto } = readSsoProductInfo();
  return xproducto || PERSONAS_PRODUCT_LABELS[cproducto] || '';
}

/** Viajero (productos 25/26): sin coberturas para beneficiarios, no se pide su cédula. */
export function isViajeroPersonas(): boolean {
  const { cproducto } = readSsoProductInfo();
  return cproducto === '25' || cproducto === '26';
}
