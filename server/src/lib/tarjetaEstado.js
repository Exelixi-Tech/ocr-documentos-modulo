/**
 * Tarjeta RCV — disponible vs ya activada (tatarjeta.iestado Sis2000).
 * 1 = inactiva/disponible · 2 = activa · 11/12 = cerrada · 99 = anulada.
 */

const DEFAULT_ACTIVATED = '2,11,12,99';
const DEFAULT_AVAILABLE = 1;

function parseActivatedStates() {
  const raw = process.env.TARJETA_IESTADO_ACTIVADA || DEFAULT_ACTIVATED;
  return new Set(
    raw.split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n)),
  );
}

function availableIestado() {
  const n = Number(process.env.TARJETA_IESTADO_DISPONIBLE ?? DEFAULT_AVAILABLE);
  return Number.isFinite(n) ? n : DEFAULT_AVAILABLE;
}

function tarjetaYaActivadaMessage() {
  return 'Esta tarjeta ya fue activada. No puedes continuar con este código.';
}

function messageSuggestsActivated(message) {
  const msg = String(message || '').toLowerCase();
  return /activad|utilizad|usada|ya fue|no disponible|cerrad|anulad|vinculad.*poliz/i.test(msg);
}

/**
 * @param {Record<string, unknown>|null|undefined} payload
 * @param {string} [message]
 */
function isTarjetaAlreadyActivated(payload, message) {
  const data = payload && typeof payload === 'object' ? payload : {};
  if (messageSuggestsActivated(message || data.mensaje || data.message)) {
    return true;
  }

  const iestado = Number(data.iestado ?? data.estado_tarjeta ?? data.id_status);
  if (Number.isFinite(iestado)) {
    const activated = parseActivatedStates();
    if (activated.has(iestado)) return true;
    if (iestado !== availableIestado()) return true;
  }

  if (data.factivacion) return true;

  const cnpoliza = String(data.cnpoliza ?? data.cnpoliza_sisip ?? '').trim();
  if (cnpoliza) return true;

  const cpoliza = Number(data.cpoliza ?? data.id_buy);
  if (Number.isFinite(cpoliza) && cpoliza > 0) return true;

  if (data.activada === true || Number(data.iactivada) === 1) return true;

  return false;
}

module.exports = {
  isTarjetaAlreadyActivated,
  tarjetaYaActivadaMessage,
};
