import type { DocType } from '../types';

export interface WizardNavSnapshot {
  step: number;
  ocrDone?: boolean;
  documents?: Partial<Record<DocType, { status?: string }>>;
  selectedPlan?: { cplan?: string } | null;
  requiredDocTypes?: DocType[];
  /** Pago confirmado o emisión en curso: no se navega a pasos anteriores. */
  paymentLocked?: boolean;
}

const DEFAULT_REQUIRED: DocType[] = ['cedula', 'certificado'];

/** Documentos obligatorios por producto cuando no hay config de admin. */
export function getDefaultRequiredDocs(productId: string): DocType[] {
  if (productId === 'funerario') return ['cedula', 'cedula_titular'];
  if (productId === 'patrimoniales') return ['cedula'];
  return DEFAULT_REQUIRED;
}

/** Indica si los documentos OCR obligatorios están procesados. */
export function areDocumentsComplete(s: WizardNavSnapshot): boolean {
  if (s.ocrDone) return true;
  // Pasado OCR (paso 2+), los documentos ya se cargaron en ese módulo.
  if (s.step >= 2) return true;
  const required = s.requiredDocTypes?.length ? s.requiredDocTypes : DEFAULT_REQUIRED;
  if (!s.documents) return false;
  return required.every((d) => s.documents?.[d]?.status === 'done');
}

/** Hay plan elegido (requerido para paso 5). */
export function hasPlanSelected(s: WizardNavSnapshot): boolean {
  return Boolean(s.selectedPlan?.cplan);
}

/**
 * Valida si se puede ir de `currentStep` a `targetStep` (1–5).
 */
export function canNavigateToStep(
  currentStep: number,
  targetStep: number,
  snapshot: WizardNavSnapshot,
): boolean {
  if (targetStep < 1 || targetStep > 5 || targetStep === currentStep) return false;

  // Pago confirmado o póliza emitida: no se vuelve a pasos anteriores.
  if (snapshot.paymentLocked || currentStep >= 6) return false;

  // Los documentos ya se cargaron en OCR: no se vuelve al paso 1.
  if (targetStep === 1 && currentStep > 1) return false;

  if (currentStep === 5 && targetStep < 5 && targetStep !== 4) return false;

  if (targetStep >= 2 && !areDocumentsComplete(snapshot)) return false;

  if (targetStep >= 5 && !hasPlanSelected(snapshot)) return false;

  if (targetStep > currentStep && targetStep > currentStep + 1) return false;

  if (targetStep > currentStep) {
    const maxForward = getMaxForwardStep(snapshot);
    if (targetStep > maxForward) return false;
  }

  return true;
}

/** Paso más avanzado permitido hacia adelante según datos completados. */
export function getMaxForwardStep(snapshot: WizardNavSnapshot): number {
  if (!areDocumentsComplete(snapshot)) return 1;
  if (!hasPlanSelected(snapshot)) return 4;
  return 5;
}

/** Paso anterior permitido (null si no hay). */
export function getPreviousAllowedStep(currentStep: number): number | null {
  // Paso 1 (OCR) no admite regreso; tras emitir (paso 6) tampoco.
  if (currentStep <= 2 || currentStep >= 6) return null;
  if (currentStep === 5) return 4;
  return currentStep - 1;
}

/** Mensaje corto cuando la navegación está bloqueada. */
export function getNavigationBlockReason(
  currentStep: number,
  targetStep: number,
  snapshot: WizardNavSnapshot,
): string | null {
  if (canNavigateToStep(currentStep, targetStep, snapshot)) return null;

  if (snapshot.paymentLocked || currentStep >= 6) {
    return 'El pago ya fue confirmado; no puedes volver a pasos anteriores.';
  }
  if (targetStep === 1 && currentStep > 1) {
    return 'Los documentos ya fueron cargados; no puedes volver a ese paso.';
  }

  if (currentStep === 5 && targetStep < 5 && targetStep !== 4) {
    return 'Desde el pago solo puedes volver al paso de plan para cambiarlo.';
  }
  if (targetStep >= 2 && !areDocumentsComplete(snapshot)) {
    return 'Sube y procesa los documentos obligatorios antes de continuar.';
  }
  if (targetStep >= 5 && !hasPlanSelected(snapshot)) {
    return 'Selecciona un plan antes de ir al pago.';
  }
  if (targetStep > currentStep && targetStep > currentStep + 1) {
    return 'Avanza paso a paso; no puedes saltar etapas.';
  }
  if (targetStep > currentStep && targetStep > getMaxForwardStep(snapshot)) {
    return 'Completa los pasos anteriores antes de avanzar.';
  }
  return 'No puedes ir a ese paso todavía.';
}
