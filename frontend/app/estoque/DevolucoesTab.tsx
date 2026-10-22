'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';
import CanalBadge from '@/components/ui/CanalBadge';
import { TiposDevolucaoModal, type MotivoOpcao } from '@/components/devolucoes/DevolucaoModais';

// Estoque > Devolucoes: historico de todos os cancelamentos e devolucoes (peca, pedido, marketplace, moto, valor e motivo).
type Registro = {
  id: number; pecaId: number | null; idPeca: string | null; descricao: string | null; pedidoNum: string | null; dataVenda: string | null; dataDevolucao: string;
  motoNome: string | null; motoLabel: string | null; valor: number | null; valorLiq: number | null; frete: number | null; taxas: number | null; nfVenda: string | null; nfDevolucao: string | null; pedidoId: string | null; canal: string | null;
  motivoId: number | null; motivoNome: string | null; observacao: string | null; origem: string | null;
  statusAtual: string; localizacaoAtual: string | null;
  etiquetas: Array<{ etiqueta: string; baixada: boolean }> | null; etiquetaPendente: boolean | null;
};

// Etiqueta Detran da devolucao: uma ou varias (pecas como motor tem 2). Clicar abre todas.
function etiquetasDe(r: Registro) { return Array.isArray(r.etiquetas) ? r.etiquetas : []; }
function statusEtiqueta(r: Registro): { texto: string; bg: string; cor: string; borda: string } | null {
  if (!etiquetasDe(r).length) return null;
  if (r.etiquetaPendente) return { texto: 'Pendente de reposição', bg: '#fffbeb', cor: '#92400e', borda: '#fde68a' };
  return { texto: 'Reposta', bg: '#f0fdf4', cor: '#15803d', borda: '#bbf7d0' };
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
function ChipStatusEtiqueta({ r }: { r: Registro }) {
  const e = statusEtiqueta(r);
  if (!e) return <span style={{ color: 'var(--gray-400)' }}>—</span>;
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: e.bg, color: e.cor, border: `1px solid ${e.borda}`, whiteSpace: 'nowrap' }}>{e.texto}</span>;
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
          {st ? <div style={{ fontSize: 12.5, color: 'var(--gray-600)', marginTop: 4 }}>Situação da peça: <strong style={{ color: st.cor }}>{st.texto}</strong>{r.etiquetaPendente ? ' — precisa de etiqueta nova para voltar a ser vendida.' : '.'}</div> : null}
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
  resumo: { qtd: number; valor: number; valorLiq: number; semMotivo: number; porMotivo: Array<{ nome: string; qtd: number }> };
  itens: Registro[];
};

const ORIGENS: Record<string, string> = {
  cancelamento_importado: 'Cancelamento importado', cancelamento_estoque: 'Cancelamento no estoque', devolucao_manual: 'Devolução registrada', historico_antigo: 'Histórico anterior',
};
const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBr = (v?: string | null) => { if (!v) return '—'; const [y, m, d] = String(v).slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : v; };

const entrada: any = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontFamily: 'inherit', color: 'var(--gray-800)', minWidth: 0 };
const rotulo: any = { fontSize: 10.5, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3, display: 'block' };

