/** Misma regla que ocr-api: solo iestado=1 (disponible) puede avanzar. */

const ACTIVATED_IESTADO = new Set([2, 11, 12, 99]);
const AVAILABLE_IESTADO = 1;

export const TARJETA_YA_ACTIVADA_CODE = 'TARJETA_YA_ACTIVADA';

export function tarjetaYaActivadaMessage(): string {
  return 'Esta tarjeta ya fue activada. No puedes continuar con este código.';
}

function messageSuggestsActivated(message: unknown): boolean {
  const msg = String(message ?? '').toLowerCase();
  return /activad|utilizad|usada|ya fue|no disponible|cerrad|anulad|vinculad.*poliz/i.test(msg);
}

export function isTarjetaAlreadyActivated(
  payload: Record<string, unknown> | null | undefined,
  message?: string,
): boolean {
  const data = payload && typeof payload === 'object' ? payload : {};
  if (messageSuggestsActivated(message || data.mensaje || data.message)) {
    return true;
  }

  const iestado = Number(data.iestado ?? data.estado_tarjeta ?? data.id_status);
  if (Number.isFinite(iestado)) {
    if (ACTIVATED_IESTADO.has(iestado)) return true;
    if (iestado !== AVAILABLE_IESTADO) return true;
  }

  if (data.factivacion) return true;

  const cnpoliza = String(data.cnpoliza ?? data.cnpoliza_sisip ?? '').trim();
  if (cnpoliza) return true;

  const cpoliza = Number(data.cpoliza ?? data.id_buy);
  if (Number.isFinite(cpoliza) && cpoliza > 0) return true;

  if (data.activada === true || Number(data.iactivada) === 1) return true;

  return false;
}

export function assertTarjetaDisponible(
  payload: Record<string, unknown>,
  message?: string,
): void {
  if (isTarjetaAlreadyActivated(payload, message)) {
    const err = new Error(tarjetaYaActivadaMessage());
    err.name = TARJETA_YA_ACTIVADA_CODE;
    throw err;
  }
}
