/** Particular/rústico (FARMPA) vs moto (FARMMO) — plan de validate-card. */
const MOTO_HINTS = /\b(MOTOCICL|MOTONETA|CICLOMOTOR|\bMOTO\b|MOTO PARTICULAR)\b/i;
const AUTO_HINTS = /\b(AUTOMOVIL|AUTOMÓVIL|CAMIONETA|PASEO|RUSTICO|RÚSTICO|SPORT\s*WAGON|STATION\s*WAGON|PICK[\s-]?UP|FURGON|FURGÓN|BUS|CAMION|CAMIÓN|MINIBUS|MICROBUS)\b/i;

function normCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function normText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveTarjetaPlanVehicleKind(input) {
  if (!input || typeof input !== 'object') return null;

  const plan = normCode(input.cplan);
  const producto = normCode(input.cproducto);
  const nombre = normText(input.nombreProducto);

  const codes = [plan, producto].filter(Boolean);
  for (const code of codes) {
    if (code === 'FARMMO' || code.endsWith('MMO')) return 'moto';
    if (code === 'FARMPA' || code.endsWith('MPA')) return 'auto';
  }

  if (MOTO_HINTS.test(nombre) && !AUTO_HINTS.test(nombre)) return 'moto';
  if (AUTO_HINTS.test(nombre) || /PARTICULAR|RUSTICO/.test(nombre)) return 'auto';

  return null;
}

function certText(ocr) {
  if (!ocr || typeof ocr !== 'object') return '';
  const keys = [
    'tipoVehiculo', 'claseUso', 'referenciaModelo', 'referencia',
    'modelo', 'linea', 'marca', 'tipoCarnet',
  ];
  return normText(keys.map((k) => String(ocr[k] ?? '')).join(' '));
}

function certificadoLooksLikeMoto(ocr) {
  const blob = certText(ocr);
  return Boolean(blob) && MOTO_HINTS.test(blob);
}

function certificadoLooksLikeAuto(ocr) {
  const blob = certText(ocr);
  if (!blob || MOTO_HINTS.test(blob)) return false;
  return AUTO_HINTS.test(blob) || /\b(PARTICULAR|PASEO)\b/.test(blob);
}

function validateCertificadoForTarjetaPlan(planKind, ocr) {
  const isMoto = certificadoLooksLikeMoto(ocr);
  const isAuto = certificadoLooksLikeAuto(ocr);

  if (planKind === 'auto' && isMoto) {
    return {
      ok: false,
      message:
        'Esta tarjeta es para vehículo particular o rústico (plan FARMPA). '
        + 'El carnet cargado corresponde a una moto.',
    };
  }

  if (planKind === 'moto') {
    if (isAuto) {
      return {
        ok: false,
        message:
          'Esta tarjeta es para moto (plan FARMMO). '
          + 'El carnet cargado no corresponde a una motocicleta.',
      };
    }
    if (!isMoto) {
      return {
        ok: false,
        message:
          'Esta tarjeta es para moto (plan FARMMO). '
          + 'Sube el certificado de circulación de la motocicleta.',
      };
    }
  }

  return { ok: true };
}

module.exports = {
  resolveTarjetaPlanVehicleKind,
  certificadoLooksLikeMoto,
  certificadoLooksLikeAuto,
  validateCertificadoForTarjetaPlan,
};
