import { useState, type FormEvent } from 'react';
import { CreditCard, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { markTarjetaPublicSession, normalizeCodigoTarjeta } from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';

const BRAND = {
  navyDeep: '#050924',
  navy: '#091133',
  navySoft: '#0F1A5A',
  blueMid: '#2E6DBF',
  blueLight: '#4A8DD5',
  red: '#E84F51',
  redLight: '#FF6675',
} as const;

/**
 * Pantalla de entrada del flujo RCV por tarjeta (farmacia).
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
      className="fixed inset-0 z-[70] grid place-items-center overflow-hidden px-4 py-8"
    >
      {/* Fondo brand */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 42%, ${BRAND.navySoft} 100%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 55% 45% at 18% 18%, ${BRAND.blueLight}33, transparent 58%),
            radial-gradient(ellipse 50% 42% at 88% 22%, ${BRAND.blueMid}28, transparent 60%),
            radial-gradient(ellipse 70% 50% at 50% 115%, ${BRAND.red}22, transparent 62%)
          `,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      <div
        className="relative w-full max-w-[440px]"
        style={{ animation: 'splashTextIn 0.55s ease-out both' }}
      >
        {/* Tarjeta decorativa */}
        <div
          className="mx-auto mb-5 w-[min(100%,320px)] rounded-2xl p-[1px]"
          style={{
            background: `linear-gradient(135deg, ${BRAND.blueLight}88, ${BRAND.blueMid}66, ${BRAND.red}77)`,
            animation: 'splashTextIn 0.6s ease-out 0.08s both',
          }}
        >
          <div
            className="relative overflow-hidden rounded-[15px] px-5 py-4"
            style={{
              background: `linear-gradient(135deg, ${BRAND.navySoft} 0%, ${BRAND.navy} 55%, #0B1444 100%)`,
            }}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl"
              style={{ background: `${BRAND.red}44` }}
            />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-white/55">
                  Activación RCV
                </p>
                <p className="mt-1 font-wordmark text-lg leading-none text-white">
                  La Mundial <span className="italic text-fuchsia-400">de Seguros</span>
                </p>
              </div>
              <img
                src={publicAsset('logo-isotipo-transparente.png')}
                alt=""
                className="h-10 w-auto shrink-0 opacity-95"
                draggable={false}
              />
            </div>
            <div className="relative mt-4 flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 ring-1 ring-white/12">
              <CreditCard size={16} className="shrink-0 text-violet-300" aria-hidden />
              <span className="truncate font-mono text-sm tracking-[0.18em] text-white/90">
                •••• •••• ••••
              </span>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-2xl bg-white/98 shadow-[0_28px_70px_-24px_rgba(5,9,36,0.75)] ring-1 ring-white/20 backdrop-blur-sm"
          style={{ animation: 'splashTextIn 0.6s ease-out 0.16s both' }}
        >
          <div
            className="h-1"
            style={{
              background: `linear-gradient(90deg, ${BRAND.navySoft} 0%, ${BRAND.blueMid} 52%, ${BRAND.red} 100%)`,
            }}
          />

          <div className="px-6 py-7 sm:px-8 sm:py-8">
            <div className="mb-6 text-center">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.32em] text-fuchsia-500">
                Farmacia aliada
              </p>
              <h1 className="mt-2 font-sans text-[1.55rem] font-extrabold tracking-tight text-indigo-900 sm:text-[1.7rem]">
                Activación de tarjeta
              </h1>
              <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-slate-500">
                Ingresa el código impreso en tu tarjeta para iniciar la suscripción RCV.
              </p>
            </div>

            <label htmlFor="codigo-tarjeta" className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Código de tarjeta
            </label>
            <div className="relative">
              <CreditCard
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400"
                aria-hidden
              />
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
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-11 pr-4 text-base text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/15 disabled:opacity-60 sm:text-sm"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700 ring-1 ring-rose-100"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-500 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_12px_28px_-10px_rgba(15,26,90,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-10px_rgba(15,26,90,0.62)] active:translate-y-0 disabled:cursor-wait disabled:opacity-75 disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                  Validando…
                </>
              ) : (
                'Validar tarjeta'
              )}
            </button>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[0.66rem] font-bold text-indigo-800 ring-1 ring-indigo-100">
                <ShieldCheck size={12} className="text-emerald-600" aria-hidden />
                Conexión segura
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 px-3 py-1.5 text-[0.66rem] font-bold text-fuchsia-800 ring-1 ring-fuchsia-100">
                <Sparkles size={12} className="text-fuchsia-500" aria-hidden />
                RCV digital
              </span>
            </div>
          </div>
        </form>

        <p className="mt-4 text-center text-[0.68rem] leading-relaxed text-white/45">
          El código está en el reverso o sobreimpreso de tu tarjeta de activación.
        </p>
      </div>
    </div>
  );
}
