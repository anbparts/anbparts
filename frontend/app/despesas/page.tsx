'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartPanel, ColumnChart, DonutChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';
import { useFinancialViewportMode } from '@/lib/company-values';

const CATEGORIAS = ['Insumo', 'Servicos', 'Taxas', 'Aluguel', 'Sistemas', 'Imposto', 'Moto', 'Outros'];
const RECORRENCIAS = [
  { value: 'nenhuma', label: 'Nao repetir' },
  { value: 'semanal', label: 'Semanalmente' },
  { value: 'mensal', label: 'Mensalmente' },
] as const;
const MESES = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Date(Date.UTC(2026, index, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }),
}));
const STATUS_COLORS: Record<string, string> = {
  pago: 'var(--green)',
  pendente: 'var(--red)',
};
const CATEG_COLORS: Record<string, string> = {
  Insumo: '#2563eb',
  Servicos: '#f59e0b',
  Taxas: '#ef4444',
  Aluguel: '#64748b',
  Sistemas: '#0ea5e9',
  Imposto: '#7c3aed',
  Contador: '#475569',
  Moto: '#16a34a',
  Outros: '#8b5cf6',
};

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function parseInputDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToInputDate(value: string, days: number) {
  const date = parseInputDate(value);
  date.setDate(date.getDate() + days);
  return formatInputDate(date);
}

