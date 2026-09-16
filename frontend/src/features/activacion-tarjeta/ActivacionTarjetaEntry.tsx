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
const LOGO_LA_MUNDIAL = publicAsset('logo-lamundial.png');

/** Velo sobre foto del kit — legibilidad del copy sin alterar el arte de marca. */
const HERO_PHOTO_VEIL = [
  'linear-gradient(180deg, rgba(5,9,36,0.72) 0%, rgba(9,17,51,0.18) 38%, rgba(9,17,51,0.08) 58%, rgba(15,26,90,0.35) 100%)',
  'linear-gradient(115deg, rgba(46,109,191,0.22) 0%, transparent 45%)',
  'radial-gradient(ellipse 80% 60% at 100% 100%, rgba(232,79,81,0.12) 0%, transparent 55%)',
].join(', ');

/** Fondo marca — mesh + semicírculo; solo mientras carga la foto o si falla. */
function TarjetaHeroBackdrop() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(155deg, #050924 0%, ${BRAND.navyDeep} 32%, ${BRAND.navy} 58%, ${BRAND.navySoft} 100%)`,
        }}
      />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 90% 70% at 8% 12%, ${BRAND.blueLight}55 0%, transparent 52%),
            radial-gradient(ellipse 75% 55% at 92% 18%, ${BRAND.blueMid}40 0%, transparent 48%),
            radial-gradient(ellipse 65% 50% at 78% 92%, ${BRAND.red}28 0%, transparent 55%),
            radial-gradient(ellipse 120% 80% at 50% 110%, rgba(255,255,255,0.14) 0%, transparent 45%)
          `,
        }}
      />
      {/* Semicírculo blanco suave — continuidad con el panel derecho / base del hero */}
      <div
        className="absolute bottom-0 left-1/2 h-[46%] w-[155%] -translate-x-1/2 rounded-[50%] bg-white/95 shadow-[0_-20px_60px_-20px_rgba(255,255,255,0.35)]"
        aria-hidden
      />
      <div
        className="absolute bottom-[38%] left-1/2 h-32 w-[80%] -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
        aria-hidden
      />
    </>
  );
}

function TarjetaHeroFallback() {
  return (
    <div className="absolute inset-x-0 bottom-[14%] flex justify-center px-6">
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
  );
}

function TarjetaHeroPanel() {
  const [heroReady, setHeroReady] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const showPhoto = heroReady && !heroFailed;

  return (
    <>
      {/* La foto del kit ya incluye fondo azul + semicírculo; no duplicar capas encima */}
      {!showPhoto && <TarjetaHeroBackdrop />}

      {!heroFailed && (
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover object-[50%_68%] transition-opacity duration-700 sm:object-[50%_58%] lg:object-[50%_50%] ${showPhoto ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
          onLoad={() => setHeroReady(true)}
          onError={() => setHeroFailed(true)}
        />
      )}

      {showPhoto && (
        <div
          className="absolute inset-0"
          aria-hidden
          style={{ background: HERO_PHOTO_VEIL }}
        />
      )}

      {(!heroReady || heroFailed) && <TarjetaHeroFallback />}
    </>
  );
}

/** QR decorativo para el reverso del mockup (no escaneable). */
function TarjetaQrDecor() {
  return (
    <svg viewBox="0 0 21 21" className="h-full w-full" aria-hidden>
      <rect width="21" height="21" fill="#fff" />
      <g fill="#111827">
        <rect x="0" y="0" width="7" height="7" />
        <rect x="1" y="1" width="5" height="5" fill="#fff" />
        <rect x="2" y="2" width="3" height="3" />
        <rect x="14" y="0" width="7" height="7" />
        <rect x="15" y="1" width="5" height="5" fill="#fff" />
        <rect x="16" y="2" width="3" height="3" />
        <rect x="0" y="14" width="7" height="7" />
        <rect x="1" y="15" width="5" height="5" fill="#fff" />
        <rect x="2" y="16" width="3" height="3" />
        <rect x="8" y="0" width="1" height="1" />
        <rect x="10" y="0" width="1" height="1" />
        <rect x="12" y="0" width="1" height="1" />
        <rect x="9" y="2" width="2" height="1" />
        <rect x="8" y="4" width="1" height="2" />
        <rect x="10" y="5" width="3" height="1" />
        <rect x="8" y="8" width="5" height="5" />
        <rect x="14" y="8" width="1" height="1" />
        <rect x="16" y="9" width="2" height="1" />
        <rect x="18" y="8" width="1" height="3" />
        <rect x="14" y="10" width="3" height="1" />
        <rect x="17" y="11" width="1" height="2" />
        <rect x="8" y="14" width="1" height="1" />
        <rect x="10" y="15" width="2" height="1" />
        <rect x="13" y="14" width="1" height="3" />
        <rect x="15" y="16" width="4" height="1" />
        <rect x="8" y="17" width="3" height="1" />
        <rect x="12" y="18" width="2" height="1" />
        <rect x="16" y="18" width="3" height="2" />
        <rect x="19" y="14" width="1" height="2" />
        <rect x="20" y="17" width="1" height="1" />
      </g>
    </svg>
  );
}

/** Mockup frente/reverso tarjética con logo La Mundial. */
function TarjetaCodigoHint() {
  return (
    <div
      className="relative h-[104px] w-[118px] shrink-0 sm:h-[112px] sm:w-[128px]"
      role="img"
      aria-label="Tarjeta La Mundial: frente con logo y reverso con código y QR"
    >
      <div
        className="absolute inset-3 rounded-2xl bg-gradient-to-br from-[#2E6DBF]/12 to-[#0F1A5A]/8"
        aria-hidden
      />

      {/* Reverso — código + QR */}
      <div className="absolute right-0 top-2 z-10 h-[88px] w-[68px] rotate-[9deg] overflow-hidden rounded-[10px] bg-white shadow-[0_8px_22px_-8px_rgba(15,26,90,0.32)] ring-1 ring-slate-200/90 sm:h-[94px] sm:w-[72px]">
        <div className="relative px-2 pt-2">
          <p className="text-[6px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-[7px]">
            Código
          </p>
          <p className="font-mono text-[7px] font-bold leading-tight text-[#0F1A5A] sm:text-[8px]">
            A-1523425
          </p>
          <span
            className="pointer-events-none absolute -inset-x-0.5 -inset-y-0.5 rounded-md ring-2 ring-[#E84F51]/75 ring-offset-1 ring-offset-white"
            aria-hidden
          />
        </div>
        <div className="mx-auto mt-1 h-9 w-9 overflow-hidden rounded-sm border border-slate-100 p-0.5 sm:h-10 sm:w-10">
          <TarjetaQrDecor />
        </div>
        <div
          className="absolute inset-x-0 bottom-0 flex h-3.5 items-center justify-end px-1.5 sm:h-4"
          style={{ background: `linear-gradient(90deg, ${BRAND.navy} 0%, ${BRAND.navySoft} 100%)` }}
        >
          <Phone size={8} className="text-white/90" aria-hidden />
        </div>
      </div>

      {/* Frente — logo La Mundial */}
      <div className="absolute left-0 top-0 z-20 flex h-[88px] w-[68px] -rotate-[7deg] items-center justify-center overflow-hidden rounded-[10px] bg-white p-2.5 shadow-[0_12px_28px_-10px_rgba(9,17,51,0.38)] ring-1 ring-slate-200/90 sm:h-[94px] sm:w-[72px] sm:p-3">
        <img
          src={LOGO_LA_MUNDIAL}
          alt=""
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
    </div>
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
      className="fixed inset-0 z-[70] min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#eef2f8]"
    >
      <div
        className="relative grid min-h-[100dvh] w-full lg:grid-cols-2"
        style={{ animation: 'splashTextIn 0.55s ease-out both' }}
      >
        {/* Hero — imagen marca a tamaño completo (panel izquierdo / top móvil) */}
        <div
          className="relative min-h-[42vh] overflow-hidden sm:min-h-[44vh] lg:min-h-[100dvh]"
          style={{ backgroundColor: BRAND.navyDeep }}
        >
          <TarjetaHeroPanel />

          <div className="pointer-events-none relative z-10 flex min-h-[inherit] flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div className="max-w-xs rounded-2xl border border-white/20 bg-white/10 px-4 py-3 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.35)] backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/85">
                Tarjética RCV
              </p>
              <p className="mt-1 text-lg font-extrabold leading-snug text-white drop-shadow-sm sm:text-xl">
                Obtén tu póliza digital en minutos
              </p>
            </div>

            <p className="max-w-sm pb-1 text-sm leading-relaxed text-white/90 drop-shadow-md sm:text-[0.9375rem] lg:pb-0">
              Activa tu protección vehicular con el código del reverso de tu tarjeta en farmacia
              aliada.
            </p>
          </div>
        </div>

        {/* Panel formulario — mitad derecha full bleed; contenido centrado en pantallas muy anchas */}
        <div className="flex flex-col bg-white lg:min-h-[100dvh] lg:border-l lg:border-slate-200/80">
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col xl:max-w-lg">
          <div className="border-b border-slate-100 px-6 pb-5 pt-8 text-center sm:px-10 sm:pt-10">
            <h1 className="font-sans text-xl font-extrabold tracking-tight text-[#0F1A5A] sm:text-2xl">
              Activación de tarjeta
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ingresa el código impreso en el reverso de tu tarjeta RCV.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
              <ShieldCheck size={14} aria-hidden className="text-[#2E6DBF]" />
              Protección vehicular RCV
            </div>
          </div>

          {/* Pista visual — frente/reverso tarjeta */}
          <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-5 sm:px-10">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              ¿Dónde está el código?
            </p>
            <div className="mx-auto flex max-w-md items-center gap-4">
              <TarjetaCodigoHint />
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
          </div>

          <div
            className="mt-auto px-4 py-3.5 text-center text-white sm:px-6"
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
