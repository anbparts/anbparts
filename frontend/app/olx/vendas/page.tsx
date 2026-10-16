'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, marginBottom: 18 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  th: { textAlign: 'left' as const, padding: '8px 10px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.6px', textTransform: 'uppercase' as const, color: 'var(--gray-400)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const },
  td: { padding: '10px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

async function chamar(path: string, init?: RequestInit) {
  const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `Erro ${resp.status}`);
  return data;
}

function dataHoraBr(v: any) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function brl(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function rotuloVenda(status: string) {
  if (status === 'pendente') return { texto: 'Aguardando pedido no Bling', cor: '#92400e', fundo: '#fffbeb' };
  if (status === 'baixada') return { texto: 'Baixada no sistema', cor: '#16a34a', fundo: '#f0fdf4' };
  if (status === 'ignorada') return { texto: 'Ignorada', cor: '#475569', fundo: '#f1f5f9' };
  return { texto: status, cor: '#475569', fundo: '#f1f5f9' };
}

export default function OlxVendasPage() {
  const [itens, setItens] = useState<any[]>([]);
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const ajustar = () => setIsPhone(typeof window !== 'undefined' && window.innerWidth <= 768);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<'pendente' | 'todas'>('pendente');
  const [busca, setBusca] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const d = await chamar('/olx/vendas');
      setItens(Array.isArray(d.itens) ? d.itens : []);
    } catch (e: any) { alert(e.message || 'Erro ao carregar as vendas'); }
    setCarregando(false);
  }
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, []);

  async function atualizarAgora() {
    setAtualizando(true);
    try {
      await chamar('/olx/anuncios/atualizar', { method: 'POST' });
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao atualizar'); }
    setAtualizando(false);
  }

  async function mudarStatus(id: number, status: string, confirmacao: string) {
    if (!confirm(confirmacao)) return;
    try {
      const resp: any = await chamar('/olx/vendas/' + id + '/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (resp?.aviso) alert(resp.aviso);
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao atualizar a venda'); }
  }

  async function tentarEstoque(id: number) {
    try {
      await chamar('/olx/vendas/' + id + '/estoque', { method: 'POST' });
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao baixar o estoque'); }
  }

  async function informarSku(id: number) {
    const sku = (prompt('SKU da peca vendida:') || '').trim();
    if (!sku) return;
    try {
      await chamar('/olx/vendas/' + id + '/sku', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku }) });
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao informar o SKU'); }
  }

  const pendentes = useMemo(() => itens.filter((i) => i.status === 'pendente'), [itens]);
  const lista = useMemo(() => {
    const base = filtro === 'pendente' ? pendentes : itens;
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => [i.sku, i.titulo, i.listId, i.blingPedidoNum].join(' ').toLowerCase().indexOf(q) >= 0);
  }, [filtro, pendentes, itens, busca]);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>OLX · Vendas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Anuncios vendidos na OLX aguardando o pedido no Bling</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', opacity: atualizando ? 0.7 : 1 }} onClick={atualizarAgora} disabled={atualizando}>
          {atualizando ? 'Atualizando...' : 'Verificar vendas agora'}
        </button>
      </div>

      <div style={{ padding: isPhone ? 12 : 24, maxWidth: 1150 }}>
        {pendentes.length > 0 && (
          <div style={{ ...s.card, background: '#fffbeb', borderColor: '#fde68a' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>{pendentes.length} venda(s) da OLX aguardando o pedido no Bling</div>
            <div style={{ fontSize: 13, color: '#92400e' }}>
              O estoque no Bling <strong>ja foi baixado automaticamente</strong> (1 unidade) no momento da venda, entao os outros canais param de vender a peca.
              Gere o pedido no Bling para fechar a venda; depois que ele for importado, a baixa no sistema e a conferencia aqui sao automaticas.
            </div>
          </div>
        )}

        <div style={s.card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {([['pendente', `Aguardando pedido (${pendentes.length})`], ['todas', `Todas (${itens.length})`]] as Array<['pendente' | 'todas', string]>).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)}
                style={{ ...s.btn, padding: '7px 16px', borderRadius: 999, background: filtro === id ? 'var(--gray-800)' : 'var(--gray-50)', color: filtro === id ? '#fff' : 'var(--gray-600)' }}>{rotulo}</button>
            ))}
            <input style={{ ...s.input, flex: '1 1 200px', width: 'auto', borderRadius: 999, background: 'var(--gray-50)', border: '1px solid transparent' }} placeholder="Buscar SKU, titulo ou pedido" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 12 }}>Carregando...</div> : null}
          {!carregando && !lista.length ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 24, textAlign: 'center' }}>{filtro === 'pendente' ? 'Nenhuma venda aguardando pedido no Bling.' : 'Nenhuma venda da OLX registrada.'}</div> : null}
          {!carregando && isPhone && lista.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {lista.map((i) => {
                const r = rotuloVenda(i.status);
                return (
                  <div key={`m-${i.id}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{i.sku || 'sem SKU'}</strong>
                      <button type="button" onClick={() => window.open(String(i.url), '_blank', 'noopener,noreferrer')} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 12px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor, cursor: 'pointer' }}>{r.texto}</button>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>{i.titulo || `anuncio ${i.listId}`}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{dataHoraBr(i.vendaEm)} · {brl(i.preco)}{i.blingPedidoNum ? ` · pedido #${i.blingPedidoNum}` : ''}</div>
                    {i.status === 'pendente' ? (
                      i.estoqueBling === 'baixado' ? <div style={{ fontSize: 12, color: '#16a34a' }}>Estoque Bling: baixado ✓</div>
                      : i.estoqueBling === 'erro' ? <div style={{ fontSize: 12, color: '#dc2626' }}>Estoque Bling: erro — {i.estoqueBlingErro} <button type="button" onClick={() => tentarEstoque(i.id)} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', textDecoration: 'underline', padding: 0 }}>tentar de novo</button></div>
                      : i.estoqueBling === 'sem_sku' ? <div style={{ fontSize: 12, color: '#b45309' }}>Sem SKU: informe o SKU para baixar o estoque no Bling</div>
                      : <div style={{ fontSize: 12, color: '#b45309' }}>Estoque Bling: baixando...</div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!i.sku && i.status === 'pendente' ? <button style={{ ...s.btn, padding: '7px 12px', fontSize: 12.5, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)' }} onClick={() => informarSku(i.id)}>Informar SKU</button> : null}
                      {i.status === 'pendente' ? (
                        <>
                          <button style={{ ...s.btn, padding: '7px 12px', fontSize: 12.5, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => mudarStatus(i.id, 'baixada', 'Marcar esta venda como baixada? Use so se o pedido ja foi tratado fora do fluxo normal.')}>Marcar baixada</button>
                          <button style={{ ...s.btn, padding: '7px 12px', fontSize: 12.5, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => mudarStatus(i.id, 'ignorada', 'Ignorar esta venda (por exemplo, compra cancelada)? Ela sai do alerta e a unidade volta ao estoque do Bling.')}>Ignorar</button>
                        </>
                      ) : (
                        <button style={{ ...s.btn, padding: '7px 12px', fontSize: 12.5, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => mudarStatus(i.id, 'pendente', 'Voltar esta venda para "aguardando pedido no Bling"?')}>Reabrir</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {!carregando && !isPhone && lista.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={s.th}>Venda em</th>
                    <th style={s.th}>SKU</th>
                    <th style={s.th}>Descricao</th>
                    <th style={s.th}>Preco do anuncio</th>
                    <th style={s.th}>Status (clique abre o anuncio)</th>
                    <th style={s.th}>Pedido Bling</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => {
                    const r = rotuloVenda(i.status);
                    return (
                      <tr key={i.id}>
                        <td style={{ ...s.td, whiteSpace: 'nowrap', color: 'var(--gray-600)' }}>{dataHoraBr(i.vendaEm)}</td>
                        <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                          {i.sku ? i.sku : <button style={{ ...s.btn, padding: '3px 10px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)' }} onClick={() => informarSku(i.id)}>Informar SKU</button>}
                        </td>
                        <td style={{ ...s.td, color: 'var(--gray-600)', maxWidth: 320 }}>
                          {i.titulo || <span style={{ color: 'var(--gray-400)' }}>anuncio {i.listId} (sem SKU)</span>}
                          {i.status === 'pendente' ? (
                            i.estoqueBling === 'baixado' ? <div style={{ fontSize: 11.5, color: '#16a34a', marginTop: 2 }}>Estoque Bling: baixado ✓</div>
                            : i.estoqueBling === 'erro' ? <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 2 }}>Estoque Bling: erro — {i.estoqueBlingErro} <button type="button" onClick={() => tentarEstoque(i.id)} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', cursor: 'pointer', fontSize: 11.5, textDecoration: 'underline', padding: 0 }}>tentar de novo</button></div>
                            : i.estoqueBling === 'sem_sku' ? <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 2 }}>Sem SKU: informe o SKU para baixar o estoque no Bling</div>
                            : <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 2 }}>Estoque Bling: baixando...</div>
                          ) : null}
                        </td>
                        <td style={s.td}>{brl(i.preco)}</td>
                        <td style={s.td}>
                          <button type="button" onClick={() => window.open(String(i.url), '_blank', 'noopener,noreferrer')} title="Abrir anuncio na OLX" style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor, cursor: 'pointer', fontFamily: 'Geist Mono, JetBrains Mono, monospace' }}>{r.texto}</button>
                        </td>
                        <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-600)' }}>{i.blingPedidoNum ? '#' + i.blingPedidoNum : '—'}</td>
                        <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {i.status === 'pendente' ? (
                            <>
                              <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)', marginRight: 6 }} onClick={() => mudarStatus(i.id, 'baixada', 'Marcar esta venda como baixada? Use so se o pedido ja foi tratado fora do fluxo normal.')}>Marcar baixada</button>
                              <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => mudarStatus(i.id, 'ignorada', 'Ignorar esta venda (por exemplo, compra cancelada)? Ela sai do alerta e a unidade volta ao estoque do Bling.')}>Ignorar</button>
                            </>
                          ) : (
                            <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => mudarStatus(i.id, 'pendente', 'Voltar esta venda para "aguardando pedido no Bling"?')}>Reabrir</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
