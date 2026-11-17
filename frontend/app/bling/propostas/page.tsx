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
  th: { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '10px 12px', fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4, display: 'block' },
};

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
async function abrirPdf(id: string) {
  const resp = await fetch(`${API}/propostas-comerciais/${id}/pdf`, { credentials: 'include' });
  if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d?.error || `Erro ${resp.status}`); }
  const url = URL.createObjectURL(await resp.blob());
  if (!window.open(url, '_blank')) { const a = document.createElement('a'); a.href = url; a.download = `proposta-${id}.pdf`; a.click(); }
}

type ItemForm = { idPeca: string; codigo: string; produtoId: string; descricao: string; valorLista: number; quantidade: number; descontoPct: number; saldoBling: number };

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

  async function carregar(p = pagina) {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ pagina: String(p), limite: '50', busca, situacao, de, ate });
      setDados(await chamar(`/propostas-comerciais?${qs.toString()}`));
    } catch (e: any) { alert(e?.message || 'Erro ao carregar as propostas'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function salvarCliente(id: string, nome: string) {
    try {
      await chamar(`/propostas-comerciais/${id}/cliente`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
      setDetalhe((d: any) => (d ? { ...d, clienteNome: nome } : d));
      carregar(pagina);
    } catch (e: any) { alert(e?.message || 'Erro ao salvar o cliente'); }
  }

  const totalPaginas = dados ? Math.max(1, Math.ceil((dados.total || 0) / (dados.limite || 50))) : 1;

  return (
    <div style={{ padding: isPhone ? 12 : 24, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...s.input, maxWidth: 280 }} placeholder="Buscar nº, cliente, SKU ou item" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPagina(1); carregar(1); } }} />
        <select style={{ ...s.input, maxWidth: 170 }} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="todas">Todas as situações</option>
          {SITUACOES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input type="date" style={{ ...s.input, maxWidth: 150 }} value={de} onChange={(e) => setDe(e.target.value)} />
        <input type="date" style={{ ...s.input, maxWidth: 150 }} value={ate} onChange={(e) => setAte(e.target.value)} />
        <button style={s.btn} onClick={() => { setPagina(1); carregar(1); }}>Filtrar</button>
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={() => sincronizar(false)} title="Traz do Bling as propostas novas ou alteradas">Sincronizar com o Bling</button>
        <button style={{ ...s.btn, ...s.btnPri }} onClick={() => setNovaAberta(true)}>+ Nova proposta</button>
      </div>

      {sinc?.rodando && <div style={{ ...s.card, padding: 12, fontSize: 13 }}>Sincronizando com o Bling… {sinc.feitos}/{sinc.total}{sinc.erros ? ` · ${sinc.erros} erro(s)` : ''}</div>}
      {sinc && !sinc.rodando && sinc.ultimoErroCliente && <div style={{ ...s.card, padding: 12, fontSize: 13, color: '#991b1b' }}>Não foi possível ler o nome do cliente no Bling ({sinc.semNomeCliente} propostas sem nome). Motivo: {sinc.ultimoErroCliente}</div>}
      {sinc && !sinc.rodando && sinc.semNomeCliente > 0 && !sinc.ultimoErroCliente && <div style={{ ...s.card, padding: 12, fontSize: 13, color: '#92400e' }}>{sinc.semNomeCliente} proposta(s) vieram do Bling sem nome de cliente (o Bling não informou nome nem id de contato). Use “Ver dados do Bling” no detalhe da proposta.</div>}
      {sinc && !sinc.rodando && sinc.ultimoErro && <div style={{ ...s.card, padding: 12, fontSize: 13, color: '#991b1b' }}>Último erro da sincronização: {sinc.ultimoErro}</div>}

      {dados && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          <span><strong>{dados.total}</strong> propostas · soma {brl(dados.somaTotal)}</span>
          {(dados.situacoes || []).map((x: any) => <span key={x.situacao}>{pill(x.situacao)} {x.n}</span>)}
        </div>
      )}

      <div style={{ ...s.card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Nº', 'Data', 'Cliente', 'Itens', 'Total', 'Situação', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {carregando && <tr><td style={s.td} colSpan={7}>Carregando…</td></tr>}
            {!carregando && dados && !dados.itens.length && <tr><td style={s.td} colSpan={7}>Nenhuma proposta. Use “Sincronizar com o Bling” para trazer as que já existem lá.</td></tr>}
            {!carregando && (dados?.itens || []).map((p: any) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => abrirDetalhe(p.id)}>
                <td style={{ ...s.td, fontWeight: 700 }}>{p.numero ?? '—'}</td>
                <td style={s.td}>{fmtData(p.data)}</td>
                <td style={s.td}>{p.clienteNome || '—'}</td>
                <td style={s.td}>{p.qtdItens}</td>
                <td style={{ ...s.td, fontWeight: 700 }}>{brl(p.total)}</td>
                <td style={s.td}>{pill(p.situacao)}</td>
                <td style={s.td}><button style={s.btn} onClick={(e) => { e.stopPropagation(); abrirPdf(p.id).catch((er) => alert(er.message)); }}>PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <button style={s.btn} disabled={pagina <= 1} onClick={() => { setPagina(pagina - 1); carregar(pagina - 1); }}>←</button>
          <span style={{ fontSize: 13 }}>Página {pagina} de {totalPaginas}</span>
          <button style={s.btn} disabled={pagina >= totalPaginas} onClick={() => { setPagina(pagina + 1); carregar(pagina + 1); }}>→</button>
        </div>
      )}

      {detalhe && <DetalheModal key={detalhe.id} p={detalhe} onClose={() => setDetalhe(null)} onSituacao={mudarSituacao} onCliente={salvarCliente} onEditar={(x: any) => { setDetalhe(null); setEditando(x); }} />}
      {editando && <NovaPropostaModal inicial={editando} onClose={() => setEditando(null)} onCriada={(r: any) => { setEditando(null); carregar(pagina); if (r?.avisos?.length) alert(r.avisos.join('\n')); abrirDetalhe(r.id); }} />}
      {novaAberta && <NovaPropostaModal onClose={() => setNovaAberta(false)} onCriada={(r: any) => { setNovaAberta(false); carregar(1); if (r?.avisos?.length) alert(r.avisos.join('\n')); abrirDetalhe(r.id); }} />}
    </div>
  );
}

