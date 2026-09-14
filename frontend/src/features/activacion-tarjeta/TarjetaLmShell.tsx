import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { publicAsset } from '../../lib/app-base';

type TarjetaLmShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Ilustración opcional bajo el logo (mock La Mundial). */
  illustrationSrc?: string;
};

/**
 * Layout marca La Mundial — fondo navy + tarjeta blanca (mock activación tarjeta).
 */
export function TarjetaLmShell({
  title,
  subtitle,
  children,
  illustrationSrc,
}: TarjetaLmShellProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-[70] overflow-y-auto bg-[#0F1A5A]"
    >
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 py-8 pb-20">
        <div
          className="my-auto flex w-full flex-col overflow-hidden rounded-lg bg-white shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]"
          style={{ animation: 'splashTextIn 0.45s ease-out both' }}
        >
          <div className="px-6 pt-8 text-center sm:px-10 sm:pt-10">
            <h1 className="font-display text-[1.35rem] font-bold leading-tight text-[#0F1A5A] sm:text-[1.55rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
            ) : null}

            <div className="mx-auto mt-6 w-full max-w-[280px] rounded-2xl border-2 border-[#b8bec8] bg-white px-5 py-6 shadow-sm">
              <img
                src={publicAsset('logo-isotipo-transparente.png')}
                alt="La Mundial de Seguros"
                className="mx-auto h-[4.5rem] w-auto"
                draggable={false}
              />
              <p className="mt-3 text-center font-wordmark text-[0.95rem] text-[#0F1A5A]">
                LA MUNDIAL{' '}
                <span className="italic text-[#E84F51]">de Seguros</span>
              </p>
            </div>

            {illustrationSrc ? (
              <img
                src={illustrationSrc}
                alt=""
                aria-hidden
                className="mx-auto mt-4 hidden max-h-28 w-auto opacity-90 sm:block"
                draggable={false}
              />
            ) : null}
          </div>

          <div className="px-6 pb-8 pt-5 sm:px-10">{children}</div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#0F1A5A] px-4 py-3 text-center text-white">
        <p className="inline-flex items-center justify-center gap-2 text-sm font-bold tracking-wide">
          <Phone size={16} aria-hidden />
          CONTACTO DIRECTO: 0500 552 62 56
        </p>
      </div>
    </div>
  );
}
