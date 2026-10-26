import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateAutopago, validateCard } from './api';
import { TARJETA_YA_ACTIVADA_CODE } from './tarjeta-estado';
import {
  markTarjetaPublicSession,
  normalizeCodigoTarjeta,
  readAutopagoToken,
  resolveTarjetaProductId,
} from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';
import type { TarjetaActivacion } from './types';

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

/** Tiempo mínimo en pantalla de "Verificando tu compra…" (autopago). */
const AUTOPAGO_MIN_VERIFY_MS = 1500;

const WOMAN_CUTOUT = publicAsset('tarjeta/mujer-tarjeta.png');
const LOGO_LA_MUNDIAL = publicAsset('logo-lamundial.png');
const TARJETICA_FRENTE = publicAsset('tarjeta/tarjetica-frente.png');
const TARJETICA_REVERSO = publicAsset('tarjeta/tarjetica-reverso.png');

const FOOTER_GRADIENT = `linear-gradient(90deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 45%, ${BRAND.navySoft} 100%)`;
const PAGE_BG = [
  'radial-gradient(1100px 620px at 14% 6%, rgba(74,141,213,0.38) 0%, transparent 62%)',
  'linear-gradient(135deg, #2C55BA 0%, #1B3E9E 48%, #102D6F 100%)',
].join(', ');

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

/**
 * Fondo — curva blanca vectorial (SVG, no pixela) + mujer recortada del kit.
 * La foto se muestra a su tamaño nativo o menor para que no se vea pixelada.
 */
