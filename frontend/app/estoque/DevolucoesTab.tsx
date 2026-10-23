'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';
import CanalBadge from '@/components/ui/CanalBadge';
import { TiposDevolucaoModal, type MotivoOpcao } from '@/components/devolucoes/DevolucaoModais';

// Estoque > Devolucoes: historico de todos os cancelamentos e devolucoes (peca, pedido, marketplace, moto, valor e motivo).
type Registro = {
  id: number; pecaId: number | null; idPeca: string | null; descricao: string | null; pedidoNum: string | null; dataVenda: string | null; dataDevolucao: string;
  motoNome: string | null; motoLabel: string | null; valor: number | null; valorLiq: number | null; frete: number | null; taxas: number | null; nfVenda: string | null; nfDevolucao: string | null; pedidoId: string | null; canal: string | null;
  motivoId: number | null; motivoNome: string | null; observacao: string | null; origem: string | null;
  clienteNome: string | null; detranStatus: string | null; criadoEm: string | null; atualizadoEm: string | null; atualizadoPor: string | null;
  statusAtual: string; localizacaoAtual: string | null;
  etiquetas: Array<{ etiqueta: string; baixada: boolean }> | null; etiquetaPendente: boolean | null; etiquetaAtual: string | null;
};

// Etiqueta Detran da devolucao: uma ou varias (pecas como motor tem 2). Clicar abre todas.
function etiquetasDe(r: Registro) { return Array.isArray(r.etiquetas) ? r.etiquetas : []; }
function statusEtiqueta(r: Registro): { texto: string; bg: string; cor: string; borda: string } | null {
  if (!etiquetasDe(r).length) return null;
  // 1) a peca esta marcada como "precisa de etiqueta nova"
  if (r.etiquetaPendente) return { texto: 'Aguardando nova etiqueta', bg: '#fffbeb', cor: '#92400e', borda: '#fde68a' };
  // 2) a peca hoje tem uma etiqueta que nao e nenhuma das da devolucao: ja recebeu etiqueta nova
  const daDevolucao = new Set(etiquetasDe(r).map((x) => x.etiqueta));
  const atuais = String(r.etiquetaAtual || '').split('/').map((x) => x.trim()).filter(Boolean);
  if (atuais.some((x) => !daDevolucao.has(x))) return { texto: 'Nova etiqueta atribuída', bg: '#f0fdf4', cor: '#15803d', borda: '#bbf7d0' };
  // 3) senao, mostra a situacao das etiquetas da propria devolucao
  if (etiquetasDe(r).every((x) => x.baixada)) return { texto: 'Etiqueta baixada', bg: '#fef2f2', cor: '#b91c1c', borda: '#fecaca' };
  return { texto: 'Etiqueta ativa', bg: '#f1f5f9', cor: '#475569', borda: '#cbd5e1' };
}
function ChipEtiqueta({ r, onAbrir }: { r: Registro; onAbrir: (r: Registro) => void }) {
  const lista = etiquetasDe(r);
  if (!lista.length) return <span style={{ color: 'var(--gray-400)' }}>—</span>;
  const varias = lista.length > 1;
  return (
    <button type="button" onClick={() => onAbrir(r)} title={varias ? 'Ver todas as etiquetas' : 'Ver detalhes da etiqueta'}
      style={varias
        ? { cursor: 'pointer', fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: '#f5f3ff', color: '#5b21b6', border: '1px solid #c4b5fd', whiteSpace: 'nowrap' }
        : { cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
      {varias ? `${lista.length} etiquetas ▾` : lista[0].etiqueta}
    </button>
  );
}
function EtiquetasModal({ r, onClose }: { r: Registro; onClose: () => void }) {
  const lista = etiquetasDe(r);
  const st = statusEtiqueta(r);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 330, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Etiquetas Detran da devolução</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>{r.idPeca} — {r.descricao}{r.pedidoNum ? ` · pedido #${r.pedidoNum}` : ''}</div>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 8 }}>
          {lista.map((x, i) => (
            <div key={`${x.etiqueta}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: 'var(--gray-800)', wordBreak: 'break-all' }}>{x.etiqueta}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, whiteSpace: 'nowrap', ...(x.baixada ? { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' } : { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }) }}>{x.baixada ? 'Baixada no Detran' : 'Não baixada'}</span>
            </div>
          ))}
          {st ? <div style={{ fontSize: 12.5, color: 'var(--gray-600)', marginTop: 4 }}>Situação: <strong style={{ color: st.cor }}>{st.texto}</strong>{r.etiquetaPendente ? ' — a peça precisa de uma etiqueta nova para voltar a ser vendida.' : ''}{r.etiquetaAtual ? <div style={{ marginTop: 4 }}>Etiqueta atual da peça: <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{r.etiquetaAtual}</span></div> : null}</div> : null}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--gray-800)', background: 'var(--gray-800)', color: '#fff' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Situacao atual da peca (hoje), independente do que aconteceu na devolucao
const STATUS: Record<string, { texto: string; bg: string; cor: string; borda: string }> = {
  estoque: { texto: 'Em estoque', bg: '#f0fdf4', cor: '#15803d', borda: '#bbf7d0' },
  em_revisao: { texto: 'Em revisão', bg: '#fffbeb', cor: '#92400e', borda: '#fde68a' },
  prejuizo: { texto: 'Prejuízo', bg: '#fef2f2', cor: '#b91c1c', borda: '#fecaca' },
  vendida: { texto: 'Vendida', bg: '#eff6ff', cor: '#1d4ed8', borda: '#bfdbfe' },
  sem_peca: { texto: 'Peça não encontrada', bg: '#f1f5f9', cor: '#475569', borda: '#cbd5e1' },
};
function ChipStatus({ r }: { r: Registro }) {
  const e = STATUS[r.statusAtual] || STATUS.sem_peca;
  return (
    <span title={r.statusAtual === 'estoque' && r.localizacaoAtual ? `Localização: ${r.localizacaoAtual}` : undefined} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: e.bg, color: e.cor, border: `1px solid ${e.borda}`, whiteSpace: 'nowrap' }}>{e.texto}</span>
  );
}
type Resposta = {
  total: number; per: number; page: number; podeEditar: boolean; canais: string[]; motivos: MotivoOpcao[];
  resumo: { qtd: number; valor: number; valorLiq: number; semMotivo: number; porMotivo: Array<{ nome: string; qtd: number }>; totalGeral: number; semMotivoGeral: number; porStatus: Record<string, number> };
  itens: Registro[];
};

// larguras fixas das colunas (px): a tabela rola na horizontal em vez de espremer o conteudo
const COLS = [158, 280, 160, 210, 130, 150, 125, 200, 96];

const ORIGENS: Record<string, string> = {
  cancelamento_importado: 'Cancelamento importado', cancelamento_estoque: 'Cancelamento no estoque', devolucao_manual: 'Devolução registrada', historico_antigo: 'Histórico anterior',
};
const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBr = (v?: string | null) => { if (!v) return '—'; const [y, m, d] = String(v).slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : v; };

const entrada: any = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontFamily: 'inherit', color: 'var(--gray-800)', minWidth: 0 };
const rotulo: any = { fontSize: 10.5, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3, display: 'block' };

// Cadastro manual e edicao da linha toda. Nao mexe em estoque nem no Bling: so no historico.
// "NF de saida" = nota da venda; "NF de entrada" = nota do retorno da peca.
const CAMPOS_VAZIOS = { sku: '', descricao: '', pedidoNum: '', canal: '', dataVenda: '', dataDevolucao: '', motoLabel: '', motoNome: '', valor: '', valorLiq: '', frete: '', taxas: '', nfVenda: '', nfDevolucao: '', motivoId: '', observacao: '' };
const txt = (v: any) => (v == null ? '' : String(v));

function DevolucaoFormModal({ registro, motivos, canais, podeGerenciar, onGerenciar, onClose, onSalvo }: { registro?: Registro | null; motivos: MotivoOpcao[]; canais: string[]; podeGerenciar: boolean; onGerenciar: () => void; onClose: () => void; onSalvo: () => void }) {
  const edicao = !!registro;
  const [f, setF] = useState<typeof CAMPOS_VAZIOS>(() => registro ? {
    sku: txt(registro.idPeca), descricao: txt(registro.descricao), pedidoNum: txt(registro.pedidoNum), canal: txt(registro.canal),
    dataVenda: txt(registro.dataVenda).slice(0, 10), dataDevolucao: txt(registro.dataDevolucao).slice(0, 10),
    motoLabel: txt(registro.motoLabel), motoNome: txt(registro.motoNome),
    valor: txt(registro.valor), valorLiq: txt(registro.valorLiq), frete: txt(registro.frete), taxas: txt(registro.taxas),
    nfVenda: txt(registro.nfVenda), nfDevolucao: txt(registro.nfDevolucao), motivoId: registro.motivoId ? String(registro.motivoId) : '', observacao: txt(registro.observacao),
  } : { ...CAMPOS_VAZIOS });
  const [info, setInfo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [buscandoNf, setBuscandoNf] = useState(false);
  const set = (k: keyof typeof CAMPOS_VAZIOS, v: string) => setF((c) => ({ ...c, [k]: v }));
  const num = (k: keyof typeof CAMPOS_VAZIOS) => (e: any) => set(k, e.target.value.replace(',', '.'));
  const canaisBase = Array.from(new Set(['Mercado Livre', 'Shopee', 'Magalu', 'Nuvemshop', 'OLX'].concat(canais)));

  // preenche a partir do SKU e do pedido (em edicao, so sobrescreve a peca quando o SKU foi trocado)
  async function consultar() {
    if (!f.sku.trim() && !f.pedidoNum.trim()) return;
    try {
      const qs = new URLSearchParams({ sku: f.sku.trim(), pedido: f.pedidoNum.trim() });
      const resp = await fetch(`${API_BASE}/devolucoes-historico/consulta?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) return;
      const skuMudou = edicao && f.sku.trim().toUpperCase() !== txt(registro?.idPeca).toUpperCase();
      const msgs: string[] = [];
      if (d.peca) msgs.push(`Peça encontrada${d.peca.motoNome ? `: ${[d.peca.motoLabel, d.peca.motoNome].filter(Boolean).join(' · ')}` : ''}`);
      else if (f.sku.trim() && (!edicao || skuMudou)) msgs.push('SKU não encontrado no estoque: será gravado só com o que você informar');
      if (d.pedido) msgs.push(`Pedido importado (${d.pedido.canal || 'sem canal'})`);
      else if (f.pedidoNum.trim() && (!edicao || f.pedidoNum.trim() !== txt(registro?.pedidoNum))) msgs.push('Pedido não encontrado nos pedidos importados: informe o marketplace');
      setF((c) => {
        const n = { ...c };
        if (d.peca) {
          if (!n.descricao || skuMudou) n.descricao = d.peca.descricao || '';
          if (!n.motoNome || skuMudou) n.motoNome = d.peca.motoNome || '';
          if (!n.motoLabel || skuMudou) n.motoLabel = d.peca.motoLabel || '';
          if (!n.valor && d.peca.precoML) n.valor = String(d.peca.precoML);
        }
        if (d.pedido) {
          if (!n.canal && d.pedido.canal) n.canal = d.pedido.canal;
          if (!n.dataVenda && d.pedido.data) n.dataVenda = String(d.pedido.data).slice(0, 10);
          if (!n.valor && d.pedido.valorItem) n.valor = String(d.pedido.valorItem);
        }
        return n;
      });
      setInfo(msgs.join(' · '));
    } catch { /* sem consulta: preenche na mao */ }
  }

  async function buscarNf() {
    if (!f.pedidoNum.trim() && !registro?.pedidoId) { setInfo('Informe o número do pedido para buscar a NF no Bling.'); return; }
    setBuscandoNf(true); setInfo(''); setErro('');
    try {
      const qs = new URLSearchParams({ pedido: f.pedidoNum.trim(), pedidoId: txt(registro?.pedidoId) });
      const resp = await fetch(`${API_BASE}/devolucoes-historico/nf-venda?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      if (d.nf) { set('nfVenda', String(d.nf)); setInfo(`NF de saída encontrada no Bling: ${d.nf}`); } else setInfo(d.aviso || 'O Bling não retornou NF para esse pedido.');
    } catch (e: any) { setErro(e?.message || 'Não foi possível consultar o Bling'); }
    setBuscandoNf(false);
  }

  async function salvar() {
    setErro('');
    if (!f.sku.trim() && !f.descricao.trim()) { setErro('Informe o SKU ou a descrição.'); return; }
    if (!f.dataDevolucao) { setErro('Informe a data da devolução.'); return; }
    setSalvando(true);
    try {
      const url = edicao ? `${API_BASE}/devolucoes-historico/${registro!.id}` : `${API_BASE}/devolucoes-historico`;
      const resp = await fetch(url, { method: edicao ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, motivoId: f.motivoId ? Number(f.motivoId) : null }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      onSalvo();
    } catch (e: any) { setErro(e?.message || 'Erro ao salvar'); setSalvando(false); }
  }

  const inp: any = { ...entrada, width: '100%', boxSizing: 'border-box' };
  const campo = (rot: any, el: any, largo = false) => <div style={largo ? { gridColumn: '1 / -1' } : undefined}><label style={rotulo}>{rot}</label>{el}</div>;
  const link: any = { background: 'none', border: 'none', color: 'var(--blue-500)', cursor: 'pointer', fontSize: 12, padding: 0, textTransform: 'none', letterSpacing: 0, fontWeight: 500 };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 700, boxShadow: '0 20px 60px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>{edicao ? 'Editar devolução' : 'Registrar devolução'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>{edicao ? 'Altera apenas este registro do histórico. Não mexe no estoque da peça nem no Bling.' : 'Só entra no histórico. Não altera o estoque da peça nem o Bling.'}</div>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {campo('SKU da peça', <input value={f.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} onBlur={consultar} placeholder="Ex: BM03_0039" style={inp} autoFocus={!edicao} />)}
          {campo('Nº do pedido', <input value={f.pedidoNum} onChange={(e) => set('pedidoNum', e.target.value)} onBlur={consultar} placeholder="Nº do Bling ou do marketplace" style={inp} />)}
          {info ? <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--gray-600)', background: 'var(--gray-50, #f9fafb)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>{info}</div> : null}
          {campo('Descrição', <input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Preenche sozinha quando o SKU é encontrado" style={inp} />, true)}
          {campo('Marketplace', <input list="canais-dev" value={f.canal} onChange={(e) => set('canal', e.target.value)} placeholder="Selecione ou digite" style={inp} />)}
          <datalist id="canais-dev">{canaisBase.map((c) => <option key={c} value={c} />)}</datalist>
          {campo(<span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Motivo</span>{podeGerenciar ? <button type="button" onClick={onGerenciar} style={link}>Configurar tipos</button> : null}</span>,
            <select value={f.motivoId} onChange={(e) => set('motivoId', e.target.value)} style={{ ...inp, cursor: 'pointer' }}><option value="">Sem motivo</option>{motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>)}
          {campo('Moto (label)', <input value={f.motoLabel} onChange={(e) => set('motoLabel', e.target.value)} placeholder="Ex: HD STREET GLIDE 2019" style={inp} />)}
          {campo('Moto (nome)', <input value={f.motoNome} onChange={(e) => set('motoNome', e.target.value)} placeholder="Marca modelo ano" style={inp} />)}
          {campo('Data da venda', <input type="date" value={f.dataVenda} onChange={(e) => set('dataVenda', e.target.value)} style={inp} />)}
          {campo('Data da devolução', <input type="date" value={f.dataDevolucao} onChange={(e) => set('dataDevolucao', e.target.value)} style={inp} />)}
          {campo('Valor da venda (R$)', <input inputMode="decimal" value={f.valor} onChange={num('valor')} placeholder="0.00" style={inp} />)}
          {campo('Valor líquido (R$)', <input inputMode="decimal" value={f.valorLiq} onChange={num('valorLiq')} placeholder="opcional" style={inp} />)}
          {campo('Frete (R$)', <input inputMode="decimal" value={f.frete} onChange={num('frete')} placeholder="opcional" style={inp} />)}
          {campo('Taxas (R$)', <input inputMode="decimal" value={f.taxas} onChange={num('taxas')} placeholder="opcional" style={inp} />)}
          {campo(<span style={{ display: 'flex', justifyContent: 'space-between' }}><span>NF de saída (venda)</span><button type="button" onClick={buscarNf} disabled={buscandoNf} style={link}>{buscandoNf ? 'Buscando...' : 'Buscar no Bling'}</button></span>,
            <input value={f.nfVenda} onChange={(e) => set('nfVenda', e.target.value)} placeholder="Número da NF de venda" style={inp} />)}
          {campo('NF de entrada (retorno)', <input value={f.nfDevolucao} onChange={(e) => set('nfDevolucao', e.target.value)} placeholder="Número da NF de entrada" style={inp} />)}
          {campo('Observação', <textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} rows={2} style={{ ...inp, fontFamily: 'inherit' }} />, true)}
          {erro ? <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: '#b91c1c' }}>{erro}</div> : null}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} style={{ ...entrada, cursor: 'pointer', fontWeight: 600, background: 'var(--gray-800)', color: '#fff', borderColor: 'var(--gray-800)' }}>{salvando ? 'Salvando...' : edicao ? 'Salvar alterações' : 'Registrar'}</button>
        </div>
      </div>
    </div>
  );
}

// Linha expandida: tudo o que se sabe sobre a devolucao
function Info({ k, children, aviso }: { k: string; children?: any; aviso?: boolean; key?: any }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12.5, borderBottom: '1px dashed var(--border)' }}>
      <span style={{ color: 'var(--gray-500)' }}>{k}</span>
      <span style={{ color: aviso ? '#b45309' : 'var(--gray-800)', fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}
function BlocoDet({ titulo, children }: { titulo: string; children?: any }) {
  return <div style={{ minWidth: 0 }}><div style={{ ...rotulo, marginBottom: 6 }}>{titulo}</div>{children}</div>;
}
function DetalhesRegistro({ r, podeEditar, onEditar }: { r: Registro; podeEditar: boolean; onEditar: (r: Registro) => void }) {
  const et = etiquetasDe(r);
  const st = statusEtiqueta(r);
  const mono: any = { fontFamily: 'JetBrains Mono, monospace' };
  const nfOu = (v: string | null, vazio: string) => (v ? <span style={mono}>{v}</span> : vazio);
  return (
    <div style={{ background: '#f8fafc', borderTop: '1px solid var(--border)', padding: '16px 20px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
      <BlocoDet titulo="Cliente e pedido">
        <Info k="Cliente">{r.clienteNome || '—'}</Info>
        <Info k="Pedido">{r.pedidoNum ? `#${r.pedidoNum}` : '—'}</Info>
        <Info k="Marketplace">{r.canal ? <CanalBadge canal={r.canal} /> : '—'}</Info>
        <Info k="Data da venda">{dataBr(r.dataVenda)}</Info>
        <Info k="Data da devolução">{dataBr(r.dataDevolucao)}</Info>
      </BlocoDet>
      <BlocoDet titulo="Notas fiscais">
        <Info k="NF de saída (venda)" aviso={!r.nfVenda}>{nfOu(r.nfVenda, 'Não informada')}</Info>
        <Info k="NF de entrada (retorno)" aviso={!r.nfDevolucao}>{nfOu(r.nfDevolucao, 'Não informada')}</Info>
      </BlocoDet>
      <BlocoDet titulo="Etiquetas Detran">
        {!et.length ? <div style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>Sem etiqueta Detran nesta devolução.</div> : et.map((x, i) => (
          <Info key={`${x.etiqueta}-${i}`} k={`Etiqueta ${et.length > 1 ? i + 1 : ''}`.trim()}>
            <span style={mono}>{x.etiqueta}</span>{' '}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', ...(x.baixada ? { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' } : { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }) }}>{x.baixada ? 'Baixada' : 'Não baixada'}</span>
          </Info>
        ))}
        {et.length && st ? <Info k="Situação">{st.texto}</Info> : null}
        {r.etiquetaAtual ? <Info k="Etiqueta atual da peça"><span style={mono}>{r.etiquetaAtual}</span></Info> : null}
        {r.detranStatus ? <Info k="Status no Detran">{r.detranStatus}</Info> : null}
        {r.localizacaoAtual ? <Info k="Localização da peça">{r.localizacaoAtual}</Info> : null}
      </BlocoDet>
      <BlocoDet titulo="Valores">
        <Info k="Valor da venda">{brl(r.valor)}</Info>
        <Info k="Valor líquido">{brl(r.valorLiq)}</Info>
        <Info k="Frete">{brl(r.frete)}</Info>
        <Info k="Taxas">{brl(r.taxas)}</Info>
      </BlocoDet>
      <BlocoDet titulo="Registro">
        <Info k="Origem">{ORIGENS[r.origem || ''] || r.origem || '—'}</Info>
        <Info k="Motivo">{r.motivoNome || 'Sem motivo'}</Info>
        <Info k="Registrado em">{r.criadoEm ? new Date(r.criadoEm).toLocaleString('pt-BR') : '—'}</Info>
        {r.atualizadoPor ? <Info k="Última edição">{r.atualizadoPor}{r.atualizadoEm ? ` · ${new Date(r.atualizadoEm).toLocaleString('pt-BR')}` : ''}</Info> : null}
        {r.observacao ? <div style={{ fontSize: 12.5, color: 'var(--gray-700)', marginTop: 8, whiteSpace: 'pre-wrap' }}><span style={{ color: 'var(--gray-500)' }}>Observação: </span>{r.observacao}</div> : null}
        {podeEditar ? <button type="button" onClick={() => onEditar(r)} style={{ marginTop: 12, border: '1px solid var(--gray-800)', background: 'var(--gray-800)', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Editar registro</button> : null}
      </BlocoDet>
    </div>
  );
}

export default function DevolucoesTab({ padding }: { padding: number }) {
  const isPhone = useIsPhone();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [page, setPage] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [canal, setCanal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [statusF, setStatusF] = useState('');
  const [editar, setEditar] = useState<Registro | null>(null);
  const [tipos, setTipos] = useState(false);
  const [novo, setNovo] = useState(false);
  const [verEtiquetas, setVerEtiquetas] = useState<Registro | null>(null);
  const [abertas, setAbertas] = useState<Record<number, boolean>>({});
  const alternar = (id: number) => setAbertas((c) => ({ ...c, [id]: !c[id] }));
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++seq.current;
    setCarregando(true); setErro('');
    try {
      const qs = new URLSearchParams({ page: String(page), per: '50' });
      if (buscaAplicada) qs.set('busca', buscaAplicada);
      if (de) qs.set('de', de);
      if (ate) qs.set('ate', ate);
      if (canal) qs.set('canal', canal);
      if (motivo) qs.set('motivo', motivo);
      if (statusF) qs.set('status', statusF);
      const resp = await fetch(`${API_BASE}/devolucoes-historico?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      if (minha === seq.current) setDados(d);
    } catch (e: any) { if (minha === seq.current) setErro(e?.message || 'Erro ao carregar'); }
    if (minha === seq.current) setCarregando(false);
  }, [page, buscaAplicada, de, ate, canal, motivo, statusF]);
  useEffect(() => { carregar(); }, [carregar]);

  // busca por digitacao, com pequena pausa
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setBuscaAplicada(busca.trim()); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const filtrando = Boolean(buscaAplicada || de || ate || canal || motivo || statusF);
  const limpar = () => { setBusca(''); setBuscaAplicada(''); setDe(''); setAte(''); setCanal(''); setMotivo(''); setStatusF(''); setPage(1); };
  const mudar = (fn: () => void) => { fn(); setPage(1); };
  const resumo = dados?.resumo;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.per)) : 1;
  const podeEditar = !!dados?.podeEditar;

  const total = resumo?.totalGeral || 0;
  const cardStatus = (chave: string, titulo: string, qtd: number, cor: string, dica: string) => {
    const ativo = statusF === chave && chave !== '';
    const pct = chave && total ? Math.round((qtd / total) * 100) : null;
    return (
      <button key={chave || 'todas'} type="button" onClick={() => mudar(() => setStatusF(ativo ? '' : chave))}
        style={{ textAlign: 'left', cursor: 'pointer', background: ativo ? 'var(--gray-50, #f9fafb)' : 'var(--white)', border: ativo ? `2px solid ${cor}` : '1px solid var(--border)', borderRadius: 12, padding: ativo ? '11px 15px' : '12px 16px', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{titulo}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: cor }}>{qtd}</span>
          {pct != null ? <span style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{pct}%</span> : null}
        </div>
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{dica}</div>
      </button>
    );
  };

  const chipMotivo = (r: Registro) => r.motivoNome
    ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>{r.motivoNome}</span>
    : <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#fffbeb', color: '#92400e', border: '1px dashed #fcd34d', whiteSpace: 'nowrap' }}>Sem motivo</span>;

  const botaoEditar = (r: Registro) => podeEditar ? (
    <button type="button" onClick={() => setEditar(r)} style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>Editar</button>
  ) : null;

  return (
    <div style={{ padding, maxWidth: 1500 }}>
      {/* Resumo: onde estao hoje as pecas devolvidas (clique para filtrar) */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
        {cardStatus('', 'Devoluções', resumo?.totalGeral ?? 0, 'var(--gray-800)', 'registradas no período')}
        {cardStatus('estoque', 'Em estoque', resumo?.porStatus?.estoque ?? 0, '#15803d', 'voltaram e estão disponíveis')}
        {cardStatus('vendida', 'Vendidas novamente', resumo?.porStatus?.vendida ?? 0, '#1d4ed8', 'já foram vendidas de novo')}
        {cardStatus('prejuizo', 'Em prejuízo', resumo?.porStatus?.prejuizo ?? 0, '#b91c1c', 'viraram prejuízo')}
        {cardStatus('em_revisao', 'Em revisão', resumo?.porStatus?.em_revisao ?? 0, '#b45309', 'aguardando revisão')}
        {(resumo?.porStatus?.sem_peca || 0) > 0 ? cardStatus('sem_peca', 'Peça não encontrada', resumo?.porStatus?.sem_peca ?? 0, '#475569', 'SKU fora do estoque') : null}
        {(resumo?.semMotivoGeral || 0) > 0 ? (
          <button type="button" onClick={() => mudar(() => setMotivo(motivo === 'sem' ? '' : 'sem'))} style={{ textAlign: 'left', cursor: 'pointer', background: motivo === 'sem' ? '#fffbeb' : 'var(--white)', border: '1px ' + (motivo === 'sem' ? 'solid #fcd34d' : 'dashed #fcd34d'), borderRadius: 12, padding: '12px 16px', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>Sem motivo informado</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#b45309', marginTop: 2 }}>{resumo?.semMotivoGeral}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>informe em Editar</div>
          </button>
        ) : null}
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'minmax(220px, 1.5fr) repeat(5, minmax(120px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
        <div style={isPhone ? { gridColumn: '1 / -1' } : undefined}>
          <label style={rotulo}>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU, descrição, pedido ou moto" style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div><label style={rotulo}>De</label><input type="date" value={de} onChange={(e) => mudar(() => setDe(e.target.value))} style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} /></div>
        <div><label style={rotulo}>Até</label><input type="date" value={ate} onChange={(e) => mudar(() => setAte(e.target.value))} style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} /></div>
        <div>
          <label style={rotulo}>Marketplace</label>
          <select value={canal} onChange={(e) => mudar(() => setCanal(e.target.value))} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todos</option>
            {(dados?.canais || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={rotulo}>Motivo</label>
          <select value={motivo} onChange={(e) => mudar(() => setMotivo(e.target.value))} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todos</option>
            <option value="sem">Sem motivo informado</option>
            {(dados?.motivos || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={rotulo}>Status atual</label>
          <select value={statusF} onChange={(e) => mudar(() => setStatusF(e.target.value))} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, ...(isPhone ? { gridColumn: '1 / -1' } : {}) }}>
          {filtrando ? <button type="button" onClick={limpar} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Limpar</button> : null}
          {podeEditar ? <button type="button" onClick={() => setNovo(true)} style={{ ...entrada, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--gray-800)', color: '#fff', borderColor: 'var(--gray-800)' }}>+ Registrar devolução</button> : null}
          <button type="button" onClick={() => setTipos(true)} style={{ ...entrada, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>⚙ Tipos de devolução</button>
        </div>
      </div>

      {resumo && resumo.porMotivo.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {resumo.porMotivo.map((m) => (
            <span key={m.nome} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-600)' }}>{m.nome}: <strong style={{ color: 'var(--gray-800)' }}>{m.qtd}</strong></span>
          ))}
        </div>
      ) : null}

      {erro ? <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{erro}</div> : null}

      {/* Lista */}
      {isPhone ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {(dados?.itens || []).map((r) => (
            <div key={r.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13.5, color: 'var(--blue-500)' }}>{r.idPeca || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{dataBr(r.dataDevolucao)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-800)', marginTop: 4 }}>{r.descricao || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>{[r.motoLabel, r.motoNome].filter(Boolean).join(' · ') || '—'}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Pedido {r.pedidoNum ? `#${r.pedidoNum}` : '—'}{r.nfVenda ? ` · NF ${r.nfVenda}` : ''}{r.nfDevolucao ? ` · NF dev. ${r.nfDevolucao}` : ''}</span>
                <CanalBadge canal={r.canal} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--blue-500)', marginLeft: 'auto' }}>{brl(r.valor)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}><ChipStatus r={r} />{etiquetasDe(r).length ? <ChipEtiqueta r={r} onAbrir={setVerEtiquetas} /> : null}{chipMotivo(r)}{botaoEditar(r)}</div>
              {r.observacao ? <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8 }}>Obs.: {r.observacao}</div> : null}
              <button type="button" onClick={() => alternar(r.id)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--blue-500)', cursor: 'pointer', fontSize: 12.5, padding: 0, fontWeight: 600 }}>{abertas[r.id] ? 'Ocultar detalhes ▴' : 'Ver detalhes ▾'}</button>
              {abertas[r.id] ? <div style={{ margin: '12px -14px -14px', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}><DetalhesRegistro r={r} podeEditar={podeEditar} onEditar={setEditar} /></div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed', width: COLS.reduce((a, c) => a + c, 0), minWidth: '100%' }}>
              <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead>
                <tr style={{ background: 'var(--gray-50, #f9fafb)', textAlign: 'left' }}>
                  {['Devolução', 'Peça', 'Pedido', 'Moto', 'Valor', 'Etiqueta Detran', 'Status atual', 'Motivo', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', textAlign: h === 'Valor' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(dados?.itens || []).map((r) => (
                  <Fragment key={r.id}>
                  <tr style={{ borderBottom: abertas[r.id] ? 'none' : '1px solid var(--border)', verticalAlign: 'top', background: abertas[r.id] ? '#f8fafc' : undefined }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-700)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <button type="button" onClick={() => alternar(r.id)} title={abertas[r.id] ? 'Recolher detalhes' : 'Ver detalhes'} aria-expanded={!!abertas[r.id]} style={{ width: 22, height: 22, flexShrink: 0, border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--gray-600)', lineHeight: 1, padding: 0 }}>{abertas[r.id] ? '▾' : '▸'}</button>
                      <div>
                      {dataBr(r.dataDevolucao)}
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>venda {dataBr(r.dataVenda)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginTop: 2 }}>{ORIGENS[r.origem || ''] || r.origem || ''}</div>
                      </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12.5, color: 'var(--blue-500)' }}>{r.idPeca || '—'}</div>
                      <div style={{ color: 'var(--gray-800)', marginTop: 2 }}>{r.descricao || '—'}</div>
                      {r.observacao ? <div title={r.observacao} style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>Obs.: {r.observacao}</div> : null}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 600 }}>{r.pedidoNum ? `#${r.pedidoNum}` : '—'}</span><CanalBadge canal={r.canal} /></div>
                      {r.nfVenda ? <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>NF venda <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-700)' }}>{r.nfVenda}</span></div> : null}
                      {r.nfDevolucao ? <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 1 }}>NF devol. <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-700)' }}>{r.nfDevolucao}</span></div> : null}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {r.motoLabel ? <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.motoLabel}</div> : null}
                      <div style={{ color: 'var(--gray-600)', fontSize: 12.5 }}>{r.motoNome || '—'}</div>
                    </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--blue-500)' }}>
                      {brl(r.valor)}
                      {r.valorLiq != null ? <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--green)', marginTop: 2 }}>líq. {brl(r.valorLiq)}</div> : null}
                      {r.frete != null ? <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', marginTop: 1 }}>frete {brl(r.frete)}</div> : null}
                    </td>
                    <td style={{ padding: '10px 12px' }}><ChipEtiqueta r={r} onAbrir={setVerEtiquetas} /></td>
                    <td style={{ padding: '10px 12px' }}><ChipStatus r={r} /></td>
                    <td style={{ padding: '10px 12px' }}>{chipMotivo(r)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{botaoEditar(r)}</td>
                  </tr>
                  {abertas[r.id] ? <tr style={{ borderBottom: '1px solid var(--border)' }}><td colSpan={COLS.length} style={{ padding: 0 }}><DetalhesRegistro r={r} podeEditar={podeEditar} onEditar={setEditar} /></td></tr> : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {carregando && !dados ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 14 }}>Carregando...</div> : null}
      {!carregando && dados && !dados.itens.length ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, textAlign: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{filtrando ? 'Nenhum registro com esses filtros' : 'Nenhum cancelamento ou devolução registrado ainda'}</div>
          {!filtrando ? <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 6 }}>A partir de agora todo cancelamento de venda e toda devolução registrada entram aqui automaticamente.</div> : null}
        </div>
      ) : null}

      {dados && dados.total > dados.per ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button type="button" disabled={page <= 1 || carregando} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>← Anterior</button>
          <span style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>Página {page} de {totalPaginas} · {dados.total} registros</span>
          <button type="button" disabled={page >= totalPaginas || carregando} onClick={() => setPage((p) => p + 1)} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Próxima →</button>
        </div>
      ) : null}

      {editar ? <DevolucaoFormModal registro={editar} motivos={dados?.motivos || []} canais={dados?.canais || []} podeGerenciar={podeEditar} onGerenciar={() => setTipos(true)} onClose={() => setEditar(null)} onSalvo={() => { setEditar(null); carregar(); }} /> : null}
      {verEtiquetas ? <EtiquetasModal r={verEtiquetas} onClose={() => setVerEtiquetas(null)} /> : null}
      {novo ? <DevolucaoFormModal motivos={dados?.motivos || []} canais={dados?.canais || []} podeGerenciar={podeEditar} onGerenciar={() => setTipos(true)} onClose={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} /> : null}
      {tipos ? <TiposDevolucaoModal onClose={() => setTipos(false)} onAlterou={carregar} /> : null}
    </div>
  );
}
