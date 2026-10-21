import type { OcrResult, PersonData } from '../types';
import { extractTomadorFromCertificado } from './carnet-propietario';
import { normalizeIdentificacionDigits } from './identificacion';
import { extractPersonFromOcr } from './ocr-person';

function resolveCarnetId(cert?: OcrResult | null): string {
  if (!cert) return '';
  return normalizeIdentificacionDigits(
    cert.identificacion
    || cert.identificacionPropietario
    || cert.propietarioIdentificacion,
  );
}

function normalizePersonName(nombre?: string, apellido?: string): string {
  return `${nombre ?? ''} ${apellido ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface OcrPersonRolesResult {
  sameInsured: boolean;
  titularFromCarnet: boolean;
  asegurado?: Partial<PersonData>;
  hasDriver: boolean;
  conductor?: Partial<PersonData>;
}

/** Titular del carnet + conductor habitual según discrepancias OCR (RCV). */
export function resolveOcrPersonRoles(
  cedula?: OcrResult | null,
  certificado?: OcrResult | null,
  licencia?: OcrResult | null,
): OcrPersonRolesResult {
  const cedulaId = normalizeIdentificacionDigits(cedula?.identificacion);
  const carnetId = resolveCarnetId(certificado);
  const licenciaId = normalizeIdentificacionDigits(licencia?.identificacion);

  let sameInsured = true;
  let titularFromCarnet = false;
  let asegurado: Partial<PersonData> | undefined;

  const hayDiscrepanciaCarnet = !!cedulaId && !!carnetId && cedulaId !== carnetId;
  if (hayDiscrepanciaCarnet && certificado) {
    const titularCarnet = extractTomadorFromCertificado(certificado);
    sameInsured = false;
    titularFromCarnet = true;
    asegurado = {
      identificacion: titularCarnet?.identificacion ?? carnetId,
      tipoDoc: titularCarnet?.tipoDoc ?? 'V',
      nombre: titularCarnet?.nombre ?? '',
      apellido: titularCarnet?.apellido ?? '',
      fechaNac: '',
    };
  }

  const fromLicencia = extractPersonFromOcr(licencia);
  const cedulaName = normalizePersonName(cedula?.nombre, cedula?.apellido);
  const titularCarnet = certificado ? extractTomadorFromCertificado(certificado) : null;
  const carnetName = titularCarnet
    ? normalizePersonName(titularCarnet.nombre, titularCarnet.apellido)
    : '';
  const licenciaName = normalizePersonName(licencia?.nombre, licencia?.apellido);

  const idDistinta =
    !!licenciaId
    && (!cedulaId || licenciaId !== cedulaId)
    && (!carnetId || licenciaId !== carnetId);

  const nombreDistinto =
    !licenciaId
    && !!licenciaName
    && (!cedulaName || licenciaName !== cedulaName)
    && (!carnetName || licenciaName !== carnetName);

  if (fromLicencia && (idDistinta || nombreDistinto)) {
    return {
      sameInsured,
      titularFromCarnet,
      asegurado,
      hasDriver: true,
      conductor: fromLicencia,
    };
  }

  return { sameInsured, titularFromCarnet, asegurado, hasDriver: false };
}
