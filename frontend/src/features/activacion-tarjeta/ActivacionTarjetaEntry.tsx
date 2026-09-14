import { useState, type FormEvent } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { persistProductFromHints } from '../../lib/product';
import { toast } from '../../store/toastStore';
import { validateCard } from './api';
import { TARJETA_YA_ACTIVADA_CODE } from './tarjeta-estado';
import { markTarjetaPublicSession, normalizeCodigoTarjeta } from './flow';
import { metadataFromTarjetaActivacion, persistTarjetaMetadataCanal } from './metadata';
import { ctipoForTarjetaPlan, resolveTarjetaPlanVehicleKind } from './plan-vehicle';
import { TarjetaLmShell } from './TarjetaLmShell';
import { TarjetaPrimaryButton } from './TarjetaPrimaryButton';

/**
 * Pantalla de entrada del flujo RCV por tarjeta de activación.
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
    <TarjetaLmShell
      title="Activación De Tarjeta"
      subtitle="Ingresa el código impreso en tu tarjeta para comenzar el proceso RCV."
    >
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="codigo-tarjeta"
          className="mb-2 block text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500"
        >
          Código De Tarjeta
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
          className="min-h-[50px] w-full rounded-lg border-2 border-[#3B6FBF] bg-white px-4 text-center text-base text-slate-800 outline-none transition-shadow placeholder:text-slate-400 focus:ring-4 focus:ring-[#3B6FBF]/20 disabled:opacity-60 sm:text-sm"
        />

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700"
          >
            {error}
          </p>
        ) : null}

        <TarjetaPrimaryButton type="submit" loading={loading} className="mt-5">
          {loading ? 'Validando…' : 'Validar'}
        </TarjetaPrimaryButton>
      </form>
    </TarjetaLmShell>
  );
}