function TarjetaBackdrop() {
  const [ready, setReady] = useState(false);

  return (
    <div
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
      aria-hidden
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path d="M0 0 H27 C43 26 43 64 32 100 H0 Z" fill="#ffffff" />
      </svg>

      <img
        src={WOMAN_CUTOUT}
        alt=""
        className={`absolute bottom-0 left-[2vw] w-auto transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
        style={{ height: 'min(88vh, 33vw, 560px)' }}
        draggable={false}
        decoding="async"
        fetchPriority="high"
        onLoad={() => setReady(true)}
      />
    </div>
  );
}

/**
 * La Tarjetica real (arte final de marketing): frente con logo y reverso con QR.
 * El recuadro rojo marca "Código de La Tarjetica" en el reverso.
 */
function TarjetaCodigoHint() {
  return (
    <div
      className="relative h-[100px] w-[150px] shrink-0 sm:h-[108px] sm:w-[164px]"
      role="img"
      aria-label="La Tarjetica: frente con logo y reverso con el código y el QR"
    >
      <img
        src={TARJETICA_FRENTE}
        alt=""
        className="absolute left-0 top-0 w-[92px] -rotate-[8deg] rounded-[7px] shadow-[0_10px_24px_-10px_rgba(9,17,51,0.38)] ring-1 ring-slate-200/90 sm:w-[100px]"
        draggable={false}
      />
      <div className="absolute bottom-0 right-0 z-10 w-[110px] rotate-[5deg] sm:w-[120px]">
        <img
          src={TARJETICA_REVERSO}
          alt=""
          className="block w-full rounded-[7px] shadow-[0_12px_28px_-10px_rgba(9,17,51,0.42)] ring-1 ring-slate-200/90"
          draggable={false}
        />
        <span
          className="pointer-events-none absolute rounded-[3px] ring-2 ring-[#E84F51]/80"
          style={{ left: '33.5%', top: '66%', width: '33%', height: '12.5%' }}
          aria-hidden
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
  // Autopago retail: el enlace del correo (?ap=) trae la compra ya pagada; no se pide código.
  const [autopagoToken] = useState(() => readAutopagoToken());
  const [autopagoChecking, setAutopagoChecking] = useState(() => Boolean(readAutopagoToken()));

  /** Fija producto, canal y tarjeta en el wizard (tarjeta física o enlace de autopago). */
  function aplicarTarjeta(tarjeta: TarjetaActivacion) {
    const vehicleKind = resolveTarjetaPlanVehicleKind(tarjeta);
    // El producto lo define la tarjeta: RCV (vehículo) o personas (Vida, AP, Funerario…).
    const productId = resolveTarjetaProductId(tarjeta, vehicleKind);
    if (!productId) {
      throw new Error(
        `El producto de esta tarjeta${tarjeta.nombreProducto ? ` (${tarjeta.nombreProducto})` : ''} `
        + 'todavía no se puede activar en línea. Comunícate con La Mundial.',
      );
    }
    persistProductFromHints({ product: productId });
    // La tarjeta manda sobre un `?product=` previo en la URL (getProductId() lee la URL primero).
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('product') !== productId) {
        u.searchParams.set('product', productId);
        window.history.replaceState(window.history.state, '', u.toString());
      }
    } catch {
      /* ignore */
    }
    const current = useWizardStore.getState().metadataCanal || {};
    const canalMeta = metadataFromTarjetaActivacion(tarjeta, {
      ...current,
      tarjetaVehicleKind: vehicleKind,
      product: productId,
    });
    setMetadataCanal(canalMeta);
    persistTarjetaMetadataCanal(canalMeta);
    if (productId === 'rcv' && vehicleKind) {
      setVehicle({ ctipo: ctipoForTarjetaPlan(vehicleKind) });
    }
    setTarjeta(tarjeta);
  }

  useEffect(() => {
    if (!autopagoToken) return;
    let cancelled = false;
    markTarjetaPublicSession();
    // La verificación tarda milisegundos: se sostiene la pantalla un mínimo para que se lea.
    const startedAt = Date.now();
    const holdMinimum = <T,>(value: T): Promise<T> =>
      new Promise((resolve) => {
        window.setTimeout(() => resolve(value), Math.max(0, AUTOPAGO_MIN_VERIFY_MS - (Date.now() - startedAt)));
      });
    validateAutopago(autopagoToken)
      .then(holdMinimum)
      .then((tarjeta) => {
        if (cancelled) return;
        aplicarTarjeta(tarjeta);
        toast.success(
          'Compra verificada',
          'Tu pago ya está registrado. Carga tus documentos para emitir la póliza.',
          6000,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No se pudo verificar el enlace de emisión.';
        setError(message);
        toast.error('Enlace no válido', message, 8000);
      })
      .finally(() => {
        if (!cancelled) setAutopagoChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopagoToken]);

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
      aplicarTarjeta(tarjeta);
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

  // Autopago: sin hero ni animación (evita el parpadeo tarjeta → OCR); solo verificación o error.
  if (autopagoToken) {
    return (
      <div
        role="dialog"
        aria-label="Emisión de tu póliza"
        className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col bg-[#f3f6fc]"
      >
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-[34rem] rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_24px_60px_-28px_rgba(9,17,51,0.35)] sm:px-12 sm:py-14">
            <img
              src={LOGO_LA_MUNDIAL}
              alt="La Mundial de Seguros"
              className="mx-auto h-20 w-auto object-contain sm:h-24"
              draggable={false}
            />
            {autopagoChecking ? (
              <div role="status" className="mt-10 flex flex-col items-center gap-5">
                <Loader2 size={56} strokeWidth={2.5} className="animate-spin text-[#2E6DBF]" aria-hidden />
                <h1 className="font-sans text-2xl font-extrabold leading-tight tracking-tight text-[#0F1A5A] sm:text-[1.75rem]">
                  Verificando tu compra…
                </h1>
                <p className="max-w-[24rem] text-base leading-relaxed text-slate-500">
                  Tu pago en caja ya está registrado. En un momento podrás cargar tus documentos y emitir tu póliza.
                </p>
              </div>
            ) : (
              <div className="mt-10">
                <h1 className="font-sans text-2xl font-extrabold leading-tight tracking-tight text-[#0F1A5A]">
                  No pudimos verificar tu compra
                </h1>
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-base font-medium text-rose-700"
                >
                  {error || 'El enlace de emisión no es válido.'}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-6 inline-flex min-h-[54px] w-full items-center justify-center rounded-xl text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_14px_30px_-12px_rgba(27,62,158,0.75)] hover:brightness-110"
                  style={{ background: `linear-gradient(180deg, ${BRAND.blueMid} 0%, #1B3E9E 100%)` }}
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>
        </div>
        <TarjetaContactFooter />
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Activación de tarjeta"
      className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto"
      style={{ background: PAGE_BG }}
    >
      <TarjetaBackdrop />

      <div
        className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:justify-end lg:px-[7vw] lg:py-10"
        style={{ animation: 'splashTextIn 0.55s ease-out both' }}
      >
        {/* Login opaco — nunca transparente sobre la foto */}
        <div className="w-full max-w-[27rem] rounded-[28px] bg-white p-6 shadow-[0_36px_80px_-28px_rgba(5,9,36,0.7)] sm:p-9">
          <div className="text-center">
            <img
              src={LOGO_LA_MUNDIAL}
              alt="La Mundial de Seguros"
              className="mx-auto h-12 w-auto object-contain sm:h-14"
              draggable={false}
            />
            <h1 className="mt-6 font-sans text-[1.4rem] font-extrabold leading-tight tracking-tight text-[#0F1A5A] sm:text-[1.6rem]">
              Activación de tarjeta
            </h1>
            <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-slate-500">
              Ingresa el código impreso en el reverso de tu tarjeta.
            </p>
          </div>

          <div className="mt-7 flex items-center gap-4 rounded-2xl border border-slate-100 bg-[#f6f9fd] px-4 py-4 sm:px-5">
            <TarjetaCodigoHint />
            <p className="text-left text-sm leading-relaxed text-slate-600">
              El código está en el <strong className="text-[#0F1A5A]">reverso</strong>, junto al QR.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col">
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
              className="min-h-[54px] w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-base font-semibold tracking-wide text-slate-800 shadow-sm outline-none transition-[box-shadow,border-color] placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#2E6DBF] focus:ring-4 focus:ring-[#2E6DBF]/15 disabled:opacity-60"
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
              className="mt-4 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_14px_30px_-12px_rgba(27,62,158,0.75)] transition-[filter,transform] hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              style={{
                background: `linear-gradient(180deg, ${BRAND.blueMid} 0%, #1B3E9E 100%)`,
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
