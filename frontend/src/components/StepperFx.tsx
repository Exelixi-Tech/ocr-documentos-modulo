import type { LucideIcon } from 'lucide-react';
import { Check, Loader2, Lock, RotateCcw } from 'lucide-react';

/**
 * Animaciones del stepper superior (paso a paso).
 * - Pasos a los que se puede volver: halo pulsante; al pasar el mouse el ícono
 *   gira a "volver" y el rótulo cambia a "Volver".
 * - Paso actual: anillo en degradado girando.
 * - Pasos bloqueados (OCR ya cargado, pago confirmado): candado.
 * - Barra de progreso con brillo bajo los pasos.
 * Todo es CSS (sin cambios de layout) y respeta prefers-reduced-motion.
 */

export interface StepperTone {
  /** Color del halo pulsante (rgba). */
  halo: string;
  /** Color de los rótulos "Volver"/"Ir". */
  accent: string;
  /** Degradado de la barra de progreso. */
  fill: string;
  /** Colores del anillo del paso actual. */
  ringA: string;
  ringB: string;
}

export const STEPPER_TONE_NAVY: StepperTone = {
  halo: 'rgba(15, 26, 90, 0.38)',
  accent: '#E84F51',
  fill: 'linear-gradient(90deg, #0F1A5A, #4F46E5 55%, #E84F51)',
  ringA: '#E84F51',
  ringB: '#0F1A5A',
};

export const STEPPER_TONE_EMERALD: StepperTone = {
  halo: 'rgba(16, 185, 129, 0.45)',
  accent: '#059669',
  fill: 'linear-gradient(90deg, #10B981, #14B8A6 55%, #0EA5E9)',
  ringA: '#0EA5E9',
  ringB: '#10B981',
};

const EASE = 'cubic-bezier(.2,.8,.2,1)';

function css(t: StepperTone): string {
  return `
.sfx-root { --sfx-halo: ${t.halo}; --sfx-accent: ${t.accent}; --sfx-ring-a: ${t.ringA}; --sfx-ring-b: ${t.ringB}; }
@keyframes sfx-enter { from { opacity: 0; transform: translateY(8px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes sfx-halo { 0% { box-shadow: 0 0 0 0 var(--sfx-halo); } 70% { box-shadow: 0 0 0 11px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
@keyframes sfx-spin { to { transform: rotate(360deg); } }
@keyframes sfx-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@keyframes sfx-pop { 0% { transform: scale(.3) rotate(-25deg); opacity: 0; } 60% { transform: scale(1.18) rotate(5deg); opacity: 1; } 100% { transform: none; } }
@keyframes sfx-shimmer { from { transform: translateX(-120%); } to { transform: translateX(320%); } }
@keyframes sfx-wiggle { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-35deg); } 60% { transform: rotate(10deg); } }
.sfx-root .sfx-step { animation: sfx-enter .5s ${EASE} backwards; transition: transform .25s ${EASE}; outline: none; }
.sfx-root .sfx-circle { position: relative; transition: transform .25s ${EASE}, box-shadow .25s, background-color .2s; }
.sfx-root .sfx-can-return .sfx-circle { animation: sfx-halo 2.4s ease-out infinite; }
.sfx-root .sfx-can-return:hover, .sfx-root .sfx-can-return:focus-visible { transform: translateY(-2px); }
.sfx-root .sfx-can-return:hover .sfx-circle, .sfx-root .sfx-can-return:focus-visible .sfx-circle { transform: scale(1.1); animation: none; box-shadow: 0 8px 20px var(--sfx-halo); }
.sfx-root .sfx-can-advance:hover .sfx-circle, .sfx-root .sfx-can-advance:focus-visible .sfx-circle { transform: scale(1.07); box-shadow: 0 6px 16px rgba(15,23,42,.14); }
.sfx-root .sfx-glyphs { display: grid; place-items: center; }
.sfx-root .sfx-glyph { grid-area: 1 / 1; display: grid; place-items: center; transition: opacity .2s, transform .35s ${EASE}; }
.sfx-root .sfx-glyph-back { opacity: 0; transform: rotate(120deg) scale(.5); }
.sfx-root .sfx-can-return:hover .sfx-glyph-main, .sfx-root .sfx-can-return:focus-visible .sfx-glyph-main { opacity: 0; transform: scale(.5) rotate(-60deg); }
.sfx-root .sfx-can-return:hover .sfx-glyph-back, .sfx-root .sfx-can-return:focus-visible .sfx-glyph-back { opacity: 1; transform: none; }
.sfx-root .sfx-can-return:hover .sfx-glyph-back svg { animation: sfx-wiggle .6s ${EASE}; }
.sfx-root .sfx-check { animation: sfx-pop .55s ${EASE} both; }
.sfx-root .sfx-active .sfx-circle::before { content: ''; position: absolute; inset: -4px; border-radius: 9999px; background: conic-gradient(from 0deg, var(--sfx-ring-a), transparent 35%, var(--sfx-ring-b) 60%, transparent 85%, var(--sfx-ring-a)); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); animation: sfx-spin 2.6s linear infinite; pointer-events: none; }
.sfx-root .sfx-active .sfx-glyph-main { animation: sfx-breathe 2.2s ease-in-out infinite; }
.sfx-root .sfx-lock { position: absolute; right: -4px; bottom: -4px; width: 17px; height: 17px; border-radius: 9999px; background: #fff; color: #64748b; display: grid; place-items: center; box-shadow: 0 1px 5px rgba(15,23,42,.25); }
.sfx-root .sfx-kicker { display: inline-grid; }
.sfx-root .sfx-kicker > span { grid-area: 1 / 1; transition: opacity .2s, transform .3s ${EASE}; white-space: nowrap; }
.sfx-root .sfx-kicker-alt { opacity: 0; transform: translateY(5px); color: var(--sfx-accent); display: inline-flex; align-items: center; gap: 3px; }
.sfx-root .sfx-can-return:hover .sfx-kicker-main, .sfx-root .sfx-can-return:focus-visible .sfx-kicker-main,
.sfx-root .sfx-can-advance:hover .sfx-kicker-main, .sfx-root .sfx-can-advance:focus-visible .sfx-kicker-main,
.sfx-root .sfx-locked:hover .sfx-kicker-main { opacity: 0; transform: translateY(-5px); }
.sfx-root .sfx-can-return:hover .sfx-kicker-alt, .sfx-root .sfx-can-return:focus-visible .sfx-kicker-alt,
.sfx-root .sfx-can-advance:hover .sfx-kicker-alt, .sfx-root .sfx-can-advance:focus-visible .sfx-kicker-alt { opacity: 1; transform: none; }
.sfx-root .sfx-locked:hover .sfx-kicker-alt { opacity: 1; transform: none; color: #64748b; }
.sfx-root .sfx-track { position: absolute; left: 22px; right: 22px; bottom: 4px; height: 3px; border-radius: 9999px; background: rgba(148,163,184,.2); overflow: hidden; pointer-events: none; }
.sfx-root .sfx-track-fill { position: relative; height: 100%; border-radius: inherit; background: ${t.fill}; transition: width .8s ${EASE}; overflow: hidden; }
.sfx-root .sfx-track-fill::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 35%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent); animation: sfx-shimmer 2.8s ease-in-out infinite; }
.sfx-root .sfx-arrow svg { transition: transform .2s ${EASE}; }
.sfx-root .sfx-arrow:not(:disabled):hover svg { transform: scale(1.2); }
@media (prefers-reduced-motion: reduce) {
  .sfx-root .sfx-step, .sfx-root .sfx-step *, .sfx-root .sfx-step .sfx-circle::before, .sfx-root .sfx-track-fill, .sfx-root .sfx-track-fill::after { animation: none !important; transition: none !important; }
}
`;
}

