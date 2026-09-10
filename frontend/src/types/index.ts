export type DocType =
  | 'cedula'
  | 'cedula_titular'
  | 'cedula_beneficiario'
  | 'licencia'
  | 'certificado'
  | 'rif'
  | 'pasaporte'
  | 'factura';

export type { DiligenciaState, TipoDiligencia } from '../lib/diligencia';

/** Producto de seguro que se está suscribiendo en el flujo. */
export type ProductId = 'rcv' | 'funerario';

export type DocStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface DocumentFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

export interface OcrResult {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  fechaNacimiento?: string;
  sexo?: string;
  estadoCivil?: string;
  numeroLicencia?: string;
  categoria?: string;
  vencimiento?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  /** Alias usado por OCR carnet binacional (Colombia). */
  linea?: string;
  anio?: string;
  año?: string;
  serial?: string;
  serialMotor?: string;
  cilindrada?: string;
  tipoCarnet?: 'nacional' | 'binacional';
  tipoPlaca?: 'nacional' | 'extranjera' | 'binacional';
  color?: string;
  rif?: string;
  razonSocial?: string | null;
  propietario?: string;
  identificacionPropietario?: string;
  tipoDocPropietario?: string;
  propietarioNombre?: string;
  propietarioApellido?: string;
  propietarioIdentificacion?: string;
  nfactura?: string;
}

export interface DocumentState {
  status: DocStatus;
  progress: number;
  file?: DocumentFile;
  ocr?: OcrResult;
  error?: string;
  /** SHA-256 del archivo subido (Circular SAA-02-1079-2026). */
  hash?: string;
}

export type TomadorData = {
  tipoDoc: string;
  identificacion: string;
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  email2: string;
  fechaNac: string;
  sexo: string;
  estadoCivil: string;
  estado: string;
  ciudad: string;
  direccion: string;
  /** Declara ser Persona Políticamente Expuesta (requerido por La Mundial). */
  personaPoliticamenteExpuesta: boolean;
  /** Código numérico La Mundial del estado (cestado). Se obtiene del selector de catálogo. */
  cestado?: number;
  /** Código numérico La Mundial de la ciudad (cciudad). Se obtiene del selector de catálogo. */
  cciudad?: number;
};

export type PersonData = {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc?: string;
  fechaNac?: string;
  parentesco?: string;
  pporcen?: number;
  licencia?: string;
  relacion?: string;
  telefono?: string;
  email?: string;
};

export interface Plan {
  /** Código del plan en Sis2000 (ej. "RCVBAS", "Auto"). Se envía al backend en quote/emit. */
  cplan?: string;
  name: string;
  price: string;
  priceNum: number;
  tag: string;
  desc: string;
  benefits: string[];
  /** Suma asegurada (USD) — máximo cubierto por la póliza */
  sumaAsegurada: number;
  /** Sufijo opcional para la suma asegurada (ej. "/unidad") */
  sumaAseguradaUnit?: string;
}

export type PaymentMethod = 'card' | 'transfer' | 'mobile' | 'otp';

export interface VehicleData {
  placa: string;
  /** Tipo de placa: nacional (VE), extranjera u binacional (Colombia). */
  tipoPlaca: 'nacional' | 'extranjera' | 'binacional';
  marca: string;   // nombre descriptivo (ej. "TOYOTA") — para display
  modelo: string;  // nombre descriptivo (ej. "COROLLA") — para display
  año: string;
  color: string;
  serial: string;
  uso: string;
  /** Código INMA de marca (ej. "074") — set al elegir en selector de catálogo */
  cmarca?: string;
  /** Código INMA de modelo (ej. "005") — set al elegir en selector de catálogo */
  cmodelo?: string;
  /** Código INMA de versión (ej. "05") — set al elegir en selector de catálogo */
  cversion?: string;
  /** Uso tarifario de la versión INMA (ccategotr) — se matchea con ccategoria_uso */
  ccategotr?: number | string;
  /** Código La Mundial de categoría de uso (numérico) — set por getCategoriasUso al elegir versión */
  ccategoria_uso?: number | string;
  /** Etiqueta legible de la categoría de uso (ej. "Auto particular") — para display */
  xcategoria_uso?: string;
  /** Tipo de vehículo INMA (1=particular, 2=rústico, 3=carga…) — set al elegir versión. Usado en planesRcv. */
  ctipo?: number;
  /** Serial del motor — opcional, máx. 60 caracteres. Aparece en el documento del vehículo. */
  serialMotor?: string;
  /** Cilindrada CC (carnet binacional Colombia). */
  cilindrada?: string;
  /** Variante del carnet OCR: nacional (VE) o binacional (CO). */
  tipoCarnet?: 'nacional' | 'binacional';
  /** Peso del vehículo en toneladas (nullable; default 60 en backend si no se envía). */
  ntoneladas?: number;
}

