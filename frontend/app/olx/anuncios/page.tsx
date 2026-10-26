'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import { useAuth } from '@/lib/auth';
import { canAccessPage } from '@/lib/permissions';
import OlxVendasPage from '../vendas/page';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
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
  if (status === 'sold') return { texto: 'Vendido', cor: '#1d4ed8', fundo: '#eff6ff' };
  if (status === 'deleted') return { texto: 'Removido', cor: '#475569', fundo: '#f1f5f9' };
  if (status === 'refused') return { texto: 'Recusado', cor: '#dc2626', fundo: '#fef2f2' };
  return { texto: status || 'Sem status', cor: '#475569', fundo: '#f1f5f9' };
}

// Aba "Pendente": SKUs que ainda vao ganhar anuncio manual na OLX. "Vincular anuncio" abre o popup com o link; ao vincular o SKU sai da fila e vai para "Publicados".
function PendentesAnuncios({ itens, isPhone, onMudou }: { itens: any[]; isPhone: boolean; onMudou: () => Promise<void> | void }) {
  const [skusNovos, setSkusNovos] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [alvo, setAlvo] = useState<any | null>(null);
  const [link, setLink] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [erroPopup, setErroPopup] = useState('');

  async function adicionar() {
    if (!skusNovos.trim()) return;
    setAdicionando(true); setAviso('');
    try {
      const r = await chamar('/olx/pendentes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus: skusNovos }) });
      const partes: string[] = [];
      if (r.adicionados?.length) partes.push(`${r.adicionados.length} adicionado(s)`);
      if (r.jaNaFila?.length) partes.push(`já na fila: ${r.jaNaFila.join(', ')}`);
      if (r.jaPublicados?.length) partes.push(`já publicado(s): ${r.jaPublicados.join(', ')}`);
      if (r.invalidos?.length) partes.push(`SKU não encontrado: ${r.invalidos.join(', ')}`);
      setAviso(partes.join(' · '));
      setSkusNovos('');
      await onMudou();
    } catch (e: any) { setAviso(e.message || 'Erro ao adicionar'); }
    setAdicionando(false);
  }

  async function remover(sku: string) {
    if (!confirm('Tirar o SKU ' + sku + ' da fila de pendentes? (Nada é alterado na OLX.)')) return;
    try { await chamar('/olx/pendentes/' + encodeURIComponent(sku), { method: 'DELETE' }); await onMudou(); }
    catch (e: any) { alert(e.message || 'Erro ao remover'); }
  }

  function abrirPopup(item: any) { setAlvo(item); setLink(''); setErroPopup(''); }

  async function vincular() {
    if (!alvo) return;
    setVinculando(true); setErroPopup('');
    try {
      const r = await chamar('/olx/anuncios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: alvo.sku, listId: link }) });
      setAlvo(null);
      await onMudou();
      alert(r.confirmado ? 'Vinculado e confirmado na OLX (' + (r.statusOlx || 'ok') + '). O SKU ' + alvo.sku + ' foi para Publicados.' : 'Vinculado. A OLX nao confirmou esse ID pela API; o vinculo fica salvo mesmo assim. O SKU ' + alvo.sku + ' foi para Publicados.');
    } catch (e: any) { setErroPopup(e.message || 'Erro ao vincular'); }
    setVinculando(false);
  }

  return (
    <>
      <div style={{ ...s.card, padding: isPhone ? 14 : 22 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Colocar SKU na fila</div>
        <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>Informe os SKUs que ainda vão ganhar anúncio manual na OLX (um ou vários, separados por espaço, vírgula ou linha). Depois de criar o anúncio, clique em “Vincular anúncio”.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <textarea style={{ ...s.input, flex: isPhone ? '1 1 100%' : '1 1 360px', width: 'auto', minHeight: 40, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace' }} placeholder="Ex: HD01_0190 BM03_0119" value={skusNovos} onChange={(e) => setSkusNovos(e.target.value)} rows={1} />
          <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', opacity: skusNovos.trim() && !adicionando ? 1 : 0.6 }} onClick={adicionar} disabled={!skusNovos.trim() || adicionando}>{adicionando ? 'Adicionando...' : 'Adicionar à fila'}</button>
        </div>
        {aviso ? <div style={{ fontSize: 12.5, color: 'var(--gray-600)', marginTop: 10 }}>{aviso}</div> : null}
      </div>

      <div style={{ ...s.card, padding: isPhone ? 12 : 22 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Pendentes de anúncio <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>({itens.length})</span></div>
        {!itens.length ? <div style={{ fontSize: 13, color: 'var(--gray-500)', padding: '10px 0' }}>Nenhum SKU pendente.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={s.th}>SKU</th><th style={s.th}>Descrição</th><th style={s.th}>Moto</th><th style={s.th}>Preço</th><th style={s.th} /></tr></thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.sku}>
                    <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{i.sku}</td>
                    <td style={s.td}>{i.encontrada ? i.descricao || '—' : <span style={{ color: '#b45309' }}>SKU não encontrado no estoque</span>}{i.encontrada && i.disponivel === false ? <span style={{ marginLeft: 8, fontSize: 11, color: '#b45309' }}>(sem estoque)</span> : null}</td>
                    <td style={{ ...s.td, color: 'var(--gray-600)' }}>{i.moto || '—'}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{i.preco != null ? Number(i.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={{ ...s.btn, padding: '6px 14px', fontSize: 12.5, background: 'var(--blue-500)', color: '#fff' }} onClick={() => abrirPopup(i)}>Vincular anúncio</button>
                      <button style={{ ...s.btn, marginLeft: 6, padding: '4px 10px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => remover(i.sku)} title="Tirar da fila">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alvo ? (
        <div onClick={() => setAlvo(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 520, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Vincular anúncio a um SKU</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 14 }}>Cole o link do anúncio na OLX (ou só o número do final). Se o SKU já tinha outro anúncio, o antigo vai para o histórico.</div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>SKU</label>
            <div style={{ ...s.input, background: 'var(--gray-50)', marginTop: 4, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{alvo.sku}</div>
            {alvo.descricao ? <div style={{ fontSize: 12.5, color: 'var(--gray-600)', marginBottom: 12 }}>{alvo.descricao}</div> : <div style={{ marginBottom: 12 }} />}
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>Link ou ID do anúncio na OLX</label>
            <input autoFocus style={{ ...s.input, marginTop: 4 }} placeholder="Link ou ID do anuncio na OLX" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && link.trim() && !vinculando) vincular(); }} />
            {erroPopup ? <div style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>{erroPopup}</div> : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }} onClick={() => setAlvo(null)}>Cancelar</button>
              <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: link.trim() && !vinculando ? 1 : 0.6 }} onClick={vincular} disabled={!link.trim() || vinculando}>{vinculando ? 'Vinculando...' : 'Vincular'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function OlxAnunciosPage() {
  const { user } = useAuth();
  const verVendas = canAccessPage(user as any, '/olx/vendas');
  const [secao, setSecao] = usePersistentTab<'publicados' | 'pendente' | 'vendas'>('aba', 'publicados', ['publicados', 'pendente', 'vendas'] as const);
  const [pendentes, setPendentes] = useState<any[]>([]);
  const [itens, setItens] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [semSku, setSemSku] = useState<any[]>([]);
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const ajustar = () => setIsPhone(typeof window !== 'undefined' && window.innerWidth <= 768);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<'ativos' | 'encerrados' | 'semvinculo'>('ativos');
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
  async function carregarPendentes() {
    try { const d = await chamar('/olx/pendentes'); setPendentes(Array.isArray(d.itens) ? d.itens : []); } catch { /* a fila e' opcional na tela */ }
  }
  async function recarregarTudo() { await Promise.all([carregar(), carregarPendentes()]); }
  useEffect(() => { carregar(); carregarPendentes(); }, []);

  async function vincular() {
    setVinculando(true);
    try {
      const r = await chamar('/olx/anuncios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: novoSku, listId: novoLink }) });
      alert(r.confirmado ? 'Vinculado e confirmado na OLX (' + (r.statusOlx || 'ok') + ').' : 'Vinculado. A OLX nao confirmou esse ID pela API; o vinculo fica salvo mesmo assim.');
      setNovoSku('');
      setNovoLink('');
      await recarregarTudo();
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

  const semSkuItens = useMemo(() => semSku.map((a) => {
    const status = a.status === 'missing' ? 'deleted' : a.status;
    const encerrado = status === 'deleted' || status === 'sold' || status === 'refused';
    return { sku: '', titulo: '', listId: a.listId, status, mensagem: '', url: a.url, ativo: !encerrado, estoque: null, precisaExcluir: false, semSku: true, criadoEm: a.primeiraVez, encerradoEm: a.atualizadoEm };
  }), [semSku]);
  const semVinculoEncerrados = useMemo(() => semSkuItens.filter((i) => !i.ativo), [semSkuItens]);
  const ativos = useMemo(() => [...itens.filter((i) => i.ativo), ...semSkuItens.filter((i) => i.ativo)], [itens, semSkuItens]);
  const encerrados = useMemo(() => [
    ...itens.filter((i) => !i.ativo),
    ...historico.map((h) => ({ ...h, ativo: false, historico: true })),
  ], [itens, historico]);
  const aExcluir = ativos.filter((i) => i.precisaExcluir);

  const lista = useMemo(() => {
    const base = aba === 'ativos' ? ativos : aba === 'semvinculo' ? semVinculoEncerrados : encerrados;
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => [i.sku, i.titulo, i.listId].join(' ').toLowerCase().indexOf(q) >= 0);
  }, [aba, ativos, encerrados, semVinculoEncerrados, busca]);

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>OLX · Anuncios</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>SKU x link do anuncio, com o status acompanhado automaticamente</div>
        </div>
        {secao !== 'vendas' && (
          <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', opacity: atualizando ? 0.7 : 1 }} onClick={atualizarStatus} disabled={atualizando}>
            {atualizando ? 'Atualizando...' : 'Atualizar status agora'}
          </button>
        )}
      </div>

      <TabsBar tabs={[{ id: 'publicados', label: 'Publicados' }, { id: 'pendente', label: 'Pendente', badge: pendentes.length || undefined }, ...(verVendas ? [{ id: 'vendas', label: 'Vendas' }] : [])]} active={secao} onChange={(id) => setSecao(id as 'publicados' | 'pendente' | 'vendas')} />

      {secao === 'vendas' && verVendas ? (
        <OlxVendasPage />
      ) : secao === 'pendente' ? (
        <div style={{ padding: isPhone ? 12 : 24, maxWidth: 1100 }}>
          <PendentesAnuncios itens={pendentes} isPhone={isPhone} onMudou={recarregarTudo} />
        </div>
      ) : (
      <div style={{ padding: isPhone ? 12 : 24, maxWidth: 1100 }}>
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

        <div style={{ ...s.card, padding: isPhone ? 14 : 22 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Vincular anuncio a um SKU</div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>Cole o link do anuncio na OLX (ou so o numero do final). Se o SKU ja tinha outro anuncio, o antigo vai para o historico.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input style={{ ...s.input, flex: isPhone ? '1 1 100%' : '1 1 160px', width: 'auto' }} placeholder="SKU (ex: HD01_0190)" value={novoSku} onChange={(e) => setNovoSku(e.target.value)} />
            <input style={{ ...s.input, flex: isPhone ? '1 1 100%' : '3 1 320px', width: 'auto' }} placeholder="Link ou ID do anuncio na OLX" value={novoLink} onChange={(e) => setNovoLink(e.target.value)} />
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: novoSku.trim() && novoLink.trim() && !vinculando ? 1 : 0.6 }} onClick={vincular} disabled={!novoSku.trim() || !novoLink.trim() || vinculando}>
              {vinculando ? 'Vinculando...' : 'Vincular'}
            </button>
          </div>
        </div>

        <div style={{ ...s.card, padding: isPhone ? 12 : 22 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            {([['ativos', `Ativos (${ativos.length})`], ['encerrados', `Ja tiveram anuncio (${encerrados.length})`], ['semvinculo', `Encerrados - Sem vinculos (${semVinculoEncerrados.length})`]] as Array<['ativos' | 'encerrados' | 'semvinculo', string]>).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => setAba(id)}
                style={{ ...s.btn, padding: '7px 16px', borderRadius: 999, background: aba === id ? 'var(--gray-800)' : 'var(--gray-50)', color: aba === id ? '#fff' : 'var(--gray-600)' }}>{rotulo}</button>
            ))}
            <input style={{ ...s.input, flex: '1 1 200px', width: 'auto', borderRadius: 999, background: 'var(--gray-50)', border: '1px solid transparent' }} placeholder="Buscar SKU ou titulo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 12 }}>Carregando...</div> : null}
          {!carregando && !lista.length ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 24, textAlign: 'center' }}>Nenhum anuncio nesta lista.</div> : null}
          {!carregando && isPhone && lista.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {lista.map((i, idx) => {
                const r = rotuloStatus(i.status, i.listId);
                return (
                  <div key={`m-${i.sku}-${i.listId}-${idx}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <strong style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{i.sku || 'sem SKU'}</strong>
                      {i.listId ? (
                        <button type="button" onClick={() => window.open(String(i.url), '_blank', 'noopener,noreferrer')} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 12px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor, cursor: 'pointer' }}>{r.texto}</button>
                      ) : <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 12px', borderRadius: 99, border: '1px solid ' + r.cor, background: r.fundo, color: r.cor }}>{r.texto}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>{i.titulo || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>ID {i.listId || 'aguardando'} · {aba === 'ativos' ? `Estoque ${i.estoque == null ? '—' : i.estoque}` : `Encerrado ${dataBr(i.encerradoEm)}`}{i.precisaExcluir ? ' · excluir' : ''}</div>
                    {i.semSku
                      ? <button style={{ ...s.btn, justifyContent: 'center', padding: '8px 12px', fontSize: 12.5, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)' }} onClick={() => { setNovoLink(String(i.url)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Vincular a um SKU</button>
                      : !i.historico ? <button style={{ ...s.btn, justifyContent: 'center', padding: '8px 12px', fontSize: 12.5, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => remover(i.sku)}>Remover vinculo</button> : null}
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
                        <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{i.sku || <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>sem SKU</span>}</td>
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
                          {i.semSku
                            ? <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)' }} onClick={() => { setNovoLink(String(i.url)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Vincular a um SKU</button>
                            : !i.historico ? <button style={{ ...s.btn, padding: '4px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--border)' }} onClick={() => remover(i.sku)}>Remover vinculo</button> : null}
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
      )}
    </>
  );
}
