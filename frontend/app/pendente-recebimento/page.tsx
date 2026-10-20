'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 14 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

type Item = { id: number; idPeca: string; descricao: string; dataVenda: string; moto: string | null; precoML: number; valorTaxas: number; valorFrete: number; valorLiq: number; brinde?: boolean };
type Pedido = { pedidoNum: string; pedidoId: string | null; nomeCliente: string | null; dataVenda: string; quantidadeItens: number; subtotalPrecoML: number; subtotalTaxas: number; subtotalFrete: number; subtotalValorLiq: number; itens: Item[] };
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

export default function PendenteRecebimentoPage() {
  const isPhone = useIsPhone();
  const [aba, setAba] = usePersistentTab<'pendente' | 'baixado'>('aba', 'pendente', ABAS);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState({ pedidos: 0, valorLiq: 0 });
  const [podeBaixar, setPodeBaixar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState('');

  async function carregar(status = aba) {
    setCarregando(true);
    try {
      const resp = await fetch(`${API}/pendente-recebimento?status=${status}`, { credentials: 'include' });
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
      const resp = await fetch(`${API}/pendente-recebimento/${rota}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoNum, ...extra }) });
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
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Pendente Recebimento</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Pedidos marcados no Relatório de Vendas que ainda aguardam o recebimento</div>
        </div>
      </div>
      <TabsBar tabs={[{ id: 'pendente', label: 'Pendentes' }, { id: 'baixado', label: 'Baixados' }]} active={aba} onChange={(id) => setAba(id as 'pendente' | 'baixado')} />

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
