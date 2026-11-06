import { useState, useEffect, useCallback } from 'react';
import { useProductConfig } from '../hooks/useProductConfig';
import { getProductId } from '../lib/product';
import {
  Settings2, FileText, RotateCcw, Save, CheckCircle2,
  AlertTriangle, Loader2, Plus, Trash2, ArrowLeftRight, ChevronUp, Sparkles, Maximize,
  Network, Search, ScanLine
} from 'lucide-react';
import { moduleApiBase } from '../lib/app-base';
import { AuroraBackground } from '../components/AuroraBackground';
import { VisualTemplateBuilder } from './VisualTemplateBuilder';
import { readConfigPanelContext } from './configPanelContext';
import {
  DEFAULT_DOCS_DDC,
  DEFAULT_DOCS_DDS,
} from '../lib/diligencia';

const PANEL_CTX = readConfigPanelContext();
const EMPRESA_ID = PANEL_CTX.empresaId;

interface DocField {
  key: string;
  label: string;
  activo: boolean;
  obligatorio: boolean;
  sampleImage?: string;
  regions?: any[];
}

interface ApiMapEntry {
  internalKey: string;
  externalKey: string;
  transform?: string;
  note?: string;
}

type Tab = 'documentos' | 'mapeador' | 'visual' | 'canales';

interface CanalActor {
  ccanalalt: number;
  xcanalalt: string;
  ctipocanal: string | null;
}

interface GestorActor {
  cgestor: string;
  xgestor: string;
  ccanalalt: number | null;
  cscanalalt: number | null;
}

interface OcrOpcionalState {
  gestores: string[];
  canales: string[];
}