export interface PolicyQuote {
  /** Prima anual en bolivares (VES). */
  mprima: number;
  /** Prima anual en dolares (USD). */
  mprimaext: number;
  /** Tasa de cambio Bs/USD usada en la cotizacion. */
  ptasa: number;
  /** Etiqueta legible del vehiculo cotizado (ej. "TOYOTA / COROLLA"). */
  vehicleLabel?: string;
  /** Indica si La Mundial uso el catalogo por defecto (vehiculo no encontrado). */
  vehicleFallback?: boolean;
}

export type QuoteState = 'idle' | 'loading' | 'ready' | 'error';

export interface IssuedPolicy {
  /** Numero de poliza La Mundial (ej. "18-1-0000048127"). Tambien expuesto como `number`. */
  number: string;
  cnpoliza: string;
  /** Numero de recibo La Mundial (ej. "18-100143232"). */
  cnrecibo?: string;
  /** URL al PDF emitido por La Mundial. */
  urlpoliza?: string;
  /** Identificador interno (no es el numero oficial). */
  internalPolicyId?: string;
  ncuota?: number;
  emittedAt: string;
  quote?: PolicyQuote;
}

export interface WizardState {
  step: number;
  /** Producto activo del flujo (rcv | funerario). Se propaga entre módulos. */
  product: ProductId;
  /** Producto del catálogo Exélixi (product-builder) cuando VITE_USE_BUILDER_CATALOG está activo. */
  builderProduct: import('./builder-catalog').BuilderCatalogProduct | null;
  documents: Record<DocType, DocumentState>;
  ocrDone: boolean;
  tomador: TomadorData;
  sameInsured: boolean;
  asegurado: PersonData;
  /** True cuando quien rellena el formulario NO es quien va a pagar la póliza. */
  differentPayer: boolean;
  /** Datos del pagador alternativo cuando differentPayer = true. */
  pagador: PersonData;
  hasBeneficiary: boolean;
  beneficiario: PersonData;
  hasDriver: boolean;
  conductor: PersonData;
  vehicle: VehicleData;
  category: string;
  selectedPlan: Plan | null;
  paymentMethod: PaymentMethod;
  policy: IssuedPolicy | null;
  /** Cotizacion vigente desde La Mundial (mprima/mprimaext/ptasa). */
  quote: PolicyQuote | null;
  /** Estado de la cotizacion para feedback en UI. */
  quoteState: QuoteState;
  /** Mensaje de error de la cotizacion (si quoteState === 'error'). */
  quoteError: string | null;
  /** Snapshot del vehiculo con el que se hizo la ultima cotizacion. Sirve para
   *  invalidar la quote si cambian datos relevantes (placa, marca, modelo, año, uso). */
  quoteVehicleSignature: string | null;
  /** Datos dinámicos del canal (SSO Delegate) para emisión dinámica */
  metadataCanal: Record<string, any> | null;
  /** Carnet colombiano/binacional detectado — solo certificado obligatorio. */
  carnetBinacionalMode: boolean;
  /** Circular SAA-02-1079-2026 — clasificación DDS/DDC y docs requeridos. */
  diligencia: import('../lib/diligencia').DiligenciaState | null;
  /**
   * true cuando la cédula/licencia y el carnet del vehículo pertenecen a personas
   * distintas (detectado en OcrStep). En ese caso:
   *   - tomador = datos de la cédula
   *   - asegurado (titular de la póliza) = datos del carnet (precargados, editables)
   *   - conductor habitual = datos de la licencia cuando cédula ≠ licencia
   *   - sameInsured = false
   */
  titularFromCarnet: boolean;
  /** Flujo RCV por tarjeta de farmacia. Null en el RCV normal. */
  tarjeta: import('../features/activacion-tarjeta/types').TarjetaActivacion | null;
}