// Edicao completa de um registro: motivo, observacao, data e NFs (a NF de venda pode ser buscada no Bling pelo pedido)
function EditarDevolucaoModal({ r, motivos, podeGerenciar, onGerenciar, onClose, onSalvo }: { r: Registro; motivos: MotivoOpcao[]; podeGerenciar: boolean; onGerenciar: () => void; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ motivoId: r.motivoId ? String(r.motivoId) : '', observacao: r.observacao || '', dataDevolucao: String(r.dataDevolucao || '').slice(0, 10), nfVenda: r.nfVenda || '', nfDevolucao: r.nfDevolucao || '' });
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));

  async function buscarNf() {
    if (!r.pedidoNum && !r.pedidoId) { setAviso('Este registro não tem número de pedido.'); return; }
    setBuscando(true); setAviso(''); setErro('');
    try {
      const qs = new URLSearchParams({ pedido: r.pedidoNum || '', pedidoId: r.pedidoId || '' });
      const resp = await fetch(`${API_BASE}/devolucoes-historico/nf-venda?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      if (d.nf) { set('nfVenda', String(d.nf)); setAviso(`NF encontrada no Bling: ${d.nf}`); } else setAviso(d.aviso || 'O Bling não retornou NF para esse pedido.');
    } catch (e: any) { setErro(e?.message || 'Não foi possível consultar o Bling'); }
    setBuscando(false);
  }

  async function salvar() {
    setSalvando(true); setErro('');
    try {
      const resp = await fetch(`${API_BASE}/devolucoes-historico/${r.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, motivoId: f.motivoId ? Number(f.motivoId) : null }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      onSalvo();
    } catch (e: any) { setErro(e?.message || 'Erro ao salvar'); setSalvando(false); }
  }

  const inp: any = { ...entrada, width: '100%', boxSizing: 'border-box' };
  const campo = (rot: string, el: any, largo = false) => <div style={largo ? { gridColumn: '1 / -1' } : undefined}><label style={rotulo}>{rot}</label>{el}</div>;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Editar devolução</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>{r.idPeca} — {r.descricao}{r.pedidoNum ? ` · pedido #${r.pedidoNum}` : ''}</div>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={rotulo}>Motivo</label>
              {podeGerenciar ? <button type="button" onClick={onGerenciar} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Configurar tipos de devolução</button> : null}
            </div>
            <select value={f.motivoId} onChange={(e) => set('motivoId', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">Sem motivo</option>
              {motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          {campo('Data da devolução', <input type="date" value={f.dataDevolucao} onChange={(e) => set('dataDevolucao', e.target.value)} style={inp} />)}
          <div />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={rotulo}>NF de venda</label>
              <button type="button" onClick={buscarNf} disabled={buscando} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', cursor: 'pointer', fontSize: 12, padding: 0 }}>{buscando ? 'Buscando...' : 'Buscar no Bling'}</button>
            </div>
            <input value={f.nfVenda} onChange={(e) => set('nfVenda', e.target.value)} placeholder="Número da NF" style={inp} />
          </div>
          {campo('NF de devolução', <input value={f.nfDevolucao} onChange={(e) => set('nfDevolucao', e.target.value)} placeholder="Número da NF" style={inp} />)}
          {aviso ? <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--gray-600)', background: 'var(--gray-50, #f9fafb)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>{aviso}</div> : null}
          {campo('Observação', <textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} rows={3} style={{ ...inp, fontFamily: 'inherit' }} />, true)}
          {erro ? <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: '#b91c1c' }}>{erro}</div> : null}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} style={{ ...entrada, cursor: 'pointer', fontWeight: 600, background: 'var(--gray-800)', color: '#fff', borderColor: 'var(--gray-800)' }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// Registro manual de devolucao (principalmente as do passado). So grava no historico: nao mexe em estoque nem no Bling.
function NovaDevolucaoModal({ motivos, canais, onClose, onSalvo }: { motivos: MotivoOpcao[]; canais: string[]; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ sku: '', descricao: '', pedidoNum: '', canal: '', dataVenda: '', dataDevolucao: '', valor: '', valorLiq: '', frete: '', nfVenda: '', nfDevolucao: '', motivoId: '', observacao: '' });
  const [info, setInfo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));
  const canaisBase = Array.from(new Set(['Mercado Livre', 'Shopee', 'Magalu', 'Nuvemshop', 'OLX'].concat(canais)));

  async function consultar() {
    if (!f.sku.trim() && !f.pedidoNum.trim()) return;
    try {
      const qs = new URLSearchParams({ sku: f.sku.trim(), pedido: f.pedidoNum.trim() });
      const resp = await fetch(`${API_BASE}/devolucoes-historico/consulta?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) return;
      const msgs: string[] = [];
      if (d.peca) msgs.push(`Peça encontrada${d.peca.motoNome ? `: ${[d.peca.motoLabel, d.peca.motoNome].filter(Boolean).join(' · ')}` : ''}`);
      else if (f.sku.trim()) msgs.push('SKU não encontrado no estoque: será gravado só com o que você informar');
      if (d.pedido) msgs.push(`Pedido importado (${d.pedido.canal || 'sem canal'})`);
      else if (f.pedidoNum.trim()) msgs.push('Pedido não encontrado nos pedidos importados: informe o marketplace');
      setF((c) => {
        const n = { ...c };
        if (d.peca) { if (!n.descricao) n.descricao = d.peca.descricao || ''; if (!n.valor && d.peca.precoML) n.valor = String(d.peca.precoML); }
        if (d.pedido) { if (!n.canal && d.pedido.canal) n.canal = d.pedido.canal; if (!n.dataVenda && d.pedido.data) n.dataVenda = String(d.pedido.data).slice(0, 10); if (d.pedido.valorItem) n.valor = String(d.pedido.valorItem); }
        return n;
      });
      setInfo(msgs.join(' · '));
    } catch { /* sem consulta: preenche na mao */ }
  }

  async function salvar() {
    setErro('');
    if (!f.sku.trim() && !f.descricao.trim()) { setErro('Informe o SKU ou a descrição.'); return; }
    if (!f.dataDevolucao) { setErro('Informe a data da devolução.'); return; }
    setSalvando(true);
    try {
      const resp = await fetch(`${API_BASE}/devolucoes-historico`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, motivoId: f.motivoId ? Number(f.motivoId) : null }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      onSalvo();
    } catch (e: any) { setErro(e?.message || 'Erro ao salvar'); setSalvando(false); }
  }

  const campo = (rot: string, el: any, largo = false) => <div style={largo ? { gridColumn: '1 / -1' } : undefined}><label style={rotulo}>{rot}</label>{el}</div>;
  const inp: any = { ...entrada, width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 620, boxShadow: '0 20px 60px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Registrar devolução</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>Só entra no histórico. Não altera o estoque da peça nem o Bling.</div>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {campo('SKU da peça', <input value={f.sku} onChange={(e) => set('sku', e.target.value)} onBlur={consultar} placeholder="Ex: BM03_0039" style={inp} autoFocus />)}
          {campo('Nº do pedido', <input value={f.pedidoNum} onChange={(e) => set('pedidoNum', e.target.value)} onBlur={consultar} placeholder="Nº do Bling ou do marketplace" style={inp} />)}
          {info ? <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--gray-600)', background: 'var(--gray-50, #f9fafb)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>{info}</div> : null}
          {campo('Descrição', <input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Preenche sozinha quando o SKU é encontrado" style={inp} />, true)}
          {campo('Marketplace', <input list="canais-dev" value={f.canal} onChange={(e) => set('canal', e.target.value)} placeholder="Selecione ou digite" style={inp} />)}
          <datalist id="canais-dev">{canaisBase.map((c) => <option key={c} value={c} />)}</datalist>
          {campo('Motivo', <select value={f.motivoId} onChange={(e) => set('motivoId', e.target.value)} style={{ ...inp, cursor: 'pointer' }}><option value="">Sem motivo</option>{motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>)}
          {campo('Data da venda', <input type="date" value={f.dataVenda} onChange={(e) => set('dataVenda', e.target.value)} style={inp} />)}
          {campo('Data da devolução', <input type="date" value={f.dataDevolucao} onChange={(e) => set('dataDevolucao', e.target.value)} style={inp} />)}
          {campo('Valor da venda (R$)', <input inputMode="decimal" value={f.valor} onChange={(e) => set('valor', e.target.value.replace(',', '.'))} placeholder="0.00" style={inp} />)}
          {campo('Valor líquido (R$)', <input inputMode="decimal" value={f.valorLiq} onChange={(e) => set('valorLiq', e.target.value.replace(',', '.'))} placeholder="opcional" style={inp} />)}
          {campo('Frete (R$)', <input inputMode="decimal" value={f.frete} onChange={(e) => set('frete', e.target.value.replace(',', '.'))} placeholder="opcional" style={inp} />)}
          <div />
          {campo('NF de venda', <input value={f.nfVenda} onChange={(e) => set('nfVenda', e.target.value)} placeholder="opcional" style={inp} />)}
          {campo('NF de devolução', <input value={f.nfDevolucao} onChange={(e) => set('nfDevolucao', e.target.value)} placeholder="opcional" style={inp} />)}
          {campo('Observação', <textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} rows={2} style={{ ...inp, fontFamily: 'inherit' }} />, true)}
          {erro ? <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: '#b91c1c' }}>{erro}</div> : null}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} style={{ ...entrada, cursor: 'pointer', fontWeight: 600, background: 'var(--gray-800)', color: '#fff', borderColor: 'var(--gray-800)' }}>{salvando ? 'Salvando...' : 'Registrar'}</button>
        </div>
      </div>
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

  const cartao = (titulo: string, valor: string, cor = 'var(--gray-800)', dica?: string) => (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', minWidth: isPhone ? 0 : 170, flex: isPhone ? '1 1 140px' : '0 0 auto' }}>
      <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
      {dica ? <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{dica}</div> : null}
    </div>
  );

  const chipMotivo = (r: Registro) => r.motivoNome
    ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>{r.motivoNome}</span>
    : <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#fffbeb', color: '#92400e', border: '1px dashed #fcd34d', whiteSpace: 'nowrap' }}>Sem motivo</span>;

  const botaoEditar = (r: Registro) => podeEditar ? (
    <button type="button" onClick={() => setEditar(r)} style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>{r.motivoNome ? 'Editar' : 'Informar motivo'}</button>
  ) : null;

  return (
    <div style={{ padding, maxWidth: 1500 }}>
      {/* Resumo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {cartao(filtrando ? 'Registros no filtro' : 'Cancelamentos e devoluções', String(resumo?.qtd ?? '—'))}
        {cartao('Valor vendido (estornado)', brl(resumo?.valor ?? 0), 'var(--blue-500)', 'preço de venda das peças')}
        {cartao('Valor líquido estornado', brl(resumo?.valorLiq ?? 0), 'var(--green)')}
        {cartao('Sem motivo informado', String(resumo?.semMotivo ?? '—'), (resumo?.semMotivo || 0) > 0 ? '#b45309' : 'var(--gray-800)', 'ajuste em Editar / Informar motivo')}
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}><ChipStatus r={r} />{etiquetasDe(r).length ? <><ChipEtiqueta r={r} onAbrir={setVerEtiquetas} /><ChipStatusEtiqueta r={r} /></> : null}{chipMotivo(r)}{botaoEditar(r)}</div>
              {r.observacao ? <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8 }}>Obs.: {r.observacao}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1400 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50, #f9fafb)', textAlign: 'left' }}>
                  {['Devolução', 'Peça', 'Pedido', 'Marketplace', 'Moto', 'Venda', 'Valor', 'Etiqueta Detran', 'Status etiqueta', 'Status atual', 'Motivo', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', textAlign: h === 'Valor' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(dados?.itens || []).map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-700)' }}>
                      {dataBr(r.dataDevolucao)}
                      <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginTop: 2 }}>{ORIGENS[r.origem || ''] || r.origem || ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 300 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12.5, color: 'var(--blue-500)' }}>{r.idPeca || '—'}</div>
                      <div style={{ color: 'var(--gray-800)', marginTop: 2 }}>{r.descricao || '—'}</div>
                      {r.observacao ? <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 3 }}>Obs.: {r.observacao}</div> : null}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{r.pedidoNum ? `#${r.pedidoNum}` : '—'}</div>
                      {r.nfVenda ? <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>NF venda <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-700)' }}>{r.nfVenda}</span></div> : null}
                      {r.nfDevolucao ? <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 1 }}>NF devol. <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-700)' }}>{r.nfDevolucao}</span></div> : null}
                    </td>
                    <td style={{ padding: '10px 12px' }}><CanalBadge canal={r.canal} />{!r.canal ? <span style={{ color: 'var(--gray-400)' }}>—</span> : null}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 230 }}>
                      {r.motoLabel ? <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.motoLabel}</div> : null}
                      <div style={{ color: 'var(--gray-600)', fontSize: 12.5 }}>{r.motoNome || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-600)' }}>{dataBr(r.dataVenda)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--blue-500)' }}>
                      {brl(r.valor)}
                      {r.valorLiq != null ? <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--green)', marginTop: 2 }}>líq. {brl(r.valorLiq)}</div> : null}
                      {r.frete != null ? <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', marginTop: 1 }}>frete {brl(r.frete)}</div> : null}
                    </td>
                    <td style={{ padding: '10px 12px' }}><ChipEtiqueta r={r} onAbrir={setVerEtiquetas} /></td>
                    <td style={{ padding: '10px 12px' }}><ChipStatusEtiqueta r={r} /></td>
                    <td style={{ padding: '10px 12px' }}><ChipStatus r={r} /></td>
                    <td style={{ padding: '10px 12px' }}>{chipMotivo(r)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{botaoEditar(r)}</td>
                  </tr>
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

      {editar ? <EditarDevolucaoModal r={editar} motivos={dados?.motivos || []} podeGerenciar={podeEditar} onGerenciar={() => setTipos(true)} onClose={() => setEditar(null)} onSalvo={() => { setEditar(null); carregar(); }} /> : null}
      {verEtiquetas ? <EtiquetasModal r={verEtiquetas} onClose={() => setVerEtiquetas(null)} /> : null}
      {novo ? <NovaDevolucaoModal motivos={dados?.motivos || []} canais={dados?.canais || []} onClose={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} /> : null}
      {tipos ? <TiposDevolucaoModal onClose={() => setTipos(false)} onAlterou={carregar} /> : null}
    </div>
  );
}
