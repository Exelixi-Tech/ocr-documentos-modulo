import { useState, type FormEvent } from 'react';
import { Loader2, Phone, ShieldCheck } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { TARJETA_YA_ACTIVADA_CODE } from './tarjeta-estado';
import { markTarjetaPublicSession, normalizeCodigoTarjeta } from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';

const BRAND = {
  navyDeep: '#091133',
  navy: '#0F1A5A',
  navySoft: '#162A7F',
  blueMid: '#2E6DBF',
  blueLight: '#4A8DD5',
  red: '#E84F51',
  silver: '#ACACAC',
  btnFrom: '#6B7FA8',
  btnTo: '#4A5F7A',
} as const;

/**
 * Entrada flujo RCV tarjeta farmacia — layout full-viewport (referencia mockup La Mundial).
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
      const yaActivada = err instanceof Error && err.name === TARJETA_YA_ACTIVADA_CODE;
      setError(message);
      toast.error(
        yaActivada ? 'Tarjeta ya activada' : 'Tarjeta no válida',
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
      aria-label="Activación de tarjeta RCV"
      className="fixed inset-0 z-[70] min-h-[100dvh] overflow-x-hidden overflow-y-auto"
      style={{ background: BRAND.navyDeep }}
    >
      {/* Fondo marca — pantalla completa */}
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 70% 55% at 15% 10%, ${BRAND.blueLight}22, transparent 55%),
            radial-gradient(ellipse 60% 50% at 88% 85%, ${BRAND.red}18, transparent 50%),
            linear-gradient(165deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 55%, ${BRAND.navySoft} 100%)
          `,
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center px-4 py-10 sm:max-w-xl sm:px-6">
        <div
          className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_28px_64px_-28px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
          style={{ animation: 'splashTextIn 0.55s ease-out both' }}
        >
          {/* Cabecera — título como mockup */}
          <div className="border-b border-slate-100 px-6 pb-5 pt-8 text-center sm:px-10 sm:pt-10">
            <h1 className="font-sans text-xl font-extrabold tracking-tight text-[#0F1A5A] sm:text-2xl">
              Activación de tarjeta
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ingresa el código impreso en tu tarjeta RCV de farmacia.
            </p>
          </div>

          {/* Logo La Mundial */}
          <div className="flex flex-col items-center px-6 py-8 sm:px-10 sm:py-10">
            <img
              src={publicAsset('logo-isotipo-transparente.png')}
              alt="La Mundial de Seguros"
              className="h-24 w-auto sm:h-28"
              draggable={false}
            />
            <p className="mt-4 text-center font-wordmark text-lg text-[#0F1A5A] sm:text-xl">
              LA MUNDIAL{' '}
              <span className="italic text-[#E84F51]">de Seguros</span>
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
              <ShieldCheck size={14} aria-hidden className="text-[#2E6DBF]" />
              RCV · Activación en farmacia
            </div>
          </div>

          {/* Formulario */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-100 bg-slate-50/60 px-6 py-7 sm:px-10 sm:py-8"
          >
            <label htmlFor="codigo-tarjeta" className="sr-only">
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
              placeholder="Código de tarjeta"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                if (error) setError('');
              }}
              disabled={loading}
              className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-base text-slate-800 shadow-sm outline-none transition-[box-shadow,border-color] placeholder:text-slate-400 focus:border-[#2E6DBF] focus:ring-4 focus:ring-[#2E6DBF]/15 disabled:opacity-60"
            />

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-center text-sm font-medium text-rose-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_-12px_rgba(74,95,122,0.85)] transition-[filter,transform] hover:brightness-105 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              style={{
                background: `linear-gradient(180deg, ${BRAND.btnFrom} 0%, ${BRAND.btnTo} 100%)`,
              }}
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

          {/* Contacto */}
          <div
            className="px-4 py-3.5 text-center text-white sm:px-6"
            style={{ background: `linear-gradient(90deg, ${BRAND.navy} 0%, ${BRAND.navySoft} 100%)` }}
          >
            <p className="inline-flex flex-wrap items-center justify-center gap-2 text-sm font-bold tracking-wide">
              <Phone size={16} aria-hidden className="shrink-0" />
              <span>Contacto directo: 0500 552 62 56</span>
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-white/55">
          Protección vehicular RCV · La Mundial de Seguros
        </p>
      </div>
    </div>
  );
}
