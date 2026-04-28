'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type SortDir = 'asc' | 'desc';
type SortState = { key: string; dir: SortDir };

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 16 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', fontFamily: 'inherit' },
  select: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', fontFamily: 'inherit', cursor: 'pointer' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' as const, border: '1px solid transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  th: { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '9px 12px', fontSize: 13, color: 'var(--gray-700)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Ativa: { bg: '#ecfdf3', color: '#16a34a' },
  Baixada: { bg: '#fef2f2', color: '#dc2626' },
  '-': { bg: '#f1f5f9', color: '#94a3b8' },
};

const TIPO_ETQ_COLORS: Record<string, { bg: string; color: string }> = {
  Cartela: { bg: '#eff6ff', color: '#1d4ed8' },
  Avulsa: { bg: '#faf5ff', color: '#7c3aed' },
};

const MAIN_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'descricao', label: 'Descricao SKU' },
  { key: 'tipoEtiqueta', label: 'Tipo Etiqueta' },
  { key: 'tipoPeca', label: 'Tipo de Peca' },
  { key: 'etiqueta', label: 'Etiqueta Detran' },
  { key: 'status', label: 'Status' },
];

const PENDENCIAS_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'descricao', label: 'Descricao' },
  { key: 'etiqueta', label: 'Etiqueta Detran' },
  { key: 'status', label: 'Status' },
  { key: 'blingPedidoNum', label: 'Pedido Bling' },
  { key: 'nfNumero', label: 'NF' },
  { key: 'clienteNome', label: 'Cliente' },
  { key: 'clienteDoc', label: 'CPF/CNPJ' },
  { key: 'dataVenda', label: 'Data Venda' },
];

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function formatCpfCnpj(value: unknown) {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  return String(value || '').trim() || '-';
}

function formatDate(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function getSortValue(row: any, key: string) {
  if (key === 'dataVenda') {
    const time = row?.dataVenda ? new Date(row.dataVenda).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  if (key === 'clienteDoc') {
    return onlyDigits(row?.clienteDoc);
  }

  const text = String(row?.[key] ?? '').trim();
  const numeric = Number(text.replace(',', '.'));
  return text && Number.isFinite(numeric) && /^\d+([.,]\d+)?$/.test(text) ? numeric : text.toLowerCase();
}

function sortRows(rows: any[], sort: SortState) {
  return [...rows].sort((left, right) => {
    const leftValue = getSortValue(left, sort.key);
    const rightValue = getSortValue(right, sort.key);
    const direction = sort.dir === 'asc' ? 1 : -1;

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction;
    }

    return String(leftValue).localeCompare(String(rightValue), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    }) * direction;
  });
}

function sortIndicator(sort: SortState, key: string) {
  if (sort.key !== key) return '';
  return sort.dir === 'asc' ? '^' : 'v';
}

function SortableTh({ column, sort, onSort }: { column: { key: string; label: string }; sort: SortState; onSort: (key: string) => void }) {
  return (
    <th style={s.th}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
          textTransform: 'inherit',
          letterSpacing: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>{column.label}</span>
        <span style={{ minWidth: 10, fontSize: 10 }}>{sortIndicator(sort, column.key)}</span>
      </button>
    </th>
  );
}

