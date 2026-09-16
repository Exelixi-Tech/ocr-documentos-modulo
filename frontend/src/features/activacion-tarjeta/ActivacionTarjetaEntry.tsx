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
const HERO_IMAGE_2X = publicAsset('tarjeta/hero-mano-tarjeta@2x.jpg');
const HERO_IMAGE_2X_WEBP = publicAsset('tarjeta/hero-mano-tarjeta@2x.webp');
const LOGO_LA_MUNDIAL = publicAsset('logo-lamundial.png');

const HERO_SRCSET_JPG = `${HERO_IMAGE} 1024w, ${HERO_IMAGE_2X} 2048w`;
const HERO_SRCSET_WEBP = `${HERO_IMAGE} 1024w, ${HERO_IMAGE_2X_WEBP} 2048w`;
const HERO_SIZES = '(min-width: 1024px) 50vw, 100vw';

const FOOTER_GRADIENT = `linear-gradient(90deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 38%, ${BRAND.navySoft} 72%, ${BRAND.blueMid} 100%)`;

/** Hero — foto kit a pantalla completa (sin capas CSS duplicadas). */
function TarjetaHeroPanel() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <>
      {!ready && !failed && (
        <div className="absolute inset-0 bg-[#2E6DBF]" aria-hidden />
      )}

      {!failed && (
        <picture
          className={`absolute inset-0 block transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
        >
          <source type="image/webp" srcSet={HERO_SRCSET_WEBP} sizes={HERO_SIZES} />
          <img
            src={HERO_IMAGE}
            srcSet={HERO_SRCSET_JPG}
            sizes={HERO_SIZES}
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-[50%_62%] sm:object-[50%_58%] lg:object-[50%_52%]"
            draggable={false}
            decoding="async"
            fetchPriority="high"
            onLoad={() => setReady(true)}
            onError={() => setFailed(true)}
          />
        </picture>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-[#050924]/50 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[38%] bg-gradient-to-t from-[#0F1A5A]/55 via-[#0F1A5A]/18 to-transparent"
        aria-hidden
      />
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

/** Mockup frente/reverso con logo La Mundial (pista visual del código). */
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
        className="relative flex min-h-[100dvh] w-full flex-col"
        style={{ animation: 'splashTextIn 0.55s ease-out both' }}
      >
      <div className="grid min-h-0 flex-1 w-full lg:grid-cols-2">
        {/* Hero — imagen marca a tamaño completo (panel izquierdo / top móvil) */}
        <div
          className="relative min-h-[42vh] overflow-hidden sm:min-h-[44vh] lg:min-h-full"
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

            <p className="max-w-sm rounded-xl border border-white/40 bg-white/95 px-3.5 py-2.5 text-sm leading-relaxed text-[#0F1A5A] shadow-[0_8px_24px_-10px_rgba(9,17,51,0.4)] sm:text-[0.9375rem]">
              Activa tu protección vehicular con el código del reverso de tu tarjeta.
            </p>
          </div>
        </div>

        {/* Panel formulario — mitad derecha full bleed; contenido centrado en pantallas muy anchas */}
        <div className="flex min-h-full flex-col bg-white lg:border-l lg:border-slate-200/80">
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
                tarjética, junto al QR.
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
        </div>
      </div>

        <div
          className="shrink-0 border-t border-white/10 px-4 py-3.5 text-center text-white shadow-[0_-8px_32px_-12px_rgba(9,17,51,0.45)] sm:px-6"
          style={{ background: FOOTER_GRADIENT }}
        >
          <p className="inline-flex flex-wrap items-center justify-center gap-2 text-sm font-bold tracking-wide">
            <Phone size={16} aria-hidden className="shrink-0" />
            <span>Contacto directo: 0500 552 62 56</span>
          </p>
        </div>
      </div>
    </div>
  );
}
