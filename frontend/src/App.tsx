import { useWizardStore } from './store/wizardStore';
import { TopStepper } from './components/TopStepper';
import { TopProgressBar } from './components/TopProgressBar';
import { AuroraBackground } from './components/AuroraBackground';
import { Toaster } from './components/Toaster';
import { WelcomeSplash } from './components/WelcomeSplash';
import { Button } from './components/ui/Button';
import { OcrStep } from './features/ocr/OcrStep';
import { getProductConfig, persistProductFromHints } from './lib/product';
import { toast } from './store/toastStore';
import { publicAsset } from './lib/app-base';
import { ChevronRight, Sparkles, ShieldCheck, CheckCircle2, ScanLine, Lock } from 'lucide-react';
import { useEffect } from 'react';
import { applyMetadataFromNexusToken } from './lib/nexus-token-client';
import { mergeMarketplaceActorMetadata } from './lib/sso-metadata';
import { useUiFlags } from './lib/ui-flags';

import { useProductConfig } from './hooks/useProductConfig';
import { CatalogPickerStep } from './features/catalog/CatalogPickerStep';
import { ExelixiOcrFlow } from './components/exelixi/ExelixiOcrFlow';
import {
  branchHasVehicle,
  resolveBuilderDocuments,
  useBuilderCatalog,
} from './lib/builder-catalog';
import { adjustDocsForBinacionalCarnet } from './lib/ocr-binacional';
import { buildOcrHandoff, continueToFormularioModule } from './lib/exelixi-handoff';
import { resolveOcrPersonRoles } from './lib/ocr-person-roles';
import {
  getOptionalDocs,
  getRequiredDocs,
  preClasificarDiligencia,
  resolveRcvOcrEntryDocs,
  toDiligenciaDocTypes,
} from './lib/diligencia';
import type { DocType } from './types';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

const DOC_LABELS: Record<string, string> = {
  cedula: 'cédula del tomador',
  cedula_titular: 'cédula del titular',
  cedula_beneficiario: 'cédula del beneficiario',
  licencia: 'licencia',
  certificado: 'certificado',
  pasaporte: 'pasaporte',
  rif: 'RIF',
  factura: 'factura fiscal',
};

import { OcrConfigPanel } from './config/OcrConfigPanel';
import { ActivacionTarjetaEntry } from './features/activacion-tarjeta/ActivacionTarjetaEntry';
import { appendFacturaIfNeeded } from './features/activacion-tarjeta/docs';
import { isTarjetaRcvEntry } from './features/activacion-tarjeta/flow';

function MobileOcrContinueBar({
  onContinue,
  canContinue,
  pendingHint,
  hidden,
}: {
  onContinue: () => void;
  canContinue: boolean;
  pendingHint?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-[60] border-t border-slate-200 bg-white/98 backdrop-blur-md px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_28px_rgba(15,23,42,0.12)]">
      {!canContinue && pendingHint && (
        <p className="mb-2 text-center text-[0.68rem] font-medium leading-snug text-slate-500">
          {pendingHint}
        </p>
      )}
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full min-h-[52px] touch-manipulation btn-shine"
        onClick={onContinue}
        disabled={!canContinue}
      >
        Continuar
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}