export default function EtiquetasDetranPage() {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({ sku: '', descricao: '', tipoEtiqueta: '', tipoPeca: '', etiqueta: '', status: '' });
  const [modalPendencias, setModalPendencias] = useState(false);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loadingPendencias, setLoadingPendencias] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'sku', dir: 'asc' });
  const [pendenciasSort, setPendenciasSort] = useState<SortState>({ key: 'dataVenda', dir: 'desc' });
  const linhasOrdenadas = useMemo(() => sortRows(linhas, sort), [linhas, sort]);
  const pendenciasOrdenadas = useMemo(() => sortRows(pendencias, pendenciasSort), [pendencias, pendenciasSort]);

  useEffect(() => { buscar(); }, []);

  function toggleSort(key: string) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }));
  }

  function togglePendenciasSort(key: string) {
    setPendenciasSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }));
  }

  async function buscar() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.sku) params.set('sku', filtros.sku);
      if (filtros.descricao) params.set('descricao', filtros.descricao);
      if (filtros.tipoEtiqueta) params.set('tipoEtiqueta', filtros.tipoEtiqueta);
      if (filtros.tipoPeca) params.set('tipoPeca', filtros.tipoPeca);
      if (filtros.etiqueta) params.set('etiqueta', filtros.etiqueta);
      if (filtros.status) params.set('status', filtros.status);
      const resp = await fetch(`${API}/etiquetas-detran?${params}`, { credentials: 'include' });
      const data = await resp.json();
      setLinhas(data.linhas || []);
    } catch {
      setLinhas([]);
    }
    setLoading(false);
  }

  async function abrirPendencias() {
    setModalPendencias(true);
    setLoadingPendencias(true);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/pendencias-baixa`, { credentials: 'include' });
      const data = await resp.json();
      setPendencias(data.linhas || []);
    } catch {
      setPendencias([]);
    }
    setLoadingPendencias(false);
  }

  async function confirmarBaixa(linha: any) {
    const key = `${linha.pecaId}|${linha.etiqueta}`;
    setConfirmando(key);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/${linha.pecaId}/confirmar-baixa`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiqueta: linha.etiqueta }),
      });
      if (!resp.ok) throw new Error('Erro ao confirmar baixa');
      setPendencias((prev) => prev.filter((p) => p.pecaId !== linha.pecaId));
      await buscar();
    } catch {}
    setConfirmando(null);
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Etiquetas Detran</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${linhas.length} etiqueta(s) encontrada(s)`}
          </div>
        </div>
        <button style={{ ...s.btn, background: '#7c3aed', color: '#fff' }} onClick={abrirPendencias}>
          Pendencias Baixa
        </button>
      </div>

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...s.card, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr)) 118px', gap: 12, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>SKU</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: HD03_0110"
                value={filtros.sku} onChange={e => setFiltros(f => ({ ...f, sku: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Descricao SKU</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: Cabecote"
                value={filtros.descricao} onChange={e => setFiltros(f => ({ ...f, descricao: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Tipo Etiqueta</div>
              <select style={{ ...s.select, width: '100%' }} value={filtros.tipoEtiqueta}
                onChange={e => setFiltros(f => ({ ...f, tipoEtiqueta: e.target.value }))}>
                <option value="">Todos</option>
                <option value="Cartela">Cartela</option>
                <option value="Avulsa">Avulsa</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Tipo de Peca</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: Balanca"
                value={filtros.tipoPeca} onChange={e => setFiltros(f => ({ ...f, tipoPeca: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Etiqueta Detran</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: SP22102017..."
                value={filtros.etiqueta} onChange={e => setFiltros(f => ({ ...f, etiqueta: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Status</div>
              <select style={{ ...s.select, width: '100%' }} value={filtros.status}
                onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}>
                <option value="">Todos</option>
                <option value="Ativa">Ativa</option>
                <option value="Baixada">Baixada</option>
              </select>
            </div>
            <button style={{ ...s.btn, height: 32, background: 'var(--ink)', color: '#fff' }} onClick={buscar} disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>

        <div style={{ ...s.card, padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {MAIN_COLUMNS.map((column) => (
                    <SortableTh key={column.key} column={column} sort={sort} onSort={toggleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>Carregando...</td></tr>
                )}
                {!loading && linhasOrdenadas.length === 0 && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>Nenhuma etiqueta encontrada</td></tr>
                )}
                {linhasOrdenadas.map((linha, i) => {
                  const etqColors = TIPO_ETQ_COLORS[linha.tipoEtiqueta] || { bg: '#f1f5f9', color: '#64748b' };
                  const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['-'];
                  return (
                    <tr key={`${linha.pecaId}-${linha.etiqueta}`} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>{linha.sku}</td>
                      <td style={{ ...s.td, maxWidth: 320 }}>{linha.descricao || '-'}</td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color }}>
                          {linha.tipoEtiqueta}
                        </span>
                      </td>
                      <td style={s.td}>{linha.tipoPeca || '-'}</td>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.etiqueta}</td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                          {linha.status || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalPendencias && (
        <div onClick={() => setModalPendencias(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--white)', borderRadius: 12, width: 'min(1380px, calc(100vw - 48px))', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(2, 6, 23, 0.28)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'var(--white)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-800)' }}>Pendencias de Baixa</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                    {loadingPendencias ? 'Buscando dados no Bling...' : `${pendencias.length} etiqueta(s) pendente(s) de baixa`}
                  </div>
                </div>
              </div>
              <button onClick={() => setModalPendencias(false)}
                style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-600)', border: '1px solid var(--border)' }}>
                Fechar
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1, background: 'var(--white)' }}>
              {loadingPendencias ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
                  Buscando NF e dados do cliente no Bling...
                </div>
              ) : pendenciasOrdenadas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
                  Nenhuma pendencia de baixa encontrada
                </div>
              ) : (
                <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      {PENDENCIAS_COLUMNS.map((column) => (
                        <SortableTh key={column.key} column={column} sort={pendenciasSort} onSort={togglePendenciasSort} />
                      ))}
                      <th style={s.th}>Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendenciasOrdenadas.map((linha, i) => {
                      const key = `${linha.pecaId}|${linha.etiqueta}`;
                      const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['-'];
                      return (
                        <tr key={key} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                          <td style={{ ...s.td, width: 96, fontFamily: 'Geist Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{linha.sku}</td>
                          <td style={{ ...s.td, width: 230, fontSize: 12, lineHeight: 1.25 }}>{linha.descricao || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.etiqueta}</td>
                          <td style={s.td}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                              {linha.status || '-'}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.blingPedidoNum || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.nfNumero || '-'}</td>
                          <td style={{ ...s.td, width: 220, fontSize: 12, lineHeight: 1.25 }}>{linha.clienteNome || '-'}</td>
                          <td style={{ ...s.td, width: 150, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{formatCpfCnpj(linha.clienteDoc)}</td>
                          <td style={{ ...s.td, fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(linha.dataVenda)}</td>
                          <td style={{ ...s.td, width: 142, whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => confirmarBaixa(linha)}
                              disabled={confirmando === key}
                              style={{ ...s.btn, background: '#16a34a', color: '#fff', padding: '5px 12px', fontSize: 12, opacity: confirmando === key ? 0.6 : 1 }}>
                              {confirmando === key ? 'Salvando...' : 'Confirmar Baixa'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
