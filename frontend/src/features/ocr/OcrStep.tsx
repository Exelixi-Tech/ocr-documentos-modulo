import { useEffect, useRef, useState } from 'react';
import {
  Upload, CheckCircle2, AlertCircle, RotateCcw, Eye,
  IdCard, Car, FileText, Building2, Sparkles, ScanLine,
  MousePointerClick, Camera, Images,
} from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { uploadDocument, DocTypeMismatchError, PlanVehicleMismatchError } from '../../lib/api';
import { validateBill } from '../activacion-tarjeta/api';
import { appendFacturaIfNeeded } from '../activacion-tarjeta/docs';
import { normalizeNfactura } from '../activacion-tarjeta/flow';
import {
  resolveTarjetaPlanVehicleKind,
  validateCertificadoForTarjetaPlan,
} from '../activacion-tarjeta/plan-vehicle';
import { getProductConfig } from '../../lib/product';
import { matchCatalog } from '../../lib/matchCatalog';
import { useCatalogs } from '../../hooks/useCatalogs';
import {
  branchHasVehicle,
  resolveBuilderDocuments,
} from '../../lib/builder-catalog';
import {
  adjustDocsForBinacionalCarnet,
  isBinacionalCarnet,
  isExtranjeroCarnet,
  resolveTipoPlacaFromCert,
} from '../../lib/ocr-binacional';
import { extractTomadorFromCertificado } from '../../lib/carnet-propietario';
import { resolveOcrPersonRoles } from '../../lib/ocr-person-roles';
import { isCedulaOcrSlot } from '../../lib/ocr-engine-doc';
import { applyFuneralOcrCedulas } from '../../lib/funeral-ocr-apply';
import {
  formatDocumentoLabel,
  inferTipoDocFromRaw,
  normalizeIdentificacionDigits,
} from '../../lib/identificacion';
import { toast } from '../../store/toastStore';
import { Badge } from '../../components/ui/Badge';
import { CircularProgress } from '../../components/ui/CircularProgress';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import type { DocType, DocumentFile } from '../../types';

interface DocConfig {
  type: DocType;
  label: string;
  description: string;
  Icon: React.ElementType;
  optional?: boolean;
  accent: string;
}

