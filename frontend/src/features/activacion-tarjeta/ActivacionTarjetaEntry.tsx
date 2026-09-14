import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { markTarjetaPublicSession, normalizeCodigoTarjeta } from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';

const STEPS = ['Código', 'Documentos', 'Póliza'] as const;

/**
 * Pantalla de entrada del flujo RCV por tarjeta de activación.
 */
export function ActivacionTarjetaEntry() {
  const setTarjeta = useWizardStore((s) => s.setTarjeta);
  const setMetadataCanal = useWizardStore((s) => s.setMetadataCanal);
  const setVehicle = useWizardStore((s) => s.setVehicle);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = normalizeCodigoTarjeta(codigo);
    if (!value) {
      setError('Ingresa el código de tarjeta.');
      return;
    }

    setLoading(true);
    setError('');
    markTarjetaPublicSession();
    try {
      const tarjeta = await validateCard(value);
      const vehicleKind = resolveTarjetaPlanVehicleKind(tarjeta);
      persistProductFromHints({ product: 'rcv' });
      const current = useWizardStore.getState().metadataCanal || {};
      const canalMeta = metadataFromTarjetaActivacion(tarjeta, {
        ...current,
        tarjetaVehicleKind: vehicleKind,
      });
      setMetadataCanal(canalMeta);
      persistTarjetaMetadataCanal(canalMeta);
      if (vehicleKind) {
        setVehicle({ ctipo: ctipoForTarjetaPlan(vehicleKind) });
      }
      setTarjeta(tarjeta);
      toast.success(
        'Tarjeta válida',
        tarjeta.bfactura === 1
          ? 'Ahora carga la factura fiscal y el resto de documentos.'
          : 'Continúa con los documentos. El pago se hace al final.',
        5000,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo validar la tarjeta.';
      setError(message);
      toast.error('Tarjeta no válida', message, 6000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Activación de tarjeta RCV"
      className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center overflow-hidden p-4 sm:p-6"
    >
      {/* Fondo */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900" />
      <div
        className="absolute inset-0 opacity-80"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(circle at 12% 20%, rgba(74,141,213,0.35), transparent 42%),
            radial-gradient(circle at 88% 12%, rgba(232,79,81,0.22), transparent 38%),
            radial-gradient(circle at 50% 100%, rgba(22,42,127,0.5), transparent 55%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl"
        aria-hidden
      />

      <div
        className="relative w-full max-w-[460px]"
        style={{ animation: 'splashTextIn 0.5s ease-out both' }}
      >
        <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_32px_80px_-28px_rgba(5,9,36,0.65)] ring-1 ring-white/10">
          {/* Cabecera */}
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-950 px-6 pb-8 pt-8 text-center sm:px-8 sm:pt-9">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              aria-hidden
              style={{
                backgroundImage: 'radial-gradient(circle at 30% 0%, rgba(255,255,255,0.25), transparent 55%)',
              }}
            />
            <div className="relative mx-auto mb-4 grid h-[72px] w-[72px] place-items-center rounded-2xl bg-white/95 shadow-lg ring-1 ring-white/40">
              <img
                src={publicAsset('logo-isotipo-transparente.png')}
                alt="La Mundial de Seguros"
                className="h-11 w-auto"
                draggable={false}
              />
            </div>
            <p className="relative font-wordmark text-xl text-white sm:text-[1.35rem]">
              La Mundial{' '}
              <span className="italic text-fuchsia-300">de Seguros</span>
            </p>
            <h1 className="relative mt-3 text-lg font-bold tracking-tight text-white/95 sm:text-xl">
              Activación de tarjeta RCV
            </h1>
            <p className="relative mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-indigo-100/80">
              Ingresa el código de tu tarjeta para comenzar la suscripción digital.
            </p>

            {/* Pasos */}
            <ol className="relative mt-6 flex items-center justify-center gap-1 sm:gap-2">
              {STEPS.map((label, i) => {
                const active = i === 0;
                const done = false;
                return (
                  <li key={label} className="flex items-center gap-1 sm:gap-2">
                    {i > 0 && (
                      <span className="hidden h-px w-4 bg-white/20 sm:block sm:w-6" aria-hidden />
                    )}
                    <span
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide sm:px-3 sm:text-[0.65rem]',
                        active
                          ? 'bg-white text-indigo-900 shadow-sm'
                          : done
                            ? 'bg-white/20 text-white'
                            : 'bg-white/10 text-white/55',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'grid h-4 w-4 place-items-center rounded-full text-[0.58rem]',
                          active ? 'bg-indigo-700 text-white' : 'bg-white/15 text-white/70',
                        ].join(' ')}
                      >
                        {i + 1}
                      </span>
                      <span className="hidden min-[380px]:inline">{label}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="px-6 py-7 sm:px-8 sm:py-8">
            <label
              htmlFor="codigo-tarjeta"
              className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"
            >
              <KeyRound size={14} className="text-indigo-500" aria-hidden />
              Código de tarjeta
            </label>
            <input
              id="codigo-tarjeta"
              type="text"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              placeholder="Ej. hS2t6TJz"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                if (error) setError('');
              }}
              disabled={loading}
              className="min-h-[52px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-center font-mono text-base tracking-[0.12em] text-slate-800 outline-none transition-all placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/12 disabled:opacity-60 sm:text-sm"
            />

            {error ? (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-center text-xs font-medium text-rose-700 ring-1 ring-rose-100"
              >
                {error}
              </p>
            ) : (
              <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
                Lo encuentras en el reverso o impreso en tu tarjeta de activación.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-[0_14px_32px_-12px_rgba(232,79,81,0.55)] transition-all hover:-translate-y-0.5 hover:from-fuchsia-600 hover:to-fuchsia-700 hover:shadow-[0_18px_36px_-12px_rgba(232,79,81,0.65)] active:translate-y-0 disabled:cursor-wait disabled:opacity-75 disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                  Validando…
                </>
              ) : (
                <>
                  Validar tarjeta
                  <ArrowRight size={18} aria-hidden />
                </>
              )}
            </button>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-[0.68rem] font-medium text-slate-400">
              <ShieldCheck size={13} className="text-emerald-500" aria-hidden />
              Conexión cifrada · Proceso guiado paso a paso
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