export default function App() {
  if (window.location.pathname === '/config') {
    return <OcrConfigPanel />;
  }

  const { step, documents, diligencia, tomador, nextStep, goTo, setMetadataCanal, builderProduct, carnetBinacionalMode, tarjeta } = useWizardStore();
  const product = getProductConfig();
  const { config } = useProductConfig(EMPRESA_ID, product.id, 'ocr');
  const builderCatalogMode = useBuilderCatalog();
  const { hideHeader, hideStepper, hideTrustBanner, hideFooterBar } = useUiFlags(config);
  const showCatalogPicker = builderCatalogMode && !builderProduct;

  // Interceptar SSO Delegation (nexus_token + legacy session_token)
  useEffect(() => {
    applyMetadataFromNexusToken('nexus_access_token_ocr', (metadata) => {
      const current = useWizardStore.getState().metadataCanal || {};
      setMetadataCanal(mergeMarketplaceActorMetadata({ ...current, ...metadata }));
      if (metadata.product === 'funerario' || metadata.product === 'rcv') {
        persistProductFromHints({ product: String(metadata.product) });
      }
    });

    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('session_token');
    
    if (token) {
      try {
        // Extraer payload del JWT (formato base64url)
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const payloadStr = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadStr);
          
          if (payload.metadata) {
            const current = useWizardStore.getState().metadataCanal || {};
            setMetadataCanal(
              mergeMarketplaceActorMetadata({ ...current, ...payload.metadata }),
            );
          }
        }
      } catch (err) {
        console.error('Error decodificando session_token:', err);
      }
    }
  }, [setMetadataCanal]);

  const isSuccess = step === 2;

  function advanceToFormulario() {
    const state = useWizardStore.getState();
    const roles = resolveOcrPersonRoles(
      state.documents.cedula?.ocr,
      state.documents.certificado?.ocr,
      state.documents.licencia?.ocr,
    );
    if (roles.hasDriver && roles.conductor) {
      state.setHasDriver(true);
      state.setConductor(roles.conductor);
    }
    state.setSameInsured(roles.sameInsured);
    state.setTitularFromCarnet(roles.titularFromCarnet);
    if (roles.asegurado) {
      state.setAsegurado(roles.asegurado);
    }
    continueToFormularioModule(
      buildOcrHandoff(
        builderProduct?.id ?? product.id,
        state.documents,
        builderProduct ?? undefined,
        state.diligencia,
        {
          hasDriver: roles.hasDriver,
          conductor: roles.conductor,
          sameInsured: roles.sameInsured,
          asegurado: roles.asegurado,
          tarjeta: state.tarjeta,
        },
      ),
    );
  }

  function resolveEffectiveOcrDocs(): { requiredDocs: DocType[]; optionalDocs: DocType[] } {
    const hasVehicle = builderProduct
      ? branchHasVehicle(builderProduct.branch)
      : product.hasVehicle;

    let requiredDocs: DocType[];
    let optionalDocs: DocType[];

    if (product.id === 'rcv' && hasVehicle && !builderProduct) {
      ({ required: requiredDocs, optional: optionalDocs } = resolveRcvOcrEntryDocs(product.docs));
    } else {
      const itipoDiligencia = diligencia?.itipoDiligencia ?? preClasificarDiligencia(tomador.tipoDoc);
      requiredDocs = getRequiredDocs(
        config as Record<string, unknown> | null,
        itipoDiligencia,
        toDiligenciaDocTypes(product.docs.required),
      );
      optionalDocs = getOptionalDocs(
        config as Record<string, unknown> | null,
        itipoDiligencia,
        toDiligenciaDocTypes(product.docs.optional),
      );
    }

    if (builderCatalogMode && builderProduct) {
      const slots = resolveBuilderDocuments(builderProduct);
      requiredDocs = slots.filter((d) => d.required).map((d) => d.ocrType);
      optionalDocs = slots.filter((d) => !d.required).map((d) => d.ocrType);
    } else if (builderProduct) {
      const slots = resolveBuilderDocuments(builderProduct);
      requiredDocs = slots.filter((d) => d.required).map((d) => d.ocrType);
      optionalDocs = slots.filter((d) => !d.required).map((d) => d.ocrType);
    } else if (product.id !== 'rcv' && config?.documentos && !config?.documentosPorDiligencia) {
      if (Array.isArray(config.documentos)) {
        const docsArr = config.documentos as { key: string; activo: boolean; obligatorio: boolean }[];
        requiredDocs = docsArr.filter((d) => d.activo && d.obligatorio).map((d) => d.key as DocType);
        optionalDocs = docsArr.filter((d) => d.activo && !d.obligatorio).map((d) => d.key as DocType);
      } else {
        const docs = config.documentos as Record<string, { activo: boolean; obligatorio: boolean }>;
        requiredDocs = Object.keys(docs).filter((k) => docs[k].activo && docs[k].obligatorio) as DocType[];
        optionalDocs = Object.keys(docs).filter((k) => docs[k].activo && !docs[k].obligatorio) as DocType[];
      }
    }

    if (product.id === 'funerario' && !builderProduct) {
      requiredDocs = ['cedula', 'cedula_titular', 'cedula_beneficiario'];
      optionalDocs = [];
    }

    const binacional = adjustDocsForBinacionalCarnet(
      requiredDocs,
      optionalDocs,
      documents,
      hasVehicle,
      carnetBinacionalMode,
    );
    return appendFacturaIfNeeded(binacional.requiredDocs, binacional.optionalDocs, tarjeta);
  }

  const { requiredDocs: effectiveRequiredDocs } = resolveEffectiveOcrDocs();
  const canContinueOcr = effectiveRequiredDocs.every((d) => documents[d]?.status === 'done');
  const pendingDocsHint = effectiveRequiredDocs
    .filter((d) => documents[d]?.status !== 'done')
    .map((d) => DOC_LABELS[d] ?? d)
    .join(', ');
  const ocrPendingHint = pendingDocsHint ? `Falta procesar: ${pendingDocsHint}` : undefined;

  function handleContinuar() {
    const { requiredDocs } = resolveEffectiveOcrDocs();

    const allDone = requiredDocs.every((d) => documents[d]?.status === 'done');
    if (!allDone) {
      const lista = requiredDocs.map((d) => DOC_LABELS[d] ?? d).join(', ');
      toast.warning('Documentos pendientes', `Procesa ${lista} para continuar.`);
      return;
    }

    if (builderCatalogMode && builderProduct) {
      toast.success('Documentos listos', 'Continuando con el formulario de emisión…', 1200);
      advanceToFormulario();
      return;
    }

    // Flujo actual: pantalla de éxito → desde ahí se redirige al Formulario.
    nextStep();
  }

  // Pantalla de éxito (paso 2): redirigir al Formulario (mismo handoff que Formulario → Emisión).
  useEffect(() => {
    if (!isSuccess) return;
    if (builderCatalogMode) return; // Exélixi ya avanza en handleContinuar
    const t = window.setTimeout(() => advanceToFormulario(), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  if (isTarjetaRcvEntry() && !tarjeta) {
    return (
      <>
        <Toaster />
        <ActivacionTarjetaEntry />
      </>
    );
  }

  if (builderCatalogMode) {
    if (showCatalogPicker) {
      return (
        <>
          <Toaster />
          <ExelixiOcrFlow phase="catalog">
            <CatalogPickerStep onSelected={() => goTo(1)} />
          </ExelixiOcrFlow>
        </>
      );
    }

    return (
      <>
        <Toaster />
        <ExelixiOcrFlow
          phase="documents"
          footer={
            !isSuccess ? (
              <div className="hidden items-center justify-between gap-4 md:flex">
                <p className="text-xs text-slate-500">
                  Producto: <strong>{builderProduct?.commercialName}</strong>
                </p>
                <Button
                  variant="primary"
                  onClick={handleContinuar}
                  disabled={!canContinueOcr}
                  className="min-w-[180px] btn-shine"
                >
                  Continuar
                  <ChevronRight size={15} />
                </Button>
              </div>
            ) : undefined
          }
        >
          {!isSuccess && (
            <header className="mb-6">
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#00AEEF]">
                <ScanLine size={11} />
                Paso 01 · Documentos
              </p>
              <h1 className="font-display text-3xl font-black tracking-tight text-[#091133] sm:text-4xl">
                Sube tus documentos
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-500">
                Ramo <strong>{builderProduct?.commercialName}</strong>
                {' · '}
                {(builderProduct?.productPlans?.length ?? 0)} plan(es). OCR según recaudos del catálogo.
              </p>
            </header>
          )}
          {!isSuccess && <OcrStep />}
          {isSuccess && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <CheckCircle2 size={48} className="text-emerald-500" />
              <h2 className="text-2xl font-black text-[#091133]">Documentos procesados</h2>
              <p className="text-sm text-slate-500">Redirigiendo al formulario…</p>
              <Button variant="primary" onClick={advanceToFormulario} className="min-w-[200px] btn-shine">
                Continuar
                <ChevronRight size={15} />
              </Button>
              <Button variant="secondary" onClick={() => goTo(1)}>
                Volver a escanear
              </Button>
            </div>
          )}
        </ExelixiOcrFlow>
        {!isSuccess && (
          <MobileOcrContinueBar
            hidden={hideFooterBar}
            canContinue={canContinueOcr}
            pendingHint={ocrPendingHint}
            onContinue={handleContinuar}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen relative">
      <WelcomeSplash />
      <Toaster />
      <AuroraBackground />
      <div className="lg:hidden">
        <TopProgressBar />
      </div>

      {/* Barra de marca (desktop) */}
      {!hideHeader && (
        <header className="hidden lg:block sticky top-0 z-40">
          <div className="glass-light border-b border-white/50">
            <div className="max-w-5xl mx-auto px-10 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white grid place-items-center ring-1 ring-slate-200/70 shadow-[0_6px_18px_-8px_rgba(15,26,90,0.35)]">
                  <img
                    src={publicAsset('logo-isotipo-transparente.png')}
                    alt="La Mundial de Seguros"
                    className="w-6 h-auto"
                    draggable={false}
                  />
                </div>
                <div className="leading-tight">
                  <p className="font-wordmark text-lg text-[#091133]">
                    La Mundial <span className="text-fuchsia-500 italic">de Seguros</span>
                  </p>
                  <p className="text-[0.6rem] font-bold tracking-[0.2em] uppercase text-slate-400">
                    Suscripción digital
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      <div>
        <main className="flex-1 min-h-screen pt-[72px] lg:pt-8 px-4 sm:px-6 lg:px-10 pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-12">
          <div className="max-w-5xl mx-auto">
            {!hideStepper && <TopStepper />}

            {!isSuccess && (
              <header className="mb-8 animate-fade-in">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-black tracking-[0.22em] gradient-text-indigo uppercase mb-2 inline-flex items-center gap-1.5">
                      <Sparkles size={11} className="text-indigo-500" />
                      {builderProduct ? 'Paso 01 · Documentos' : 'Paso 01 · Documentos'}
                    </p>
                    <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                      Sube tus documentos
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                      Los analizaremos con OCR y precargaremos tus datos automáticamente.
                    </p>

                    {/* Chips de confianza */}
                    {!hideTrustBanner && (
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <span className="chip">
                          <ScanLine size={12} className="text-indigo-500" />
                          Lectura OCR con IA
                        </span>
                        <span className="chip">
                          <Lock size={12} className="text-emerald-500" />
                          Datos cifrados
                        </span>
                        <span className="chip">
                          <Sparkles size={12} className="text-fuchsia-500" />
                          Precarga automática
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              </header>
            )}

            <section key={step} className="surface-card overflow-hidden step-enter">
              <div className="p-6 sm:p-8 lg:p-10">
                {!isSuccess && <OcrStep />}
                {isSuccess && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center shadow-[0_16px_40px_-10px_rgba(16,185,129,0.5)] animate-spring-in">
                        <CheckCircle2 size={42} className="text-white" strokeWidth={2.4} />
                      </div>
                      <Sparkles size={16} className="absolute -top-1 -right-1 text-amber-400 animate-pulse-soft" />
                    </div>
                    <h2 className="font-display text-2xl font-black text-slate-900 mt-1">
                      ¡Documentos procesados!
                    </h2>
                    <p className="text-slate-500 text-sm text-center max-w-sm">
                      El OCR completó la lectura. Los datos han sido precargados exitosamente.
                    </p>
                    <p className="text-slate-400 text-xs">Redirigiendo al formulario…</p>
                    <Button variant="primary" onClick={advanceToFormulario} className="mt-2 min-w-[200px] btn-shine">
                      Continuar
                      <ChevronRight size={15} />
                    </Button>
                    <Button variant="secondary" onClick={() => goTo(1)} className="mt-1">
                      Volver a escanear
                    </Button>
                  </div>
                )}
              </div>

              {!isSuccess && !hideFooterBar && (
                <div className="hidden md:flex items-center justify-between gap-4 px-8 lg:px-10 py-5 border-t border-slate-100/80 bg-gradient-to-b from-slate-50/50 to-white/40 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    <span className="font-medium">Cifrado de extremo a extremo · TLS 1.3</span>
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleContinuar}
                    disabled={!canContinueOcr}
                    className="min-w-[180px] btn-shine"
                  >
                    Continuar
                    <ChevronRight size={15} />
                  </Button>
                </div>
              )}
            </section>

          </div>
        </main>
      </div>

      {!isSuccess && (
        <MobileOcrContinueBar
          hidden={hideFooterBar}
          canContinue={canContinueOcr}
          pendingHint={ocrPendingHint}
          onContinue={handleContinuar}
        />
      )}
    </div>
  );
}
