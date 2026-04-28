'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 16 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', fontFamily: 'inherit' },
  select: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', fontFamily: 'inherit', cursor: 'pointer' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' as const, border: '1px solid transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  th: { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '9px 12px', fontSize: 13, color: 'var(--gray-700)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Reutilizavel': { bg: '#f0fdf4', color: '#16a34a' },
  'Sucata':       { bg: '#fef9c3', color: '#92400e' },
  'Inexistente':  { bg: '#f1f5f9', color: '#64748b' },
  'Baixada':      { bg: '#f1f5f9', color: '#94a3b8' },
  '—':            { bg: '#f1f5f9', color: '#94a3b8' },
};

const TIPO_ETQ_COLORS: Record<string, { bg: string; color: string }> = {
  'Cartela': { bg: '#eff6ff', color: '#1d4ed8' },
  'Avulsa':  { bg: '#faf5ff', color: '#7c3aed' },
};

export default function EtiquetasDetranPage() {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({ sku: '', descricao: '', tipoEtiqueta: '', tipoPeca: '', etiqueta: '', status: '' });
  const [modalPendencias, setModalPendencias] = useState(false);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loadingPendencias, setLoadingPendencias] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  useEffect(() => { buscar(); }, []);

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
    } catch {}
    setLoading(false);
  }

  async function abrirPendencias() {
    setModalPendencias(true);
    setLoadingPendencias(true);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/pendencias-baixa`, { credentials: 'include' });
      const data = await resp.json();
      setPendencias(data.linhas || []);
    } catch {}
    setLoadingPendencias(false);
  }

  async function confirmarBaixa(linha: any) {
    const key = `${linha.pecaId}|${linha.etiqueta}`;
    setConfirmando(key);
    try {
      await fetch(`${API}/etiquetas-detran/${linha.pecaId}/confirmar-baixa`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiqueta: linha.etiqueta }),
      });
      setPendencias(prev => prev.filter(p => !(p.pecaId === linha.pecaId && p.etiqueta === linha.etiqueta)));
    } catch {}
    setConfirmando(null);
  }

  const tiposPeca = [...new Set(linhas.map(l => l.tipoPeca))].sort();

  return (
    <>
      {/* Topbar */}
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Etiquetas Detran</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${linhas.length} etiqueta(s) encontrada(s)`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ ...s.btn, background: '#7c3aed', color: '#fff' }} onClick={abrirPendencias}>
            ⚠️ Pendências Baixa
          </button>
          <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff' }} onClick={buscar} disabled={loading}>
            {loading ? 'Buscando...' : '🔍 Buscar'}
          </button>
        </div>
      </div>

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filtros */}
        <div style={{ ...s.card, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>SKU</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: HD03_0110"
                value={filtros.sku} onChange={e => setFiltros(f => ({ ...f, sku: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Descrição SKU</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: Cabeçote"
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
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Tipo de Peça</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: Balança"
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
                <option value="Reutilizavel">Reutilizável</option>
                <option value="Sucata">Sucata</option>
                <option value="Inexistente">Inexistente</option>
                <option value="Baixada">Baixada</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div style={{ ...s.card, padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['SKU', 'Descrição SKU', 'Tipo Etiqueta', 'Tipo de Peça', 'Etiqueta Detran', 'Status'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>Carregando...</td></tr>
                )}
                {!loading && linhas.length === 0 && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>Nenhuma etiqueta encontrada</td></tr>
                )}
                {linhas.map((linha, i) => {
                  const etqColors = TIPO_ETQ_COLORS[linha.tipoEtiqueta] || { bg: '#f1f5f9', color: '#64748b' };
                  const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['—'];
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>{linha.sku}</td>
                      <td style={{ ...s.td, maxWidth: 260 }}>{linha.descricao || '—'}</td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color }}>
                          {linha.tipoEtiqueta}
                        </span>
                      </td>
                      <td style={{ ...s.td }}>{linha.tipoPeca}</td>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.etiqueta}</td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                          {linha.status}
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

      {/* Modal Pendências Baixa */}
      {modalPendencias && (
        <div onClick={() => setModalPendencias(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 1100, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>⚠️ Pendências de Baixa</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                  {loadingPendencias ? 'Buscando dados no Bling...' : `${pendencias.length} etiqueta(s) pendente(s) de baixa`}
                </div>
              </div>
              <button onClick={() => setModalPendencias(false)}
                style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-600)', border: '1px solid var(--border)' }}>
                Fechar
              </button>
            </div>

            {/* Tabela */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loadingPendencias ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
                  ⏳ Buscando NF e dados do cliente no Bling...
                </div>
              ) : pendencias.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
                  ✓ Nenhuma pendência de baixa encontrada
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['SKU', 'Descrição', 'Etiqueta Detran', 'Status', 'Pedido Bling', 'NF', 'Cliente', 'CPF/CNPJ', 'Data Venda', ''].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendencias.map((linha, i) => {
                      const key = `${linha.pecaId}|${linha.etiqueta}`;
                      const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['—'];
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{linha.sku}</td>
                          <td style={{ ...s.td, maxWidth: 200, fontSize: 12 }}>{linha.descricao || '—'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.etiqueta}</td>
                          <td style={s.td}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                              {linha.status}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.blingPedidoNum || '—'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.nfNumero || '—'}</td>
                          <td style={{ ...s.td, fontSize: 12, maxWidth: 180 }}>{linha.clienteNome || '—'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.clienteDoc || '—'}</td>
                          <td style={{ ...s.td, fontSize: 12, whiteSpace: 'nowrap' }}>
                            {linha.dataVenda ? new Date(linha.dataVenda).toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td style={{ ...s.td }}>
                            <button
                              onClick={() => confirmarBaixa(linha)}
                              disabled={confirmando === key}
                              style={{ ...s.btn, background: '#16a34a', color: '#fff', padding: '5px 12px', fontSize: 12, opacity: confirmando === key ? 0.6 : 1 }}>
                              {confirmando === key ? '⏳' : '✓ Confirmar Baixa'}
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
