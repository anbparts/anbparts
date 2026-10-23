'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import CanalBadge from '@/components/ui/CanalBadge';
import { MotivoDevolucaoModal, TiposDevolucaoModal, type MotivoOpcao } from '@/components/devolucoes/DevolucaoModais';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 14 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

type Item = { id: number; idPeca: string; descricao: string; dataVenda: string; moto: string | null; precoML: number; valorTaxas: number; valorFrete: number; valorLiq: number; brinde?: boolean };
type Pedido = { pedidoNum: string; pedidoId: string | null; nomeCliente: string | null; canal?: string | null; dataVenda: string; quantidadeItens: number; subtotalPrecoML: number; subtotalTaxas: number; subtotalFrete: number; subtotalValorLiq: number; itens: Item[] };
type Marcacao = { pedidoNum: string; status: string; marcadoEm: string; marcadoPor: string | null; baixadoEm: string | null; baixadoPor: string | null; observacao: string | null };
type Linha = { marcacao: Marcacao; pedido: Pedido; semDados: boolean };

const fmtMoney = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtDate(value: string) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}
const fmtDataHora = (v?: string | null) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR');
};

const ABAS = ['pendente', 'baixado'] as const;

function RecebimentosTab() {
  const isPhone = useIsPhone();
  const [aba, setAba] = usePersistentTab<'pendente' | 'baixado'>('sub', 'pendente', ABAS);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState({ pedidos: 0, valorLiq: 0 });
  const [podeBaixar, setPodeBaixar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState('');

  async function carregar(status = aba) {
    setCarregando(true);
    try {
      const resp = await fetch(`${API}/pendencias?status=${status}`, { credentials: 'include' });
      const d = await resp.json();
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      setLinhas(d.itens || []);
      setResumo(d.resumo || { pedidos: 0, valorLiq: 0 });
      setPodeBaixar(!!d.podeBaixar);
    } catch (e: any) { alert(e?.message || 'Erro ao carregar'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(aba); }, [aba]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(rota: 'baixar' | 'desmarcar' | 'reabrir', pedidoNum: string, extra: any = {}) {
    setAgindo(pedidoNum);
    try {
      const resp = await fetch(`${API}/pendencias/${rota}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoNum, ...extra }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      await carregar(aba);
    } catch (e: any) { alert(e?.message || 'Erro'); }
    setAgindo('');
  }

  function darBaixa(l: Linha) {
    if (!confirm(`Dar baixa no pedido #${l.pedido.pedidoNum}? Confirma que o pagamento foi recebido.`)) return;
    const obs = prompt('Observação da baixa (opcional):');
    if (obs === null) return;
    void acao('baixar', l.pedido.pedidoNum, { observacao: obs });
  }

  const pagePadding = isPhone ? 14 : 28;

  return (
    <>
      <div style={{ padding: isPhone ? '12px 14px 0' : '16px 28px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['pendente', 'Pendentes'], ['baixado', 'Baixados']] as Array<['pendente' | 'baixado', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setAba(id)} style={{ border: '1px solid ' + (aba === id ? 'var(--gray-800)' : 'var(--border)'), background: aba === id ? 'var(--gray-800)' : 'var(--white)', color: aba === id ? '#fff' : 'var(--gray-600)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{rotulo}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--gray-400)', alignSelf: 'center' }}>Pedidos marcados no Relatório de Vendas que aguardam o recebimento</span>
      </div>

      <div style={{ padding: pagePadding, maxWidth: 1250 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(auto-fit, minmax(190px, 240px))', gap: 12, marginBottom: 14 }}>
          <div style={{ ...s.card, padding: '12px 16px', marginBottom: 0 }}><div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{aba === 'pendente' ? 'Pedidos pendentes' : 'Pedidos baixados'}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{resumo.pedidos}</div></div>
          <div style={{ ...s.card, padding: '12px 16px', marginBottom: 0 }}><div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{aba === 'pendente' ? 'A receber (líquido)' : 'Recebido (líquido)'}</div><div style={{ fontSize: 22, fontWeight: 700, color: aba === 'pendente' ? '#c2410c' : 'var(--green)' }}>{fmtMoney(resumo.valorLiq)}</div></div>
        </div>

        {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 12 }}>Carregando...</div> : null}
        {!carregando && !linhas.length ? (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>{aba === 'pendente' ? 'Nenhum pedido pendente de recebimento' : 'Nenhum pedido baixado ainda'}</div>
            {aba === 'pendente' ? <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Marque os pedidos com o botão "Pendente recebimento" no Relatório de Vendas.</div> : null}
          </div>
        ) : null}

        {linhas.map((l) => {
          const p = l.pedido;
          const m = l.marcacao;
          return (
            <div key={p.pedidoNum} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>
                      Pedido #{p.pedidoNum}
                      {p.nomeCliente ? <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}> — {p.nomeCliente}</span> : null}
                    </div>
                    <CanalBadge canal={p.canal} />
                    {aba === 'pendente' ? (
                      <>
                        {podeBaixar ? <button onClick={() => darBaixa(l)} disabled={agindo === p.pedidoNum} style={{ ...s.btn, background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0', fontWeight: 700 }}>Dar baixa</button> : null}
                        <button onClick={() => { if (confirm(`Tirar o pedido #${p.pedidoNum} da lista (marcado por engano)?`)) void acao('desmarcar', p.pedidoNum); }} disabled={agindo === p.pedidoNum} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-600)', borderColor: 'var(--border)' }}>Tirar da lista</button>
                      </>
                    ) : podeBaixar ? (
                      <button onClick={() => { if (confirm(`Reabrir o pedido #${p.pedidoNum} como pendente?`)) void acao('reabrir', p.pedidoNum); }} disabled={agindo === p.pedidoNum} style={{ ...s.btn, background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}>Reabrir</button>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                    {p.quantidadeItens} item(ns) - Data da venda: {fmtDate(p.dataVenda)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                    Marcado em {fmtDataHora(m.marcadoEm)}{m.marcadoPor ? ` por ${m.marcadoPor}` : ''}
                    {aba === 'baixado' ? <> · Baixado em {fmtDataHora(m.baixadoEm)}{m.baixadoPor ? ` por ${m.baixadoPor}` : ''}</> : null}
                  </div>
                  {m.observacao ? <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 2 }}>Obs.: {m.observacao}</div> : null}
                  {l.semDados ? <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Este pedido não aparece mais no Relatório de Vendas (peças alteradas ou devolvidas). Confira antes de dar baixa.</div> : null}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total do pedido</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(p.subtotalValorLiq)}</div>
                </div>
              </div>

              {p.itens.length ? (isPhone ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {p.itens.map((item) => (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--white)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--blue-500)', fontWeight: 700 }}>{item.idPeca}{item.brinde && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px' }}>BRINDE</span>}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--gray-800)', lineHeight: 1.45 }}>{item.descricao}</div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{fmtDate(item.dataVenda)}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        {[{ label: 'Moto', value: item.moto || '-' }, { label: 'Preco ML', value: fmtMoney(item.precoML) }, { label: 'Taxas', value: fmtMoney(item.valorTaxas) }, { label: 'Frete', value: fmtMoney(item.valorFrete) }, { label: 'Valor liq.', value: fmtMoney(item.valorLiq) }].map((meta) => (
                          <div key={meta.label}>
                            <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{meta.label}</div>
                            <div style={{ marginTop: 3, fontSize: 12.5, color: meta.label === 'Valor liq.' ? 'var(--green)' : 'var(--gray-800)', fontWeight: meta.label === 'Valor liq.' ? 700 : 500 }}>{meta.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--gray-50)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>Total do pedido #{p.pedidoNum}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      {[{ label: 'Preco ML', value: fmtMoney(p.subtotalPrecoML), color: 'var(--blue-500)' }, { label: 'Taxas', value: fmtMoney(p.subtotalTaxas), color: 'var(--amber)' }, { label: 'Frete', value: fmtMoney(p.subtotalFrete), color: 'var(--gray-700)' }, { label: 'Valor liq.', value: fmtMoney(p.subtotalValorLiq), color: 'var(--green)' }].map((meta) => (
                        <div key={meta.label}><div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{meta.label}</div><div style={{ marginTop: 3, fontSize: 12.5, color: meta.color, fontWeight: 700 }}>{meta.value}</div></div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                        {['ID Peca', 'Moto', 'Descricao', 'Data venda', 'Preco ML', 'Taxas', 'Frete', 'Valor liq.'].map((head) => (
                          <th key={head} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.itens.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--blue-500)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.idPeca}{item.brinde && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '1px 7px' }}>BRINDE</span>}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{item.moto || '-'}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)' }}>{item.descricao}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtDate(item.dataVenda)}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)', whiteSpace: 'nowrap' }}>{fmtMoney(item.precoML)}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtMoney(item.valorTaxas)}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(item.valorFrete)}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(item.valorLiq)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--gray-50)' }}>
                        <td colSpan={4} style={{ padding: '11px 12px', fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Total do pedido #{p.pedidoNum}</td>
                        <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>{fmtMoney(p.subtotalPrecoML)}</td>
                        <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtMoney(p.subtotalTaxas)}</td>
                        <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(p.subtotalFrete)}</td>
                        <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmtMoney(p.subtotalValorLiq)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}


// ───────────── Devolucoes: pecas em revisao depois de um cancelamento de venda ─────────────
type ItemDev = {
  pecaId: number; idPeca: string; descricao: string; localizacao: string | null; detranEtiqueta: string | null; etiquetaPendente: boolean; moto: string;
  pedido: { num: string | null; id: string | null; dataVenda: string | null; clienteNome: string | null; canal: string | null; situacao: string | null };
  estornado: { precoML: number; valorLiq: number; valorFrete: number; valorTaxas: number };
  motivo: string | null; status: string; criadoEm: string; revisadaEm: string | null; revisadaPor: string | null; observacao: string | null;
  blingSaida?: boolean; blingSaidaErro?: string | null;
  tipo?: { id: number; nome: string; observacao: string | null } | null;
  nfEntrada?: string | null;
};

function DevolucoesTab() {
  const isPhone = useIsPhone();
  const [sub, setSub] = usePersistentTab<'em_revisao' | 'revisada'>('subdev', 'em_revisao', ['em_revisao', 'revisada'] as const);
  const [itens, setItens] = useState<ItemDev[]>([]);
  const [podeRevisar, setPodeRevisar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState<number | null>(null);
  const [motivos, setMotivos] = useState<string[]>(['Defeito']);
  const [prejuizoDe, setPrejuizoDe] = useState<ItemDev | null>(null);
  const [motivoPrej, setMotivoPrej] = useState('Defeito');
  const [obsPrej, setObsPrej] = useState('');
  const [tiposDevolucao, setTiposDevolucao] = useState<MotivoOpcao[]>([]);
  const [motivoDe, setMotivoDe] = useState<ItemDev | null>(null);
  const [gerenciarTipos, setGerenciarTipos] = useState(false);

  async function salvarMotivo(it: ItemDev, motivoId: number | null, observacao: string) {
    const resp = await fetch(`${API}/devolucoes-historico/motivo-por-peca`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pecaId: it.pecaId, motivoId, observacao }) });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
    setMotivoDe(null);
    await carregar(sub);
  }

  async function carregar(status = sub) {
    setCarregando(true);
    try {
      const resp = await fetch(`${API}/pendencias/devolucoes?status=${status}`, { credentials: 'include' });
      const d = await resp.json();
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      setItens(d.itens || []);
      setPodeRevisar(!!d.podeRevisar);
      if (Array.isArray(d.motivosPrejuizo) && d.motivosPrejuizo.length) setMotivos(d.motivosPrejuizo);
      setTiposDevolucao(Array.isArray(d.motivosDevolucao) ? d.motivosDevolucao : []);
    } catch (e: any) { alert(e?.message || 'Erro ao carregar'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(sub); }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revisar peca: exige a NF de entrada (retorno) emitida e informada
  const [nfDe, setNfDe] = useState<ItemDev | null>(null);
  const [nfValor, setNfValor] = useState('');
  const [nfErro, setNfErro] = useState('');
  const [revisarDe, setRevisarDe] = useState<ItemDev | null>(null);

  function abrirNf(it: ItemDev) { setNfDe(it); setNfValor(it.nfEntrada || ''); setNfErro(''); }
  async function salvarNf() {
    if (!nfDe) return;
    const nf = nfValor.trim();
    if (!nf) { setNfErro('Informe o número da NF de entrada.'); return; }
    setAgindo(nfDe.pecaId); setNfErro('');
    try {
      const resp = await fetch(`${API}/pendencias/devolucoes/nf-entrada`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pecaId: nfDe.pecaId, nfEntrada: nf }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      setNfDe(null);
      await carregar(sub);
    } catch (e: any) { setNfErro(e?.message || 'Erro'); }
    setAgindo(null);
  }
  const [nfEntrada, setNfEntrada] = useState('');
  const [obsRevisao, setObsRevisao] = useState('');
  const [erroRevisao, setErroRevisao] = useState('');

  function revisar(it: ItemDev) {
    setRevisarDe(it); setNfEntrada(it.nfEntrada || ''); setObsRevisao(''); setErroRevisao('');
  }

  async function confirmarRevisao() {
    if (!revisarDe) return;
    const nf = nfEntrada.trim();
    if (!nf) { setErroRevisao('Informe o número da NF de entrada. A peça só sai de "Em revisão" depois que a nota de entrada foi emitida.'); return; }
    setAgindo(revisarDe.pecaId); setErroRevisao('');
    try {
      const resp = await fetch(`${API}/pendencias/devolucoes/revisar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pecaId: revisarDe.pecaId, observacao: obsRevisao, nfEntrada: nf }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      setRevisarDe(null);
      if (d.ajusteBling) alert(`Peça liberada.\nEstoque do Bling: ${d.ajusteBling}`);
      await carregar(sub);
    } catch (e: any) { setErroRevisao(e?.message || 'Erro'); }
    setAgindo(null);
  }

  async function tentarBling(it: ItemDev) {
    setAgindo(it.pecaId);
    try {
      const resp = await fetch(`${API}/pendencias/devolucoes/tentar-bling`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pecaId: it.pecaId }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      await carregar(sub);
    } catch (e: any) { alert(e?.message || 'Erro'); }
    setAgindo(null);
  }

  async function enviarPrejuizo() {
    if (!prejuizoDe) return;
    setAgindo(prejuizoDe.pecaId);
    try {
      const resp = await fetch(`${API}/pendencias/devolucoes/prejuizo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pecaId: prejuizoDe.pecaId, motivo: motivoPrej, observacao: obsPrej }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      setPrejuizoDe(null); setObsPrej(''); setMotivoPrej('Defeito');
      if (d.ajusteBling) alert(`Enviada para Prejuízo.\nEstoque do Bling: ${d.ajusteBling}`);
      await carregar(sub);
    } catch (e: any) { alert(e?.message || 'Erro'); }
    setAgindo(null);
  }

  const campo = (rotulo: string, valor: string, cor = 'var(--gray-800)') => (
    <div><div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{rotulo}</div><div style={{ marginTop: 3, fontSize: 12.5, color: cor, fontWeight: 600 }}>{valor}</div></div>
  );

  return (
    <>
      <div style={{ padding: isPhone ? '12px 14px 0' : '16px 28px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['em_revisao', 'Em revisão'], ['revisada', 'Revisadas']] as Array<['em_revisao' | 'revisada', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setSub(id)} style={{ border: '1px solid ' + (sub === id ? 'var(--gray-800)' : 'var(--border)'), background: sub === id ? 'var(--gray-800)' : 'var(--white)', color: sub === id ? '#fff' : 'var(--gray-600)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{rotulo}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--gray-400)', alignSelf: 'center' }}>Peças de vendas canceladas aguardando revisão antes de voltar ao estoque</span>
        <button type="button" onClick={() => setGerenciarTipos(true)} style={{ ...s.btn, marginLeft: 'auto', background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)', fontWeight: 600, padding: '6px 14px', fontSize: 12.5, borderRadius: 999 }}>⚙ Tipos de devolução</button>
      </div>
      <div style={{ padding: isPhone ? 14 : 28, maxWidth: 1250 }}>
        <div style={{ ...s.card, padding: '12px 16px', display: 'inline-block', minWidth: 190, marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{sub === 'em_revisao' ? 'Peças em revisão' : 'Peças revisadas'}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{itens.length}</div>
        </div>
        {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 12 }}>Carregando...</div> : null}
        {!carregando && !itens.length ? (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>{sub === 'em_revisao' ? 'Nenhuma peça em revisão' : 'Nenhuma peça revisada ainda'}</div>
            {sub === 'em_revisao' ? <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Quando você aprovar um cancelamento importado do Bling, a peça aparece aqui e fica como "Em Revisão" no Estoque.</div> : null}
          </div>
        ) : null}
        {itens.map((it) => (
          <div key={it.pecaId} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14, color: 'var(--blue-500)' }}>{it.idPeca}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 99, background: it.status === 'em_revisao' ? '#fffbeb' : it.status === 'prejuizo' ? '#fef2f2' : '#f0fdf4', color: it.status === 'em_revisao' ? '#92400e' : it.status === 'prejuizo' ? '#b91c1c' : '#15803d', border: '1px solid ' + (it.status === 'em_revisao' ? '#fde68a' : it.status === 'prejuizo' ? '#fecaca' : '#bbf7d0') }}>{it.status === 'em_revisao' ? 'Em Revisão' : it.status === 'prejuizo' ? 'Enviada para Prejuízo' : 'Revisada'}</span>
                  <CanalBadge canal={it.pedido.canal} />
                  {it.nfEntrada ? <button type="button" disabled={!podeRevisar} onClick={() => abrirNf(it)} title={podeRevisar ? 'Alterar a NF de entrada' : undefined} style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', cursor: podeRevisar ? 'pointer' : 'default' }}>NF entrada {it.nfEntrada}</button> : it.status === 'em_revisao' ? <button type="button" disabled={!podeRevisar} onClick={() => abrirNf(it)} title={podeRevisar ? 'Informar a NF de entrada' : undefined} style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: '#fffbeb', color: '#92400e', border: '1px dashed #fcd34d', cursor: podeRevisar ? 'pointer' : 'default' }}>NF de entrada pendente — informar</button> : null}
                  {it.tipo ? <span title={it.tipo.observacao || undefined} style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>{it.tipo.nome}</span> : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: 'var(--white)', color: 'var(--gray-500)', border: '1px dashed var(--border)' }}>Sem motivo</span>}
                  {podeRevisar ? <button onClick={() => setMotivoDe(it)} style={{ ...s.btn, background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe', fontWeight: 700 }}>{it.tipo ? 'Alterar motivo' : 'Informar motivo'}</button> : null}
                  {podeRevisar && it.status === 'em_revisao' ? <button onClick={() => revisar(it)} disabled={agindo === it.pecaId} style={{ ...s.btn, background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0', fontWeight: 700 }}>Marcar como revisada</button> : null}
                  {podeRevisar && it.status === 'em_revisao' ? <button onClick={() => { setPrejuizoDe(it); setMotivoPrej('Defeito'); setObsPrej(''); }} disabled={agindo === it.pecaId} style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', fontWeight: 700 }}>Enviar para Prejuízo</button> : null}
                </div>
                {it.status === 'em_revisao' && it.blingSaida === false ? (
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>⚠ Estoque do Bling ainda não foi atualizado{it.blingSaidaErro ? ` (${it.blingSaidaErro})` : ''}. {podeRevisar ? <button onClick={() => tentarBling(it)} disabled={agindo === it.pecaId} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 12 }}>Tentar de novo</button> : null}</div>
                ) : null}
                <div style={{ fontSize: 13.5, color: 'var(--gray-800)', marginTop: 6 }}>{it.descricao}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>{it.moto || '-'}{it.localizacao ? ` · ${it.localizacao}` : ''}{it.etiquetaPendente ? ' · etiqueta Detran pendente' : ''}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', textAlign: isPhone ? 'left' : 'right' }}>
                <div>Pedido cancelado <strong>#{it.pedido.num || '-'}</strong>{it.pedido.clienteNome ? ` — ${it.pedido.clienteNome}` : ''}</div>
                <div>Venda em {fmtDate(it.pedido.dataVenda || '')} · cancelamento importado em {fmtDataHora(it.criadoEm)}</div>
                {it.status === 'revisada' ? <div>Revisada em {fmtDataHora(it.revisadaEm)}{it.revisadaPor ? ` por ${it.revisadaPor}` : ''}</div> : null}
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Valores estornados da venda</div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                {campo('Preço ML', fmtMoney(it.estornado.precoML), 'var(--blue-500)')}
                {campo('Taxas', fmtMoney(it.estornado.valorTaxas), 'var(--amber)')}
                {campo('Frete', fmtMoney(it.estornado.valorFrete))}
                {campo('Valor líq.', fmtMoney(it.estornado.valorLiq), 'var(--green)')}
              </div>
              {it.observacao ? <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8 }}>Obs.: {it.observacao}</div> : null}
            </div>
          </div>
        ))}
      </div>
      {nfDe ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setNfDe(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>NF de entrada (retorno)</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 14 }}>{nfDe.idPeca} — {nfDe.descricao}{nfDe.pedido.num ? ` · pedido #${nfDe.pedido.num}` : ''}</div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>Número da nota fiscal de entrada</label>
            <input value={nfValor} onChange={(e) => setNfValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvarNf(); }} placeholder="Número da NF" autoFocus style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace' }} />
            <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 6 }}>Salvar só registra a nota. Para liberar a peça, use "Marcar como revisada".</div>
            {nfErro ? <div style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>{nfErro}</div> : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setNfDe(null)} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }}>Cancelar</button>
              <button onClick={salvarNf} disabled={agindo === nfDe.pecaId} style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', borderColor: 'var(--gray-800)', fontWeight: 700 }}>{agindo === nfDe.pecaId ? 'Salvando...' : 'Salvar NF'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {revisarDe ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setRevisarDe(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 460, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Marcar como revisada</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 14 }}>{revisarDe.idPeca} — {revisarDe.descricao}. A peça volta ao Estoque como disponível e o estoque do Bling é igualado ao total do sistema.</div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>NF de entrada (retorno) *</label>
            <input value={nfEntrada} onChange={(e) => setNfEntrada(e.target.value)} placeholder="Número da nota fiscal de entrada" autoFocus style={{ width: '100%', padding: '8px 10px', border: '1px solid ' + (erroRevisao && !nfEntrada.trim() ? '#fca5a5' : 'var(--border)'), borderRadius: 8, marginBottom: 4, marginTop: 4, boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace' }} />
            <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginBottom: 12 }}>Obrigatória: emita a nota de entrada da peça devolvida e informe o número aqui.</div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>Observação da revisão (opcional)</label>
            <textarea value={obsRevisao} onChange={(e) => setObsRevisao(e.target.value)} rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            {erroRevisao ? <div style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>{erroRevisao}</div> : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setRevisarDe(null)} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }}>Cancelar</button>
              <button onClick={confirmarRevisao} disabled={agindo === revisarDe.pecaId} style={{ ...s.btn, background: '#047857', color: '#fff', borderColor: '#047857', fontWeight: 700 }}>{agindo === revisarDe.pecaId ? 'Salvando...' : 'Confirmar revisão'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {motivoDe ? (
        <MotivoDevolucaoModal
          subtitulo={`${motivoDe.idPeca} — ${motivoDe.descricao}${motivoDe.pedido.num ? ` · pedido #${motivoDe.pedido.num}` : ''}`}
          motivos={tiposDevolucao} motivoIdAtual={motivoDe.tipo?.id} observacaoAtual={motivoDe.tipo?.observacao}
          podeGerenciar={podeRevisar} onGerenciar={() => setGerenciarTipos(true)}
          onSalvar={(motivoId, obs) => salvarMotivo(motivoDe, motivoId, obs)} onClose={() => setMotivoDe(null)}
        />
      ) : null}
      {gerenciarTipos ? <TiposDevolucaoModal onClose={() => setGerenciarTipos(false)} onAlterou={() => carregar(sub)} /> : null}
      {prejuizoDe ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPrejuizoDe(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Enviar para Prejuízo</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 14 }}>{prejuizoDe.idPeca} — {prejuizoDe.descricao}. A peça sai da revisão e vai para Prejuízos; o estoque do Bling continua com a saída.</div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>Motivo</label>
            <select value={motivoPrej} onChange={(e) => setMotivoPrej(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, marginTop: 4 }}>
              {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray-500)' }}>Observação (opcional)</label>
            <textarea value={obsPrej} onChange={(e) => setObsPrej(e.target.value)} rows={3} placeholder="Ex: voltou com a rosca danificada" style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setPrejuizoDe(null)} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }}>Cancelar</button>
              <button onClick={enviarPrejuizo} disabled={agindo === prejuizoDe.pecaId} style={{ ...s.btn, background: '#b91c1c', color: '#fff', borderColor: '#b91c1c', fontWeight: 700 }}>{agindo === prejuizoDe.pecaId ? 'Enviando...' : 'Enviar para Prejuízo'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ───────────── Pagina ─────────────
const ABAS_PRINCIPAIS = ['recebimentos', 'devolucoes'] as const;

export default function PendenciasPage() {
  const isPhone = useIsPhone();
  const [aba, setAba] = usePersistentTab<'recebimentos' | 'devolucoes'>('aba', 'recebimentos', ABAS_PRINCIPAIS);
  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Pendências</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Recebimentos a conferir e peças devolvidas em revisão</div>
        </div>
      </div>
      <TabsBar tabs={[{ id: 'recebimentos', label: 'Recebimentos' }, { id: 'devolucoes', label: 'Devoluções' }]} active={aba} onChange={(id) => setAba(id as 'recebimentos' | 'devolucoes')} />
      {aba === 'recebimentos' ? <RecebimentosTab /> : <DevolucoesTab />}
    </>
  );
}
