import { useState, type FormEvent } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { markTarjetaPublicSession, normalizeCodigoTarjeta } from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';

/** Pasos impresos en el reverso de la tarjetica (manual pólizas rediseño). */
const ACTIVATION_STEPS = [
  'Escanea el código QR.',
  'Ingresa el código de La Tarjetica. (Clic en validar).',
  'Llena el formulario.',
  'Obtendrás tu póliza de inmediato vía e-mail.',
] as const;

const ACTIVE_STEP = 1;

/**
 * Pantalla de entrada — alineada al reverso de la tarjetica La Mundial.
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
      setError('Ingresa el código de La Tarjetica.');
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
      aria-label="Activación de póliza RCV"
      className="fixed inset-0 z-[70] overflow-y-auto bg-[#eceff3]"
    >
      {/* Patrón ondas (frente tarjetica) */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 10% 20%, #fff 0%, transparent 55%),
            radial-gradient(ellipse 70% 45% at 90% 80%, #fff 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 50% 50%, #d8dde6 0%, transparent 70%)
          `,
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-4 py-6 sm:py-8">
        {/* Cabecera — reverso tarjetica */}
        <header
          className="relative overflow-hidden rounded-t-2xl bg-[#4f5668] px-5 pb-6 pt-7 text-white shadow-lg sm:px-7"
          style={{ animation: 'splashTextIn 0.45s ease-out both' }}
        >
          <div
            className="pointer-events-none absolute -left-8 top-0 h-full w-32 skew-x-[-12deg] bg-white/10"
            aria-hidden
          />
          <h1 className="relative text-xl font-extrabold tracking-tight sm:text-2xl">
            ¡Activa tu póliza!
          </h1>
          <ol className="relative mt-4 space-y-2.5">
            {ACTIVATION_STEPS.map((text, i) => {
              const active = i === ACTIVE_STEP;
              return (
                <li
                  key={text}
                  className={[
                    'flex gap-3 text-[0.82rem] leading-snug sm:text-sm',
                    active ? 'font-semibold text-white' : 'text-white/72',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                      active ? 'bg-white text-[#4f5668]' : 'bg-white/15 text-white/90',
                    ].join(' ')}
                  >
                    {i + 1}
                  </span>
                  <span className={active ? 'underline decoration-white/40 underline-offset-2' : ''}>
                    {text}
                  </span>
                </li>
              );
            })}
          </ol>
        </header>

        {/* Cuerpo — frente tarjetica + formulario */}
        <div
          className="-mt-1 flex flex-1 flex-col rounded-b-2xl bg-white shadow-[0_20px_50px_-24px_rgba(15,26,90,0.35)] ring-1 ring-slate-200/80"
          style={{ animation: 'splashTextIn 0.55s ease-out 0.08s both' }}
        >
          <div className="flex flex-col items-center px-5 pb-2 pt-8 sm:px-8 sm:pt-10">
            {/* Mock tarjetica física */}
            <div className="relative w-full max-w-[280px] rounded-2xl border-2 border-[#b8bec8] bg-white p-6 shadow-sm">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[0.55rem] font-bold tracking-widest text-slate-400"
                aria-hidden
              >
                J-00084644-8
              </span>
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-[0.55rem] font-bold tracking-widest text-slate-400"
                aria-hidden
              >
                www.lamundialdeseguros.com
              </span>
              <img
                src={publicAsset('logo-isotipo-transparente.png')}
                alt="La Mundial de Seguros"
                className="mx-auto h-20 w-auto"
                draggable={false}
              />
              <p className="mt-3 text-center font-wordmark text-base text-indigo-900">
                LA MUNDIAL{' '}
                <span className="italic text-fuchsia-600">de Seguros</span>
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-slate-500">
              Para más información visítanos:{' '}
              <span className="font-semibold text-indigo-700">www.lamundialdeseguros.com</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-100 px-5 py-6 sm:px-8">
            <label
              htmlFor="codigo-tarjeta"
              className="mb-2 block text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500"
            >
              Código de La Tarjetica
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
              placeholder="Ingresa tu código"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                if (error) setError('');
              }}
              disabled={loading}
              className="min-h-[50px] w-full rounded-lg border-2 border-[#3B6FBF] bg-white px-4 text-center text-base text-slate-800 outline-none transition-shadow placeholder:text-slate-400 focus:ring-4 focus:ring-[#3B6FBF]/20 disabled:opacity-60 sm:text-sm"
            />

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#3B6FBF] text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_-10px_rgba(59,111,191,0.9)] transition-colors hover:bg-[#2E5AA3] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                  Validando…
                </>
              ) : (
                'Validar'
              )}
            </button>
          </form>

          {/* Footer tarjetica */}
          <div className="mt-auto rounded-b-2xl bg-indigo-900 px-4 py-3 text-center text-white">
            <p className="inline-flex items-center justify-center gap-2 text-sm font-bold tracking-wide">
              <Phone size={16} aria-hidden />
              CONTACTO DIRECTO: 0500 552 62 56
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
