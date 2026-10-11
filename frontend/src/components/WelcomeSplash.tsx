import { useEffect, useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { publicAsset } from '../lib/app-base';

const VISIBLE_MS = 2600;
const FADE_MS = 700;

// Paleta oficial — Manual de Identidad La Mundial de Seguros
const BRAND = {
  navyDeep: '#050924',
  navy: '#091133',
  navySoft: '#0F1A5A',
  blueMid: '#2E6DBF',
  blueLight: '#4A8DD5',
  red: '#E84F51',
  redLight: '#FF6675',
};

/** No mostrar splash cuando el módulo se carga desde un flujo encadenado (bridge). */
function isChainedFlow(): boolean {
  try {
    const p = new URLSearchParams(window.location.search);
    return Boolean(p.get('sid'));
  } catch {
    return false;
  }
}

export function WelcomeSplash() {
  const [show, setShow] = useState(() => !isChainedFlow());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const fadeTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setShow(false), VISIBLE_MS + FADE_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        setLeaving(true);
        window.setTimeout(() => setShow(false), FADE_MS);
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  if (!show) return null;

  const skip = () => {
    setLeaving(true);
    window.setTimeout(() => setShow(false), FADE_MS);
  };

  return (
    <div
      role="dialog"
      aria-label="Bienvenida La Mundial de Seguros"
      className="fixed inset-0 z-[10000] grid place-items-center overflow-hidden"
      style={{
        animation: leaving ? `splashFadeOut ${FADE_MS}ms ease-out forwards` : undefined,
      }}
    >
      {/* Base oceánica (amanecer sobre el mar — narrativa de marca) */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 42%, ${BRAND.navySoft} 100%)`,
        }}
      />

      {/* Glows de profundidad */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 55% 45% at 20% 22%, ${BRAND.blueLight}44, transparent 60%),
            radial-gradient(ellipse 60% 50% at 82% 30%, ${BRAND.blueMid}33, transparent 62%),
            radial-gradient(ellipse 80% 55% at 50% 118%, ${BRAND.red}3A, transparent 60%)
          `,
        }}
      />

      {/* Sol naciente (rojo imperial) que sube desde el horizonte */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          width: '46vw',
          height: '46vw',
          bottom: '-24vw',
          background: `radial-gradient(circle, ${BRAND.redLight}55, ${BRAND.red}22 45%, transparent 70%)`,
          animation: 'floatSlow 7s ease-in-out infinite',
        }}
      />

      {/* Partículas en órbita */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {[
          { r: 120, d: 14, size: 6, c: BRAND.blueLight, delay: 0 },
          { r: 180, d: 20, size: 4, c: BRAND.redLight, delay: -4 },
          { r: 240, d: 26, size: 5, c: '#FFFFFF', delay: -9 },
          { r: 150, d: 18, size: 3, c: BRAND.blueLight, delay: -12 },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: p.size,
              height: p.size,
              background: p.c,
              opacity: 0.7,
              boxShadow: `0 0 12px ${p.c}`,
              // @ts-expect-error custom prop consumida por la animación orbit
              '--r': `${p.r}px`,
              animation: `orbit ${p.d}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Grano sutil */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* Contenido central */}
      <div className="relative flex flex-col items-center text-center px-6">
        {/* Medallón con anillo cónico giratorio + arco de progreso */}
        <div className="relative w-[200px] h-[200px] sm:w-[236px] sm:h-[236px] grid place-items-center">
          {/* Halo pulsante */}
          <span
            className="absolute inset-0 rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle at 32% 30%, ${BRAND.blueLight}66, transparent 60%), radial-gradient(circle at 72% 74%, ${BRAND.red}4D, transparent 62%)`,
              animation: 'splashHaloPulse 2.8s ease-in-out infinite',
            }}
          />

          {/* Anillo cónico giratorio */}
          <span
            aria-hidden
            className="absolute inset-2 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, ${BRAND.blueLight}, ${BRAND.blueMid}, ${BRAND.red}, ${BRAND.blueLight})`,
              opacity: 0.9,
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              animation: 'splashRingSpin 3.4s linear infinite',
            }}
          />

          {/* Arco de progreso que se dibuja durante la carga */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="url(#splashArc)"
              strokeWidth="2.5"
              strokeLinecap="round"
              pathLength={289}
              strokeDasharray={289}
              style={{
                // @ts-expect-error custom prop consumida por la animación
                '--circ': '289',
                animation: `splashRingDraw ${VISIBLE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
              }}
            />
            <defs>
              <linearGradient id="splashArc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={BRAND.blueLight} />
                <stop offset="55%" stopColor={BRAND.blueMid} />
                <stop offset="100%" stopColor={BRAND.red} />
              </linearGradient>
            </defs>
          </svg>

          {/* Disco central de vidrio */}
          <span
            className="absolute inset-7 rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.98), rgba(255,255,255,0.86))',
              boxShadow: `0 24px 60px -14px ${BRAND.navyDeep}, inset 0 0 0 1px rgba(255,255,255,0.9)`,
              animation: 'splashLogoIn 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            }}
          />

          {/* Isotipo */}
          <img
            src={publicAsset('logo-isotipo-transparente.png')}
            alt="La Mundial de Seguros"
            draggable={false}
            className="relative w-[104px] sm:w-[128px] h-auto select-none"
            style={{
              animation: 'splashLogoIn 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both',
              filter: `drop-shadow(0 12px 26px ${BRAND.navyDeep}88)`,
            }}
          />

          {/* Barrido de brillo */}
          <span aria-hidden className="absolute inset-7 rounded-full overflow-hidden pointer-events-none">
            <span
              className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
              style={{ animation: 'splashShine 1.8s ease-out 0.7s both' }}
            />
          </span>
        </div>

        {/* Wordmark + tagline */}
        <div className="mt-8 sm:mt-10">
          <p
            className="text-[0.68rem] sm:text-[0.72rem] font-black tracking-[0.34em] uppercase mb-2"
            style={{ animation: 'splashTextIn 0.6s ease-out 0.6s both', color: BRAND.redLight }}
          >
            Bienvenido
          </p>

          <h1
            className="font-wordmark text-3xl sm:text-[2.6rem] leading-tight text-white"
            style={{ animation: 'splashTextIn 0.6s ease-out 0.78s both' }}
          >
            La Mundial{' '}
            <span style={{ color: BRAND.redLight, fontStyle: 'italic' }}>de Seguros</span>
          </h1>

          <p
            className="text-xs sm:text-sm mt-3 max-w-xs sm:max-w-sm leading-relaxed mx-auto text-slate-300"
            style={{ animation: 'splashTextIn 0.6s ease-out 0.95s both' }}
          >
            Suscripción digital de pólizas en minutos. Seguro, rápido y sin papeleo.
          </p>

          {/* Línea de acento navy → azul → rojo */}
          <div
            className="mx-auto mt-5 h-[3px] w-24 rounded-full origin-left"
            style={{
              background: `linear-gradient(90deg, ${BRAND.blueLight} 0%, ${BRAND.blueMid} 55%, ${BRAND.red} 100%)`,
              animation: 'splashLineGrow 0.7s cubic-bezier(0.22, 1, 0.36, 1) 1.05s both',
            }}
          />
        </div>

        {/* Barra de progreso determinada (sincronizada con VISIBLE_MS) */}
        <div
          className="mt-7 w-56 sm:w-64"
          style={{ animation: 'splashTextIn 0.6s ease-out 1.15s both' }}
        >
          <div className="h-1.5 rounded-full overflow-hidden bg-white/12 ring-1 ring-white/10">
            <div
              className="h-full rounded-full origin-left"
              style={{
                background: `linear-gradient(90deg, ${BRAND.blueLight}, ${BRAND.blueMid} 55%, ${BRAND.redLight})`,
                animation: `splashBarFill ${VISIBLE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
              }}
            />
          </div>
          <p className="mt-2 text-[0.62rem] font-semibold tracking-[0.2em] uppercase text-slate-400">
            Preparando tu experiencia
          </p>
        </div>

        {/* Chips de confianza */}
        <div
          className="mt-7 flex items-center justify-center gap-2.5 flex-wrap"
          style={{ animation: 'splashTextIn 0.6s ease-out 1.3s both' }}
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 text-[0.66rem] font-bold text-white backdrop-blur-md">
            <Sparkles size={12} style={{ color: BRAND.redLight }} />
            Un mundo de innovación a tu alcance
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 text-[0.66rem] font-bold text-white backdrop-blur-md">
            <ShieldCheck size={12} className="text-emerald-300" />
            Cifrado TLS 1.3
          </span>
        </div>
      </div>

      {/* Botón omitir */}
      <button
        type="button"
        onClick={skip}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 px-3 py-1.5 rounded-full bg-white/12 hover:bg-white/20 backdrop-blur-md text-[0.66rem] font-bold ring-1 ring-white/20 text-white transition-colors uppercase tracking-wider"
        aria-label="Omitir bienvenida"
      >
        Omitir
      </button>
    </div>
  );
}
