import { useWizardStore } from '../store/wizardStore';
import { getProductId } from './product';
import { inferTipoDocFromRaw, normalizeIdentificacionDigits } from './identificacion';
import type { OcrResult } from '../types';

/** Cédula VE: DD/MM/YYYY → YYYY-MM-DD. ISO se deja igual. */
function toIsoFechaNac(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function personFromOcr(ocr?: OcrResult | null) {
  if (!ocr) return null;
  const rawId = ocr.identificacion;
  const identificacion = normalizeIdentificacionDigits(rawId);
  if (!identificacion && !ocr.nombre && !ocr.apellido) return null;
  return {
    tipoDoc: ocr.tipoDoc ?? inferTipoDocFromRaw(rawId) ?? 'V',
    identificacion,
    nombre: ocr.nombre ?? '',
    apellido: ocr.apellido ?? '',
    fechaNac: toIsoFechaNac(ocr.fechaNacimiento),
    sexo: ocr.sexo ?? '',
    estadoCivil: ocr.estadoCivil ?? '',
  };
}

/** Precarga tomador / titular / beneficiario desde las 3 cédulas funerarias. */
export function applyFuneralOcrCedulas(): void {
  if (getProductId() !== 'funerario') return;
  const { documents, setTomador, setAsegurado, setSameInsured, setBeneficiario, setHasBeneficiary } =
    useWizardStore.getState();

  const tom = personFromOcr(documents.cedula?.ocr);
  const tit = personFromOcr(documents.cedula_titular?.ocr);
  const ben = personFromOcr(documents.cedula_beneficiario?.ocr);

  if (tom) setTomador(tom);
  if (tit) {
    setAsegurado(tit);
    setSameInsured(
      Boolean(tom?.identificacion) && tom?.identificacion === tit.identificacion,
    );
  }
  if (ben) {
    setHasBeneficiary(true);
    setBeneficiario({ ...ben, parentesco: '', pporcen: 100 });
  }
}