function addMonthsToInputDate(value: string, months: number) {
  const current = parseInputDate(value);
  const day = current.getDate();
  const base = new Date(current.getFullYear(), current.getMonth() + months, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return formatInputDate(new Date(base.getFullYear(), base.getMonth(), Math.min(day, lastDay)));
}

function currentYear() {
  return String(new Date().getFullYear());
}

function currentMonth() {
  return String(new Date().getMonth() + 1);
}

function monthKey(dateValue: string) {
  const key = dateKey(dateValue);
  return key ? key.slice(0, 7) : '';
}

function monthLabel(dateValue: string) {
  const key = dateKey(dateValue);
  if (!key) return '';
  const [year, month] = key.split('-');
  const date = new Date(`${year}-${month}-01T00:00:00.000Z`);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
}

function dateKey(value: any) {
  if (!value) return '';
  return new Date(value).toISOString().split('T')[0];
}

function formatDateBr(value: any) {
  const key = dateKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTimeBr(value: any) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR');
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function recurrenceLabel(tipo: string) {
  if (tipo === 'mensal') return 'Mensal';
  if (tipo === 'semanal') return 'Semanal';
  return '';
}

function CategBadge({ categoria }: { categoria: string }) {
  const color = CATEG_COLORS[categoria] || '#64748b';
  return (
    <span
      style={{
        background: `${color}18`,
        color,
        padding: '2px 10px',
        borderRadius: 99,
        fontSize: 11,
        fontFamily: 'Geist Mono, monospace',
        fontWeight: 500,
      }}
    >
      {categoria}
    </span>
  );
}

function StatusBadge({ status, onClick }: { status: 'pago' | 'pendente'; onClick: () => void }) {
  const color = STATUS_COLORS[status];
  const background = status === 'pago' ? '#ecfdf3' : '#fef2f2';
  const border = status === 'pago' ? '#86efac' : '#fecaca';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background,
        color,
        border: `1px solid ${border}`,
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {status === 'pago' ? 'Pago' : 'Pendente'}
    </button>
  );
}

function InfoPill({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      style={{
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        background: 'var(--gray-50)',
        border: '1px solid var(--border)',
        color: 'var(--gray-700)',
        cursor: 'help',
      }}
    >
      {label}
    </span>
  );
}

function FileButton({ label, dataUrl, fileName }: { label: string; dataUrl?: string | null; fileName?: string | null }) {
  if (!dataUrl) return <span style={{ color: 'var(--gray-300)' }}>-</span>;
  return (
    <button
      type="button"
      onClick={() => downloadDataUrl(dataUrl, fileName || `${label}.pdf`)}
      style={{
        border: '1px solid var(--border)',
        background: 'var(--white)',
        color: 'var(--blue-500)',
        borderRadius: 7,
        padding: '4px 9px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function PaymentModal({
  despesa,
  onClose,
  onConfirm,
}: {
  despesa: any;
  onClose: () => void;
  onConfirm: (payload: { statusPagamento: 'pago' | 'pendente'; dataPagamento?: string | null; comprovante?: { name: string; dataUrl: string } | null }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(despesa.dataPagamento ? String(despesa.dataPagamento).split('T')[0] : today());
  const [comprovante, setComprovante] = useState<{ name: string; dataUrl: string } | null>(null);

  async function handleComprovanteChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setComprovante({ name: file.name, dataUrl });
  }

  async function confirmarPago() {
    setSaving(true);
    try {
      await onConfirm({ statusPagamento: 'pago', dataPagamento, comprovante });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function reverterPendente() {
    if (!confirm('Reverter esta despesa para pendente?')) return;
    setSaving(true);
    try {
      await onConfirm({ statusPagamento: 'pendente', dataPagamento: null, comprovante: null });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
      <div style={{ width: 'min(620px, 100%)', background: 'var(--white)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(15,23,42,.18)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Pagamento da despesa</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{despesa.detalhes}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: 'var(--gray-700)' }}>X</button>
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Status atual</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: STATUS_COLORS[despesa.statusPagamento] }}>{despesa.statusPagamento === 'pago' ? 'Pago' : 'Pendente'}</div>
            </div>
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Valor</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--red)' }}>{fmt(Number(despesa.valor || 0))}</div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 6 }}>Data do pagamento</label>
            <input
              type="date"
              value={dataPagamento}
              onChange={(event) => setDataPagamento(event.target.value)}
              style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 6 }}>Comprovante do pagamento</label>
            <input type="file" accept=".pdf,image/*" onChange={handleComprovanteChange} />
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>
              {comprovante?.name || despesa.comprovanteNome || 'Nenhum comprovante anexado'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0 22px 22px' }}>
          <div>
            {despesa.statusPagamento === 'pago' && (
              <button type="button" onClick={reverterPendente} disabled={saving} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: 'var(--red)', fontWeight: 700, cursor: 'pointer' }}>
                Reverter para pendente
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
            <button type="button" onClick={confirmarPago} disabled={saving} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid transparent', background: 'var(--blue-500)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Salvando...' : despesa.statusPagamento === 'pago' ? 'Atualizar pagamento' : 'Confirmar como pago'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteRecurringModal({
  despesa,
  futureCount,
  onClose,
  onDeleteSingle,
  onDeleteFutureSeries,
}: {
  despesa: any;
  futureCount: number;
  onClose: () => void;
  onDeleteSingle: () => Promise<void>;
  onDeleteFutureSeries: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSingle() {
    setSaving(true);
    try {
      await onDeleteSingle();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleFutureSeries() {
    setSaving(true);
    try {
      await onDeleteFutureSeries();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
      <div style={{ width: 'min(560px, 100%)', background: 'var(--white)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(15,23,42,.18)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Excluir despesa recorrente</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{despesa.detalhes}</div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: 'var(--gray-700)' }}>X</button>
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Encontramos <strong>{futureCount}</strong> lancamento(s) futuro(s) da mesma serie a partir desta despesa.
          </div>
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Serie</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{recurrenceLabel(despesa.recorrenciaTipo)} ate {formatDateBr(despesa.recorrenciaFim)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0 22px 22px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleSingle} disabled={saving} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: 'var(--red)', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Excluindo...' : 'Somente este lancamento'}
            </button>
            <button type="button" onClick={handleFutureSeries} disabled={saving} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid transparent', background: 'var(--blue-500)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Excluindo...' : 'Este + futuros da serie'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DespesasPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroAno, setFiltroAno] = useState(currentYear());
  const [filtroMes, setFiltroMes] = useState(currentMonth());
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [origemForm, setOrigemForm] = useState<'manual' | 'arquivo'>('manual');
  const [editingDespesaId, setEditingDespesaId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [solicitandoRelatorioMp, setSolicitandoRelatorioMp] = useState(false);
  const [analisandoCsvMp, setAnalisandoCsvMp] = useState(false);
  const [importandoCsvMp, setImportandoCsvMp] = useState(false);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [pagamentoDespesa, setPagamentoDespesa] = useState<any | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<{ despesa: any; futureCount: number } | null>(null);
  const [mercadoPagoAte, setMercadoPagoAte] = useState(today());
  const [arquivoMercadoPago, setArquivoMercadoPago] = useState<{ name: string; dataUrl: string } | null>(null);
  const [previewMercadoPagoInfo, setPreviewMercadoPagoInfo] = useState<any | null>(null);
  const [previewMercadoPagoRows, setPreviewMercadoPagoRows] = useState<any[]>([]);
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isCompact = isPhone || isTabletPortrait;
  const [form, setForm] = useState({
    data: today(),
    detalhes: '',
    categoria: 'Insumo',
    valor: '',
    recorrenciaTipo: 'nenhuma',
    recorrenciaAte: '',
    chavePix: '',
    codigoBarras: '',
    observacao: '',
    anexo: null as { name: string; dataUrl: string } | null,
  });

  function resetManualForm() {
    setEditingDespesaId(null);
    setForm({
      data: today(),
      detalhes: '',
      categoria: 'Insumo',
      valor: '',
      recorrenciaTipo: 'nenhuma',
      recorrenciaAte: '',
      chavePix: '',
      codigoBarras: '',
      observacao: '',
      anexo: null,
    });
  }

  function startEditDespesa(item: any) {
    setEditingDespesaId(Number(item.id));
    setOrigemForm('manual');
    setForm({
      data: item.data ? dateKey(item.data) : today(),
      detalhes: item.detalhes || '',
      categoria: item.categoria || 'Outros',
      valor: String(Number(item.valor || 0)),
      recorrenciaTipo: item.recorrenciaTipo || 'nenhuma',
      recorrenciaAte: item.recorrenciaFim ? dateKey(item.recorrenciaFim) : '',
      chavePix: item.chavePix || '',
      codigoBarras: item.codigoBarras || '',
      observacao: item.observacao || '',
      anexo: item.anexoArquivo ? { name: item.anexoNome || 'anexo', dataUrl: item.anexoArquivo } : null,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleFormVisibility() {
    if (showForm) {
      setShowForm(false);
      setEditingDespesaId(null);
      return;
    }
    resetManualForm();
    setOrigemForm('manual');
    setShowForm(true);
  }

  const inputStyle: any = {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    color: 'var(--ink)',
  };

  async function load() {
    setLoading(true);
    try {
      const data = await api.financeiro.despesas.list();
      setRows(data);
      setSelectedRowIds((current) => current.filter((id) => data.some((item: any) => Number(item.id) === id)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const anos = Array.from(new Set(
    rows.map((item) => Number(dateKey(item.data).slice(0, 4))).filter((ano) => Number.isFinite(ano)),
  )).sort((a, b) => b - a);

  const filtradas = rows.filter((item) => {
    const ano = Number(dateKey(item.data).slice(0, 4));
    const mes = Number(dateKey(item.data).slice(5, 7));
    return (!filtroCategoria || item.categoria === filtroCategoria)
      && (!filtroStatus || item.statusPagamento === filtroStatus)
      && (!filtroAno || ano === Number(filtroAno))
      && (!filtroMes || mes === Number(filtroMes));
  });

  const filteredRowIds = filtradas
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const selectedFilteredIds = filteredRowIds.filter((id) => selectedRowIds.includes(id));
  const allFilteredSelected = filteredRowIds.length > 0 && selectedFilteredIds.length === filteredRowIds.length;

  const total = filtradas.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalPendentes = filtradas.filter((item) => item.statusPagamento === 'pendente').length;
  const totalPagas = filtradas.filter((item) => item.statusPagamento === 'pago').length;
  const totalValorPago = filtradas.filter((item) => item.statusPagamento === 'pago').reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalValorPendente = filtradas.filter((item) => item.statusPagamento === 'pendente').reduce((sum, item) => sum + Number(item.valor || 0), 0);

  const porCategoriaMap = new Map<string, number>();
  const porMesMap = new Map<string, { label: string; value: number }>();

  filtradas.forEach((item) => {
    const categoria = item.categoria || 'Outros';
    const valor = Number(item.valor || 0);
    porCategoriaMap.set(categoria, (porCategoriaMap.get(categoria) || 0) + valor);

    const key = monthKey(item.data);
    const current = porMesMap.get(key) || { label: monthLabel(item.data), value: 0 };
    current.value += valor;
    porMesMap.set(key, current);
  });

  const categoriasOrdenadas = Array.from(porCategoriaMap.entries())
    .map(([label, value]) => ({
      label,
      value,
      color: CATEG_COLORS[label],
      note: `${((value / Math.max(total, 1)) * 100).toFixed(1).replace('.', ',')}%`,
    }))
    .sort((a, b) => b.value - a.value);

  const linhaTempo = Array.from(porMesMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value)
    .slice(-8);

  async function handleAnexoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setForm((current) => ({ ...current, anexo: { name: file.name, dataUrl } }));
  }

  async function handleArquivoMercadoPagoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setArquivoMercadoPago({ name: file.name, dataUrl });
  }

  async function salvar() {
    if (!form.detalhes || !form.valor) return;
    setSaving(true);
    try {
      const payload = {
        data: form.data,
        detalhes: form.detalhes,
        categoria: form.categoria,
        valor: Number(form.valor),
        recorrenciaTipo: form.recorrenciaTipo,
        recorrenciaAte: form.recorrenciaTipo !== 'nenhuma' ? form.recorrenciaAte || null : null,
        chavePix: form.chavePix || null,
        codigoBarras: form.codigoBarras || null,
        observacao: form.observacao || null,
        anexo: form.anexo,
      };
      if (editingDespesaId) {
        await api.financeiro.despesas.update(editingDespesaId, payload);
        alert('Despesa atualizada.');
      } else {
        const response = await api.financeiro.despesas.create(payload);
        if (Number(response?.totalCriadas || 1) > 1) {
          alert(`Serie criada com ${response.totalCriadas} lancamentos.`);
        }
      }
      resetManualForm();
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function solicitarRelatorioMercadoPago() {
    setSolicitandoRelatorioMp(true);
    try {
      const response = await api.financeiro.despesas.solicitarRelatorioMercadoPago({ ate: mercadoPagoAte });
      alert(response?.detail || 'Solicitacao enviada ao Mercado Pago. O CSV pode chegar por email em alguns minutos.');
    } finally {
      setSolicitandoRelatorioMp(false);
    }
  }

  async function analisarArquivoMercadoPago() {
    if (!arquivoMercadoPago) {
      alert('Selecione o CSV do Mercado Pago antes de analisar.');
      return;
    }

    setAnalisandoCsvMp(true);
    try {
      const response = await api.financeiro.despesas.previewImportacaoMercadoPago({
        fileName: arquivoMercadoPago.name,
        dataUrl: arquivoMercadoPago.dataUrl,
      });

      setPreviewMercadoPagoInfo(response);
      setPreviewMercadoPagoRows(
        (response?.rows || []).map((item: any) => ({
          ...item,
          selected: false,
          categoria: item.importacaoExistente?.categoria || '',
          detalhes: item.importacaoExistente?.detalhes || item.detalhesSugeridos || item.descriptionOriginal || 'Movimentacao Mercado Pago',
        })),
      );

      if (!response?.rows?.length) {
        alert('O CSV foi lido, mas nao encontramos saídas negativas para revisar.');
      }
    } finally {
      setAnalisandoCsvMp(false);
    }
  }

  function atualizarLinhaMercadoPago(importKey: string, patch: Record<string, any>) {
    setPreviewMercadoPagoRows((current) => current.map((item) => (
      item.importKey === importKey ? { ...item, ...patch } : item
    )));
  }

  function marcarTodasLinhasMercadoPago(selected: boolean) {
    setPreviewMercadoPagoRows((current) => current.map((item) => (
      item.jaImportada ? item : { ...item, selected }
    )));
  }

  async function importarSelecionadasMercadoPago() {
    const selecionadas = previewMercadoPagoRows.filter((item) => item.selected && !item.jaImportada);
    if (!selecionadas.length) {
      alert('Selecione pelo menos uma linha para importar como despesa.');
      return;
    }

    const semCategoria = selecionadas.find((item) => !String(item.categoria || '').trim());
    if (semCategoria) {
      alert('Selecione a categoria de todas as linhas marcadas antes de importar.');
      return;
    }

    const semDetalhes = selecionadas.find((item) => !String(item.detalhes || '').trim());
    if (semDetalhes) {
      alert('Preencha os detalhes de todas as linhas marcadas antes de importar.');
      return;
    }

    setImportandoCsvMp(true);
    try {
      const response = await api.financeiro.despesas.importarMercadoPagoCsv({
        itens: selecionadas.map((item) => ({
          data: item.data,
          dataHora: item.dataHora,
          detalhes: item.detalhes,
          categoria: item.categoria,
          valor: Number(item.valor || 0),
          fileName: item.fileName,
          sourceId: item.sourceId,
          descriptionOriginal: item.descriptionOriginal,
          valorAssinado: Number(item.valorAssinado || 0),
        })),
      });

      alert(`Importacao concluida. ${response.imported || 0} despesa(s) criada(s) e ${response.skipped || 0} linha(s) ignorada(s).`);

      setPreviewMercadoPagoRows((current) => current.map((item) => (
        item.selected && !item.jaImportada
          ? {
              ...item,
              selected: false,
              jaImportada: true,
              importacaoExistente: {
                detalhes: item.detalhes,
                categoria: item.categoria,
                data: item.data,
                valor: item.valor,
              },
            }
          : item
      )));

      await load();
    } finally {
      setImportandoCsvMp(false);
    }
  }

  function futureSeriesCount(item: any) {
    if (!item?.recorrenciaSerieId) return 0;
    const currentTime = new Date(item.data).getTime();
    return rows.filter((row) => row.recorrenciaSerieId === item.recorrenciaSerieId && new Date(row.data).getTime() > currentTime).length;
  }

  async function excluir(id: number, scope: 'single' | 'future_series' = 'single') {
    await api.financeiro.despesas.delete(id, scope);
    setSelectedRowIds((current) => current.filter((itemId) => itemId !== id));
    await load();
  }

  function toggleDespesaSelecionada(id: number, checked: boolean) {
    setSelectedRowIds((current) => (
      checked
        ? Array.from(new Set([...current, id]))
        : current.filter((itemId) => itemId !== id)
    ));
  }

  function selecionarTodasFiltradas(checked: boolean) {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      filteredRowIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return Array.from(next);
    });
  }

  async function excluirSelecionadas() {
    if (!selectedFilteredIds.length) {
      alert('Selecione pelo menos uma despesa no filtro atual.');
      return;
    }

    if (!confirm(`Excluir ${selectedFilteredIds.length} despesa(s) selecionada(s)?`)) return;
    await api.financeiro.despesas.bulkDelete(selectedFilteredIds);
    setSelectedRowIds((current) => current.filter((id) => !selectedFilteredIds.includes(id)));
    await load();
  }

  async function solicitarExclusao(item: any) {
    const futureCount = futureSeriesCount(item);
    if (futureCount > 0 && item.recorrenciaSerieId) {
      setDeletePrompt({ despesa: item, futureCount });
      return;
    }

    if (!confirm('Excluir despesa?')) return;
    await excluir(item.id, 'single');
  }

  async function atualizarStatus(payload: { statusPagamento: 'pago' | 'pendente'; dataPagamento?: string | null; comprovante?: { name: string; dataUrl: string } | null }) {
    if (!pagamentoDespesa) return;
    await api.financeiro.despesas.setStatus(pagamentoDespesa.id, payload);
    await load();
  }

  const resumoPendenteHoje = useMemo(() => {
    const todayKey = today();
    return rows.filter((item) => item.statusPagamento === 'pendente' && dateKey(item.data) === todayKey).length;
  }, [rows]);

  const previewMercadoPagoSelecionadas = useMemo(
    () => previewMercadoPagoRows.filter((item) => item.selected && !item.jaImportada),
    [previewMercadoPagoRows],
  );

  const totalPreviewMercadoPagoSelecionado = useMemo(
    () => previewMercadoPagoSelecionadas.reduce((sum, item) => sum + Number(item.valor || 0), 0),
    [previewMercadoPagoSelecionadas],
  );

  return (
    <>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: isCompact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Despesas</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Controle de vencimento, pagamento e comprovantes</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: isCompact ? '100%' : 'auto', flexWrap: 'wrap' }}>
          <ViewModeSwitch value={modo} onChange={setModo} />
          <button
            onClick={toggleFormVisibility}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: 'var(--blue-500)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', width: isPhone ? '100%' : 'auto' }}
          >
            {showForm ? (editingDespesaId ? 'Fechar edicao' : 'Fechar') : '+ Nova despesa'}
          </button>
        </div>
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Total despesas</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.4px' }}>{fmt(total)}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Pendentes no filtro</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.4px' }}>{totalPendentes}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Pagas no filtro</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.4px' }}>{totalPagas}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Vencem hoje</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: resumoPendenteHoje > 0 ? 'var(--amber)' : 'var(--gray-700)', letterSpacing: '-0.4px' }}>{resumoPendenteHoje}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Valor pago</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.4px' }}>{fmt(totalValorPago)}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Valor pendente</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.4px' }}>{fmt(totalValorPendente)}</div>
          </div>
        </div>

        {showForm && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--blue-200)', borderRadius: 10, padding: isCompact ? 16 : 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Nova despesa</div>
                {editingDespesaId ? (
                  <div style={{ fontSize: 12, color: 'var(--blue-500)', marginTop: 4, fontWeight: 700 }}>
                    Editando despesa #{editingDespesaId}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                  Escolha se o lancamento sera feito manualmente ou revisado a partir de um CSV do Mercado Pago.
                </div>
              </div>
              <div style={{ display: 'inline-flex', gap: 8, padding: 4, borderRadius: 999, background: 'var(--gray-50)', border: '1px solid var(--border)', width: isPhone ? '100%' : 'auto', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setOrigemForm('manual')}
                  disabled={!!editingDespesaId}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '8px 14px',
                    background: origemForm === 'manual' ? 'var(--blue-500)' : 'transparent',
                    color: origemForm === 'manual' ? '#fff' : 'var(--ink)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: editingDespesaId ? 'not-allowed' : 'pointer',
                    opacity: editingDespesaId ? 0.7 : 1,
                  }}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setOrigemForm('arquivo')}
                  disabled={!!editingDespesaId}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '8px 14px',
                    background: origemForm === 'arquivo' ? 'var(--blue-500)' : 'transparent',
                    color: origemForm === 'arquivo' ? '#fff' : 'var(--ink)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: editingDespesaId ? 'not-allowed' : 'pointer',
                    opacity: editingDespesaId ? 0.7 : 1,
                  }}
                >
                  Via arquivo
                </button>
              </div>
            </div>

            {origemForm === 'manual' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Data</div>
                    <input style={{ ...inputStyle, width: '100%' }} type="date" value={form.data} onChange={(e) => setForm((value) => ({ ...value, data: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: isPhone ? '1 / -1' : 'span 2' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Detalhes *</div>
                    <input style={{ ...inputStyle, width: '100%' }} placeholder="Ex: Boleto fornecedor pneus" value={form.detalhes} onChange={(e) => setForm((value) => ({ ...value, detalhes: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Categoria</div>
                    <select style={{ ...inputStyle, width: '100%', cursor: 'pointer' }} value={form.categoria} onChange={(e) => setForm((value) => ({ ...value, categoria: e.target.value }))}>
                      {CATEGORIAS.map((categoria) => <option key={categoria}>{categoria}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Valor (R$) *</div>
                    <input style={{ ...inputStyle, width: '100%' }} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={(e) => setForm((value) => ({ ...value, valor: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Recorrencia</div>
                    <select
                      style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                      value={form.recorrenciaTipo}
                      disabled={!!editingDespesaId}
                      onChange={(e) => setForm((value) => ({
                        ...value,
                        recorrenciaTipo: e.target.value,
                        recorrenciaAte: e.target.value === 'nenhuma'
                          ? ''
                          : (value.recorrenciaAte || (e.target.value === 'mensal' ? addMonthsToInputDate(value.data, 11) : addDaysToInputDate(value.data, 77))),
                      }))}
                    >
                      {RECORRENCIAS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Repetir ate</div>
                    <input
                      style={{ ...inputStyle, width: '100%' }}
                      type="date"
                      value={form.recorrenciaAte}
                      disabled={form.recorrenciaTipo === 'nenhuma' || !!editingDespesaId}
                      onChange={(e) => setForm((value) => ({ ...value, recorrenciaAte: e.target.value }))}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Chave PIX</div>
                    <input style={{ ...inputStyle, width: '100%' }} placeholder="Opcional" value={form.chavePix} onChange={(e) => setForm((value) => ({ ...value, chavePix: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Codigo de barras</div>
                    <input style={{ ...inputStyle, width: '100%' }} placeholder="Opcional" value={form.codigoBarras} onChange={(e) => setForm((value) => ({ ...value, codigoBarras: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: isPhone ? '1 / -1' : 'span 2' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Observacao</div>
                    <input style={{ ...inputStyle, width: '100%' }} placeholder="Opcional" value={form.observacao} onChange={(e) => setForm((value) => ({ ...value, observacao: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>PDF da despesa</div>
                    <input type="file" accept=".pdf" onChange={handleAnexoChange} />
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>{form.anexo?.name || 'Nenhum arquivo selecionado'}</div>
                  </div>
                </div>
                {form.recorrenciaTipo !== 'nenhuma' && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-muted)' }}>
                    A serie sera criada com o mesmo valor e os mesmos dados ate <strong>{form.recorrenciaAte ? formatDateBr(form.recorrenciaAte) : '-'}</strong>.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: isPhone ? 'stretch' : 'flex-end', marginTop: 14 }}>
                  <button
                    onClick={salvar}
                    disabled={saving || !form.detalhes || !form.valor || (form.recorrenciaTipo !== 'nenhuma' && !form.recorrenciaAte)}
                    style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', width: isPhone ? '100%' : 'auto' }}
                  >
                    {saving ? 'Salvando...' : editingDespesaId ? 'Salvar alteracoes' : 'Salvar'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fafcff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>1. Solicitar extrato por email</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 12 }}>
                      O ANB solicita ao Mercado Pago o <strong>release_report</strong> do primeiro dia do mes ate a data escolhida. O CSV chega por email e depois voce importa manualmente aqui.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(160px, 220px) auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Data ate</div>
                        <input
                          style={{ ...inputStyle, width: '100%' }}
                          type="date"
                          value={mercadoPagoAte}
                          onChange={(e) => setMercadoPagoAte(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={solicitarRelatorioMercadoPago}
                        disabled={solicitandoRelatorioMp}
                        style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {solicitandoRelatorioMp ? 'Solicitando...' : 'Solicitar CSV por email'}
                      </button>
                    </div>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fafcff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>2. Importar e revisar o CSV</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 12 }}>
                      O ANB mostra somente as linhas negativas. Voce escolhe o que realmente e despesa, ajusta os detalhes e define a categoria antes de gravar.
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <input type="file" accept=".csv,text/csv" onChange={handleArquivoMercadoPagoChange} />
                      <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{arquivoMercadoPago?.name || 'Nenhum arquivo CSV selecionado'}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <button
                        type="button"
                        onClick={analisarArquivoMercadoPago}
                        disabled={analisandoCsvMp || !arquivoMercadoPago}
                        style={{ padding: '8px 18px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', width: isPhone ? '100%' : 'auto' }}
                      >
                        {analisandoCsvMp ? 'Analisando...' : 'Analisar arquivo'}
                      </button>
                      </div>
                    </div>
                  </div>
                </div>

                {previewMercadoPagoInfo && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: 16, background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Arquivo</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{previewMercadoPagoInfo.fileName}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Saidas negativas</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{previewMercadoPagoInfo.totalSaidas || 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Ja importadas</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{previewMercadoPagoInfo.totalJaImportadas || 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Selecionadas agora</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue-500)' }}>{previewMercadoPagoSelecionadas.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>Total selecionado</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{fmt(totalPreviewMercadoPagoSelecionado)}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        Marque apenas o que voce realmente considera despesa. O valor do arquivo entra como despesa paga, com a mesma data de lancamento e pagamento.
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => marcarTodasLinhasMercadoPago(true)} style={{ ...inputStyle, cursor: 'pointer', padding: '7px 12px', background: 'var(--white)' }}>
                          Marcar todas
                        </button>
                        <button type="button" onClick={() => marcarTodasLinhasMercadoPago(false)} style={{ ...inputStyle, cursor: 'pointer', padding: '7px 12px', background: 'var(--white)' }}>
                          Limpar selecao
                        </button>
                        <button
                          type="button"
                          onClick={importarSelecionadasMercadoPago}
                          disabled={importandoCsvMp || !previewMercadoPagoSelecionadas.length}
                          style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {importandoCsvMp ? 'Importando...' : 'Criar despesas selecionadas'}
                        </button>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--gray-50)' }}>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Importar</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Data</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Valor no arquivo</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Descricao original</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Origem</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Saldo apos</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Detalhes da despesa</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Categoria</th>
                            <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewMercadoPagoRows.map((item) => (
                            <tr key={item.importKey}>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                                <input
                                  type="checkbox"
                                  checked={!!item.selected}
                                  disabled={item.jaImportada}
                                  onChange={(e) => atualizarLinhaMercadoPago(item.importKey, { selected: e.target.checked })}
                                />
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--ink)' }}>
                                <div>{formatDateBr(item.data)}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{formatDateTimeBr(item.dataHora)}</div>
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
                                -{fmt(Number(item.valor || 0)).replace('R$', 'R$ ')}
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--ink)' }}>
                                <div style={{ fontWeight: 600 }}>{item.descriptionOriginal || '-'}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>source_id: {item.sourceId || '-'}</div>
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--ink)' }}>
                                <div>{[item.businessUnit, item.subUnit].filter(Boolean).join(' / ') || '-'}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>{[item.paymentMethod, item.paymentMethodType].filter(Boolean).join(' / ') || '-'}</div>
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--ink)' }}>
                                {item.saldoApos === null || item.saldoApos === undefined ? '-' : fmt(Number(item.saldoApos || 0))}
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                                <input
                                  style={{ ...inputStyle, width: '100%', minWidth: 230 }}
                                  value={item.detalhes}
                                  disabled={item.jaImportada}
                                  onChange={(e) => atualizarLinhaMercadoPago(item.importKey, { detalhes: e.target.value })}
                                />
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                                <select
                                  style={{ ...inputStyle, width: '100%', minWidth: 150, cursor: item.jaImportada ? 'not-allowed' : 'pointer' }}
                                  value={item.categoria}
                                  disabled={item.jaImportada}
                                  onChange={(e) => atualizarLinhaMercadoPago(item.importKey, { categoria: e.target.value })}
                                >
                                  <option value="">Selecione</option>
                                  {CATEGORIAS.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                {item.jaImportada ? (
                                  <div style={{ display: 'grid', gap: 4 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, width: 'fit-content' }}>
                                      Ja importada
                                    </span>
                                    <span style={{ color: 'var(--ink-muted)' }}>{item.importacaoExistente?.categoria || '-'}</span>
                                  </div>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 999, background: '#fef2f2', color: 'var(--red)', fontWeight: 700 }}>
                                    A revisar
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!previewMercadoPagoRows.length && (
                            <tr>
                              <td colSpan={9} style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                                Nenhuma saida negativa encontrada neste CSV.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: isCompact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isCompact ? 'column' : 'row', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Visualizacao <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 400 }}>- {filtradas.length} registros</span>
            </div>
            <div style={{ display: 'flex', flexWrap: isCompact ? 'wrap' : 'nowrap', gap: 8, width: isCompact ? '100%' : 'auto', alignItems: 'center' }}>
              {modo === 'relatorio' && (
                <>
                  <button
                    type="button"
                    onClick={() => selecionarTodasFiltradas(true)}
                    disabled={!filteredRowIds.length}
                    style={{ ...inputStyle, cursor: filteredRowIds.length ? 'pointer' : 'not-allowed', padding: '8px 12px', background: 'var(--white)' }}
                  >
                    Selecionar tudo
                  </button>
                  <button
                    type="button"
                    onClick={() => selecionarTodasFiltradas(false)}
                    disabled={!selectedFilteredIds.length}
                    style={{ ...inputStyle, cursor: selectedFilteredIds.length ? 'pointer' : 'not-allowed', padding: '8px 12px', background: 'var(--white)' }}
                  >
                    Limpar selecao
                  </button>
                  <button
                    type="button"
                    onClick={excluirSelecionadas}
                    disabled={!selectedFilteredIds.length}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 7,
                      border: '1px solid #fecaca',
                      background: '#fff1f2',
                      color: 'var(--red)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: selectedFilteredIds.length ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Excluir selecionadas{selectedFilteredIds.length ? ` (${selectedFilteredIds.length})` : ''}
                  </button>
                </>
              )}
              <select style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
                <option value="">Todos os anos</option>
                {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
              </select>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
                <option value="">Todos os meses</option>
                {MESES.map((mes) => <option key={mes.value} value={mes.value}>{mes.label}</option>)}
              </select>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">Todas categorias</option>
                {CATEGORIAS.map((categoria) => <option key={categoria}>{categoria}</option>)}
              </select>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos os status</option>
                <option value="pendente">Pendentes</option>
                <option value="pago">Pagas</option>
              </select>
            </div>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, color: 'var(--ink-muted)' }}>Carregando visualizacao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 18 }}>
                <ChartPanel title="Distribuicao por categoria" subtitle="Entenda onde o caixa esta sendo consumido." accent="#ef4444">
                  <DonutChart items={categoriasOrdenadas} totalLabel="Despesas" totalDisplay={fmt(total)} valueFormatter={fmt} emptyText="Sem despesas para distribuir." />
                </ChartPanel>
                <ChartPanel title="Ranking de categorias" subtitle="As categorias mais pesadas dentro do filtro atual." accent="#2563eb">
                  <HorizontalBarChart items={categoriasOrdenadas} valueFormatter={fmt} emptyText="Sem categorias para comparar." />
                </ChartPanel>
              </div>
              <ChartPanel title="Evolucao por mes" subtitle="Barras mensais para comparar concentracao e ritmo das despesas." accent="#f59e0b">
                <ColumnChart items={linhaTempo} valueFormatter={fmt} emptyText="Sem linha do tempo para mostrar." />
              </ChartPanel>
            </div>
          )
        ) : (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      <th style={{ width: 42, padding: '9px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          disabled={!filteredRowIds.length}
                          onChange={(e) => selecionarTodasFiltradas(e.target.checked)}
                        />
                      </th>
                      {['Data', 'Detalhes', 'Categoria', 'Valor', 'Dados', 'Anexo', 'Comprovante', 'Status', 'Pagamento', ''].map((header) => (
                        <th key={header} style={{ padding: '9px 16px', textAlign: header === 'Valor' ? 'right' : 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 500 }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedRowIds.includes(Number(item.id))}
                            onChange={(e) => toggleDespesaSelecionada(Number(item.id), e.target.checked)}
                          />
                        </td>
                        <td style={{ padding: '9px 16px', fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{formatDateBr(item.data)}</td>
                        <td style={{ padding: '9px 16px', color: 'var(--ink)' }}>{item.detalhes}</td>
                        <td style={{ padding: '9px 16px' }}><CategBadge categoria={item.categoria} /></td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>{fmt(Number(item.valor || 0))}</td>
                        <td style={{ padding: '9px 16px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {item.chavePix ? <InfoPill label="PIX" title={item.chavePix} /> : null}
                            {item.codigoBarras ? <InfoPill label="Barras" title={item.codigoBarras} /> : null}
                            {item.observacao ? <InfoPill label="Obs" title={item.observacao} /> : null}
                            {item.recorrenciaTipo ? <InfoPill label={recurrenceLabel(item.recorrenciaTipo)} title={`Recorrente ate ${formatDateBr(item.recorrenciaFim)}`} /> : null}
                            {item.recorrenciaGerada ? <InfoPill label="Planejada" title="Lancamento criado automaticamente pela serie recorrente" /> : null}
                            {!item.chavePix && !item.codigoBarras && !item.observacao && !item.recorrenciaTipo && !item.recorrenciaGerada ? <span style={{ color: 'var(--gray-300)' }}>-</span> : null}
                          </div>
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          <FileButton label="PDF" dataUrl={item.anexoArquivo} fileName={item.anexoNome} />
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          <FileButton label="Comp." dataUrl={item.comprovanteArquivo} fileName={item.comprovanteNome} />
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          <StatusBadge status={item.statusPagamento} onClick={() => setPagamentoDespesa(item)} />
                        </td>
                        <td style={{ padding: '9px 16px', fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>
                          {item.dataPagamento ? formatDateBr(item.dataPagamento) : '-'}
                        </td>
                        <td style={{ padding: '9px 10px', width: 92 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => startEditDespesa(item)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue-500)', fontSize: 12, padding: '2px 0', borderRadius: 4, fontWeight: 700 }}
                              title="Editar"
                            >
                              Editar
                            </button>
                            <button onClick={() => solicitarExclusao(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }} title="Excluir">
                              x
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filtradas.length && (
                      <tr><td colSpan={11} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Nenhuma despesa encontrada</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {pagamentoDespesa && (
        <PaymentModal
          despesa={pagamentoDespesa}
          onClose={() => setPagamentoDespesa(null)}
          onConfirm={atualizarStatus}
        />
      )}

      {deletePrompt && (
        <DeleteRecurringModal
          despesa={deletePrompt.despesa}
          futureCount={deletePrompt.futureCount}
          onClose={() => setDeletePrompt(null)}
          onDeleteSingle={() => excluir(deletePrompt.despesa.id, 'single')}
          onDeleteFutureSeries={() => excluir(deletePrompt.despesa.id, 'future_series')}
        />
      )}
    </>
  );
}
