import { useWizardStore } from '../store/wizardStore';
import { getRenovarParam } from '../lib/renovacion-entrada';

/** Pantalla de OCR en renovación: no hay documentos; solo espera el salto a Formulario. */
export function RenovacionEntrada() {
  const cnpoliza = getRenovarParam();
  const r = useWizardStore((s) => (s as unknown as {
    renovacion?: { estado?: string; mensaje?: string } | null;
  }).renovacion);
  const error = r?.estado === 'error';
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'linear-gradient(135deg, #0C133A 0%, #1a2460 100%)',
      fontFamily: 'Inter, system-ui, sans-serif', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '2.5rem 2rem', maxWidth: 420, width: '100%',
        textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
      }}>
        {!error && (
          <div style={{
            width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#ED7423',
            borderRadius: '50%', margin: '0 auto 1.25rem', animation: 'renovSpin 0.8s linear infinite',
          }} />
        )}
        <p style={{ fontWeight: 700, color: '#0C133A', margin: 0 }}>Renovación de la póliza {cnpoliza}</p>
        <p style={{ fontSize: 14, color: '#475569', marginTop: 10, lineHeight: 1.5 }}>
          {error ? r?.mensaje : 'Preparando el formulario con los datos de tu póliza…'}
        </p>
      </div>
      <style>{'@keyframes renovSpin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
