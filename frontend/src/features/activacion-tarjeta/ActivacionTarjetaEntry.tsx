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

const HERO_IMAGE = publicAsset('tarjeta/hero-activacion.jpg');
const HERO_IMAGE_2X = publicAsset('tarjeta/hero-activacion@2x.jpg');
const LOGO_LA_MUNDIAL = publicAsset('logo-lamundial.png');

const HERO_SRCSET_JPG = `${HERO_IMAGE} 1024w, ${HERO_IMAGE_2X} 2048w`;

const FOOTER_GRADIENT = `linear-gradient(90deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 45%, ${BRAND.navySoft} 100%)`;
const PAGE_BG = `linear-gradient(135deg, ${BRAND.navySoft} 0%, #1E3E9E 45%, ${BRAND.navy} 100%)`;

function TarjetaContactFooter({ className = '' }: { className?: string }) {
  return (
    <div
      className={`px-4 py-3.5 text-center text-white sm:px-6 ${className}`}
      style={{ background: FOOTER_GRADIENT }}
    >
      <p className="inline-flex flex-wrap items-center justify-center gap-2 text-sm font-bold tracking-wide">
        <Phone size={16} aria-hidden className="shrink-0 opacity-90" />
        <span>Contacto directo: 0500 552 62 56</span>
      </p>
    </div>
  );
}

/** Fondo — foto kit editada (mujer + azul limpio, sin textos del banner). */
function TarjetaBackdrop() {
  const [ready, setReady] = useState(false);

  return (
    <img
      src={HERO_IMAGE}
      srcSet={HERO_SRCSET_JPG}
      sizes="100vw"
      alt=""
      aria-hidden
      className={`pointer-events-none absolute inset-0 hidden h-full w-full object-cover object-left transition-opacity duration-500 lg:block ${ready ? 'opacity-100' : 'opacity-0'}`}
      draggable={false}
      decoding="async"
      fetchPriority="high"
      onLoad={() => setReady(true)}
    />
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
      className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto"
      style={{ background: PAGE_BG }}
    >
      <TarjetaBackdrop />

      <div
        className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:justify-end lg:px-[7vw] lg:py-10"
        style={{ animation: 'splashTextIn 0.55s ease-out both' }}
      >
        {/* Login opaco — nunca transparente sobre la foto */}
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_30px_70px_-25px_rgba(5,9,36,0.65)] ring-1 ring-white/60 sm:p-8">
          <div className="text-center">
            <img
              src={LOGO_LA_MUNDIAL}
              alt="La Mundial de Seguros"
              className="mx-auto h-11 w-auto object-contain sm:h-12"
              draggable={false}
            />
            <h1 className="mt-5 font-sans text-xl font-extrabold tracking-tight text-[#0F1A5A] sm:text-2xl">
              Activación de tarjeta
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ingresa el código impreso en el reverso de tu tarjeta RCV.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#2E6DBF]">
              <ShieldCheck size={14} aria-hidden />
              Protección vehicular RCV
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 rounded-2xl bg-[#f5f8fc] px-4 py-4 sm:px-5">
            <TarjetaCodigoHint />
            <p className="text-left text-sm leading-relaxed text-slate-600">
              El código está en el <strong className="text-[#0F1A5A]">reverso</strong>, junto al QR.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col">
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
        </div>
      </div>

      <TarjetaContactFooter className="relative" />
    </div>
  );
}