/** Estilos del stepper animado; renderizar una vez dentro de `.sfx-root`. */
export function StepperFxStyles({ tone }: { tone: StepperTone }) {
  return <style>{css(tone)}</style>;
}

/** Ícono del círculo: check / ícono del paso, "volver" al pasar el mouse, candado o spinner. */
export function StepGlyph({
  Icon,
  isComplete,
  isActive,
  canReturn,
  locked,
  loading,
}: {
  Icon: LucideIcon;
  isComplete: boolean;
  isActive: boolean;
  canReturn: boolean;
  locked: boolean;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Loader2
        size={18}
        className={`animate-spin ${isComplete ? 'text-white' : 'text-slate-500'}`}
        strokeWidth={2.5}
      />
    );
  }
  return (
    <>
      <span className="sfx-glyphs">
        <span className="sfx-glyph sfx-glyph-main">
          {isComplete ? (
            <Check size={18} className="text-white sfx-check" strokeWidth={3} />
          ) : (
            <Icon
              size={18}
              className={isActive ? 'text-slate-600' : 'text-slate-400'}
              strokeWidth={2}
            />
          )}
        </span>
        {canReturn && (
          <span className="sfx-glyph sfx-glyph-back" aria-hidden>
            <RotateCcw size={17} className={isComplete ? 'text-white' : 'text-slate-600'} strokeWidth={2.75} />
          </span>
        )}
      </span>
      {locked && (
        <span className="sfx-lock" aria-hidden>
          <Lock size={9} strokeWidth={3} />
        </span>
      )}
    </>
  );
}

/** Rótulo "PASO 0N" que cambia a "Volver" / "Ir" / motivo del bloqueo al pasar el mouse. */
export function StepKicker({
  label,
  canReturn,
  canAdvance,
  locked,
  lockedText,
}: {
  label: string;
  canReturn: boolean;
  canAdvance: boolean;
  locked: boolean;
  lockedText: string;
}) {
  const alt = canReturn ? (
    <><RotateCcw size={9} strokeWidth={3} /> Volver</>
  ) : canAdvance ? (
    <>Ir aquí →</>
  ) : locked ? (
    <><Lock size={8} strokeWidth={3} /> {lockedText}</>
  ) : null;
  return (
    <span className="sfx-kicker">
      <span className="sfx-kicker-main">{label}</span>
      {alt && <span className="sfx-kicker-alt" aria-hidden>{alt}</span>}
    </span>
  );
}

/** Barra de progreso con brillo (dentro de un contenedor `relative`). */
export function StepperProgress({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <span className="sfx-track" aria-hidden>
      <span className="sfx-track-fill block" style={{ width: `${Math.max(pct, 4)}%` }} />
    </span>
  );
}
