'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const PREJUIZO_MOTIVOS = [
  {
    key: 'extravio_no_envio',
    label: 'Extravio no Envio',
    shortLabel: 'Extravio envio',
    aliases: ['extravio no envio'],
  },
  {
    key: 'defeito',
    label: 'Defeito',
    shortLabel: 'Defeito',
    aliases: ['defeito'],
  },
  {
    key: 'sku_cancelado',
    label: 'SKU Cancelado',
    shortLabel: 'SKU cancelado',
    aliases: ['sku cancelado'],
  },
  {
    key: 'peca_restrita_sem_revenda',
    label: 'Peça Restrita - Sem Revenda',
    shortLabel: 'Peça restrita',
    aliases: ['peca restrita - sem revenda', 'peça restrita - sem revenda'],
  },
  {
    key: 'extravio_no_estoque',
    label: 'Extravio no Estoque',
    shortLabel: 'Extravio estoque',
    aliases: ['extravio no estoque'],
  },
] as const;

const PREJUIZO_OPTIONS = PREJUIZO_MOTIVOS.map((item) => item.label);
type PrejuizoOptionLabel = (typeof PREJUIZO_MOTIVOS)[number]['label'];

type EditPrejuizoFormState = {
  data: string;
  motivo: PrejuizoOptionLabel;
  valor: string;
  frete: string;
  observacao: string;
};

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toInputDate(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateBr(value: string | Date) {
  const key = toInputDate(value);
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function normalizeMotivoValue(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveMotivoMeta(value: string | null | undefined) {
  const normalized = normalizeMotivoValue(value);
  return PREJUIZO_MOTIVOS.find((item) => (
    item.aliases.some((alias) => normalizeMotivoValue(alias) === normalized)
    || normalizeMotivoValue(item.label) === normalized
    || normalizeMotivoValue(item.shortLabel) === normalized
    || normalizeMotivoValue(item.key) === normalized
  )) || null;
}

function getMotivoLabel(value: string | null | undefined) {
  const meta = resolveMotivoMeta(value);
  return meta?.label || String(value || '-');
}

function getMotivoOption(value: string | null | undefined): PrejuizoOptionLabel {
  const meta = resolveMotivoMeta(value);
  return meta?.label || PREJUIZO_OPTIONS[0];
}

function getMotivoKey(value: string | null | undefined) {
  const meta = resolveMotivoMeta(value);
  return meta?.key || normalizeMotivoValue(value);
}

function motivoAccent(motivo: string) {
  const key = getMotivoKey(motivo);
  if (key === 'extravio_no_envio') return { color: 'var(--amber)', border: '#fcd34d', background: '#fffbeb' };
  if (key === 'defeito') return { color: 'var(--red)', border: '#fecaca', background: '#fef2f2' };
  if (key === 'sku_cancelado') return { color: '#7c3aed', border: '#ddd6fe', background: '#f5f3ff' };
  if (key === 'peca_restrita_sem_revenda') return { color: '#0f766e', border: '#99f6e4', background: '#f0fdfa' };
  if (key === 'extravio_no_estoque') return { color: '#2563eb', border: '#bfdbfe', background: '#eff6ff' };
  return { color: 'var(--gray-700)', border: 'var(--border)', background: 'var(--white)' };
}

function EditPrejuizoModal({ row, saving, onClose, onSave }: any) {
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isCompact = isPhone || viewportMode === 'tablet-portrait';
  const [form, setForm] = useState<EditPrejuizoFormState>({
    data: '',
    motivo: PREJUIZO_OPTIONS[0],
    valor: '',
    frete: '',
    observacao: '',
  });

  useEffect(() => {
    if (!row) return;
    setForm({
      data: toInputDate(row.data),
      motivo: getMotivoOption(row.motivo),
      valor: String(Number(row.valor || 0)),
      frete: String(Number(row.frete || 0)),
      observacao: String(row.observacao || ''),
    });
  }, [row]);

  if (!row) return null;

  const valor = Number(form.valor) || 0;
  const frete = Number(form.frete) || 0;
  const total = valor + frete;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 220, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: isPhone ? 0 : 16, width: '100%', maxWidth: isPhone ? '100%' : 680, minHeight: isPhone ? '100vh' : undefined, boxShadow: '0 12px 32px rgba(0,0,0,.10)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: isCompact ? '16px 16px 12px' : '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Editar prejuizo</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{row.idPeca || '-'} - {row.descricaoPeca || row.detalhe}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>

        <div style={{ padding: isCompact ? 16 : 22, display: 'grid', gap: 14, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Data</label>
              <input style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, outline: 'none', marginTop: 5 }} type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Tipo de defeito</label>
              <select style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, outline: 'none', marginTop: 5, cursor: 'pointer' }} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
                {PREJUIZO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Valor peca (R$)</label>
              <input style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, outline: 'none', marginTop: 5 }} type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Frete (R$)</label>
              <input style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, outline: 'none', marginTop: 5 }} type="number" step="0.01" value={form.frete} onChange={(e) => setForm({ ...form, frete: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Total (R$)</label>
              <input style={{ width: '100%', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, outline: 'none', marginTop: 5, color: 'var(--red)', fontWeight: 600 }} type="text" readOnly value={fmt(total)} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Observacao</label>
            <textarea style={{ width: '100%', minHeight: 110, resize: 'vertical', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, outline: 'none', marginTop: 5 }} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </div>
        </div>

        <div style={{ padding: isCompact ? '14px 16px 18px' : '14px 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--white)', color: 'var(--ink-soft)' }}>Cancelar</button>
          <button
            onClick={() => onSave({
              data: form.data,
              motivo: form.motivo,
              valor,
              frete,
              observacao: form.observacao.trim() || null,
            })}
            disabled={saving}
            style={{ padding: '10px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', background: 'var(--ink)', color: 'var(--white)' }}
          >
            {saving ? 'Salvando...' : 'Salvar ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PrejuizosPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [filters, setFilters] = useState({
    idPeca: '',
    motivo: '',
    dataFrom: '',
    dataTo: '',
  });
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isCompact = isPhone || viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';

  async function load() {
    setLoading(true);
    try {
      const data = await api.financeiro.prejuizos.list();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const rowDate = toInputDate(row.data);
      const matchesIdPeca = !filters.idPeca || String(row.idPeca || '').toLowerCase().includes(filters.idPeca.toLowerCase());
      const matchesMotivo = !filters.motivo || getMotivoKey(row.motivo) === filters.motivo;
      const matchesFrom = !filters.dataFrom || rowDate >= filters.dataFrom;
      const matchesTo = !filters.dataTo || rowDate <= filters.dataTo;
      return matchesIdPeca && matchesMotivo && matchesFrom && matchesTo;
    });
  }, [rows, filters]);

  const totalValor = filteredRows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
  const totalFrete = filteredRows.reduce((sum, row) => sum + (Number(row.frete) || 0), 0);
  const total = totalValor + totalFrete;
  const totalsByMotivo = PREJUIZO_MOTIVOS.map((motivo) => {
    const motivoRows = filteredRows.filter((row) => getMotivoKey(row.motivo) === motivo.key);
    const motivoValor = motivoRows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
    const motivoFrete = motivoRows.reduce((sum, row) => sum + (Number(row.frete) || 0), 0);
    return {
      motivo: motivo.label,
      shortLabel: motivo.shortLabel,
      key: motivo.key,
      count: motivoRows.length,
      total: motivoValor + motivoFrete,
      valor: motivoValor,
      frete: motivoFrete,
      ...motivoAccent(motivo.key),
    };
  });

  async function reativar(row: any) {
    const label = row.idPeca ? `a peca ${row.idPeca}` : 'este prejuizo';
    if (!confirm(`Remover ${label} do prejuizo e reativar no estoque?`)) return;

    setBusyId(row.id);
    try {
      await api.financeiro.prejuizos.delete(row.id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function salvarEdicao(data: any) {
    if (!editRow) return;
    setEditSaving(true);
    try {
      await api.financeiro.prejuizos.update(editRow.id, data);
      setEditRow(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  }

  const hasFilters = Boolean(filters.idPeca || filters.motivo || filters.dataFrom || filters.dataTo);

  return (
    <>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: isCompact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Prejuizos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Pecas bloqueadas por problema, extravio ou restricao de revenda.</div>
        </div>
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : isCompact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            { l: 'Total prejuizos', v: total, c: 'var(--red)', isFmt: true },
            { l: 'Valor pecas', v: totalValor, c: 'var(--amber)', isFmt: true },
            { l: 'Frete', v: totalFrete, c: 'var(--gray-600)', isFmt: true },
            { l: 'Ocorrencias', v: filteredRows.length, c: 'var(--gray-800)', isFmt: false },
          ].map((card) => (
            <div key={card.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: isPhone ? '12px 12px' : '14px 14px' }}>
              <div style={{ fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{card.l}</div>
              <div style={{ fontSize: isPhone ? 16 : 18, fontWeight: 700, color: card.c, letterSpacing: '-0.35px', ...sensitiveMaskStyle(hidden) }}>
                {sensitiveText(card.isFmt ? fmt(card.v as number) : String(card.v), hidden)}
              </div>
            </div>
          ))}
        </div>

        {totalsByMotivo.length ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 10 }}>Totais por motivo</div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : isCompact ? 'repeat(2, minmax(0, 1fr))' : isTabletLandscape ? 'repeat(3, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
              {totalsByMotivo.map((item) => (
                <div
                  key={item.key}
                  style={{
                    background: item.background,
                    border: `1px solid ${item.border}`,
                    borderRadius: 10,
                    padding: isPhone ? '12px 12px' : '12px 14px',
                  }}
                  title={item.motivo}
                >
                  <div style={{ fontSize: 9.5, fontFamily: 'Geist Mono, monospace', color: 'var(--gray-500)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 5 }}>
                    Motivo
                  </div>
                  <div style={{ fontSize: isPhone ? 12 : 13, fontWeight: 700, color: 'var(--gray-800)', lineHeight: 1.2, minHeight: isPhone ? 32 : 36, marginBottom: 6 }}>
                    {isPhone ? item.shortLabel : item.motivo}
                  </div>
                  <div style={{ fontSize: isPhone ? 15 : 17, fontWeight: 700, color: item.color, letterSpacing: '-0.3px', ...sensitiveMaskStyle(hidden) }}>
                    {sensitiveText(fmt(item.total), hidden)}
                  </div>
                  <div style={{ display: 'grid', gap: 3, marginTop: 7, fontSize: isPhone ? 10.5 : 11.5, color: 'var(--gray-600)', lineHeight: 1.25 }}>
                    <span>{item.count} ocorr.</span>
                    <span style={sensitiveMaskStyle(hidden)}>{sensitiveText(`Peça ${fmt(item.valor)}`, hidden)}</span>
                    <span style={sensitiveMaskStyle(hidden)}>{sensitiveText(`Frete ${fmt(item.frete)}`, hidden)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div data-company-sensitive-ignore="1" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
            Relatorio de prejuizos <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>- {filteredRows.length}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : isCompact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(180px, max-content))', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: '#fcfcfd' }}>
            <input
              type="text"
              placeholder="ID Peca"
              value={filters.idPeca}
              onChange={(e) => setFilters({ ...filters, idPeca: e.target.value })}
              style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, outline: 'none' }}
            />
            <select
              value={filters.motivo}
              onChange={(e) => setFilters({ ...filters, motivo: e.target.value })}
              style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Tipo de defeito</option>
              {PREJUIZO_MOTIVOS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <input type="date" value={filters.dataFrom} max={filters.dataTo || undefined} onChange={(e) => setFilters({ ...filters, dataFrom: e.target.value })} style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, outline: 'none' }} />
            <input type="date" value={filters.dataTo} min={filters.dataFrom || undefined} onChange={(e) => setFilters({ ...filters, dataTo: e.target.value })} style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13, outline: 'none' }} />
            <button onClick={() => setFilters({ idPeca: '', motivo: '', dataFrom: '', dataTo: '' })} disabled={!hasFilters} style={{ border: '1px solid var(--border)', background: 'var(--white)', color: hasFilters ? 'var(--gray-700)' : 'var(--gray-400)', borderRadius: 7, padding: '10px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Limpar filtros
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
          ) : isCompact ? (
            <div style={{ display: 'grid', gap: 12, padding: 14 }}>
              {filteredRows.map((row) => (
                <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{row.idPeca || '-'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{row.descricaoPeca || row.detalhe}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>{formatDateBr(row.data)}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Motivo</div>
                      <div style={{ fontSize: 12 }}>{getMotivoLabel(row.motivo)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>ID Moto</div>
                      <div style={{ fontSize: 12 }}>{row.idMoto ? `#${row.idMoto}` : '-'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Valor peca</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-700)' }}>{fmt(Number(row.valor) || 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Frete</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-700)' }}>{fmt(Number(row.frete) || 0)}</div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Total</div>
                      <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>{fmt((Number(row.valor) || 0) + (Number(row.frete) || 0))}</div>
                    </div>
                    {row.observacao ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Observacao</div>
                        <div style={{ fontSize: 12 }}>{row.observacao}</div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    <button onClick={() => setEditRow(row)} style={{ border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', borderRadius: 7, padding: '8px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Editar
                    </button>
                    <button onClick={() => reativar(row)} disabled={busyId === row.id} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: 'var(--blue-500)', borderRadius: 7, padding: '8px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {busyId === row.id ? '...' : row.idPeca ? 'Reativar' : 'Excluir'}
                    </button>
                  </div>
                </div>
              ))}
              {!filteredRows.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>Nenhum prejuizo encontrado com os filtros atuais</div>}
            </div>
          ) : (
            <div style={{ overflowX: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '72px' }} />
                  <col style={{ width: '78px' }} />
                  <col style={{ width: '102px' }} />
                  <col />
                  <col style={{ width: '210px' }} />
                  <col style={{ width: '170px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '104px' }} />
                </colgroup>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Data', 'ID Moto', 'SKU', 'ID Peca', 'Peca', 'Motivo', 'Obs.', 'Valor', 'Frete', 'Total', ''].map((header) => (
                      <th key={header} style={{ padding: '8px 10px', textAlign: ['Valor', 'Frete', 'Total'].includes(header) ? 'right' : 'left', fontFamily: 'Geist Mono, monospace', fontSize: 9.5, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500, whiteSpace: 'nowrap' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '8px 10px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{formatDateBr(row.data)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{row.idMoto ? `#${row.idMoto}` : '-'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--blue-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.skuMoto || '-'}>
                        {row.skuMoto || '-'}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.idPeca || '-'}>
                        {row.idPeca || '-'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--gray-700)' }} title={row.descricaoPeca || row.detalhe}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>
                          {row.descricaoPeca || row.detalhe}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--gray-700)' }} title={getMotivoLabel(row.motivo)}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>
                          {getMotivoLabel(row.motivo)}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--gray-500)' }} title={row.observacao || '-'}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>
                          {row.observacao || '-'}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{fmt(Number(row.valor) || 0)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{fmt(Number(row.frete) || 0)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--red)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt((Number(row.valor) || 0) + (Number(row.frete) || 0))}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditRow(row)} style={{ border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            Editar
                          </button>
                          <button onClick={() => reativar(row)} disabled={busyId === row.id} style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: 'var(--blue-500)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            {busyId === row.id ? '...' : row.idPeca ? 'Reativar' : 'Excluir'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredRows.length && (
                    <tr>
                      <td colSpan={11} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                        Nenhum prejuizo encontrado com os filtros atuais
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EditPrejuizoModal row={editRow} saving={editSaving} onClose={() => setEditRow(null)} onSave={salvarEdicao} />
    </>
  );
}
