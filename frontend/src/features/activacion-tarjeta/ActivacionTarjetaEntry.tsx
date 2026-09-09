import { useState, type FormEvent } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { publicAsset } from '../../lib/app-base';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { normalizeCodigoTarjeta } from './flow';

/**
 * Pantalla de entrada del flujo RCV por tarjeta (farmacia).
 * Visual: fondo navy + tarjeta blanca + VALIDAR.
 */
export function ActivacionTarjetaEntry() {
  const setTarjeta = useWizardStore((s) => s.setTarjeta);
  const setMetadataCanal = useWizardStore((s) => s.setMetadataCanal);
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
    try {
      const tarjeta = await validateCard(value);
      persistProductFromHints({ product: 'rcv' });
      const current = useWizardStore.getState().metadataCanal || {};
      setMetadataCanal({
        ...current,
        flujo: 'tarjeta',
        skipPayment: tarjeta.bfactura === 1,
        bfactura: tarjeta.bfactura,
        xcodigo_unico: tarjeta.xcodigoUnico,
        ctarjeta: tarjeta.ctarjeta,
        cplan: tarjeta.cplan,
        cramo: tarjeta.cramo,
        ccanalalt: tarjeta.ccanalalt,
        cproductor: tarjeta.cproductor,
        cproducto: tarjeta.cproducto,
      });
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
    <div className="fixed inset-0 z-[70] grid place-items-center px-4" style={{ background: '#0F1A5A' }}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] rounded-sm bg-white px-8 py-10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] sm:px-12"
      >
        <h1 className="mb-8 text-center font-sans text-[1.65rem] font-extrabold tracking-tight text-[#0F1A5A]">
          Activación De Tarjeta
        </h1>

        <div className="mb-8 flex flex-col items-center">
          <img
            src={publicAsset('logo-isotipo-transparente.png')}
            alt=""
            className="h-14 w-auto"
            draggable={false}
          />
          <p className="mt-2 font-wordmark text-center text-[1.15rem] leading-none text-[#0F1A5A]">
            LA MUNDIAL
          </p>
          <p className="font-wordmark text-center text-[0.78rem] italic text-[#0F1A5A]">
            de Seguros
          </p>
        </div>

        <label className="sr-only" htmlFor="codigo-tarjeta">
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
          placeholder="Código De Tarjeta"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            if (error) setError('');
          }}
          disabled={loading}
          className="mb-5 h-11 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#3B6FBF] focus:ring-2 focus:ring-[#3B6FBF]/25 disabled:opacity-60"
        />

        {error && (
          <p className="mb-4 text-center text-xs font-medium text-rose-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-sm bg-[#3B6FBF] text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_18px_-8px_rgba(59,111,191,0.8)] transition-colors hover:bg-[#2E5AA3] disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? 'Validando…' : 'Validar'}
        </button>
      </form>
    </div>
  );
}
