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
  btnFrom: '#6B7FA8',
  btnTo: '#4A5F7A',
} as const;

const HERO_IMAGE = publicAsset('tarjeta/hero-mano-tarjeta.jpg');
const CARD_HINT_IMAGE = publicAsset('tarjeta/tarjeta-frente-reverso.jpg');

function TarjetaHeroFallback() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(145deg, ${BRAND.blueLight} 0%, ${BRAND.blueMid} 35%, ${BRAND.navy} 100%)`,
        }}
      />
      <div
        className="absolute bottom-0 left-1/2 h-[42%] w-[140%] -translate-x-1/2 rounded-[50%] bg-white"
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-[18%] flex justify-center px-6">
        <div className="w-full max-w-[220px] rotate-[-8deg] rounded-2xl bg-white p-4 shadow-[0_24px_48px_-20px_rgba(9,17,51,0.45)] ring-1 ring-slate-200/80">
          <img
            src={publicAsset('logo-isotipo-transparente.png')}
            alt=""
            className="mx-auto h-14 w-auto"
            draggable={false}
          />
          <p className="mt-2 text-center font-wordmark text-sm text-[#0F1A5A]">
            LA MUNDIAL <span className="italic text-[#E84F51]">de Seguros</span>
          </p>
        </div>
      </div>
    </>
  );
}

function TarjetaHeroPanel() {
  const [heroReady, setHeroReady] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);

  return (
    <>
      {!heroFailed && (
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover object-[center_35%] transition-opacity duration-500 ${heroReady ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
          onLoad={() => setHeroReady(true)}
          onError={() => setHeroFailed(true)}
        />
      )}
      {(!heroReady || heroFailed) && <TarjetaHeroFallback />}
    </>
  );
}

/**
 * Entrada flujo RCV tarjeta farmacia — hero marca + panel de código.
 */
export function ActivacionTarjetaEntry() {
  const setTarjeta = useWizardStore((s) => s.setTarjeta);
  const setMetadataCanal = useWizardStore((s) => s.setMetadataCanal);
  const setVehicle = useWizardStore((s) => s.setVehicle);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hintImageOk, setHintImageOk] = useState(true);

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
      className="fixed inset-0 z-[70] min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#091133]"
    >
      <div
        className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl lg:grid-cols-[1.05fr_0.95fr]"
        style={{ animation: 'splashTextIn 0.55s ease-out both' }}
      >
        {/* Hero — imagen marca a tamaño completo (panel izquierdo / top móvil) */}
        <div className="relative min-h-[38vh] overflow-hidden lg:min-h-[100dvh]">
          <TarjetaHeroPanel />

          <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div className="rounded-2xl bg-[#0F1A5A]/35 px-4 py-3 backdrop-blur-sm ring-1 ring-white/15 lg:max-w-xs">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                Tarjética RCV
              </p>
              <p className="mt-1 text-lg font-extrabold leading-snug text-white sm:text-xl">
                Obtén tu póliza digital en minutos
              </p>
            </div>

            <p className="hidden max-w-sm text-sm leading-relaxed text-white/75 lg:block">
              Activa tu protección vehicular con el código impreso en el reverso de tu tarjeta de
              farmacia aliada.
            </p>
          </div>
        </div>

        {/* Panel formulario */}
        <div className="flex flex-col bg-white lg:min-h-[100dvh] lg:shadow-[-24px_0_48px_-24px_rgba(9,17,51,0.35)]">
          <div className="border-b border-slate-100 px-6 pb-5 pt-8 text-center sm:px-10 sm:pt-10">
            <h1 className="font-sans text-xl font-extrabold tracking-tight text-[#0F1A5A] sm:text-2xl">
              Activación de tarjeta
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ingresa el código impreso en el reverso de tu tarjeta RCV.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
              <ShieldCheck size={14} aria-hidden className="text-[#2E6DBF]" />
              RCV · Activación en farmacia
            </div>
          </div>

          {/* Pista visual — frente/reverso tarjeta */}
          <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5 sm:px-10">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              ¿Dónde está el código?
            </p>
            <div className="mx-auto flex max-w-md items-center gap-4">
              {hintImageOk ? (
                <img
                  src={CARD_HINT_IMAGE}
                  alt="Reverso de la tarjeta RCV con código y QR"
                  className="h-24 w-auto shrink-0 object-contain sm:h-28"
                  draggable={false}
                  onError={() => setHintImageOk(false)}
                />
              ) : (
                <div
                  className="flex h-24 w-36 shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-semibold text-slate-400 ring-1 ring-slate-200"
                  aria-hidden
                >
                  Reverso · QR
                </div>
              )}
              <p className="text-left text-sm leading-relaxed text-slate-600">
                El código está en el <strong className="text-[#0F1A5A]">reverso</strong> de la
                tarjética, junto al QR. También puedes encontrarlo en el sobre de farmacia.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col px-6 py-7 sm:px-10 sm:py-8"
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

            <p className="mt-auto pt-6 text-center text-xs leading-relaxed text-slate-400 lg:hidden">
              Protección vehicular RCV · La Mundial de Seguros
            </p>
          </form>

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
      </div>
    </div>
  );
}
