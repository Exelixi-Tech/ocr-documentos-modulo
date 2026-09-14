import { useState, type FormEvent } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { TARJETA_YA_ACTIVADA_CODE } from './tarjeta-estado';
import { markTarjetaPublicSession, normalizeCodigoTarjeta } from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';

/**
 * Pantalla de entrada del flujo RCV por tarjeta de activaci├│n.
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
      setError('Ingresa el c├│digo de tarjeta.');
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
        'Tarjeta v├ílida',
        tarjeta.bfactura === 1
          ? 'Ahora carga la factura fiscal y el resto de documentos.'
          : 'Contin├║a con los documentos. El pago se hace al final.',
        5000,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo validar la tarjeta.';
      const yaActivada = err instanceof Error && err.name === TARJETA_YA_ACTIVADA_CODE;
      setError(message);
      toast.error(
        yaActivada ? 'Tarjeta ya activada' : 'Tarjeta no v├ílida',
        message,
        6000,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Activaci├│n de tarjeta RCV"
      className="fixed inset-0 z-[70] overflow-y-auto bg-[#eceff3]"
    >
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

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] items-center px-4 py-8">
        <div
          className="flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-24px_rgba(15,26,90,0.35)] ring-1 ring-slate-200/80"
          style={{ animation: 'splashTextIn 0.5s ease-out both' }}
        >
          <div className="flex flex-col items-center px-5 pb-2 pt-8 sm:px-8 sm:pt-10">
            <div className="w-full max-w-[280px] rounded-2xl border-2 border-[#b8bec8] bg-white px-6 py-7 shadow-sm">
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

            <h1 className="mt-6 text-center text-lg font-extrabold tracking-tight text-indigo-900 sm:text-xl">
              Activaci├│n de tarjeta RCV
            </h1>
            <p className="mt-2 text-center text-sm text-slate-500">
              Ingresa el c├│digo de tu tarjeta para comenzar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-100 px-5 py-6 sm:px-8">
            <label
              htmlFor="codigo-tarjeta"
              className="mb-2 block text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500"
            >
              C├│digo de tarjeta
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
              placeholder="Ingresa tu c├│digo"
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
                  ValidandoÔÇª
                </>
              ) : (
                'Validar'
              )}
            </button>
          </form>

          <div className="bg-indigo-900 px-4 py-3 text-center text-white">
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