type ActoresLoad = 'idle' | 'loading' | 'ready' | 'error';

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-indigo-500' : 'bg-slate-300'}`}
      style={{ width: 40, height: 22 }}
    >
      <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : ''}`} style={{ width: 18, height: 18 }} />
    </button>
  );
}

export function OcrConfigPanel() {
  const producto = getProductId();

  const { config, loadState, saving, saveError, saveConfig, resetConfig } =
    useProductConfig(EMPRESA_ID, producto, 'ocr');

  const [docs, setDocs] = useState<DocField[]>([]);
  const [apiMap, setApiMap] = useState<ApiMapEntry[]>([]);
  const [tab, setTab] = useState<Tab>('documentos');
  const [saved, setSaved] = useState(false);
  const [newDoc, setNewDoc] = useState({ key: '', label: '', obligatorio: false });
  const [addingDoc, setAddingDoc] = useState(false);
  const [escaneoLoteBeneficiarios, setEscaneoLoteBeneficiarios] = useState(false);
  const [validarVigencia, setValidarVigencia] = useState(true);
  const [editingDocTemplate, setEditingDocTemplate] = useState<string | null>(null);
  const [uiPerProductor, setUiPerProductor] = useState<Record<string, Record<string, boolean>>>({});
  const [newProductorKey, setNewProductorKey] = useState('');
  const [ocrOpcional, setOcrOpcional] = useState<OcrOpcionalState>({ gestores: [], canales: [] });
  const [actores, setActores] = useState<{ canales: CanalActor[]; gestores: GestorActor[] }>({ canales: [], gestores: [] });
  const [actoresLoad, setActoresLoad] = useState<ActoresLoad>('idle');
  const [actoresError, setActoresError] = useState('');
  const [actorFilter, setActorFilter] = useState('');

  // Catálogo de actores Sis2000 (vía el server del módulo → server-api-sys).
  useEffect(() => {
    if (tab !== 'canales' || actoresLoad !== 'idle') return;
    setActoresLoad('loading');
    setActoresError('');
    fetch(`${moduleApiBase()}/catalog/actores`, {
      headers: PANEL_CTX.token ? { Authorization: `Bearer ${PANEL_CTX.token}` } : undefined,
    })
      .then(res => res.json())
      .then(data => {
        if (data?.success && data.data) {
          setActores({
            canales: Array.isArray(data.data.canales) ? data.data.canales : [],
            gestores: Array.isArray(data.data.gestores) ? data.data.gestores : [],
          });
          setActoresLoad('ready');
        } else {
          setActoresError(typeof data?.message === 'string' ? data.message : '');
          setActoresLoad('error');
        }
      })
      .catch(() => setActoresLoad('error'));
  }, [tab, actoresLoad]);

  const toggleOcrOpcional = useCallback((tipo: 'gestores' | 'canales', code: string, obligatorio: boolean) => {
    setOcrOpcional(prev => {
      const list = prev[tipo];
      // toggle ON = obligatorio → el código sale de la lista de opcionales.
      const next = obligatorio ? list.filter(c => c !== code) : (list.includes(code) ? list : [...list, code]);
      return { ...prev, [tipo]: next };
    });
    setSaved(false);
  }, []);

  const UI_FLAG_LABELS = [
    { key: 'hideHeader',      label: 'Ocultar cabecera (logo / marca)' },
    { key: 'hideStepper',     label: 'Ocultar barra de pasos' },
    { key: 'hideTrustBanner', label: 'Ocultar chips de confianza' },
    { key: 'hideFooterBar',   label: 'Ocultar barra inferior (TLS / Continuar)' },
  ];

  useEffect(() => {
    if (!config) return;
    const raw = config.documentos;
    if (Array.isArray(raw)) {
      setDocs(raw as DocField[]);
    } else if (raw && typeof raw === 'object') {
      setDocs(
        Object.entries(raw as Record<string, any>).map(([key, v]) => ({
          key,
          label: v.label ?? key,
          activo: !!v.activo,
          obligatorio: !!v.obligatorio,
          sampleImage: v.sampleImage,
          regions: v.regions,
        })),
      );
    }
    setApiMap((config.apiMap as ApiMapEntry[]) ?? []);
    setEscaneoLoteBeneficiarios(config.escaneoLoteBeneficiarios ?? false);
    setValidarVigencia(config.validarVigencia ?? true);
    setUiPerProductor((config.ui?.perProductor as Record<string, Record<string, boolean>>) ?? {});
    const oc = config.ocrOpcional as Partial<OcrOpcionalState> | undefined;
    setOcrOpcional({
      gestores: Array.isArray(oc?.gestores) ? oc!.gestores!.map(String) : [],
      canales: Array.isArray(oc?.canales) ? oc!.canales!.map(String) : [],
    });
  }, [config]);

  const updateDoc = useCallback((key: string, field: keyof DocField, val: any) => {
    setDocs(prev =>
      prev.map(d => {
        if (d.key !== key) return d;
        const next = { ...d, [field]: val };
        if (field === 'activo' && !val) next.obligatorio = false;
        if (field === 'obligatorio' && val) next.activo = true;
        return next;
      }),
    );
    setSaved(false);
  }, []);

  const removeDoc = (key: string) => {
    setDocs(prev => prev.filter(d => d.key !== key));
    setSaved(false);
  };

  const addDoc = () => {
    const key = newDoc.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key || !newDoc.label.trim()) return;
    if (docs.find(d => d.key === key)) return;
    setDocs(prev => [...prev, { key, label: newDoc.label.trim(), activo: true, obligatorio: newDoc.obligatorio }]);
    setNewDoc({ key: '', label: '', obligatorio: false });
    setAddingDoc(false);
    setSaved(false);
  };

  const addMapEntry = () => {
    setApiMap(prev => [...prev, { internalKey: '', externalKey: '', transform: 'none', note: '' }]);
    setSaved(false);
  };

  const updateMapEntry = (idx: number, field: keyof ApiMapEntry, val: string) => {
    setApiMap(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
    setSaved(false);
  };

  const removeMapEntry = (idx: number) => {
    setApiMap(prev => prev.filter((_, i) => i !== idx));
    setSaved(false);
  };

  async function handleSave() {
    const payload: Record<string, unknown> = {
      documentos: docs,
      apiMap,
      escaneoLoteBeneficiarios,
      validarVigencia,
      ui: { perProductor: uiPerProductor },
      ocrOpcional,
    };
    if (producto === 'rcv') {
      payload.documentosPorDiligencia = {
        S: DEFAULT_DOCS_DDS.map((d) => {
          const found = docs.find((x) => x.key === d.key);
          return found ?? d;
        }),
        C: DEFAULT_DOCS_DDC.map((d) => {
          const found = docs.find((x) => x.key === d.key);
          return found ?? d;
        }),
      };
    }
    await saveConfig(payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />

      <div className="pt-[40px] px-4 sm:px-6 lg:px-10 pb-12 w-full max-w-5xl mx-auto relative z-10">
        <header className="mb-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black tracking-[0.22em] text-indigo-500 uppercase mb-2 inline-flex items-center gap-1.5">
                <Sparkles size={11} className="text-indigo-500" />
                PARAMETRIZADOR · {producto}
              </p>
              <h1 className="font-display text-3xl sm:text-[2.5rem] font-black text-slate-900 tracking-tight leading-tight">
                Módulo OCR
              </h1>
              <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
                Configura los documentos requeridos para extracción automática y mapeo a la API.
              </p>
              <div className="mt-3 inline-flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                  canal: {PANEL_CTX.canal}
                </span>
                {PANEL_CTX.cproductor && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    cproductor: {PANEL_CTX.cproductor}
                  </span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-500/20">
              <Settings2 size={24} className="text-white" />
            </div>
          </div>
        </header>

        <section className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-xl rounded-3xl overflow-hidden animate-fade-in">
          <div className="p-6 sm:p-8 lg:p-10">
            {/* Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50 backdrop-blur-sm">
              {([['documentos', 'Documentos', FileText], ['mapeador', 'Mapeador API', ArrowLeftRight], ['visual', 'Visual SSO', Maximize], ['canales', 'OCR por canal', Network]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setTab(t as Tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === t ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                >
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>

            {loadState === 'loading' && (
              <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
                <Loader2 size={20} className="animate-spin" /><span className="text-sm">Cargando configuración...</span>
              </div>
            )}

            {loadState === 'error' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3 mb-4">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-amber-700 text-sm font-medium">No se pudo cargar la configuración. Se usan los valores por defecto.</p>
              </div>
            )}

            {loadState !== 'loading' && (
              <>
                {/* ── TAB DOCUMENTOS ── */}
                {tab === 'documentos' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 mb-6">
                      {producto === 'rcv' && (
                        <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                          <input type="checkbox" checked={validarVigencia} onChange={e => { setValidarVigencia(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                          <div>
                            <span className="text-sm text-slate-800 font-bold block mb-1">Validar vigencia de carnet</span>
                            <span className="text-xs text-slate-500">Rechazar automáticamente carnets de circulación vencidos durante la extracción OCR.</span>
                          </div>
                        </label>
                      )}
                      {producto === 'funerario' && (
                        <label className="flex items-start gap-3 cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
                          <input type="checkbox" checked={escaneoLoteBeneficiarios} onChange={e => { setEscaneoLoteBeneficiarios(e.target.checked); setSaved(false); }} className="rounded w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5" />
                          <div>
                            <span className="text-sm text-slate-800 font-bold block mb-1">Escaneo en lote (Beneficiarios)</span>
                            <span className="text-xs text-slate-500">Permitir a los usuarios escanear múltiples cédulas consecutivamente para registrar a su grupo familiar.</span>
                          </div>
                        </label>
                      )}
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Documentos OCR</p>
                      <button onClick={() => setAddingDoc(v => !v)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        {addingDoc ? <ChevronUp size={14} /> : <Plus size={14} />}{addingDoc ? 'Cancelar' : 'Agregar documento'}
                      </button>
                    </div>

                    {addingDoc && (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 space-y-4 mb-4 animate-fade-in shadow-inner">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Clave *</label>
                            <input className="w-full text-sm border border-indigo-100 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400 bg-white" placeholder="ej: cedula_identidad" value={newDoc.key} onChange={e => setNewDoc(p => ({ ...p, key: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Etiqueta visible *</label>
                            <input className="w-full text-sm border border-indigo-100 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 bg-white" placeholder="ej: Cédula de Identidad" value={newDoc.label} onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))} />
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={newDoc.obligatorio} onChange={e => setNewDoc(p => ({ ...p, obligatorio: e.target.checked }))} className="rounded w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                            <span className="text-sm text-slate-700 font-medium">Documento obligatorio</span>
                          </label>
                          <button onClick={addDoc} className="w-full sm:w-auto px-6 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all">✓ Guardar</button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {docs.map(doc => (
                        <div key={doc.key} className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center gap-4 transition-all duration-300 ${doc.activo ? 'border-slate-200 bg-white shadow-sm hover:shadow-md' : 'border-slate-200/50 bg-slate-50/50 opacity-60'}`}>
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 hidden md:flex">
                            <FileText size={18} className={doc.activo ? 'text-indigo-500' : 'text-slate-500'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <input
                              className="font-bold text-slate-800 text-base bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none w-full pb-0.5"
                              value={doc.label}
                              onChange={e => updateDoc(doc.key, 'label', e.target.value)}
                            />
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-500 font-mono">{doc.key}</span>
                              {doc.regions && doc.regions.length > 0 && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                  {doc.regions.length} zonas IA
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 w-full md:w-auto overflow-x-auto justify-between md:justify-end">
                            <button 
                              onClick={() => setEditingDocTemplate(doc.key)}
                              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1.5"
                            >
                              <Maximize size={12} /> Entrenar IA
                            </button>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">Activo</span>
                              <Toggle on={doc.activo} onChange={v => updateDoc(doc.key, 'activo', v)} />
                            </div>
                            <div className="w-px h-8 bg-slate-200" />
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-bold text-slate-500 uppercase">Oblig.</span>
                              <Toggle on={doc.obligatorio} onChange={v => updateDoc(doc.key, 'obligatorio', v)} disabled={!doc.activo} />
                            </div>
                            <div className="w-px h-8 bg-slate-200" />
                            <button onClick={() => removeDoc(doc.key)} className="p-2 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── TAB MAPEADOR ── */}
                {tab === 'mapeador' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Mapeador de campos API</p>
                        <p className="text-xs text-slate-500 mt-1">Traduce los campos leídos a la API destino.</p>
                      </div>
                      <button onClick={addMapEntry} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600/10 text-indigo-700 text-xs font-bold hover:bg-indigo-600/20 transition-colors">
                        <Plus size={14} /> Nueva regla
                      </button>
                    </div>

                    {apiMap.length === 0 && (
                      <div className="text-center py-12 text-slate-500 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                        No hay mapeos.
                      </div>
                    )}

                    <div className="space-y-3">
                      {apiMap.map((entry, idx) => (
                        <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-4 items-end shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo origen</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: doc_number" value={entry.internalKey} onChange={e => updateMapEntry(idx, 'internalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Campo destino (API)</label>
                            <input className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400" placeholder="ej: p_cedula" value={entry.externalKey} onChange={e => updateMapEntry(idx, 'externalKey', e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Transformación</label>
                            <select className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-indigo-400" value={entry.transform ?? 'none'} onChange={e => updateMapEntry(idx, 'transform', e.target.value)}>
                              <option value="none">Ninguna</option>
                              <option value="date_ddmmyyyy">Fecha DD/MM/YYYY</option>
                              <option value="strip_prefix">Quitar prefijos</option>
                            </select>
                          </div>
                          <button onClick={() => removeMapEntry(idx)} className="p-2.5 rounded-xl text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── TAB OCR POR CANAL ── */}
                {tab === 'canales' && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 text-sm text-indigo-700">
                      <p className="font-bold mb-1 flex items-center gap-1.5"><ScanLine size={14} /> OCR obligatorio u opcional por canal / gestor</p>
                      <p className="text-xs text-indigo-500">
                        Con el toggle <strong>activado</strong> el canal o gestor exige escanear los documentos (comportamiento actual).
                        Al <strong>desactivarlo</strong>, sus usuarios ven el paso OCR pero pueden <strong>continuar sin documentos</strong> y
                        cargar los datos a mano en el formulario. Todo actor nuevo entra como obligatorio.
                      </p>
                    </div>

                    {actoresLoad === 'loading' && (
                      <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
                        <Loader2 size={18} className="animate-spin" /><span className="text-sm">Cargando canales y gestores…</span>
                      </div>
                    )}

                    {actoresLoad === 'error' && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-amber-700 text-sm font-medium">{actoresError || 'No se pudo cargar el catálogo de canales/gestores del Core.'}</p>
                        </div>
                        <button
                          onClick={() => setActoresLoad('idle')}
                          className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shrink-0"
                        >
                          Reintentar
                        </button>
                      </div>
                    )}

                    {actoresLoad === 'ready' && (
                      <>
                        <div className="relative">
                          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            className="w-full text-sm border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 outline-none focus:border-indigo-400 bg-white"
                            placeholder="Buscar por nombre o código…"
                            value={actorFilter}
                            onChange={e => setActorFilter(e.target.value)}
                          />
                        </div>

                        {(() => {
                          const MAX_ROWS = 50;
                          const f = actorFilter.trim().toLowerCase();

                          const canalRow = (c: CanalActor) => ({
                            code: String(c.ccanalalt),
                            nombre: c.xcanalalt,
                            detalle: `ccanalalt ${c.ccanalalt}`,
                          });
                          const gestorRow = (g: GestorActor) => ({
                            code: g.cgestor,
                            nombre: g.xgestor,
                            detalle: `cgestor ${g.cgestor}${g.ccanalalt != null ? ` · canal ${g.ccanalalt}` : ''}`,
                          });

                          // Los marcados como opcionales siempre se muestran; el resto según el buscador,
                          // con tope de filas (hay miles de gestores).
                          const buildRows = <T,>(
                            all: T[],
                            marked: (x: T) => boolean,
                            matches: (x: T, f: string) => boolean,
                            toRow: (x: T) => { code: string; nombre: string; detalle: string },
                            requireFilter: boolean,
                          ) => {
                            const fijos = all.filter(marked).map(toRow);
                            const seen = new Set(fijos.map(r => r.code));
                            let resto: T[] = [];
                            let truncated = 0;
                            if (f) {
                              const found = all.filter(x => !marked(x) && matches(x, f));
                              truncated = Math.max(0, found.length - MAX_ROWS);
                              resto = found.slice(0, MAX_ROWS);
                            } else if (!requireFilter) {
                              resto = all.filter(x => !marked(x));
                            }
                            return {
                              rows: [...fijos, ...resto.map(toRow).filter(r => !seen.has(r.code))],
                              truncated,
                              needsFilter: requireFilter && !f,
                            };
                          };

                          const secciones = [
                            {
                              titulo: 'Canales alternos',
                              tipo: 'canales' as const,
                              total: actores.canales.length,
                              ...buildRows(
                                actores.canales,
                                c => ocrOpcional.canales.includes(String(c.ccanalalt)),
                                (c, q) => c.xcanalalt.toLowerCase().includes(q) || String(c.ccanalalt).includes(q),
                                canalRow,
                                false,
                              ),
                            },
                            {
                              titulo: 'Gestores',
                              tipo: 'gestores' as const,
                              total: actores.gestores.length,
                              ...buildRows(
                                actores.gestores,
                                g => ocrOpcional.gestores.includes(g.cgestor),
                                (g, q) => g.xgestor.toLowerCase().includes(q) || g.cgestor.toLowerCase().includes(q),
                                gestorRow,
                                true,
                              ),
                            },
                          ];

                          return secciones.map(({ titulo, tipo, rows, total, truncated, needsFilter }) => (
                          <div key={tipo}>
                            <div className="flex items-center justify-between mb-3 mt-2">
                              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{titulo}</p>
                              <span className="text-[11px] font-semibold text-slate-400">
                                {ocrOpcional[tipo].length > 0
                                  ? `${ocrOpcional[tipo].length} con OCR opcional`
                                  : 'Todos obligatorios'}
                              </span>
                            </div>
                            {rows.length === 0 && (
                              <div className="text-center py-8 text-slate-400 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                                {needsFilter
                                  ? `Usa el buscador para encontrar entre los ${total.toLocaleString('es-VE')} gestores (por nombre o código).`
                                  : 'Sin resultados.'}
                              </div>
                            )}
                            <div className="space-y-2">
                              {rows.map(({ code, nombre, detalle }) => {
                                const obligatorio = !ocrOpcional[tipo].includes(code);
                                return (
                                  <div
                                    key={code}
                                    className={`rounded-2xl border p-3.5 flex items-center gap-4 transition-all ${obligatorio ? 'border-slate-200 bg-white shadow-sm' : 'border-indigo-200 bg-indigo-50/40'}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-slate-800 text-sm truncate">{nombre || code}</p>
                                      <p className="text-xs text-slate-500 font-mono">{detalle}</p>
                                    </div>
                                    {!obligatorio && (
                                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold shrink-0">
                                        OCR opcional
                                      </span>
                                    )}
                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                      <span className="text-[9px] font-bold text-slate-500 uppercase">Obligatorio</span>
                                      <Toggle on={obligatorio} onChange={v => toggleOcrOpcional(tipo, code, v)} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {truncated > 0 && (
                              <p className="mt-2 text-center text-[11px] text-slate-400">
                                {truncated.toLocaleString('es-VE')} resultado(s) más — refina la búsqueda.
                              </p>
                            )}
                            {rows.length > 0 && needsFilter && (
                              <p className="mt-2 text-center text-[11px] text-slate-400">
                                Mostrando solo los marcados. Usa el buscador para ver los {total.toLocaleString('es-VE')} gestores.
                              </p>
                            )}
                          </div>
                          ));
                        })()}
                      </>
                    )}
                  </div>
                )}

                {/* ── TAB VISUAL SSO ── */}
                {tab === 'visual' && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 text-sm text-indigo-700">
                      <p className="font-bold mb-1">Control visual por productor SSO</p>
                      <p className="text-xs text-indigo-500">La barra de pasos se oculta sola en cualquier invocación SSO / iframe. Estos toggles sirven para ocultar cabecera, chips o pie por <code>cproductor</code> adicional. El integrador no necesita cambiar nada.</p>
                    </div>

                    {/* Agregar productor */}
                    <div className="flex gap-2">
                      <input
                        className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 font-mono outline-none focus:border-indigo-400"
                        placeholder="cproductor (ej: 123)"
                        value={newProductorKey}
                        onChange={e => setNewProductorKey(e.target.value.replace(/\D/g, ''))}
                      />
                      <button
                        onClick={() => {
                          const k = newProductorKey.trim();
                          if (!k || uiPerProductor[k]) return;
                          setUiPerProductor(prev => ({ ...prev, [k]: {} }));
                          setNewProductorKey('');
                          setSaved(false);
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {Object.keys(uiPerProductor).length === 0 && (
                      <div className="text-center py-12 text-slate-400 text-sm rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                        Sin productores configurados. Agrega el <code>cproductor</code> para personalizar su UI.
                      </div>
                    )}

                    {Object.entries(uiPerProductor).map(([cp, flags]) => (
                      <div key={cp} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-800 font-mono">Productor <span className="text-indigo-600">#{cp}</span></p>
                          <button
                            onClick={() => {
                              const next = { ...uiPerProductor };
                              delete next[cp];
                              setUiPerProductor(next);
                              setSaved(false);
                            }}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {UI_FLAG_LABELS.map(({ key, label }) => (
                            <label key={key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                              <span className="text-sm text-slate-700">{label}</span>
                              <Toggle
                                on={!!flags[key]}
                                onChange={v => {
                                  setUiPerProductor(prev => ({
                                    ...prev,
                                    [cp]: { ...prev[cp], [key]: v },
                                  }));
                                  setSaved(false);
                                }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {loadState !== 'loading' && (
            <div className="px-6 sm:px-8 lg:px-10 py-5 bg-slate-50/80 border-t border-slate-100 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              {saveError && (
                <div className="w-full sm:w-auto flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-4 py-2 rounded-xl">
                  <AlertTriangle size={14} />{saveError}
                </div>
              )}
              <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
                <button onClick={() => { if (confirm('¿Restaurar originales?')) resetConfig(); }} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm">
                  <RotateCcw size={15} /> Restaurar defaults
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-8 rounded-xl font-bold text-sm bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-50">
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle2 size={16} /> ¡Guardado!</> : <><Save size={16} /> Guardar cambios</>}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {editingDocTemplate && (
        <VisualTemplateBuilder
          doc={docs.find(d => d.key === editingDocTemplate)!}
          onClose={() => setEditingDocTemplate(null)}
          onSave={(sampleImage, regions) => {
            updateDoc(editingDocTemplate, 'sampleImage', sampleImage);
            updateDoc(editingDocTemplate, 'regions', regions);
            setEditingDocTemplate(null);
          }}
        />
      )}
    </div>
  );
}