function MobileUploadActions({
  onCamera,
  onGallery,
  variant = 'idle',
}: {
  onCamera: () => void;
  onGallery: () => void;
  variant?: 'idle' | 'error';
}) {
  const btnBase =
    'min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold touch-manipulation select-none active:scale-[0.98] transition-transform';

  return (
    <div
      className="sm:hidden px-4 pb-4 pt-2 border-t border-slate-100/80 bg-white/60"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5 w-full">
        <button
          data-upload-btn
          type="button"
          onClick={onCamera}
          className={`${btnBase} bg-indigo-600 text-white shadow-[0_8px_20px_rgba(15,26,90,0.28)]`}
        >
          <Camera size={18} strokeWidth={2.2} />
          Tomar foto
        </button>
        <button
          data-upload-btn
          type="button"
          onClick={onGallery}
          className={`${btnBase} bg-white border-2 border-indigo-200 text-indigo-800 shadow-sm`}
        >
          <Images size={18} strokeWidth={2.2} />
          Elegir archivo
        </button>
      </div>
      <p className={`text-center text-[0.65rem] mt-2 leading-relaxed ${variant === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
        {variant === 'error'
          ? 'Selecciona otra imagen o PDF e inténtalo de nuevo.'
          : 'JPG · PNG · PDF · HEIC'}
      </p>
    </div>
  );
}

/** Inputs ocultos pero activables en iOS / WebView (display:none a veces rompe el picker). */
function HiddenFileInputs({
  inputRef,
  cameraRef,
  onPick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  cameraRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    e.target.value = '';
  };

  const hiddenInputClass =
    'absolute left-0 top-0 h-px w-px overflow-hidden opacity-0 -z-10';

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,image/heic,image/heif,.pdf"
        className={hiddenInputClass}
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={hiddenInputClass}
        tabIndex={-1}
        aria-hidden
        onChange={handleChange}
      />
    </>
  );
}

const DOCS: DocConfig[] = [
  {
    type: 'cedula',
    label: 'Cédula del tomador',
    description: 'Quien paga la póliza',
    Icon: IdCard,
    accent: 'from-indigo-500 to-violet-500',
  },
  {
    type: 'cedula_titular',
    label: 'Cédula del titular',
    description: 'Persona asegurada (funerario)',
    Icon: IdCard,
    accent: 'from-violet-500 to-fuchsia-500',
  },
  {
    type: 'cedula_beneficiario',
    label: 'Cédula del beneficiario',
    description: 'Quien recibe el beneficio',
    Icon: IdCard,
    accent: 'from-fuchsia-500 to-rose-500',
  },
  {
    type: 'licencia',
    label: 'Licencia de conducir',
    description: 'Conductor principal',
    Icon: Car,
    accent: 'from-violet-500 to-fuchsia-500',
  },
  {
    type: 'certificado',
    label: 'Certificado del vehículo',
    description: 'Vehículo a asegurar',
    Icon: FileText,
    accent: 'from-blue-500 to-indigo-500',
  },
  {
    type: 'pasaporte',
    label: 'Pasaporte',
    description: 'Alternativa a cédula (DDS)',
    Icon: IdCard,
    optional: true,
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    type: 'rif',
    label: 'RIF',
    description: 'Opcional · empresas',
    Icon: Building2,
    optional: true,
    accent: 'from-slate-400 to-slate-500',
  },
  {
    type: 'factura',
    label: 'Factura fiscal',
    description: 'Ticket de farmacia · número FACTURA',
    Icon: FileText,
    accent: 'from-sky-500 to-blue-600',
  },
];

/** Orden visual: obligatorios del vehículo primero, factura tarjeta, opcionales al final. */
const DOC_DISPLAY_ORDER: DocType[] = [
  'cedula',
  'cedula_titular',
  'cedula_beneficiario',
  'licencia',
  'certificado',
  'factura',
  'pasaporte',
  'rif',
];

function sortDocConfigs(docs: DocConfig[]): DocConfig[] {
  const order = new Map(DOC_DISPLAY_ORDER.map((type, index) => [type, index]));
  return [...docs].sort(
    (a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99),
  );
}

/** Grilla simétrica según cantidad (evita filas huérfanas tipo 4+1). */
function resolveOcrDocGridClass(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return 'grid grid-cols-1 gap-4 max-w-sm mx-auto';
  if (count === 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto';
  if (count === 3) return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto';
  if (count === 4) return 'grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto';
  return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto';
}

type UploadDocLayout = 'default' | 'compact' | 'banner';

function UploadDocCard({
  config,
  onOpenPreview,
  layout = 'default',
}: {
  config: DocConfig;
  onOpenPreview: (file: DocumentFile, title: string) => void;
  layout?: UploadDocLayout;
}) {
  const isCompact = layout === 'compact';
  const isBanner = layout === 'banner';
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const docState = useWizardStore((s) => s.documents[config.type]) || { status: config.optional ? 'idle' : 'idle', progress: 0 };
  const setDocState = useWizardStore((s) => s.setDocState);
  const setVehicle = useWizardStore((s) => s.setVehicle);
  const setTomador = useWizardStore((s) => s.setTomador);
  const setCarnetBinacionalMode = useWizardStore((s) => s.setCarnetBinacionalMode);

  const statusVariant = {
    idle: config.optional ? 'optional' : 'pending',
    uploading: 'uploading',
    processing: 'processing',
    done: 'done',
    error: 'error',
  } as const;

  const currentStatus = docState.status as keyof typeof statusVariant;

  const statusLabel = {
    idle: config.optional ? 'OPCIONAL' : 'PENDIENTE',
    uploading: 'SUBIENDO',
    processing: 'ANALIZANDO',
    done: 'PROCESADO',
    error: 'ERROR',
  };

  const isLoading = currentStatus === 'uploading' || currentStatus === 'processing';
  const isDone = currentStatus === 'done';
  const isClickable = currentStatus === 'idle' || currentStatus === 'error';
  const Icon = config.Icon;

  function handleCardClick(e: React.MouseEvent) {
    // En móvil los botones de cámara/galería manejan el click directamente.
    // Solo activar el input genérico si el click viene del área de la tarjeta
    // (no de uno de los botones), y si NO es un dispositivo táctil (desktop).
    if (!isClickable) return;
    const isTouchDevice = window.matchMedia('(hover: none)').matches;
    if (!isTouchDevice) {
      // Desktop: comportamiento original — abre el selector de archivos
      const target = e.target as HTMLElement;
      if (!target.closest('[data-upload-btn]')) {
        inputRef.current?.click();
      }
    }
  }

  function handleCardKey(e: React.KeyboardEvent) {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  /**
   * Prepara la imagen para OCR antes de subirla:
   * - Redimensiona al máximo 1600 px (suficiente para que Gemini lea texto)
   * - Convierte todo a JPEG calidad 82 % → documentos quedan ~200-500 KB
   * - HEIC/HEIF (iOS galería), PNG, WebP, Android JPEG → todos → JPEG
   * - PDFs pasan sin cambios
   *
   * Gemini OCR no necesita fotos de alta fidelidad; necesita texto legible.
   */
  async function prepareFile(raw: File): Promise<File> {
    if (raw.type === 'application/pdf') return raw;

    return new Promise((resolve) => {
      const MAX_PX  = 1600;   // suficiente para leer texto en documentos A4/A5
      const QUALITY = 0.82;   // 82 % → texto nítido, tamaño mínimo

      const url = URL.createObjectURL(raw);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;

        // Solo escala si supera el máximo; nunca ampliar
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) {
            height = Math.round((height * MAX_PX) / width);
            width  = MAX_PX;
          } else {
            width  = Math.round((width * MAX_PX) / height);
            height = MAX_PX;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(raw); return; }

        // Fondo blanco para documentos con transparencia (PNG con fondo vacío)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(raw); return; }
            const name = raw.name.replace(/\.[^.]+$/, '.jpg');
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          QUALITY,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(raw); };
      img.src = url;
    });
  }

  async function handleFile(rawFile: File) {
    setDocState(config.type, { status: 'uploading', progress: 0, error: undefined });
    const file = await prepareFile(rawFile);

    try {
      const wiz = useWizardStore.getState();
      const cedulaTitular = String(
        wiz.tomador?.identificacion
        || wiz.documents.cedula?.ocr?.identificacion
        || wiz.documents.cedula_titular?.ocr?.identificacion
        || '',
      ).replace(/\D/g, '');
      const tarjeta = wiz.tarjeta;
      const result = await uploadDocument(file, config.type, (pct) => {
        setDocState(config.type, { progress: pct });
      }, {
        cedulaTitular: cedulaTitular || undefined,
        tarjetaCplan: tarjeta?.cplan,
        tarjetaCproducto: tarjeta?.cproducto,
        tarjetaNombreProducto: tarjeta?.nombreProducto,
      });

      setDocState(config.type, { status: 'processing', progress: 100 });
      await new Promise((r) => setTimeout(r, 800));

      // Gemini caído / sin lectura: el slot queda en error (rojo), no en verde.
      if (result.ocrFailed) {
        toast.error(
          `No pudimos leer "${config.label}"`,
          'El servicio de lectura no respondió. Inténtalo de nuevo.',
          7000
        );
        setDocState(config.type, {
          status: 'error',
          progress: 0,
          error: 'No se pudo leer el documento. Inténtalo de nuevo.',
        });
        return;
      }

      if (config.type === 'certificado' && tarjeta) {
        const planKind = resolveTarjetaPlanVehicleKind(tarjeta);
        if (planKind) {
          const check = validateCertificadoForTarjetaPlan(
            planKind,
            result.ocr as Record<string, unknown> | undefined,
          );
          if (check.ok === false) {
            toast.warning('Carnet no compatible con la tarjeta', check.message, 8000);
            setDocState(config.type, {
              status: 'error',
              progress: 0,
              error: check.message,
            });
            return;
          }
        }
      }

      if (config.type === 'factura') {
        const nfactura = normalizeNfactura(result.ocr?.nfactura);
        const xcodigo = useWizardStore.getState().tarjeta?.xcodigoUnico;
        if (!nfactura) {
          throw new Error('No se leyó el número de FACTURA. Sube una foto más nítida.');
        }
        if (!xcodigo) {
          throw new Error('Falta el código único de la tarjeta. Vuelve a validar el código.');
        }
        await validateBill(xcodigo, nfactura);
        const prev = useWizardStore.getState().tarjeta!;
        useWizardStore.getState().setTarjeta({ ...prev, nfactura });
        const meta = useWizardStore.getState().metadataCanal || {};
        useWizardStore.getState().setMetadataCanal({ ...meta, nfactura });
        toast.success('Factura validada', `Número ${nfactura}`, 4000);
      }

      setDocState(config.type, {
        status: 'done',
        progress: 100,
        file: result.file,
        ocr: result.ocr,
        hash: result.hash,
      });

      if (isCedulaOcrSlot(config.type) && result.ocr && typeof result.ocr === 'object') {
        const rawId = result.ocr.identificacion as string | undefined;
        const digits = normalizeIdentificacionDigits(rawId);
        const tipoDoc =
          (result.ocr.tipoDoc as string | undefined)
          || inferTipoDocFromRaw(rawId)
          || (digits ? 'V' : undefined);
        setDocState(config.type, {
          ocr: {
            ...result.ocr,
            identificacion: digits || undefined,
            ...(tipoDoc ? { tipoDoc } : {}),
          },
        });
      }

      if (config.type === 'licencia' && result.ocr && typeof result.ocr === 'object') {
        const rawId = result.ocr.identificacion as string | undefined;
        const digits = normalizeIdentificacionDigits(rawId);
        const tipoDoc =
          (result.ocr.tipoDoc as string | undefined)
          || inferTipoDocFromRaw(rawId)
          || (digits ? 'V' : undefined);
        setDocState(config.type, {
          ocr: {
            ...result.ocr,
            identificacion: digits || undefined,
            ...(tipoDoc ? { tipoDoc } : {}),
          },
        });
      }

      if (config.type === 'cedula' && result.ocr?.tipoDoc) {
        const tipo = String(result.ocr.tipoDoc).trim().toUpperCase();
        const { setDiligencia } = useWizardStore.getState();
        const itipo = ['J', 'G', 'C'].includes(tipo) ? 'C' : 'S';
        setDiligencia({ itipoDiligencia: itipo, clasificadoEn: 'ocr' });
      }

      if (config.type === 'certificado') {
        const certOcr = result.ocr as Parameters<typeof isBinacionalCarnet>[0];
        const binacional =
          Boolean(result.carnetBinacional) || isBinacionalCarnet(certOcr);
        const extranjero = isExtranjeroCarnet(certOcr);
        setCarnetBinacionalMode(binacional);
        if (binacional) {
          setVehicle({ tipoPlaca: 'binacional', tipoCarnet: 'binacional' });
        } else if (extranjero) {
          setVehicle({ tipoPlaca: 'extranjera' });
        } else {
          // ← CRÍTICO: fijar explícitamente 'nacional' para sobreescribir cualquier
          // valor previo almacenado en sesión Nexus (ej. 'extranjera' de un intento anterior).
          setVehicle({ tipoPlaca: 'nacional', tipoCarnet: certOcr?.tipoCarnet as 'nacional' | 'binacional' | undefined ?? 'nacional' });
        }

        const tomadorFromCert = extractTomadorFromCertificado(result.ocr);
        const cedulaId = useWizardStore.getState().documents.cedula?.ocr?.identificacion;
        if (tomadorFromCert?.identificacion && !cedulaId) {
          setTomador(tomadorFromCert);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DocTypeMismatchError) {
        toast.warning(
          `Documento incorrecto en "${config.label}"`,
          `Detectamos: ${err.detectedLabel}. Esperabamos: ${err.expectedLabel}.`,
          7000
        );
        setDocState(config.type, {
          status: 'error',
          progress: 0,
          error: `Subiste un(a) ${err.detectedLabel}. Aqui va ${err.expectedLabel}.`,
        });
        return;
      }

      if (err instanceof PlanVehicleMismatchError) {
        toast.warning('Carnet no compatible con la tarjeta', err.message, 8000);
        setDocState(config.type, {
          status: 'error',
          progress: 0,
          error: err.message,
        });
        return;
      }

      const data = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
      const message =
        data?.code === 'OCR_PROVIDER_FAILED'
          ? 'No se pudo leer el documento. Inténtalo de nuevo.'
          : (data?.message ?? 'Error al procesar el documento.');
      toast.error(`No pudimos procesar "${config.label}"`, message, 6000);
      setDocState(config.type, { status: 'error', progress: 0, error: message });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const openCamera = () => cameraRef.current?.click();
  const openGallery = () => inputRef.current?.click();

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
      aria-label={isClickable ? `Subir ${config.label}` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      className={`
        group relative rounded-2xl border-2 transition-all duration-300 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white
        ${isBanner ? 'border-sky-200 bg-gradient-to-r from-sky-50/80 via-white to-white shadow-sm' : ''}
        ${dragOver ? 'dropzone-active' : ''}
        ${isDone
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white cursor-default'
          : currentStatus === 'error'
          ? 'border-rose-300 bg-rose-50/30 sm:cursor-pointer sm:hover:border-rose-400 sm:hover:-translate-y-0.5'
          : isLoading
          ? 'border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/30 cursor-wait'
          : isBanner
          ? 'sm:hover:border-sky-400 sm:hover:shadow-[0_12px_32px_-12px_rgba(14,165,233,0.35)] sm:hover:-translate-y-0.5 sm:cursor-pointer sm:active:scale-[0.995]'
          : 'border-slate-200 bg-white sm:hover:border-indigo-400 sm:hover:shadow-[0_18px_40px_-12px_rgba(15,26,90,0.22)] sm:hover:-translate-y-0.5 sm:cursor-pointer sm:active:scale-[0.99]'
        }
      `}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Decorative accent corner */}
      {!isDone && !isLoading && currentStatus !== 'error' && (
        <div className={`absolute -top-12 -right-12 w-24 h-24 rounded-full bg-gradient-to-br ${config.accent} opacity-[0.08] blur-2xl pointer-events-none`} />
      )}

      <HiddenFileInputs inputRef={inputRef} cameraRef={cameraRef} onPick={handleFile} />

      <div className={isBanner ? 'lg:flex lg:items-stretch' : undefined}>
      {/* Top bar + title */}
      <div className={`
        relative shrink-0
        ${isBanner ? 'lg:w-[34%] lg:border-r lg:border-sky-100 lg:p-5' : ''}
        ${isCompact ? 'p-3 pb-0' : 'p-4 pb-0'}
      `}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`
                shrink-0 rounded-xl grid place-items-center transition-all
                ${isCompact ? 'w-8 h-8' : 'w-9 h-9'}
                ${isDone
                  ? 'bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.32)]'
                  : isLoading
                  ? `bg-gradient-to-br ${config.accent} text-white shadow-[0_4px_14px_rgba(15,26,90,0.32)]`
                  : isBanner
                  ? 'bg-sky-500 text-white shadow-[0_4px_14px_rgba(14,165,233,0.35)]'
                  : config.optional
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-indigo-100 text-indigo-600'
                }
              `}
            >
              <Icon size={isCompact ? 14 : 16} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 pt-0.5">
              <h3 className={`font-display font-bold text-slate-900 leading-tight ${isCompact ? 'text-[0.82rem]' : 'text-sm'}`}>
                {config.label}
              </h3>
              <p className={`text-slate-500 mt-0.5 ${isCompact ? 'text-[0.72rem] leading-snug' : 'text-[0.78rem]'}`}>
                {config.description}
              </p>
            </div>
          </div>
          <Badge variant={statusVariant[currentStatus]}>
            {statusLabel[currentStatus]}
          </Badge>
        </div>
      </div>

      {/* Visual zone */}
      <div className={`
        rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center relative overflow-hidden
        ${isBanner ? 'mx-4 mb-4 mt-3 lg:m-4 lg:flex-1 min-h-[120px]' : isCompact ? 'mx-3 my-2.5 min-h-[108px] p-3' : 'mx-4 my-3 min-h-[150px] p-4'}
      `}>
        {/* Scan line effect when processing */}
        {currentStatus === 'processing' && (
          <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_12px_rgba(15,26,90,0.6)] pointer-events-none"
            style={{ animation: 'fillTrack 1.4s ease-in-out infinite alternate' }}
          />
        )}

        {currentStatus === 'idle' && (
          <div className="flex flex-col items-center gap-2.5 text-slate-500 transition-colors">
            {/* Ícono central — desktop y móvil */}
            <div className={`relative rounded-2xl bg-white border-2 border-dashed border-slate-300 grid place-items-center group-hover:border-indigo-400 group-hover:bg-indigo-50/60 transition-all pointer-events-none ${isCompact || isBanner ? 'w-11 h-11' : 'w-14 h-14'}`}>
              <Upload size={isCompact || isBanner ? 18 : 20} strokeWidth={2.2} className="group-hover:scale-110 transition-transform" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 shadow-[0_4px_12px_rgba(15,26,90,0.4)]">
                <span className="text-[0.6rem] font-black">+</span>
              </span>
            </div>

            {/* Desktop: texto de arrastre */}
            {!isCompact && (
              <span className="hidden sm:inline-flex text-xs font-bold items-center gap-1.5 pointer-events-none group-hover:text-indigo-500 transition-colors">
                <MousePointerClick size={11} className="opacity-70" />
                Click o arrastra aquí
              </span>
            )}

            {(isCompact || isBanner) && (
              <span className="hidden sm:inline text-[0.68rem] font-semibold text-slate-500 pointer-events-none">
                Click o arrastra
              </span>
            )}

            <span className="sm:hidden text-xs font-semibold text-slate-600 text-center px-2 pointer-events-none">
              Usa los botones de abajo para subir
            </span>

            {!isCompact && (
              <span className="hidden sm:inline text-[0.62rem] text-slate-500 font-mono uppercase tracking-wider pointer-events-none">JPG · PNG · PDF</span>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-2.5 z-10 pointer-events-none">
            <CircularProgress progress={docState.progress ?? 0} size={72} strokeWidth={5}>
              <div className="text-center">
                <p className="text-[1rem] font-black text-indigo-600 leading-none font-mono">
                  {Math.round(docState.progress ?? 0)}
                </p>
                <p className="text-[0.55rem] text-slate-500 font-bold mt-0.5 tracking-wider">%</p>
              </div>
            </CircularProgress>
            <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-indigo-600">
              {currentStatus === 'processing' && <ScanLine size={11} className="animate-pulse-soft" />}
              {currentStatus === 'uploading' ? 'Subiendo...' : 'Analizando OCR...'}
            </div>
          </div>
        )}

        {isDone && (
          <div className="flex flex-col items-center gap-2 animate-spring-in pointer-events-none">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center shadow-[0_8px_22px_rgba(16,185,129,0.4)]">
                <CheckCircle2 size={26} className="text-white" strokeWidth={2.5} />
              </div>
              <Sparkles size={12} className="absolute -top-1 -right-1 text-amber-400 animate-pulse-soft" />
            </div>
            <p className="text-xs font-bold text-emerald-700">Verificado</p>
            {docState.file && (
              <p className="text-[0.62rem] text-slate-500 max-w-full truncate px-2 font-mono">
                {docState.file.name}
              </p>
            )}
          </div>
        )}

        {currentStatus === 'error' && (
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 grid place-items-center pointer-events-none">
              <AlertCircle size={24} className="text-rose-500" strokeWidth={2.2} />
            </div>
            <p className="text-xs font-bold text-rose-700 pointer-events-none">
              <span className="hidden sm:inline">Error · Click para reintentar</span>
              <span className="sm:hidden">Error · Vuelve a intentar</span>
            </p>
            <p className="text-[0.65rem] text-rose-500 max-w-full px-2 text-center pointer-events-none break-words leading-snug">{docState.error}</p>
          </div>
        )}
      </div>

      {(currentStatus === 'idle' || currentStatus === 'error') && (
        <MobileUploadActions
          variant={currentStatus === 'error' ? 'error' : 'idle'}
          onCamera={openCamera}
          onGallery={openGallery}
        />
      )}
      </div>

      {/* Action footer (only when done) */}
      {isDone && (
        <div className={`flex flex-col gap-2 ${isCompact ? 'p-3 pt-1' : 'p-4 pt-2'}`}>
          <div className="flex gap-2">
          {docState.file?.url && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenPreview(docState.file!, config.label); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
            >
              <Eye size={12} />
              Ver
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDocState(config.type, { status: 'idle', progress: 0, file: undefined, ocr: undefined });
              useWizardStore.getState().setOcrDone(false);
              if (config.type === 'certificado') setCarnetBinacionalMode(false);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors"
          >
            <RotateCcw size={12} />
            Cambiar
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Documentos demo: 100% client-side. NO pasan por Gemini para no consumir
 * cuota ni provocar `ocrFailed`. Cuando el usuario hace click en
 * "Cargar documentos demo" obtenemos los datos pre-extraidos de DEMO_OCR
 * y mostramos el SVG correspondiente en el preview.
 *
 * Los datos son coherentes entre si (mismo titular, mismo vehiculo) para
 * que el resto del wizard sea creible.
 */


import { useProductConfig } from '../../hooks/useProductConfig';
import {
  getOptionalDocs,
  getRequiredDocs,
  preClasificarDiligencia,
  isDiligenciaDocType,
  resolveRcvOcrEntryDocs,
  toDiligenciaDocTypes,
} from '../../lib/diligencia';

const EMPRESA_ID = Number(import.meta.env.VITE_EMPRESA_ID ?? 1);

export function OcrStep() {
  const {
    documents, ocrDone, setOcrDone, setTomador, setVehicle, tomador,
    builderProduct, carnetBinacionalMode, diligencia, setDiligencia,
    titularFromCarnet, asegurado, hasDriver, conductor, tarjeta,
  } = useWizardStore();
  const catalogs = useCatalogs();
  const [preview, setPreview] = useState<{ file: DocumentFile; title: string } | null>(null);

  // Producto activo y configuración desde Nexus
  const product = getProductConfig();
  const { config } = useProductConfig(EMPRESA_ID, product.id, 'ocr');
  const hasVehicle = builderProduct
    ? branchHasVehicle(builderProduct.branch)
    : product.hasVehicle;

  // Documentos según catálogo Exélixi, Nexus o producto legacy (rcv/funerario).
  const itipoDiligencia = diligencia?.itipoDiligencia ?? preClasificarDiligencia(tomador.tipoDoc);
  let requiredDocs: DocType[];
  let optionalDocs: DocType[];

  if (product.id === 'rcv' && hasVehicle && !builderProduct) {
    ({ required: requiredDocs, optional: optionalDocs } = resolveRcvOcrEntryDocs(product.docs));
  } else {
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

  if (product.id === 'funerario' && !builderProduct) {
    requiredDocs = ['cedula', 'cedula_titular', 'cedula_beneficiario'];
    optionalDocs = [];
  } else if (builderProduct) {
    const slots = resolveBuilderDocuments(builderProduct);
    requiredDocs = slots.filter((d) => d.required).map((d) => d.ocrType);
    optionalDocs = slots.filter((d) => !d.required).map((d) => d.ocrType);
  } else if (product.id !== 'rcv' && config?.documentos && !config?.documentosPorDiligencia) {
    if (Array.isArray(config.documentos)) {
      const docsArr = config.documentos as { key: string; activo: boolean; obligatorio: boolean }[];
      requiredDocs = docsArr.filter(d => d.activo && d.obligatorio).map(d => d.key as DocType);
      optionalDocs = docsArr.filter(d => d.activo && !d.obligatorio).map(d => d.key as DocType);
    } else {
      const docs = config.documentos as Record<string, { activo: boolean; obligatorio: boolean }>;
      requiredDocs = Object.keys(docs).filter(k => docs[k].activo && docs[k].obligatorio) as DocType[];
      optionalDocs = Object.keys(docs).filter(k => docs[k].activo && !docs[k].obligatorio) as DocType[];
    }
  }

  const binacionalDocs = adjustDocsForBinacionalCarnet(
    requiredDocs, optionalDocs, documents, hasVehicle, carnetBinacionalMode,
  );
  const { requiredDocs: effectiveRequired, optionalDocs: effectiveOptional } =
    appendFacturaIfNeeded(binacionalDocs.requiredDocs, binacionalDocs.optionalDocs, tarjeta);

  useEffect(() => {
    if (product.id !== 'rcv') return;
    const hashes = Object.fromEntries(
      Object.entries(documents)
        .filter(([k, d]) => d?.hash && isDiligenciaDocType(k))
        .map(([k, d]) => [k, d!.hash!]),
    );
    setDiligencia({
      itipoDiligencia,
      documentosRequeridos: toDiligenciaDocTypes(effectiveRequired),
      documentHashes: hashes,
      clasificadoEn: 'ocr',
    });
  }, [product.id, itipoDiligencia, effectiveRequired.join(','), documents, setDiligencia]);

  const visibleDocs = sortDocConfigs(
    DOCS.filter(
      (d) => effectiveRequired.includes(d.type) || effectiveOptional.includes(d.type),
    ).map((d) => ({
      ...d,
      optional: effectiveOptional.includes(d.type),
    })),
  );
  const requiredVisibleDocs = visibleDocs.filter((d) => !d.optional);
  const optionalVisibleDocs = visibleDocs.filter((d) => d.optional);
  const requiredGridClass = resolveOcrDocGridClass(requiredVisibleDocs.length);
  const optionalGridClass = resolveOcrDocGridClass(optionalVisibleDocs.length);
  const tarjetaNeedsFactura = tarjeta?.bfactura === 1;
  const vehicleDocTypes = new Set<DocType>(['cedula', 'licencia', 'certificado']);
  const vehicleRequiredDocs = requiredVisibleDocs.filter((d) => vehicleDocTypes.has(d.type));
  const extraRequiredDocs = requiredVisibleDocs.filter((d) => !vehicleDocTypes.has(d.type));
  const useTarjetaGroupedLayout =
    tarjetaNeedsFactura
    && vehicleRequiredDocs.length === 3
    && extraRequiredDocs.some((d) => d.type === 'factura');
  const allRequiredDone =
    effectiveRequired.length > 0
    && effectiveRequired.every((d) => documents[d]?.status === 'done');

  useEffect(() => {
    if (allRequiredDone && !ocrDone) {
      if (product.id === 'funerario') {
        applyFuneralOcrCedulas();
      }
      const cedula = documents.cedula.ocr;
      if (cedula?.nombre || cedula?.identificacion) {
        // El OCR de Gemini devuelve "Soltero(a)" / "Femenino" pero el catálogo
        // Valrep usa "SOLTERO" / "FEMENINO". matchCatalog hace el puente.
        const sexoOpts = catalogs.sexos.map(s => ({ value: String(s.label), label: s.label }));
        const ecOpts   = catalogs.estadosCivil.map(s => ({ value: String(s.label), label: s.label }));

        setTomador({
          nombre: cedula.nombre ?? '',
          apellido: cedula.apellido ?? '',
          identificacion: normalizeIdentificacionDigits(cedula.identificacion),
          tipoDoc: cedula.tipoDoc ?? inferTipoDocFromRaw(cedula.identificacion) ?? 'V',
          fechaNac: cedula.fechaNacimiento ?? '',
          sexo: matchCatalog(cedula.sexo, sexoOpts),
          estadoCivil: matchCatalog(cedula.estadoCivil, ecOpts),
        });
      }
      // El vehículo sólo aplica a productos con vehículo (RCV). Funerario no
      // lleva certificado de vehículo.
      const cert = hasVehicle ? documents.certificado.ocr : undefined;
      if (cert) {
        if (!cedula?.identificacion && !cedula?.nombre) {
          const tomadorFromCert = extractTomadorFromCertificado(cert);
          if (tomadorFromCert?.identificacion) setTomador(tomadorFromCert);
        }
        setVehicle({
          placa: cert.placa ?? '',
          marca: cert.marca ?? '',
          modelo: cert.modelo ?? cert.linea ?? '',
          año: cert.año ?? cert.anio ?? '',
          color: cert.color ?? '',
          serial: cert.serial ?? '',
          serialMotor: cert.serialMotor ?? '',
          cilindrada: cert.cilindrada ?? '',
          tipoCarnet: cert.tipoCarnet,
          tipoPlaca: resolveTipoPlacaFromCert(cert),
        });

      }

      if (hasVehicle) {
        // ── Titular carnet + conductor habitual (licencia ≠ cédula y ≠ carnet) ──
        const personRoles = resolveOcrPersonRoles(cedula, cert, documents.licencia?.ocr);
        useWizardStore.getState().setSameInsured(personRoles.sameInsured);
        useWizardStore.getState().setTitularFromCarnet(personRoles.titularFromCarnet);
        if (personRoles.asegurado) {
          useWizardStore.getState().setAsegurado(personRoles.asegurado);
        }
        useWizardStore.getState().setHasDriver(personRoles.hasDriver);
        if (personRoles.hasDriver && personRoles.conductor) {
          useWizardStore.getState().setConductor(personRoles.conductor);
        }
      }

      setOcrDone(true);
    }
  }, [
    allRequiredDone,
    ocrDone,
    hasVehicle,
    documents.cedula.ocr,
    documents.certificado.ocr,
    documents.licencia.ocr,
    catalogs.sexos,
    catalogs.estadosCivil,
    setTomador,
    setVehicle,
    setOcrDone,
  ]);


  // Re-sincronización tardía: si los catálogos llegan DESPUÉS de aplicar el OCR
  // normaliza los valores del tomador contra las opciones reales del Valrep.
  // Solo actúa cuando el valor actual NO existe en las opciones (no reescribe selecciones manuales).
  useEffect(() => {
    if (catalogs.loading) return;
    const updates: { sexo?: string; estadoCivil?: string } = {};

    if (tomador.sexo && catalogs.sexos.length > 0) {
      const opts = catalogs.sexos.map(s => ({ value: String(s.label), label: s.label }));
      if (!opts.some(o => o.value === tomador.sexo)) {
        const matched = matchCatalog(tomador.sexo, opts);
        if (matched && matched !== tomador.sexo) updates.sexo = matched;
      }
    }

    if (tomador.estadoCivil && catalogs.estadosCivil.length > 0) {
      const opts = catalogs.estadosCivil.map(s => ({ value: String(s.label), label: s.label }));
      if (!opts.some(o => o.value === tomador.estadoCivil)) {
        const matched = matchCatalog(tomador.estadoCivil, opts);
        if (matched && matched !== tomador.estadoCivil) updates.estadoCivil = matched;
      }
    }

    if (updates.sexo || updates.estadoCivil) setTomador(updates);
  }, [catalogs.loading, catalogs.sexos, catalogs.estadosCivil, tomador.sexo, tomador.estadoCivil, setTomador]);

  const completedCount = effectiveRequired.filter((d) => documents[d]?.status === 'done').length;
  const completionPct =
    effectiveRequired.length > 0
      ? (completedCount / effectiveRequired.length) * 100
      : 0;

  return (
    <div className="animate-fade-in">
      {/* Hero stat */}
      <div className="mb-7 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 flex flex-col justify-center">
          <p className="text-slate-600 text-sm leading-relaxed">
            Carga tus documentos y los analizaremos con OCR para
            <span className="font-bold text-slate-800"> precargar la información</span> en el siguiente paso.
            Aceptamos JPG, PNG, SVG o PDF.
            {product.id === 'rcv' && (
              <span className="block mt-2 text-indigo-700 font-semibold text-xs">
                Documentos originales: cédula, licencia de conducir y certificado del vehículo
                {tarjetaNeedsFactura ? ', más factura fiscal de farmacia' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="relative bg-gradient-to-br from-indigo-50 via-violet-50/60 to-white border border-indigo-100 rounded-2xl p-4 overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-violet-500/10 blur-2xl" />
          <div className="relative flex items-end gap-3">
            <span className="text-5xl font-display font-black gradient-text-indigo leading-none">
              <AnimatedCounter value={completedCount} />
            </span>
            <div className="pb-1">
              <p className="text-xs text-slate-500 font-semibold leading-tight">
                de <span className="font-mono text-slate-700">{effectiveRequired.length}</span> obligatorios
              </p>
              <p className="text-[0.65rem] text-slate-500 mt-0.5">documentos verificados</p>
            </div>
          </div>
          {/* Mini progress */}
          <div className="mt-3 h-1 rounded-full bg-indigo-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ease-out"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Demo loader bar — oculto en producción */}

      {/* Obligatorios — layout agrupado flujo tarjeta con factura */}
      {useTarjetaGroupedLayout ? (
        <div className="mx-auto max-w-5xl space-y-5">
          <section>
            <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-indigo-600/80">
              Documentos del vehículo
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {vehicleRequiredDocs.map((doc) => (
                <UploadDocCard
                  key={doc.type}
                  config={doc}
                  layout="compact"
                  onOpenPreview={(file, title) => setPreview({ file, title })}
                />
              ))}
            </div>
          </section>

          {extraRequiredDocs.map((doc) => (
            <section key={doc.type}>
              <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-sky-700/90">
                Comprobante de farmacia
              </p>
              <UploadDocCard
                config={doc}
                layout="banner"
                onOpenPreview={(file, title) => setPreview({ file, title })}
              />
            </section>
          ))}
        </div>
      ) : requiredVisibleDocs.length > 0 && (
        <div className={requiredGridClass}>
          {requiredVisibleDocs.map((doc) => (
            <UploadDocCard
              key={doc.type}
              config={doc}
              layout={requiredVisibleDocs.length >= 4 ? 'compact' : 'default'}
              onOpenPreview={(file, title) => setPreview({ file, title })}
            />
          ))}
        </div>
      )}

      {/* Opcionales — caja suave, sin romper la grilla principal */}
      {optionalVisibleDocs.length > 0 && (
        <div className={`mx-auto max-w-lg ${useTarjetaGroupedLayout ? 'mt-5' : 'mt-8'}`}>
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4">
            <p className="mb-3 text-center text-xs text-slate-500">
              {useTarjetaGroupedLayout
                ? 'Opcional · solo si el tomador es empresa'
                : 'Documentos opcionales'}
            </p>
            <div className={optionalGridClass}>
              {optionalVisibleDocs.map((doc) => (
                <UploadDocCard
                  key={doc.type}
                  config={doc}
                  layout="compact"
                  onOpenPreview={(file, title) => setPreview({ file, title })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OCR success banner */}
      {allRequiredDone && (() => {
        // ── Datos tomador (cédula/licencia) ──────────────────────────────────
        const fromCert = hasVehicle
          ? extractTomadorFromCertificado(documents.certificado?.ocr)
          : null;
        const nombre = documents.cedula.ocr?.nombre || tomador.nombre || fromCert?.nombre || '';
        const apellido = documents.cedula.ocr?.apellido || tomador.apellido || fromCert?.apellido || '';
        const rawId = documents.cedula.ocr?.identificacion || tomador.identificacion || fromCert?.identificacion;
        const identificacion = normalizeIdentificacionDigits(rawId);
        const tipoDoc =
          documents.cedula.ocr?.tipoDoc
          || tomador.tipoDoc
          || fromCert?.tipoDoc
          || inferTipoDocFromRaw(rawId)
          || (identificacion ? 'V' : '');
        const documento = formatDocumentoLabel(identificacion, tipoDoc);
        const placa = documents.certificado?.ocr?.placa ?? '';

        // ── Datos propietario del carnet (si hay discrepancia) ───────────────
        const docCarnet = asegurado.identificacion
          ? formatDocumentoLabel(asegurado.identificacion, asegurado.tipoDoc ?? 'V')
          : '';

        const docConductor = conductor.identificacion
          ? formatDocumentoLabel(conductor.identificacion, conductor.tipoDoc ?? 'V')
          : '';
        const multiPersonas = titularFromCarnet || hasDriver;
        const personasCount = 1 + (titularFromCarnet ? 1 : 0) + (hasDriver ? 1 : 0);
        const bannerHint = titularFromCarnet && hasDriver
          ? 'Cédula, carnet y licencia son de personas distintas. Se separan tomador, titular y conductor habitual.'
          : titularFromCarnet
            ? 'El carnet del vehículo pertenece a una persona distinta. Se separan tomador y titular.'
            : hasDriver
              ? 'La licencia pertenece a otra persona. Se precargará como conductor habitual en el paso del vehículo.'
              : 'Hemos precargado la información en el siguiente paso. Podrás revisarla y editarla si es necesario.';

        // ── Chip genérico ────────────────────────────────────────────────────
        const Chip = ({
          label, value, color = 'white',
        }: { label: string; value?: string; color?: 'white' | 'amber' }) => value ? (
          <div className={
            `rounded-xl p-3 border animate-fade-in ${
              color === 'amber'
                ? 'bg-amber-400/20 border-amber-300/30'
                : 'bg-white/12 backdrop-blur-sm border-white/15'
            }`
          }>
            <p className="text-[0.62rem] text-indigo-100/90 font-bold mb-1 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-bold text-white truncate font-mono">{value}</p>
          </div>
        ) : null;

        return (
          <div className="mt-6 relative rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-[0_24px_48px_rgba(15,26,90,0.28)] animate-spring-in overflow-hidden">
            {/* Decorative bg */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-fuchsia-300/15 blur-3xl pointer-events-none" />

            <div className="relative p-5">
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md grid place-items-center flex-shrink-0 ring-1 ring-white/20">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-display font-black text-base flex items-center gap-2">
                    Datos detectados automáticamente
                    <span className="text-[0.6rem] font-bold bg-white/20 backdrop-blur px-2 py-0.5 rounded-full tracking-wider">
                      OCR · IA
                    </span>
                  </p>
                  <p className="text-xs text-indigo-100 mt-0.5 leading-relaxed">
                    {bannerHint}
                  </p>
                </div>
                {multiPersonas && (
                  <span className="flex-shrink-0 text-[0.6rem] font-bold bg-amber-400/80 text-amber-950 px-2 py-1 rounded-full tracking-wider">
                    {personasCount} personas
                  </span>
                )}
              </div>

              {multiPersonas ? (
                <div className={`grid grid-cols-1 gap-3 ${hasDriver && titularFromCarnet ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  <div className="rounded-xl bg-white/10 border border-white/20 p-3">
                    <p className="text-[0.65rem] font-black uppercase tracking-widest text-indigo-200 mb-2.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 inline-block" />
                      Tomador · Cédula
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Chip label="Nombre" value={nombre} />
                      <Chip label="Apellido" value={apellido} />
                      <Chip label="Documento" value={documento} />
                      {hasVehicle && !titularFromCarnet && !hasDriver && <Chip label="Placa" value={placa} />}
                    </div>
                  </div>
                  {titularFromCarnet && (
                    <div className="rounded-xl bg-amber-400/15 border border-amber-300/25 p-3">
                      <p className="text-[0.65rem] font-black uppercase tracking-widest text-amber-200 mb-2.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-300 inline-block" />
                        Titular · Propietario del carnet
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Chip label="Nombre" value={asegurado.nombre || '—'} color="amber" />
                        <Chip label="Apellido" value={asegurado.apellido || 'Completar'} color="amber" />
                        <Chip label="Documento" value={docCarnet || '—'} color="amber" />
                        {hasVehicle && <Chip label="Placa" value={placa} color="amber" />}
                      </div>
                    </div>
                  )}
                  {hasDriver && (
                    <div className="rounded-xl bg-violet-400/15 border border-violet-300/25 p-3">
                      <p className="text-[0.65rem] font-black uppercase tracking-widest text-violet-200 mb-2.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-300 inline-block" />
                        Conductor habitual · Licencia
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Chip label="Nombre" value={conductor.nombre || '—'} />
                        <Chip label="Apellido" value={conductor.apellido || 'Completar'} />
                        <Chip label="Documento" value={docConductor || '—'} />
                        <Chip label="Licencia" value={conductor.licencia || documents.licencia.ocr?.numeroLicencia} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Una fila: flujo normal ── */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Chip label="Nombre" value={nombre} />
                  <Chip label="Apellido" value={apellido} />
                  <Chip label="Documento" value={documento} />
                  {hasVehicle
                    ? <Chip label="Placa" value={placa} />
                    : <Chip label="Fecha nac." value={documents.cedula.ocr?.fechaNacimiento} />}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Preview modal */}
      <DocumentPreviewModal
        open={!!preview}
        file={preview?.file ?? null}
        title={preview?.title}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
