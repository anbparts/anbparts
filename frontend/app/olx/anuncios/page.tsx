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

function dataBr(v: any) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rotuloStatus(status: string, listId: string) {
  if (!listId) return { texto: 'Em analise', cor: '#92400e', fundo: '#fffbeb' };
  if (status === 'published' || status === 'accepted') return { texto: 'No ar', cor: '#16a34a', fundo: '#f0fdf4' };
  if (status === 'pending' || status === 'queued' || status === 'pending_review') return { texto: 'Em analise', cor: '#92400e', fundo: '#fffbeb' };
  if (status === 'deleted') return { texto: 'Removido', cor: '#475569', fundo: '#f1f5f9' };
  if (status === 'refused') return { texto: 'Recusado', cor: '#dc2626', fundo: '#fef2f2' };
  return { texto: status || 'Sem status', cor: '#475569', fundo: '#f1f5f9' };
}

export default function OlxAnunciosPage() {
  const [itens, setItens] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [semSku, setSemSku] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<'ativos' | 'encerrados'>('ativos');
  const [busca, setBusca] = useState('');
  const [novoSku, setNovoSku] = useState('');
  const [novoLink, setNovoLink] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const d = await chamar('/olx/anuncios');
      setItens(Array.isArray(d.itens) ? d.itens : []);
      setHistorico(Array.isArray(d.historico) ? d.historico : []);
      setSemSku(Array.isArray(d.semSku) ? d.semSku : []);
    } catch (e: any) { alert(e.message || 'Erro ao carregar os anuncios'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);

  async function vincular() {
    setVinculando(true);
    try {
      const r = await chamar('/olx/anuncios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: novoSku, listId: novoLink }) });
      alert(r.confirmado ? 'Vinculado e confirmado na OLX (' + (r.statusOlx || 'ok') + ').' : 'Vinculado. A OLX nao confirmou esse ID pela API; o vinculo fica salvo mesmo assim.');
      setNovoSku('');
      setNovoLink('');
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao vincular'); }
    setVinculando(false);
  }

  async function atualizarStatus() {
    setAtualizando(true);
    try {
      await chamar('/olx/anuncios/atualizar', { method: 'POST' });
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao atualizar o status'); }
    setAtualizando(false);
  }

  async function remover(sku: string) {
    if (!confirm('Remover o vinculo do SKU ' + sku + '? O anuncio vai para o historico (nada e apagado na OLX).')) return;
    try {
      await chamar('/olx/anuncios/' + encodeURIComponent(sku), { method: 'DELETE' });
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao remover'); }
  }

  async function confirmarExcluido(sku: string) {
    if (!confirm('Confirmar que o anuncio do SKU ' + sku + ' foi EXCLUIDO na OLX?')) return;
    try {
      await chamar('/olx/anuncios/' + encodeURIComponent(sku) + '/excluido', { method: 'POST' });
      await carregar();
    } catch (e: any) { alert(e.message || 'Erro ao confirmar'); }
  }

  const ativos = useMemo(() => itens.filter((i) => i.ativo), [itens]);
  const encerrados = useMemo(() => [
    ...itens.filter((i) => !i.ativo),
    ...historico.map((h) => ({ ...h, ativo: false, historico: true })),
  ], [itens, historico]);
  const aExcluir = ativos.filter((i) => i.precisaExcluir);

  const lista = useMemo(() => {
    const base = aba === 'ativos' ? ativos : encerrados;
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => [i.sku, i.titulo, i.listId].join(' ').toLowerCase().indexOf(q) >= 0);
  }, [aba, ativos, encerrados, busca]);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>OLX · Anuncios</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>SKU x link do anuncio, com o status acompanhado automaticamente</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', opacity: atualizando ? 0.7 : 1 }} onClick={atualizarStatus} disabled={atualizando}>
          {atualizando ? 'Atualizando...' : 'Atualizar status agora'}
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 1100 }}>
        {aExcluir.length > 0 && (
          <div style={{ ...s.card, background: '#fffbeb', borderColor: '#fde68a' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>{aExcluir.length} anuncio(s) para excluir na OLX</div>
            <div style={{ fontSize: 13, color: '#92400e', marginBottom: 10 }}>A peca foi vendida (sem estoque) e o anuncio ainda esta no ar. Exclua na OLX; o sistema confirma sozinho quando o status mudar, ou use "Ja excluí".</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {aExcluir.map((i) => (
                <div key={i.sku} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{i.sku}</strong>
                  <span style={{ flex: '1 1 200px', color: '#78350f' }}>{i.titulo}</span>
                  <a href={i.url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue-500)' }}>Abrir na OLX</a>
                  <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }} onClick={() => confirmarExcluido(i.sku)}>Ja excluí</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {semSku.length > 0 && (
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Anuncios na OLX sem SKU vinculado ({semSku.length})</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>Estao na conta da OLX mas nao ligados a nenhum SKU. O status deles e acompanhado mesmo assim; cada mudanca fica registrada.</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {semSku.map((a) => {
                const r = rotuloStatus(a.status === 'missing' ? 'deleted' : a.status, a.listId);
                return (
                  <div key={a.listId} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-600)' }}>{a.listId}</span>
                    <button type="button" onClick={() => window.open(String(a.url), '_blank', 'noopener,noreferrer')} title="Abrir anuncio na OLX" style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor, cursor: 'pointer', fontFamily: 'Geist Mono, JetBrains Mono, monospace' }}>{r.texto}</button>
                    <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>visto em {dataBr(a.primeiraVez)}</span>
                    <button type="button" style={{ ...s.btn, padding: '3px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)', marginLeft: 'auto' }} onClick={() => { setNovoLink(String(a.url)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Vincular a um SKU</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Vincular anuncio a um SKU</div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>Cole o link do anuncio na OLX (ou so o numero do final). Se o SKU ja tinha outro anuncio, o antigo vai para o historico.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input style={{ ...s.input, flex: '1 1 160px', width: 'auto' }} placeholder="SKU (ex: HD01_0190)" value={novoSku} onChange={(e) => setNovoSku(e.target.value)} />
            <input style={{ ...s.input, flex: '3 1 320px', width: 'auto' }} placeholder="Link ou ID do anuncio na OLX" value={novoLink} onChange={(e) => setNovoLink(e.target.value)} />
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: novoSku.trim() && novoLink.trim() && !vinculando ? 1 : 0.6 }} onClick={vincular} disabled={!novoSku.trim() || !novoLink.trim() || vinculando}>
              {vinculando ? 'Vinculando...' : 'Vincular'}
            </button>
          </div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {([['ativos', `Ativos (${ativos.length})`], ['encerrados', `Ja tiveram anuncio (${encerrados.length})`]] as Array<['ativos' | 'encerrados', string]>).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => setAba(id)}
                style={{ ...s.btn, padding: '7px 16px', borderRadius: 999, background: aba === id ? 'var(--gray-800)' : 'var(--gray-50)', color: aba === id ? '#fff' : 'var(--gray-600)' }}>{rotulo}</button>
            ))}
            <input style={{ ...s.input, flex: '1 1 200px', width: 'auto', borderRadius: 999, background: 'var(--gray-50)', border: '1px solid transparent' }} placeholder="Buscar SKU ou titulo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 12 }}>Carregando...</div> : null}
          {!carregando && !lista.length ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 24, textAlign: 'center' }}>Nenhum anuncio nesta lista.</div> : null}
          {!carregando && lista.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={s.th}>SKU</th>
                    <th style={s.th}>Titulo</th>
                    <th style={s.th}>ID OLX</th>
                    <th style={s.th}>Status (clique abre o anuncio)</th>
                    {aba === 'ativos' ? <th style={s.th}>Estoque</th> : <th style={s.th}>Encerrado em</th>}
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i, idx) => {
                    const r = rotuloStatus(i.status, i.listId);
                    return (
                      <tr key={`${i.sku}-${i.listId}-${idx}`}>
                        <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{i.sku}</td>
                        <td style={{ ...s.td, color: 'var(--gray-600)', maxWidth: 360 }}>{i.titulo || '—'}</td>
                        <td style={s.td}>
                          {i.listId ? <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--gray-500)' }}>{i.listId}</span> : <span style={{ color: 'var(--gray-400)' }}>aguardando</span>}
                        </td>
                        <td style={s.td}>
                          {i.listId ? (
                            <button type="button" onClick={() => window.open(String(i.url), '_blank', 'noopener,noreferrer')} title={i.mensagem ? i.mensagem : 'Abrir anuncio na OLX'} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor, cursor: 'pointer', fontFamily: 'Geist Mono, JetBrains Mono, monospace' }}>{r.texto}</button>
                          ) : (
                            <span title={i.mensagem || ''} style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor, fontFamily: 'Geist Mono, JetBrains Mono, monospace' }}>{r.texto}</span>
                          )}
                          {i.precisaExcluir ? <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: '#92400e' }}>excluir</span> : null}
                        </td>
                        {aba === 'ativos'
                          ? <td style={s.td}>{i.estoque == null ? '—' : i.estoque}</td>
                          : <td style={{ ...s.td, color: 'var(--gray-500)' }}>{dataBr(i.encerradoEm)}</td>}
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          {!i.historico ? <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => remover(i.sku)}>Remover vinculo</button> : null}
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