function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: any; largo?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ ...s.card, width: '100%', maxWidth: largo ? 980 : 760, padding: 20, marginTop: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{titulo}</div>
          <button style={s.btn} onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DetalheModal({ p, onClose, onSituacao, onCliente, onEditar }: { p: any; onClose: () => void; onSituacao: (id: string, s: string) => void; onCliente: (id: string, nome: string) => Promise<void>; onEditar: (p: any) => void }) {
  const itens: any[] = p.itens || [];
  const rascunho = String(p.situacao || '') === 'Rascunho';
  const [cliente, setCliente] = useState<string>(p.clienteNome || '');
  const [salvandoCli, setSalvandoCli] = useState(false);
  return (
    <Modal titulo={`Proposta Nº ${p.numero ?? ''} · ${p.clienteNome || 'sem cliente'}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>Cliente
          <input style={s.input} placeholder="Nome do cliente (aparece na lista e no PDF)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </label>
        <button style={s.btn} disabled={salvandoCli || cliente.trim() === String(p.clienteNome || '').trim()} onClick={async () => { setSalvandoCli(true); try { await onCliente(p.id, cliente.trim()); } finally { setSalvandoCli(false); } }}>Salvar cliente</button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13 }}>Data: <strong>{fmtData(p.data)}</strong></span>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>Situação
          <select style={{ ...s.input, width: 'auto' }} value={p.situacao || ''} onChange={(e) => onSituacao(p.id, e.target.value)}>
            {SITUACOES.concat(SITUACOES.indexOf(p.situacao) < 0 && p.situacao ? [p.situacao] : []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button style={s.btn} onClick={async () => { try { const d = await chamar(`/propostas-comerciais/${p.id}/bling-bruto`); alert(JSON.stringify({ contato: d.contato, camposDoTopo: d.camposDoTopo }, null, 2)); } catch (e: any) { alert(e?.message || 'Erro'); } }}>Ver dados do Bling</button>
        {rascunho && <button style={s.btn} onClick={() => onEditar(p)}>Editar</button>}
        {rascunho && <button style={{ ...s.btn, background: '#166534', color: '#fff', border: '1px solid #166534' }} onClick={() => { if (confirm(`Aprovar a proposta Nº ${p.numero ?? ''}? A situação muda de Rascunho para Aprovado no Bling.`)) onSituacao(p.id, 'Aprovado'); }}>Aprovar</button>}
        <button style={{ ...s.btn, ...s.btnPri }} onClick={() => abrirPdf(p.id).catch((er) => alert(er.message))}>Gerar PDF</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
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
      </div>
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

const baseSkuFront = (v: any) => String(v || '').trim().toUpperCase().replace(/-\d+$/, '');
function NovaPropostaModal({ onClose, onCriada, inicial }: { onClose: () => void; onCriada: (r: any) => void; inicial?: any }) {
  const edicao = !!inicial;
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
  const [descGeral, setDescGeral] = useState(inicial && inicial.desconto ? String(inicial.desconto) : '');
  const [outras, setOutras] = useState(inicial && inicial.outrasDespesas ? String(inicial.outrasDespesas) : '');
  const [frete, setFrete] = useState(inicial && inicial.frete ? String(inicial.frete) : '');
  const [descPadrao, setDescPadrao] = useState('');
  const [f, setF] = useState({ data: inicial ? String(inicial.data || '').slice(0, 10) : '', aosCuidadosDe: inicial?.aosCuidadosDe || '', introducao: inicial?.introducao || '', observacoes: inicial ? (inicial.observacoes || '') : OBS_PADRAO, prazoEntrega: inicial?.prazoEntrega || '', observacaoInterna: inicial?.observacaoInterna || '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (cliBusca.trim().length < 2 || cliSel) { setCliLista([]); return; }
    const t = setTimeout(() => { chamar(`/propostas-comerciais/clientes?q=${encodeURIComponent(cliBusca.trim())}`).then((d) => setCliLista(d.clientes || [])).catch(() => setCliLista([])); }, 300);
    return () => clearTimeout(t);
  }, [cliBusca, cliSel]);

  async function adicionarItem() {
    const cod = sku.trim();
    if (!cod) return;
    if (itens.some((i) => i.idPeca.toUpperCase() === cod.toUpperCase().replace(/-\d+$/, ''))) { setErro(`SKU ${cod} já está na proposta.`); return; }
    setValidando(true); setErro('');
    try {
      const d = await chamar(`/propostas-comerciais/item/validar?sku=${encodeURIComponent(cod)}`);
      const it = d.item;
      setItens((prev) => prev.concat([{ idPeca: it.idPeca, codigo: it.codigo, produtoId: it.produtoId, descricao: it.descricao, valorLista: it.valorLista, quantidade: 1, descontoPct: Number(descPadrao) || 0, saldoBling: it.saldoBling }]));
      setSku('');
      if (d.avisos?.length) setErro(d.avisos.join(' '));
    } catch (e: any) { setErro(e?.message || 'SKU não pôde ser adicionado'); }
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
    <Modal titulo={edicao ? `Editar proposta Nº ${inicial.numero ?? ''} (Rascunho)` : 'Nova proposta comercial'} onClose={onClose} largo>
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <span style={s.label}>Cliente</span>
          {cliSel ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{cliSel.nome}</strong><button style={s.btn} onClick={() => { setCliSel(null); setCliBusca(''); }}>Trocar</button>
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
              <input style={s.input} placeholder="Não está na base? Digite o nome do cliente (será criado no Bling só com o nome)" value={cliNome} onChange={(e) => setCliNome(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <label><span style={s.label}>Data</span><input type="date" style={s.input} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
          <label><span style={s.label}>Aos cuidados de</span><input style={s.input} value={f.aosCuidadosDe} onChange={(e) => setF({ ...f, aosCuidadosDe: e.target.value })} /></label>
          <label><span style={s.label}>Prazo de entrega</span><input style={s.input} value={f.prazoEntrega} onChange={(e) => setF({ ...f, prazoEntrega: e.target.value })} /></label>
          <label><span style={s.label}>Desconto % padrão (novos itens)</span><input style={s.input} inputMode="decimal" value={descPadrao} onChange={(e) => setDescPadrao(e.target.value.replace(',', '.'))} /></label>
        </div>
        <label><span style={s.label}>Introdução</span><textarea style={{ ...s.input, minHeight: 56 }} value={f.introducao} onChange={(e) => setF({ ...f, introducao: e.target.value })} /></label>

        <div>
          <span style={s.label}>Itens (SKU da nossa base — o estoque é conferido no Bling)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={s.input} placeholder="Ex.: HD04_0147" value={sku} onChange={(e) => setSku(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionarItem(); }} />
            <button style={{ ...s.btn, ...s.btnPri }} disabled={validando} onClick={adicionarItem}>{validando ? 'Conferindo…' : 'Adicionar'}</button>
          </div>
          {erro && <div style={{ color: '#991b1b', fontSize: 12.5, marginTop: 6 }}>{erro}</div>}
          {itens.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Código', 'Item', 'Qtd', 'Preço lista', 'Desc %', 'Preço un.', 'Total', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {itens.map((i, idx) => {
                    const un = r2(i.valorLista * (1 - i.descontoPct / 100));
                    return (
                      <tr key={i.idPeca}>
                        <td style={s.td}>{i.codigo}</td><td style={s.td}>{i.descricao}</td>
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{edicao ? 'Ao salvar, a edição também é gravada no Bling.' : 'Ao salvar, a proposta é criada no Bling como Rascunho e recebe o número do Bling.'}</span>
          <button style={s.btn} onClick={onClose}>Cancelar</button>
          <button style={{ ...s.btn, ...s.btnPri }} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Salvar proposta'}</button>
        </div>
      </div>
    </Modal>
  );
}
