'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';

const API = API_BASE;

const s: any = {
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink-soft)', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  btnPri: { background: 'var(--ink)', color: '#fff', border: '1px solid var(--ink)' },
  th: { padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '7px 10px', fontSize: 12, color: 'var(--ink)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4, display: 'block' },
};

const CSS_PHONE = '.pc-root input,.pc-root select,.pc-root textarea{font-size:16px !important}.pc-root button{min-height:40px}';
const OBS_PADRAO = 'Proposta válida por 3 dias ou enquanto durarem os estoques.';
const SITUACOES = ['Rascunho', 'Pendente', 'Aguardando', 'Aprovado', 'Não aprovado', 'Concluído'];
const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const r2 = (n: number) => Math.round(n * 100) / 100;
function fmtData(iso?: string | null) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}
function corSituacao(sit: string) {
  const t = String(sit || '').toLowerCase();
  if (/aprovad/.test(t) && !/n.o/.test(t)) return { cor: '#166534', fundo: '#dcfce7' };
  if (/n.o aprov/.test(t)) return { cor: '#991b1b', fundo: '#fee2e2' };
  if (/conclu/.test(t)) return { cor: '#1e40af', fundo: '#dbeafe' };
  if (/aguard/.test(t)) return { cor: '#92400e', fundo: '#fef3c7' };
  if (/pendent/.test(t)) return { cor: '#9a3412', fundo: '#ffedd5' };
  return { cor: '#475569', fundo: '#f1f5f9' };
}
const pill = (texto: string) => {
  const c = corSituacao(texto);
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.fundo, color: c.cor, whiteSpace: 'nowrap' }}>{texto || '—'}</span>;
};

