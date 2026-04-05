'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PREJUIZO_OPTIONS = [
  'Extravio no Envio',
  'Defeito',
  'SKU Cancelado',
  'Peça Restrita - Sem Revenda',
  'Extravio no Estoque',
];

function toInputDate(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function EditPrejuizoModal({ row, saving, onClose, onSave }: any) {
  const [form, setForm] = useState({
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
      motivo: row.motivo || PREJUIZO_OPTIONS[0],
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Editar prejuizo</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{row.idPeca || '-'} - {row.descricaoPeca || row.detalhe}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Data</label>
              <input style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5 }} type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Tipo de defeito</label>
              <select style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, cursor: 'pointer' }} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
                {PREJUIZO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Valor peca (R$)</label>
              <input style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5 }} type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Frete (R$)</label>
              <input style={{ width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5 }} type="number" step="0.01" value={form.frete} onChange={(e) => setForm({ ...form, frete: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Total (R$)</label>
              <input style={{ width: '100%', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--red)', fontWeight: 600 }} type="text" readOnly value={fmt(total)} />
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Observacao</label>
            <textarea
              style={{ width: '100%', minHeight: 92, resize: 'vertical', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' }}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Anotacoes livres sobre este prejuizo..."
            />
          </div>
        </div>

        <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--white)', color: 'var(--ink-soft)', fontFamily: 'Geist, sans-serif' }}>Cancelar</button>
          <button
            onClick={() => onSave({
              data: form.data,
              motivo: form.motivo,
              valor,
              frete,
              observacao: form.observacao.trim() || null,
            })}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', background: 'var(--ink)', color: 'var(--white)', fontFamily: 'Geist, sans-serif' }}
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
      const matchesMotivo = !filters.motivo || String(row.motivo || '') === filters.motivo;
      const matchesFrom = !filters.dataFrom || rowDate >= filters.dataFrom;
      const matchesTo = !filters.dataTo || rowDate <= filters.dataTo;
      return matchesIdPeca && matchesMotivo && matchesFrom && matchesTo;
    });
  }, [rows, filters]);

  const totalValor = filteredRows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
  const totalFrete = filteredRows.reduce((sum, row) => sum + (Number(row.frete) || 0), 0);
  const total = totalValor + totalFrete;

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
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Prejuizos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Pecas bloqueadas por problema, extravio ou restricao de revenda.</div>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Total prejuizos', v: total, c: 'var(--red)', isFmt: true },
            { l: 'Valor pecas', v: totalValor, c: 'var(--amber)', isFmt: true },
            { l: 'Frete', v: totalFrete, c: 'var(--gray-600)', isFmt: true },
            { l: 'Ocorrencias', v: filteredRows.length, c: 'var(--gray-800)', isFmt: false },
          ].map((card) => (
            <div key={card.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{card.l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.c, letterSpacing: '-0.4px' }}>{card.isFmt ? fmt(card.v as number) : card.v}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
            Relatorio de prejuizos <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— {filteredRows.length}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: '#fcfcfd' }}>
            <input
              type="text"
              placeholder="ID Peca"
              value={filters.idPeca}
              onChange={(e) => setFilters({ ...filters, idPeca: e.target.value })}
              style={{ minWidth: 180, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none' }}
            />
            <select
              value={filters.motivo}
              onChange={(e) => setFilters({ ...filters, motivo: e.target.value })}
              style={{ minWidth: 210, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Tipo de defeito</option>
              {PREJUIZO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 38 }}>
              <span style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>Data de</span>
              <input type="date" value={filters.dataFrom} max={filters.dataTo || undefined} onChange={(e) => setFilters({ ...filters, dataFrom: e.target.value })} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Geist, sans-serif', minWidth: 128 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 38 }}>
              <span style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>ate</span>
              <input type="date" value={filters.dataTo} min={filters.dataFrom || undefined} onChange={(e) => setFilters({ ...filters, dataTo: e.target.value })} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Geist, sans-serif', minWidth: 128 }} />
            </div>
            <button
              onClick={() => setFilters({ idPeca: '', motivo: '', dataFrom: '', dataTo: '' })}
              disabled={!hasFilters}
              style={{ border: '1px solid var(--border)', background: 'var(--white)', color: hasFilters ? 'var(--gray-700)' : 'var(--gray-400)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Limpar filtros
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Data', 'ID Moto', 'SKU Moto', 'ID Peca', 'Peca', 'Motivo', 'Observacao', 'Valor peca', 'Frete', 'Total', ''].map((header) => (
                      <th key={header} style={{ padding: '9px 16px', textAlign: ['Valor peca', 'Frete', 'Total'].includes(header) ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500, whiteSpace: 'nowrap' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{new Date(row.data).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{row.idMoto ? `#${row.idMoto}` : '-'}</td>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>{row.skuMoto || '-'}</td>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-700)' }}>{row.idPeca || '-'}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-700)', minWidth: 240 }}>{row.descricaoPeca || row.detalhe}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{row.motivo || '-'}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-500)', minWidth: 220 }}>{row.observacao || '-'}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{fmt(Number(row.valor) || 0)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{fmt(Number(row.frete) || 0)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{fmt((Number(row.valor) || 0) + (Number(row.frete) || 0))}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setEditRow(row)}
                            style={{ border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => reativar(row)}
                            disabled={busyId === row.id}
                            style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: 'var(--blue-500)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
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

      <EditPrejuizoModal
        row={editRow}
        saving={editSaving}
        onClose={() => setEditRow(null)}
        onSave={salvarEdicao}
      />
    </>
  );
}