async function chamar(path: string, init?: RequestInit) {
  const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
  return d;
}
// Nome: "Proposta Comercial - DDMMAA - Nº da proposta - Primeiro nome do cliente.pdf" (data = data da proposta)
function nomeArquivoProposta(p: any) {
  const [a, m, d] = String(p?.data || '').slice(0, 10).split('-');
  const ddmmaa = d && m && a ? `${d}${m}${a.slice(2)}` : '';
  const primeiro = String(p?.clienteNome || '').trim().split(/\s+/)[0] || '';
  const partes = ['Proposta Comercial', ddmmaa, p?.numero != null ? String(p.numero) : '', primeiro].filter(Boolean);
  return `${partes.join(' - ').replace(/[\\/:*?"<>|]/g, '')}.pdf`;
}
// Baixa o PDF direto para a pasta Downloads (sem abrir aba)
async function abrirPdf(p: any) {
  const resp = await fetch(`${API}/propostas-comerciais/${p.id}/pdf`, { credentials: 'include' });
  if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d?.error || `Erro ${resp.status}`); }
  const url = URL.createObjectURL(await resp.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivoProposta(p);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

type ItemForm = { preCadastro?: boolean; idPeca: string; codigo: string; produtoId: string; descricao: string; valorLista: number; quantidade: number; descontoPct: number; saldoBling: number };

export default function PropostasComerciaisPage() {
  const isPhone = useIsPhone();
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);
  const [sinc, setSinc] = useState<any>(null);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [excluindo, setExcluindo] = useState<any>(null);
  const [copiando, setCopiando] = useState<any>(null);
  const [fila, setFila] = useState<{ pendentes: any[] }>({ pendentes: [] });
  const [enviando, setEnviando] = useState<string | null>(null);

  async function carregar(p = pagina) {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ pagina: String(p), limite: '50', busca, situacao, de, ate });
      setDados(await chamar(`/propostas-comerciais?${qs.toString()}`));
    } catch (e: any) { alert(e?.message || 'Erro ao carregar as propostas'); }
    setCarregando(false);
  }
  async function carregarFila() {
    try { const d = await chamar('/propostas-comerciais/fila'); setFila({ pendentes: d.pendentes || [] }); } catch { /* sem fila: segue */ }
  }
  useEffect(() => { carregar(1); carregarFila(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // depois de salvar (nova, copia ou edicao): recarrega, avisa se ficou pendente de envio ao Bling e abre o detalhe
  function aposSalvar(r: any) {
    carregar(1); carregarFila();
    const msgs: string[] = [];
    if (r?.pendente) msgs.push(`Proposta Nº ${r.numero} criada SÓ no sistema (pendente de envio ao Bling).${r.motivo ? ` ${r.motivo}` : ''}`);
    if (r?.avisos?.length) msgs.push(r.avisos.join('\n'));
    if (msgs.length) alert(msgs.join('\n\n'));
    if (r?.id) abrirDetalhe(r.id);
  }
  async function enviarAoBling(p: any) {
    if (!confirm(`Enviar a proposta Nº ${p.numero} ao Bling agora?`)) return;
    setEnviando(p.id);
    try {
      const r = await chamar(`/propostas-comerciais/${p.id}/enviar-bling`, { method: 'POST' });
      if (r.avisos?.length) alert(r.avisos.join('\n'));
    } catch (e: any) { alert(e?.message || 'Erro ao enviar ao Bling'); }
    setEnviando(null); carregar(pagina); carregarFila();
  }

  // acompanha a sincronizacao com o Bling
  const timer = useRef<any>(null);
  async function sincronizar(tudo: boolean) {
    try {
      await chamar('/propostas-comerciais/sincronizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tudo }) });
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const st = await chamar('/propostas-comerciais/status');
          setSinc(st);
          if (!st.rodando) { clearInterval(timer.current); timer.current = null; carregar(1); }
        } catch { /* tenta de novo */ }
      }, 2500);
    } catch (e: any) { alert(e?.message || 'Erro ao sincronizar'); }
  }
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function abrirDetalhe(id: string) {
    try { setDetalhe((await chamar(`/propostas-comerciais/${id}`)).proposta); } catch (e: any) { alert(e?.message || 'Erro ao abrir a proposta'); }
  }
  async function mudarSituacao(id: string, nova: string) {
    try {
      await chamar(`/propostas-comerciais/${id}/situacao`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situacao: nova }) });
      setDetalhe((d: any) => (d ? { ...d, situacao: nova } : d));
      carregar(pagina);
    } catch (e: any) { alert(e?.message || 'Erro ao mudar a situação'); }
  }

  async function editarDaLinha(id: string) {
    try { setEditando((await chamar(`/propostas-comerciais/${id}`)).proposta); } catch (e: any) { alert(e?.message || 'Erro ao abrir a proposta'); }
  }
  async function copiarDaLinha(id: string) {
    try { setCopiando({ ...(await chamar(`/propostas-comerciais/${id}`)).proposta, copia: true }); } catch (e: any) { alert(e?.message || 'Erro ao abrir a proposta'); }
  }
  async function aprovarDaLinha(p: any) {
    if (!confirm(`Aprovar a proposta Nº ${p.numero ?? ''}? A situação muda de Rascunho para Aprovado no Bling.`)) return;
    await mudarSituacao(p.id, 'Aprovado');
  }

  async function salvarCliente(id: string, nome: string) {
    try {
      await chamar(`/propostas-comerciais/${id}/cliente`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
      setDetalhe((d: any) => (d ? { ...d, clienteNome: nome } : d));
      carregar(pagina);
    } catch (e: any) { alert(e?.message || 'Erro ao salvar o cliente'); }
  }

  const totalPaginas = dados ? Math.max(1, Math.ceil((dados.total || 0) / (dados.limite || 50))) : 1;

  const bt: any = isPhone ? { padding: '9px 14px', fontSize: 14 } : { padding: '5px 10px', fontSize: 12 };
  const acoes = (p: any) => (
    <>
      <button style={{ ...s.btn, ...bt }} onClick={(e) => { e.stopPropagation(); abrirPdf(p).catch((er) => alert(er.message)); }}>PDF</button>
      {p.situacao === 'Rascunho' && <button style={{ ...s.btn, ...bt }} onClick={(e) => { e.stopPropagation(); editarDaLinha(p.id); }}>Editar</button>}
      <button style={{ ...s.btn, ...bt }} title="Cria uma nova proposta já com os itens desta" onClick={(e) => { e.stopPropagation(); copiarDaLinha(p.id); }}>Copiar</button>
      <button style={{ ...s.btn, ...bt, color: '#991b1b' }} onClick={(e) => { e.stopPropagation(); setExcluindo(p); }}>Excluir</button>
      {p.integracao === 'pendente' && <button disabled={enviando === p.id} title="Envia esta proposta ao Bling" style={{ ...s.btn, ...bt, background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' }} onClick={(e) => { e.stopPropagation(); enviarAoBling(p); }}>{enviando === p.id ? 'Enviando…' : 'Enviar ao Bling'}</button>}
      {p.situacao === 'Rascunho' && (!p.integracao || p.integracao === 'ok') && <button style={{ ...s.btn, ...bt, background: '#166534', color: '#fff', border: '1px solid #166534' }} onClick={(e) => { e.stopPropagation(); aprovarDaLinha(p); }}>Aprovar</button>}
    </>
  );
  const selo = (p: any) => (p.integracao === 'pendente'
    ? <span title={p.integracaoMotivo || ''} style={{ marginLeft: 6, display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>Pendente de envio ao Bling</span>
    : null);

  return (
    <div className="pc-root" style={{ padding: isPhone ? 12 : 24, display: 'grid', gap: 14 }}>
      {isPhone && <style>{CSS_PHONE}</style>}
      <div style={isPhone ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } : { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...s.input, maxWidth: isPhone ? undefined : 280, gridColumn: isPhone ? 'span 2' : undefined }} placeholder="Buscar nº, cliente, SKU ou item" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPagina(1); carregar(1); } }} />
        <select style={{ ...s.input, maxWidth: isPhone ? undefined : 170, gridColumn: isPhone ? 'span 2' : undefined }} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="todas">Todas as situações</option>
          {SITUACOES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input type="date" style={{ ...s.input, maxWidth: isPhone ? undefined : 150 }} value={de} onChange={(e) => setDe(e.target.value)} />
        <input type="date" style={{ ...s.input, maxWidth: isPhone ? undefined : 150 }} value={ate} onChange={(e) => setAte(e.target.value)} />
        <button style={{ ...s.btn, gridColumn: isPhone ? 'span 2' : undefined }} onClick={() => { setPagina(1); carregar(1); }}>Filtrar</button>
        {!isPhone && <div style={{ flex: 1 }} />}
        <button style={s.btn} onClick={() => sincronizar(false)} title="Traz do Bling as propostas novas ou alteradas">{isPhone ? 'Sincronizar' : 'Sincronizar com o Bling'}</button>
        <button style={{ ...s.btn, ...s.btnPri }} onClick={() => setNovaAberta(true)}>+ Nova proposta</button>
      </div>

      {sinc?.rodando && <div style={{ ...s.card, padding: 12, fontSize: 13 }}>Sincronizando com o Bling… {sinc.feitos}/{sinc.total}{sinc.erros ? ` · ${sinc.erros} erro(s)` : ''}</div>}
      {sinc && !sinc.rodando && sinc.ultimoErroCliente && <div style={{ ...s.card, padding: 12, fontSize: 13, color: '#991b1b' }}>Não foi possível ler o nome do cliente no Bling ({sinc.semNomeCliente} propostas sem nome). Motivo: {sinc.ultimoErroCliente}</div>}
      {sinc && !sinc.rodando && sinc.semNomeCliente > 0 && !sinc.ultimoErroCliente && <div style={{ ...s.card, padding: 12, fontSize: 13, color: '#92400e' }}>{sinc.semNomeCliente} proposta(s) vieram do Bling sem nome de cliente (o Bling não informou nome nem id de contato). Use “Ver dados do Bling” no detalhe da proposta.</div>}
      {sinc && !sinc.rodando && sinc.ultimoErro && <div style={{ ...s.card, padding: 12, fontSize: 13, color: '#991b1b' }}>Último erro da sincronização: {sinc.ultimoErro}</div>}

      {fila.pendentes.length > 0 && (
        <div style={{ ...s.card, padding: 12, fontSize: 13, background: '#fffbeb', borderColor: '#fde68a' }}>
          <strong>{fila.pendentes.length} proposta(s) aguardando envio ao Bling</strong> (Nº {fila.pendentes.map((x: any) => x.numero).join(', ')}). Use “Enviar ao Bling” na linha quando as peças já existirem lá. O número da proposta é nosso; o número que o Bling der fica gravado na coluna “Nº Bling”.
        </div>
      )}

      {dados && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          <span><strong>{dados.total}</strong> propostas · soma {brl(dados.somaTotal)}</span>
          {(dados.situacoes || []).map((x: any) => <span key={x.situacao}>{pill(x.situacao)} {x.n}</span>)}
        </div>
      )}

      {!isPhone && <div style={{ ...s.card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Nº', 'Nº Bling', 'Data', 'Cliente', 'Itens', 'Total', 'Situação', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {carregando && <tr><td style={s.td} colSpan={8}>Carregando…</td></tr>}
            {!carregando && dados && !dados.itens.length && <tr><td style={s.td} colSpan={8}>Nenhuma proposta. Use “Sincronizar com o Bling” para trazer as que já existem lá.</td></tr>}
            {!carregando && (dados?.itens || []).map((p: any) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => abrirDetalhe(p.id)}>
                <td style={{ ...s.td, fontWeight: 700 }}>{p.numero ?? '—'}</td>
                <td style={{ ...s.td, color: 'var(--ink-muted)' }}>{p.blingNumero ? p.blingNumero : '—'}</td>
                <td style={s.td}>{fmtData(p.data)}</td>
                <td style={s.td}>{p.clienteNome || '—'}</td>
                <td style={s.td}>{p.qtdItens}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{brl(p.total)}</td>
                <td style={s.td}>
                  {pill(p.situacao)}
                  {selo(p)}
                </td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', gap: 6 }}>{acoes(p)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {isPhone && (
        <div style={{ display: 'grid', gap: 10 }}>
          {carregando && <div style={{ ...s.card, padding: 12, fontSize: 14 }}>Carregando…</div>}
          {!carregando && dados && !dados.itens.length && <div style={{ ...s.card, padding: 12, fontSize: 14 }}>Nenhuma proposta. Use “Sincronizar” para trazer as que já existem no Bling.</div>}
          {!carregando && (dados?.itens || []).map((p: any) => (
            <div key={p.id} style={{ ...s.card, padding: 12 }} onClick={() => abrirDetalhe(p.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 17 }}>Nº {p.numero ?? '—'}</strong>
                <strong style={{ fontSize: 16 }}>{brl(p.total)}</strong>
              </div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{p.clienteNome || '—'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>{fmtData(p.data)} · {p.qtdItens} {p.qtdItens === 1 ? 'item' : 'itens'}{p.blingNumero ? ` · Bling Nº ${p.blingNumero}` : ''}</div>
              <div style={{ marginTop: 8 }}>{pill(p.situacao)}{selo(p)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>{acoes(p)}</div>
            </div>
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <button style={s.btn} disabled={pagina <= 1} onClick={() => { setPagina(pagina - 1); carregar(pagina - 1); }}>←</button>
          <span style={{ fontSize: 13 }}>Página {pagina} de {totalPaginas}</span>
          <button style={s.btn} disabled={pagina >= totalPaginas} onClick={() => { setPagina(pagina + 1); carregar(pagina + 1); }}>→</button>
        </div>
      )}

      {detalhe && <DetalheModal key={detalhe.id} p={detalhe} onClose={() => setDetalhe(null)} onSituacao={mudarSituacao} onCliente={salvarCliente} onEditar={(x: any) => { setDetalhe(null); setEditando(x); }} />}
      {copiando && <NovaPropostaModal inicial={copiando} onClose={() => setCopiando(null)} onCriada={(r: any) => { setCopiando(null); aposSalvar(r); }} />}
      {excluindo && <ExcluirModal p={excluindo} onClose={() => setExcluindo(null)} onExcluida={() => { setExcluindo(null); carregar(pagina); }} />}
      {editando && <NovaPropostaModal inicial={editando} onClose={() => setEditando(null)} onCriada={(r: any) => { setEditando(null); aposSalvar(r); }} />}
      {novaAberta && <NovaPropostaModal onClose={() => setNovaAberta(false)} onCriada={(r: any) => { setNovaAberta(false); aposSalvar(r); }} />}
    </div>
  );
}

function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: any; largo?: boolean }) {
  const isPhone = useIsPhone();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isPhone ? 0 : 16, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ ...s.card, width: '100%', maxWidth: largo ? 980 : 760, padding: isPhone ? 12 : 20, marginTop: isPhone ? 0 : 20, borderRadius: isPhone ? 0 : 14, minHeight: isPhone ? '100%' : undefined, boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14, position: isPhone ? 'sticky' : undefined, top: 0, background: isPhone ? 'var(--white)' : undefined, zIndex: 2, paddingBottom: isPhone ? 8 : 0 }}>
          <div style={{ fontSize: isPhone ? 15 : 17, fontWeight: 800, minWidth: 0 }}>{titulo}</div>
          <button style={s.btn} onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ExcluirModal({ p, onClose, onExcluida }: { p: any; onClose: () => void; onExcluida: () => void }) {
  const [modo, setModo] = useState<'local' | 'bling'>('local');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  async function excluir() {
    setSalvando(true); setErro('');
    try { await chamar(`/propostas-comerciais/${p.id}?modo=${modo}`, { method: 'DELETE' }); onExcluida(); }
    catch (e: any) { setErro(e?.message || 'Erro ao excluir'); }
    setSalvando(false);
  }
  const opcao = (valor: 'local' | 'bling', titulo: string, desc: string) => (
    <label style={{ ...s.card, padding: 12, display: 'flex', gap: 10, cursor: 'pointer', borderColor: modo === valor ? '#991b1b' : 'var(--border)' }}>
      <input type="radio" checked={modo === valor} onChange={() => setModo(valor)} />
      <span><strong>{titulo}</strong><br /><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{desc}</span></span>
    </label>
  );
  return (
    <Modal titulo={`Excluir proposta Nº ${p.numero ?? ''} · ${p.clienteNome || 'sem cliente'}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        {opcao('local', p.integracao === 'pendente' ? 'Excluir esta proposta pendente' : 'Excluir só aqui no sistema', p.integracao === 'pendente' ? 'Remove a proposta que só existe aqui.' : 'A proposta continua no Bling. A sincronização passa a ignorá-la, então ela não volta para a lista.')}
        {p.integracao === 'pendente'
          ? <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Esta proposta ainda não existe no Bling (pendente de envio). O número reservado só volta para a sequência se for o maior; caso contrário fica um buraco na numeração.</div>
          : opcao('bling', 'Excluir aqui e no Bling', 'Apaga a proposta também no Bling. Não dá para desfazer.')}
        {erro && <div style={{ color: '#991b1b', fontSize: 13 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={s.btn} onClick={onClose}>Cancelar</button>
          <button style={{ ...s.btn, background: '#991b1b', color: '#fff', border: '1px solid #991b1b' }} disabled={salvando} onClick={excluir}>{salvando ? 'Excluindo…' : 'Excluir'}</button>
        </div>
      </div>
    </Modal>
  );
}

function DetalheModal({ p, onClose, onSituacao, onCliente, onEditar }: { p: any; onClose: () => void; onSituacao: (id: string, s: string) => void; onCliente: (id: string, nome: string) => Promise<void>; onEditar: (p: any) => void }) {
  const isPhone = useIsPhone();
  const itens: any[] = p.itens || [];
  const rascunho = String(p.situacao || '') === 'Rascunho';
  const [cliente, setCliente] = useState<string>(p.clienteNome || '');
  const [salvandoCli, setSalvandoCli] = useState(false);
  const [jsonBling, setJsonBling] = useState<string | null>(null);
  return (
    <Modal titulo={`Proposta Nº ${p.numero ?? ''} · ${p.clienteNome || 'sem cliente'}`} onClose={onClose}>
      {jsonBling !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setJsonBling(null)}>
          <div style={{ ...s.card, width: '100%', maxWidth: 860, maxHeight: '85vh', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Resposta do Bling (GET /propostas-comerciais/{p.id})</strong>
              <span style={{ display: 'flex', gap: 8 }}>
                <button style={s.btn} onClick={() => { try { navigator.clipboard.writeText(jsonBling); } catch { /* sem area de transferencia */ } }}>Copiar</button>
                <button style={s.btn} onClick={() => setJsonBling(null)}>Fechar</button>
              </span>
            </div>
            <pre style={{ margin: 0, overflow: 'auto', fontSize: 12, background: 'var(--gray-50)', padding: 12, borderRadius: 8, userSelect: 'text' }}>{jsonBling}</pre>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: isPhone ? 'stretch' : 'center', flexDirection: isPhone ? 'column' : 'row', marginBottom: 12 }}>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>Cliente
          <input style={s.input} placeholder="Nome do cliente (aparece na lista e no PDF)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </label>
        <button style={s.btn} disabled={salvandoCli || cliente.trim() === String(p.clienteNome || '').trim()} onClick={async () => { setSalvandoCli(true); try { await onCliente(p.id, cliente.trim()); } finally { setSalvandoCli(false); } }}>Salvar cliente</button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13 }}>Data: <strong>{fmtData(p.data)}</strong></span>
        <span style={{ fontSize: 13 }}>Nº no Bling: <strong>{p.blingNumero ? p.blingNumero : '—'}</strong></span>
        {p.integracao === 'pendente' && <span style={{ fontSize: 12.5, color: '#92400e' }}>Pendente de envio ao Bling. {p.integracaoMotivo || ''}</span>}
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>Situação
          <select disabled={!!p.integracao && p.integracao !== 'ok'} title={p.integracao && p.integracao !== 'ok' ? 'Envie a proposta ao Bling antes de mudar a situação' : ''} style={{ ...s.input, width: 'auto' }} value={p.situacao || ''} onChange={(e) => onSituacao(p.id, e.target.value)}>
            {SITUACOES.concat(SITUACOES.indexOf(p.situacao) < 0 && p.situacao ? [p.situacao] : []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={async () => { try { const d = await chamar(`/propostas-comerciais/${p.id}/bling-bruto`); setJsonBling(JSON.stringify(d.bling, null, 2)); } catch (e: any) { alert(e?.message || 'Erro'); } }}>Ver dados do Bling</button>
        <button style={{ ...s.btn, ...s.btnPri }} onClick={() => abrirPdf(p).catch((er) => alert(er.message))}>Gerar PDF</button>
      </div>
      {isPhone && (
        <div style={{ display: 'grid', gap: 8 }}>
          {itens.map((i, k) => (
            <div key={k} style={{ ...s.card, padding: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{i.descricao}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>{i.codigo} · {i.quantidade} un. · lista {brl(i.valorLista)} · desc. {i.descontoPct}%</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{brl(r2(i.valorLista * (1 - i.descontoPct / 100) * i.quantidade))}</div>
            </div>
          ))}
          {!itens.length && <div style={{ fontSize: 14 }}>Sem itens gravados (use “Sincronizar”).</div>}
        </div>
      )}
      {!isPhone && <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Código', 'Item', 'Qtd', 'Lista', 'Desc %', 'Total'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {itens.map((i, k) => (
              <tr key={k}>
                <td style={s.td}>{i.codigo}</td><td style={s.td}>{i.descricao}</td><td style={s.td}>{i.quantidade}</td>
                <td style={s.td}>{brl(i.valorLista)}</td><td style={s.td}>{i.descontoPct}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{brl(r2(i.valorLista * (1 - i.descontoPct / 100) * i.quantidade))}</td>
              </tr>
            ))}
            {!itens.length && <tr><td style={s.td} colSpan={6}>Sem itens gravados (use “Sincronizar com o Bling”).</td></tr>}
          </tbody>
        </table>
      </div>}
      <div style={{ textAlign: 'right', marginTop: 12, fontSize: 13 }}>
        {p.desconto ? <div>Desconto: {brl(p.desconto)}</div> : null}
        {p.outrasDespesas ? <div>Outras despesas: {brl(p.outrasDespesas)}</div> : null}
        {p.frete ? <div>Frete: {brl(p.frete)}</div> : null}
        <div style={{ fontSize: 17, fontWeight: 800 }}>Total: {brl(p.total)}</div>
      </div>
      {(p.introducao || p.observacoes || p.prazoEntrega || p.observacaoInterna) && (
        <div style={{ marginTop: 12, fontSize: 13, display: 'grid', gap: 6, color: 'var(--ink-soft)' }}>
          {p.introducao && <div><strong>Introdução:</strong> {p.introducao}</div>}
          {p.prazoEntrega && <div><strong>Prazo de entrega:</strong> {p.prazoEntrega}</div>}
          {p.observacoes && <div><strong>Observações:</strong> {p.observacoes}</div>}
          {p.observacaoInterna && <div><strong>Obs. interna:</strong> {p.observacaoInterna}</div>}
        </div>
      )}
    </Modal>
  );
}

// data de hoje (fuso de Sao Paulo) no formato do campo de data: AAAA-MM-DD
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function BuscaPecasModal({ onClose, onAdicionar, jaNaProposta }: { onClose: () => void; onAdicionar: (sku: string) => Promise<boolean>; jaNaProposta: string[] }) {
  const isPhone = useIsPhone();
  const [q, setQ] = useState('');
  const [origem, setOrigem] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [ano, setAno] = useState('');
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');
  const [pagina, setPagina] = useState(1);
  const [res, setRes] = useState<any>({ itens: [], total: 0, limite: 30 });
  const [filtros, setFiltros] = useState<any>({ marcas: [], modelos: [], anos: [] });
  const [carregando, setCarregando] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [ja, setJa] = useState<string[]>(jaNaProposta);

  // opcoes dos filtros em cascata: marca -> modelo -> ano (so o que tem peca)
  useEffect(() => {
    chamar(`/propostas-comerciais/item/filtros?${new URLSearchParams({ marca, modelo, origem }).toString()}`).then((d) => setFiltros(d)).catch(() => undefined);
  }, [marca, modelo, origem]);

  useEffect(() => {
    setCarregando(true);
    const h = setTimeout(() => {
      const qs = new URLSearchParams({ q, origem, marca, modelo, ano, precoMin, precoMax, pagina: String(pagina), limite: '30' });
      chamar(`/propostas-comerciais/item/buscar?${qs.toString()}`).then((d) => { setRes(d); setCarregando(false); }).catch((e) => { setCarregando(false); alert(e?.message || 'Erro na busca'); });
    }, 300);
    return () => clearTimeout(h);
  }, [q, origem, marca, modelo, ano, precoMin, precoMax, pagina]);

  const mudaFiltro = (fn: () => void) => { fn(); setPagina(1); };
  const alternar = (sku: string) => setMarcados((prev) => (prev.indexOf(sku) >= 0 ? prev.filter((x) => x !== sku) : prev.concat([sku])));
  async function adicionarMarcados() {
    setAdicionando(true);
    const feitos: string[] = [];
    for (const sku of marcados) { if (await onAdicionar(sku)) feitos.push(sku.toUpperCase()); }
    setJa((prev) => prev.concat(feitos));
    setMarcados((prev) => prev.filter((x) => feitos.indexOf(x.toUpperCase()) < 0));
    setAdicionando(false);
  }
  const totalPag = Math.max(1, Math.ceil((res.total || 0) / (res.limite || 30)));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isPhone ? 0 : 16, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ ...s.card, width: '100%', maxWidth: 1000, padding: isPhone ? 12 : 16, marginTop: isPhone ? 0 : 10, borderRadius: isPhone ? 0 : 14, minHeight: isPhone ? '100%' : undefined, boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Buscar peças</div>
          <button style={s.btn} onClick={onClose}>Fechar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 10 }}>
          <input style={{ ...s.input, gridColumn: isPhone ? '1 / -1' : 'span 2' }} placeholder="SKU, descrição, marca ou modelo" value={q} onChange={(e) => mudaFiltro(() => setQ(e.target.value))} autoFocus />
          <select style={s.input} value={origem} onChange={(e) => mudaFiltro(() => { setOrigem(e.target.value); setMarca(''); setModelo(''); setAno(''); })}>
            <option value="">Estoque e pré-cadastro</option><option value="estoque">Só em estoque</option><option value="pre_cadastro">Só pré-cadastro</option>
          </select>
          <select style={s.input} value={marca} onChange={(e) => mudaFiltro(() => { setMarca(e.target.value); setModelo(''); setAno(''); })}>
            <option value="">Todas as marcas</option>
            {(filtros.marcas || []).map((m: any) => <option key={m.marca} value={m.marca}>{m.marca} ({m.n})</option>)}
          </select>
          <select style={s.input} value={modelo} disabled={!marca} onChange={(e) => mudaFiltro(() => { setModelo(e.target.value); setAno(''); })}>
            <option value="">{marca ? 'Todos os modelos' : 'Modelo (escolha a marca)'}</option>
            {(filtros.modelos || []).map((m: any) => <option key={m.modelo} value={m.modelo}>{m.modelo} ({m.n})</option>)}
          </select>
          <select style={s.input} value={ano} disabled={!modelo} onChange={(e) => mudaFiltro(() => setAno(e.target.value))}>
            <option value="">{modelo ? 'Todos os anos' : 'Ano (escolha o modelo)'}</option>
            {(filtros.anos || []).map((a: any) => <option key={String(a.ano)} value={a.ano ?? ''}>{a.ano ?? 's/ ano'} ({a.n})</option>)}
          </select>
          <input style={s.input} inputMode="decimal" placeholder="Preço mín." value={precoMin} onChange={(e) => mudaFiltro(() => setPrecoMin(e.target.value.replace(',', '.')))} />
          <input style={s.input} inputMode="decimal" placeholder="Preço máx." value={precoMax} onChange={(e) => mudaFiltro(() => setPrecoMax(e.target.value.replace(',', '.')))} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>
          <span>{carregando ? 'Buscando…' : `${res.total} peça(s)`}</span>
          <div style={{ flex: 1 }} />
          <button style={s.btn} onClick={() => { setQ(''); setOrigem(''); setMarca(''); setModelo(''); setAno(''); setPrecoMin(''); setPrecoMax(''); setPagina(1); }}>Limpar filtros</button>
          <button style={{ ...s.btn, ...s.btnPri }} disabled={!marcados.length || adicionando} onClick={adicionarMarcados}>{adicionando ? 'Adicionando…' : `Adicionar selecionadas (${marcados.length})`}</button>
        </div>
        {isPhone && (
          <div style={{ display: 'grid', gap: 8 }}>
            {(res.itens || []).map((x: any) => {
              const naProposta = ja.indexOf(String(x.sku).toUpperCase()) >= 0;
              return (
                <div key={x.sku} style={{ ...s.card, padding: 10, opacity: naProposta ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input type="checkbox" style={{ marginTop: 4, width: 20, height: 20 }} disabled={naProposta} checked={marcados.indexOf(x.sku) >= 0} onChange={() => alternar(x.sku)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{x.sku} <span style={{ fontWeight: 400 }}>· {x.descricao}</span></div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>{x.marca} {x.modelo}{x.ano ? ` ${x.ano}` : ''} · {x.origem === 'pre_cadastro' ? 'pré-cadastro' : 'estoque'}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{brl(x.preco)}</div>
                    </div>
                    {naProposta ? <span style={{ fontSize: 12 }}>na proposta</span> : <button style={{ ...s.btn, padding: '8px 12px' }} disabled={adicionando} onClick={async () => { setAdicionando(true); if (await onAdicionar(x.sku)) setJa((prev) => prev.concat([String(x.sku).toUpperCase()])); setAdicionando(false); }}>Adicionar</button>}
                  </div>
                </div>
              );
            })}
            {!carregando && !(res.itens || []).length && <div style={{ fontSize: 14 }}>Nenhuma peça com esses filtros.</div>}
          </div>
        )}
        {!isPhone && <div style={{ overflowX: 'auto', maxHeight: '52vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['', 'SKU', 'Descrição', 'Moto', 'Origem', 'Preço', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(res.itens || []).map((x: any) => {
                const naProposta = ja.indexOf(String(x.sku).toUpperCase()) >= 0;
                return (
                  <tr key={x.sku} style={{ opacity: naProposta ? 0.5 : 1 }}>
                    <td style={s.td}><input type="checkbox" disabled={naProposta} checked={marcados.indexOf(x.sku) >= 0} onChange={() => alternar(x.sku)} /></td>
                    <td style={{ ...s.td, fontWeight: 700 }}>{x.sku}</td>
                    <td style={s.td}>{x.descricao}</td>
                    <td style={s.td}>{x.marca} {x.modelo}{x.ano ? ` ${x.ano}` : ''}</td>
                    <td style={s.td}>{x.origem === 'pre_cadastro' ? <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>pré-cadastro</span> : 'Estoque'}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>{brl(x.preco)}</td>
                    <td style={s.td}>{naProposta ? <span style={{ fontSize: 12 }}>na proposta</span> : <button style={{ ...s.btn, padding: '4px 10px', fontSize: 12 }} disabled={adicionando} onClick={async () => { setAdicionando(true); if (await onAdicionar(x.sku)) setJa((prev) => prev.concat([String(x.sku).toUpperCase()])); setAdicionando(false); }}>Adicionar</button>}</td>
                  </tr>
                );
              })}
              {!carregando && !(res.itens || []).length && <tr><td style={s.td} colSpan={7}>Nenhuma peça com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>}
        {totalPag > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
            <button style={s.btn} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>←</button>
            <span style={{ fontSize: 13 }}>Página {pagina} de {totalPag}</span>
            <button style={s.btn} disabled={pagina >= totalPag} onClick={() => setPagina(pagina + 1)}>→</button>
          </div>
        )}
      </div>
    </div>
  );
}

const baseSkuFront = (v: any) => String(v || '').trim().toUpperCase().replace(/-\d+$/, '');
function NovaPropostaModal({ onClose, onCriada, inicial }: { onClose: () => void; onCriada: (r: any) => void; inicial?: any }) {
  const isPhone = useIsPhone();
  const copia = !!inicial?.copia;
  const edicao = !!inicial && !copia;
  const [cliBusca, setCliBusca] = useState('');
  const [cliLista, setCliLista] = useState<any[]>([]);
  const [cliSel, setCliSel] = useState<{ id: string; nome: string } | null>(inicial && inicial.clienteId ? { id: String(inicial.clienteId), nome: String(inicial.clienteNome || `Contato ${inicial.clienteId}`) } : null);
  const [cliNome, setCliNome] = useState(inicial && !inicial.clienteId ? String(inicial.clienteNome || '') : '');
  const [sku, setSku] = useState('');
  const [validando, setValidando] = useState(false);
  const [itens, setItens] = useState<ItemForm[]>(inicial ? (inicial.itens || []).map((i: any) => ({
    idPeca: baseSkuFront(i.codigo), codigo: String(i.codigo || ''), produtoId: String(i.produtoId || ''), descricao: String(i.descricao || ''),
    valorLista: Number(i.valorLista) || 0, quantidade: Number(i.quantidade) || 1, descontoPct: Number(i.descontoPct) || 0, saldoBling: 9999,
  })) : []);
  const [descGeral, setDescGeral] = useState(inicial && !copia && inicial.desconto ? String(inicial.desconto) : '');
  const [outras, setOutras] = useState(inicial && !copia && inicial.outrasDespesas ? String(inicial.outrasDespesas) : '');
  const [frete, setFrete] = useState(inicial && !copia && inicial.frete ? String(inicial.frete) : '');
  // campo "Desconto %" de cima: se todos os itens ja tem o mesmo desconto, ele comeca mostrando esse valor
  const [descPadrao, setDescPadrao] = useState(() => {
    const lista: any[] = inicial && inicial.itens ? inicial.itens : [];
    const d0 = lista.length ? Number(lista[0].descontoPct) || 0 : 0;
    return lista.length && d0 > 0 && lista.every((i: any) => (Number(i.descontoPct) || 0) === d0) ? String(d0) : '';
  });
  const [f, setF] = useState({ data: inicial && !copia ? String(inicial.data || '').slice(0, 10) : hojeSP(), aosCuidadosDe: copia ? '' : (inicial?.aosCuidadosDe || ''), introducao: inicial?.introducao || '', observacoes: inicial && !copia ? (inicial.observacoes || '') : OBS_PADRAO, prazoEntrega: inicial?.prazoEntrega || '', observacaoInterna: copia ? '' : (inicial?.observacaoInterna || '') });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [numeroProp, setNumeroProp] = useState(inicial && !copia && inicial.blingNumero ? String(inicial.blingNumero) : '');

  useEffect(() => {
    if (cliBusca.trim().length < 2 || cliSel) { setCliLista([]); return; }
    const t = setTimeout(() => { chamar(`/propostas-comerciais/clientes?q=${encodeURIComponent(cliBusca.trim())}`).then((d) => setCliLista(d.clientes || [])).catch(() => setCliLista([])); }, 300);
    return () => clearTimeout(t);
  }, [cliBusca, cliSel]);

  const itensRef = useRef<ItemForm[]>(itens);
  itensRef.current = itens;
  const descPadraoRef = useRef(descPadrao);
  descPadraoRef.current = descPadrao;

  // Valida o SKU no servidor (estoque na base + Bling, ou limite do pre-cadastro) e inclui na proposta.
  async function adicionarPorSku(codEntrada: string): Promise<boolean> {
    const cod = String(codEntrada || '').trim();
    if (!cod) return false;
    const base = cod.toUpperCase().replace(/-\d+$/, '');
    if (itensRef.current.some((i) => i.idPeca.toUpperCase() === base)) { setErro(`SKU ${cod} já está na proposta.`); return false; }
    setValidando(true); setErro('');
    try {
      const d = await chamar(`/propostas-comerciais/item/validar?sku=${encodeURIComponent(cod)}`);
      const it = d.item;
      const novo: ItemForm = { preCadastro: !!it.preCadastro, idPeca: it.idPeca, codigo: it.codigo, produtoId: it.produtoId, descricao: it.descricao, valorLista: it.valorLista, quantidade: 1, descontoPct: Number(descPadraoRef.current) || 0, saldoBling: it.saldoBling };
      itensRef.current = itensRef.current.concat([novo]);
      setItens((prev) => prev.concat([novo]));
      if (d.avisos?.length) setErro(d.avisos.join(' '));
      setValidando(false);
      return true;
    } catch (e: any) { setErro(e?.message || 'SKU não pôde ser adicionado'); }
    setValidando(false);
    return false;
  }
  async function adicionarItem() {
    const cod = sku.trim();
    if (!cod) return;
    if (await adicionarPorSku(cod)) { setSku(''); setSugestoes([]); }
  }

  // Ajuda de pesquisa: ao digitar SKU ou descricao, lista sugestoes (estoque + pre-cadastro)
  const [sugestoes, setSugestoes] = useState<any[]>([]);
  const [focoSku, setFocoSku] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  useEffect(() => {
    const t = sku.trim();
    if (t.length < 2) { setSugestoes([]); return; }
    const h = setTimeout(() => {
      chamar(`/propostas-comerciais/item/buscar?q=${encodeURIComponent(t)}&limite=8`).then((d) => setSugestoes(d.itens || [])).catch(() => setSugestoes([]));
    }, 250);
    return () => clearTimeout(h);
  }, [sku]);
  // Edicao: refaz o preco de lista de cada item com o preco atual da nossa base (util se o Bling gravou o preco errado)
  async function precosDaBase() {
    setErro(''); setValidando(true);
    try {
      const novos: ItemForm[] = [];
      for (const it of itens) {
        const d = await chamar(`/propostas-comerciais/item/validar?sku=${encodeURIComponent(it.idPeca)}`);
        novos.push({ ...it, valorLista: d.item.valorLista > 0 ? d.item.valorLista : it.valorLista, produtoId: d.item.produtoId || it.produtoId, saldoBling: d.item.saldoBling });
      }
      setItens(novos);
    } catch (e: any) { setErro(e?.message || 'Não foi possível atualizar os preços'); }
    setValidando(false);
  }
  const mudar = (idx: number, campo: keyof ItemForm, valor: number) => setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));

  const totalItens = r2(itens.reduce((t, i) => t + r2(i.valorLista * (1 - i.descontoPct / 100)) * i.quantidade, 0));
  const total = r2(totalItens - (Number(descGeral) || 0) + (Number(outras) || 0) + (Number(frete) || 0));

  async function salvar() {
    setErro('');
    if (!cliSel && !cliNome.trim()) { setErro('Escolha um cliente da base ou digite o nome.'); return; }
    if (!itens.length) { setErro('Inclua ao menos um item.'); return; }
    setSalvando(true);
    try {
      const corpo: any = {
        clienteId: cliSel ? cliSel.id : undefined, clienteNome: cliSel ? undefined : cliNome.trim(), data: f.data || undefined,
        numero: edicao && Number(numeroProp) > 0 ? Number(numeroProp) : undefined,
        aosCuidadosDe: f.aosCuidadosDe, introducao: f.introducao, observacoes: f.observacoes, prazoEntrega: f.prazoEntrega, observacaoInterna: f.observacaoInterna,
        desconto: Number(descGeral) || 0, outrasDespesas: Number(outras) || 0, frete: Number(frete) || 0,
        itens: itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade, descontoPct: i.descontoPct, valorLista: i.valorLista })),
      };
      const r = edicao
        ? await chamar(`/propostas-comerciais/${inicial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
        : await chamar('/propostas-comerciais', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      onCriada(r);
    } catch (e: any) { setErro(e?.message || 'Erro ao salvar'); }
    setSalvando(false);
  }

  return (
    <Modal titulo={edicao ? `Editar proposta Nº ${inicial.numero ?? ''} (Rascunho)` : copia ? `Nova proposta (cópia da Nº ${inicial.numero ?? ''})` : 'Nova proposta comercial'} onClose={onClose} largo>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <span style={s.label}>Cliente</span>
          {cliSel ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{cliSel.nome}</strong>
              <button style={s.btn} onClick={() => { setCliSel(null); setCliBusca(''); }}>Trocar</button>
              <button style={{ ...s.btn, color: '#991b1b' }} onClick={() => { setCliSel(null); setCliBusca(''); setCliNome(''); }}>Limpar</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <input style={s.input} placeholder="Buscar cliente da base (nome ou CPF/CNPJ)" value={cliBusca} onChange={(e) => setCliBusca(e.target.value)} />
              {cliLista.length > 0 && (
                <div style={{ ...s.card, maxHeight: 180, overflowY: 'auto' }}>
                  {cliLista.map((c) => (
                    <div key={c.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }} onClick={() => { setCliSel({ id: c.id, nome: c.nome }); setCliBusca(''); setCliLista([]); }}>
                      <strong>{c.nome}</strong> <span style={{ color: 'var(--ink-muted)' }}>{c.documento || ''} {c.cidade ? `· ${c.cidade}/${c.uf || ''}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={s.input} placeholder="Não está na base? Digite o nome do cliente (será criado no Bling só com o nome)" value={cliNome} onChange={(e) => setCliNome(e.target.value)} />
                {(cliNome || cliBusca) && <button style={{ ...s.btn, color: '#991b1b' }} onClick={() => { setCliNome(''); setCliBusca(''); setCliLista([]); }}>Limpar</button>}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          {edicao && <label><span style={s.label}>Nº no Bling (reenviado ao salvar)</span><input style={s.input} inputMode="numeric" value={numeroProp} onChange={(e) => setNumeroProp(e.target.value.replace(/\D/g, ''))} /></label>}
          <label><span style={s.label}>Data</span><input type="date" style={s.input} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
          <label><span style={s.label}>Aos cuidados de</span><input style={s.input} value={f.aosCuidadosDe} onChange={(e) => setF({ ...f, aosCuidadosDe: e.target.value })} /></label>
          <label><span style={s.label}>Prazo de entrega</span><input style={s.input} value={f.prazoEntrega} onChange={(e) => setF({ ...f, prazoEntrega: e.target.value })} /></label>
          <label><span style={s.label}>Desconto % (todos os itens)</span><input style={s.input} inputMode="decimal" value={descPadrao} onChange={(e) => { const v = e.target.value.replace(',', '.'); setDescPadrao(v); const pct = Math.min(100, Math.max(0, Number(v) || 0)); setItens((prev) => prev.map((it) => ({ ...it, descontoPct: pct }))); }} /></label>
        </div>
        <label><span style={s.label}>Introdução</span><textarea style={{ ...s.input, minHeight: 56 }} value={f.introducao} onChange={(e) => setF({ ...f, introducao: e.target.value })} /></label>

        <div>
          <span style={s.label}>Itens (SKU ou descrição) — peça em estoque tem o saldo conferido no Bling; peça em pré-cadastro respeita o limite do pré-cadastro</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: isPhone ? '1 1 100%' : 1 }}>
              <input style={s.input} placeholder="Digite o SKU ou parte da descrição (ex.: HD04_0147 ou embreagem fat boy)" value={sku}
                onFocus={() => setFocoSku(true)} onBlur={() => setTimeout(() => setFocoSku(false), 200)}
                onChange={(e) => setSku(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionarItem(); if (e.key === 'Escape') setSugestoes([]); }} />
              {focoSku && sugestoes.length > 0 && (
                <div style={{ ...s.card, position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)', marginTop: 4 }}>
                  {sugestoes.map((x: any) => (
                    <div key={x.sku} style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'baseline' }}
                      onMouseDown={(e) => { e.preventDefault(); setSku(''); setSugestoes([]); adicionarPorSku(x.sku); }}>
                      <strong style={{ whiteSpace: 'nowrap' }}>{x.sku}</strong>
                      <span style={{ flex: 1 }}>{x.descricao} <span style={{ color: 'var(--ink-muted)' }}>· {x.marca} {x.modelo}{x.ano ? ` ${x.ano}` : ''}</span></span>
                      {x.origem === 'pre_cadastro' && <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>pré-cadastro</span>}
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{brl(x.preco)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button style={s.btn} title="Abrir a busca com filtros (marca, modelo, ano...)" onClick={() => setBuscaAberta(true)}>🔍 Buscar peças</button>
            <button style={{ ...s.btn, ...s.btnPri }} disabled={validando} onClick={adicionarItem}>{validando ? 'Conferindo…' : 'Adicionar'}</button>
          </div>
          {buscaAberta && <BuscaPecasModal jaNaProposta={itens.map((i) => i.idPeca.toUpperCase())} onAdicionar={adicionarPorSku} onClose={() => setBuscaAberta(false)} />}
          {erro && <div style={{ color: '#991b1b', fontSize: 12.5, marginTop: 6 }}>{erro}</div>}
          {itens.length > 0 && <button style={{ ...s.btn, marginTop: 8 }} disabled={validando} onClick={precosDaBase}>Usar preços da base nos itens</button>}
          {isPhone && itens.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {itens.map((i, idx) => {
                const un = r2(i.valorLista * (1 - i.descontoPct / 100));
                return (
                  <div key={i.idPeca} style={{ ...s.card, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{i.descricao}{i.preCadastro && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>pré-cadastro</span>}</div>
                      <button style={s.btn} onClick={() => setItens((prev) => prev.filter((_, k) => k !== idx))}>✕</button>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '2px 0 8px' }}>{i.codigo}{i.saldoBling < 9999 ? ` · máx. ${i.saldoBling} un.` : ''}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <label><span style={s.label}>Qtd</span><input style={s.input} inputMode="numeric" value={i.quantidade} onChange={(e) => mudar(idx, 'quantidade', Math.min(i.saldoBling, Math.max(1, Number(e.target.value) || 1)))} /></label>
                      <label><span style={s.label}>Lista</span><input style={s.input} inputMode="decimal" value={i.valorLista} onChange={(e) => mudar(idx, 'valorLista', Number(e.target.value.replace(',', '.')) || 0)} /></label>
                      <label><span style={s.label}>Desc %</span><input style={s.input} inputMode="decimal" value={i.descontoPct} onChange={(e) => mudar(idx, 'descontoPct', Math.min(100, Math.max(0, Number(e.target.value.replace(',', '.')) || 0)))} /></label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}><span>Unitário {brl(un)}</span><strong style={{ fontSize: 15 }}>{brl(r2(un * i.quantidade))}</strong></div>
                  </div>
                );
              })}
            </div>
          )}
          {!isPhone && itens.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Código', 'Item', 'Qtd', 'Preço lista', 'Desc %', 'Preço un.', 'Total', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {itens.map((i, idx) => {
                    const un = r2(i.valorLista * (1 - i.descontoPct / 100));
                    return (
                      <tr key={i.idPeca}>
                        <td style={s.td}>{i.codigo}</td><td style={s.td}>{i.descricao}{i.preCadastro && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>pré-cadastro</span>}</td>
                        <td style={s.td}><input style={{ ...s.input, width: 60 }} inputMode="numeric" value={i.quantidade} onChange={(e) => mudar(idx, 'quantidade', Math.min(i.saldoBling, Math.max(1, Number(e.target.value) || 1)))} /></td>
                        <td style={s.td}><input style={{ ...s.input, width: 100 }} inputMode="decimal" value={i.valorLista} onChange={(e) => mudar(idx, 'valorLista', Number(e.target.value.replace(',', '.')) || 0)} /></td>
                        <td style={s.td}><input style={{ ...s.input, width: 70 }} inputMode="decimal" value={i.descontoPct} onChange={(e) => mudar(idx, 'descontoPct', Math.min(100, Math.max(0, Number(e.target.value.replace(',', '.')) || 0)))} /></td>
                        <td style={s.td}>{brl(un)}</td><td style={{ ...s.td, fontWeight: 700 }}>{brl(r2(un * i.quantidade))}</td>
                        <td style={s.td}><button style={s.btn} onClick={() => setItens((prev) => prev.filter((_, k) => k !== idx))}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
          <label><span style={s.label}>Desconto (R$)</span><input style={s.input} inputMode="decimal" value={descGeral} onChange={(e) => setDescGeral(e.target.value.replace(',', '.'))} /></label>
          <label><span style={s.label}>Outras despesas (R$)</span><input style={s.input} inputMode="decimal" value={outras} onChange={(e) => setOutras(e.target.value.replace(',', '.'))} /></label>
          <label><span style={s.label}>Frete (R$)</span><input style={s.input} inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value.replace(',', '.'))} /></label>
          <div><span style={s.label}>Total da proposta</span><div style={{ fontSize: 20, fontWeight: 800 }}>{brl(total)}</div></div>
        </div>
        <label><span style={s.label}>Observações (aparecem na proposta)</span><textarea style={{ ...s.input, minHeight: 56 }} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></label>
        <label><span style={s.label}>Observação interna (só no Bling)</span><textarea style={{ ...s.input, minHeight: 44 }} value={f.observacaoInterna} onChange={(e) => setF({ ...f, observacaoInterna: e.target.value })} /></label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {!edicao && itens.some((i) => i.preCadastro) && <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Há peça em pré-cadastro: a proposta será criada só aqui (pendente de envio ao Bling), com o número já reservado.</span>}
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{edicao ? 'Ao salvar, a edição também é gravada no Bling.' : 'Ao salvar, a proposta é criada no Bling como Rascunho e recebe o número do Bling.'}</span>
          <button style={s.btn} onClick={onClose}>Cancelar</button>
          <button style={{ ...s.btn, ...s.btnPri }} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Salvar proposta'}</button>
        </div>
      </div>
    </Modal>
  );
}
