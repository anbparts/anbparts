'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useAuth } from '@/lib/auth';
import { canProcessAction } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink-soft)', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  th: { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '10px 12px', fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtData(iso?: string | null) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}

function corCanal(canal: string) {
  const c = String(canal || '').toLowerCase();
  if (/mercado|ml\b/.test(c)) return { cor: '#92400e', fundo: '#fef3c7' };
  if (/shopee/.test(c)) return { cor: '#c2410c', fundo: '#ffedd5' };
  if (/magalu|magazine/.test(c)) return { cor: '#1d4ed8', fundo: '#dbeafe' };
  if (/nuvem|tiendanube|loja virtual/.test(c)) return { cor: '#0f766e', fundo: '#ccfbf1' };
  if (/olx/.test(c)) return { cor: '#6d28d9', fundo: '#ede9fe' };
  return { cor: '#475569', fundo: '#f1f5f9' };
}
function corSituacao(situacao: string, cancelado: boolean) {
  if (cancelado) return { cor: '#b91c1c', fundo: '#fee2e2' };
  if (/atendid|conclu|entregue|faturad/i.test(situacao)) return { cor: '#15803d', fundo: '#dcfce7' };
  if (/abert/i.test(situacao)) return { cor: '#b45309', fundo: '#fef3c7' };
  return { cor: '#475569', fundo: '#f1f5f9' };
}
const pill = (texto: string, c: { cor: string; fundo: string }) => (
  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: c.fundo, color: c.cor, whiteSpace: 'nowrap' }}>{texto}</span>
);

export default function BlingPedidosPage() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const podeSincronizar = canProcessAction(user, 'bling_pedidos', 'sincronizar');

  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState({ busca: '', situacao: 'todas', canal: 'todos', de: '', ate: '' });
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, any>>({});
  const [sync, setSync] = useState<any>(null);
  const [periodo, setPeriodo] = useState({ de: '', ate: '' });
  const [sincronizando, setSincronizando] = useState(false);
  const pollRef = useRef<any>(null);

  async function chamar(path: string, init?: RequestInit) {
    const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
    return d;
  }

  async function carregar(p = pagina, f = filtros, silencioso = false) {
    if (!silencioso) setCarregando(true);
    try {
      const qs = new URLSearchParams({ pagina: String(p), limite: '50', busca: f.busca, situacao: f.situacao, canal: f.canal, de: f.de, ate: f.ate });
      setDados(await chamar(`/bling-pedidos/pedidos?${qs.toString()}`));
    } catch (e: any) { alert(e?.message || 'Erro ao carregar os pedidos'); }
    if (!silencioso) setCarregando(false);
  }
  async function carregarSync() {
    try { setSync(await chamar('/bling-pedidos/sincronizacao')); } catch { /* painel opcional */ }
  }

  useEffect(() => { carregar(1); carregarSync(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // acompanha a carga enquanto ela roda
  useEffect(() => {
    if (sync?.job?.rodando && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        await carregarSync();
      }, 3000);
    }
    if (!sync?.job?.rodando && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      carregar(1);
    }
  }, [sync?.job?.rodando]); // eslint-disable-line react-hooks/exhaustive-deps

  // enquanto importa, a lista vai sendo atualizada com os pedidos novos
  useEffect(() => { if (sync?.job?.rodando && sync?.job?.fase === 'pedidos') carregar(pagina, filtros, true); }, [sync?.job?.feitos]); // eslint-disable-line react-hooks/exhaustive-deps

  async function expandir(id: string) {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    if (!detalhes[id]) {
      try {
        const d = await chamar(`/bling-pedidos/pedidos/${id}`);
        setDetalhes((prev) => ({ ...prev, [id]: d.pedido }));
      } catch (e: any) { alert(e?.message || 'Erro ao carregar o pedido'); }
    }
  }

  async function importarDasPecas() {
    setSincronizando(true);
    try { await chamar('/bling-pedidos/sincronizacao/historico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await carregarSync(); }
    catch (e: any) { alert(e?.message || 'Erro ao iniciar'); }
    setSincronizando(false);
  }
  async function importarPeriodo() {
    if (!periodo.de || !periodo.ate) return alert('Informe as duas datas.');
    setSincronizando(true);
    try {
      await chamar('/bling-pedidos/sincronizacao/periodo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(periodo) });
      await carregarSync();
    } catch (e: any) { alert(e?.message || 'Erro ao importar o periodo'); }
    setSincronizando(false);
  }

  function aplicar() { setPagina(1); carregar(1, filtros); }
  function irPara(p: number) { setPagina(p); carregar(p); }

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1;
  const job = sync?.job;
  const pendentes = sync?.pedidosDasPecasPendentes || 0;

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Pedidos</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Pedidos de venda do Bling com itens, canal e cliente</div>
        </div>
      </div>

      <div style={{ padding: isPhone ? 12 : 28, display: 'grid', gap: 16 }}>
        {/* Base de pedidos / sincronizacao */}
        <div style={{ ...s.card, padding: '14px 18px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Base de pedidos</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 3, lineHeight: 1.6 }}>
              {sync ? <>{sync.pedidos} pedido(s) · {sync.clientes} cliente(s){sync.pedidoMaisAntigo ? ` · desde ${fmtData(sync.pedidoMaisAntigo)}` : ''}{sync.ultimaSincronizacao ? ` · atualizado em ${new Date(sync.ultimaSincronizacao).toLocaleString('pt-BR')}` : ''}</> : 'Carregando...'}
              {sync && pendentes > 0 ? <div style={{ color: '#b45309' }}>{pendentes} pedido(s) já ligados às peças ainda não foram importados.</div> : null}
            </div>
            {job?.rodando ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 8, borderRadius: 99, background: '#e9e9f1', overflow: 'hidden' }}>
                  <div style={{ width: `${job.total ? Math.min(100, (job.feitos / job.total) * 100) : 5}%`, height: '100%', background: '#2563eb', borderRadius: 99, transition: 'width .4s' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                  {job.fase === 'listando' ? 'Consultando a lista de pedidos do período no Bling...' : <>{job.fase === 'clientes' ? 'Buscando dados dos clientes' : 'Importando pedidos'}: {job.feitos} de {job.total}</>}{job.erros ? ` · ${job.erros} erro(s)` : ''} — pode sair da tela, a importação continua no servidor.
                </div>
              </div>
            ) : job?.ultimoErro ? <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>Último aviso: {job.ultimoErro}</div> : null}
          </div>
          {podeSincronizar && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={{ ...s.btn, background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)', opacity: job?.rodando || sincronizando || !pendentes ? 0.55 : 1 }} disabled={!!job?.rodando || sincronizando || !pendentes} onClick={importarDasPecas}>
                {job?.rodando ? 'Importando...' : `Importar pedidos das peças${pendentes ? ` (${pendentes})` : ''}`}
              </button>
              <input type="date" style={{ ...s.input, width: 150 }} value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
              <input type="date" style={{ ...s.input, width: 150 }} value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
              <button type="button" style={s.btn} disabled={sincronizando || !!job?.rodando} onClick={importarPeriodo}>{job?.rodando && job?.modo === 'periodo' ? 'Importando...' : 'Importar período'}</button>
            </div>
          )}
        </div>

        {/* Resumo + filtros */}
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Pedidos no filtro</div><div style={{ fontSize: 22, fontWeight: 700 }}>{dados?.total ?? '—'}</div></div>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Receita (sem cancelados)</div><div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{dados ? brl(dados.soma) : '—'}</div></div>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Ticket médio</div><div style={{ fontSize: 22, fontWeight: 700 }}>{dados && dados.ativos ? brl(dados.soma / dados.ativos) : '—'}</div></div>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Canais</div><div style={{ fontSize: 22, fontWeight: 700 }}>{dados?.canais?.length ?? '—'}</div></div>
        </div>

        <div style={{ ...s.card, padding: 14, display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(220px, 1.6fr) 1fr 1fr 150px 150px auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Buscar</div>
            <input style={s.input} placeholder="Pedido, cliente, SKU ou descrição" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); }} /></div>
          <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Situação</div>
            <select style={s.input} value={filtros.situacao} onChange={(e) => { const f = { ...filtros, situacao: e.target.value }; setFiltros(f); setPagina(1); carregar(1, f); }}>
              <option value="todas">Todas</option><option value="ativos">Sem cancelados</option><option value="cancelado">Cancelados</option>
              {(dados?.situacoes || []).map((x: string) => <option key={x} value={x}>{x}</option>)}
            </select></div>
          <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Canal</div>
            <select style={s.input} value={filtros.canal} onChange={(e) => { const f = { ...filtros, canal: e.target.value }; setFiltros(f); setPagina(1); carregar(1, f); }}>
              <option value="todos">Todos</option>
              {(dados?.canais || []).map((x: string) => <option key={x} value={x}>{x}</option>)}
            </select></div>
          <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>De</div><input type="date" style={s.input} value={filtros.de} onChange={(e) => setFiltros({ ...filtros, de: e.target.value })} /></div>
          <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Até</div><input type="date" style={s.input} value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} /></div>
          <button type="button" style={{ ...s.btn, background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }} onClick={aplicar}>Buscar</button>
        </div>

        {/* Lista */}
        <div style={{ ...s.card, overflow: 'hidden' }}>
          {carregando && !dados ? <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-muted)' }}>Carregando...</div> : null}
          {dados && !dados.itens.length ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>
              {sync && sync.pedidos === 0 ? 'Nenhum pedido na base ainda. Use "Importar pedidos das peças" para começar.' : 'Nenhum pedido encontrado neste filtro.'}
            </div>
          ) : null}

          {dados && dados.itens.length > 0 && !isPhone && (
            <div style={{ overflowX: 'auto', opacity: carregando ? 0.6 : 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...s.th, width: 28 }} />
                  <th style={s.th}>Pedido</th><th style={s.th}>Data</th><th style={s.th}>Canal</th><th style={s.th}>Cliente</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Peças</th><th style={{ ...s.th, textAlign: 'right' }}>Total</th><th style={s.th}>Situação</th>
                </tr></thead>
                <tbody>
                  {dados.itens.map((p: any) => {
                    const aberto = expandido === p.id;
                    const d = detalhes[p.id];
                    return (
                      <Fragment key={p.id}>
                        <tr onClick={() => expandir(p.id)} style={{ cursor: 'pointer', background: aberto ? 'var(--gray-50)' : undefined }}>
                          <td style={{ ...s.td, color: 'var(--ink-muted)' }}>{aberto ? '▾' : '▸'}</td>
                          <td style={s.td}><strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>#{p.numero}</strong>{p.numeroLoja ? <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{p.numeroLoja}</div> : null}</td>
                          <td style={{ ...s.td, color: 'var(--ink-soft)' }}>{fmtData(p.data)}</td>
                          <td style={s.td}>{pill(p.canal || '—', corCanal(p.canal))}</td>
                          <td style={s.td}>{p.clienteNome || <span style={{ color: 'var(--ink-muted)' }}>sem cliente</span>}{p.entregaCidade ? <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{p.entregaCidade}{p.entregaUf ? `/${p.entregaUf}` : ''}</div> : null}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{p.pecas}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{brl(p.total)}</td>
                          <td style={s.td}>{pill(p.situacao || '—', corSituacao(p.situacao, p.cancelado))}</td>
                        </tr>
                        {aberto && (
                          <tr><td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>{DetalhePedido(d)}</td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {dados && dados.itens.length > 0 && isPhone && (
            <div style={{ display: 'grid', gap: 0 }}>
              {dados.itens.map((p: any) => {
                const aberto = expandido === p.id;
                return (
                  <div key={p.id} style={{ borderBottom: '1px solid var(--border)', padding: 12 }}>
                    <div onClick={() => expandir(p.id)} style={{ cursor: 'pointer', display: 'grid', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>#{p.numero}</strong><span style={{ fontWeight: 700 }}>{brl(p.total)}</span></div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{pill(p.canal || '—', corCanal(p.canal))}{pill(p.situacao || '—', corSituacao(p.situacao, p.cancelado))}<span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{fmtData(p.data)} · {p.pecas} peça(s)</span></div>
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{p.clienteNome || 'sem cliente'}</div>
                    </div>
                    {aberto ? <div style={{ marginTop: 8 }}>{DetalhePedido(detalhes[p.id])}</div> : null}
                  </div>
                );
              })}
            </div>
          )}

          {dados && dados.total > dados.limite && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', fontSize: 12.5, color: 'var(--ink-muted)' }}>
              <span>Página {dados.pagina} de {totalPaginas}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={s.btn} disabled={dados.pagina <= 1} onClick={() => irPara(dados.pagina - 1)}>Anterior</button>
                <button type="button" style={s.btn} disabled={dados.pagina >= totalPaginas} onClick={() => irPara(dados.pagina + 1)}>Próxima</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  function DetalhePedido(d: any) {
    if (!d) return <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-muted)' }}>Carregando pedido...</div>;
    return (
      <div style={{ padding: isPhone ? 10 : '14px 20px 18px', display: 'grid', gap: 14 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <thead><tr><th style={s.th}>SKU</th><th style={s.th}>Descrição</th><th style={{ ...s.th, textAlign: 'right' }}>Qtd</th><th style={{ ...s.th, textAlign: 'right' }}>Valor</th><th style={{ ...s.th, textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {d.itens.map((i: any, idx: number) => (
                <tr key={idx}>
                  <td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{i.sku || '—'}</td>
                  <td style={{ ...s.td, color: 'var(--ink-soft)' }}>{i.descricao || '—'}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{i.quantidade}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{brl(i.valor)}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14, fontSize: 12.5 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Valores</div>
            <div>Produtos: {brl(d.totalProdutos)}</div>
            <div>Frete: {brl(d.frete)}</div>
            {d.desconto ? <div>Desconto: {brl(d.desconto)}</div> : null}
            {d.taxaComissao ? <div>Comissão do canal: {brl(d.taxaComissao)}</div> : null}
            <div style={{ fontWeight: 700 }}>Total: {brl(d.total)}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Cliente</div>
            <div>{d.cliente?.nome || d.clienteNome || '—'}</div>
            {d.cliente?.documento ? <div style={{ color: 'var(--ink-muted)' }}>{d.cliente.documento}</div> : null}
            {d.cliente?.celular || d.cliente?.telefone ? <div>{d.cliente.celular || d.cliente.telefone}</div> : null}
            {d.cliente?.email ? <div style={{ wordBreak: 'break-all' }}>{d.cliente.email}</div> : null}
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Entrega</div>
            <div>{[d.entrega?.endereco, d.entrega?.cidade && `${d.entrega.cidade}${d.entrega.uf ? `/${d.entrega.uf}` : ''}`, d.entrega?.cep].filter(Boolean).join(' · ') || '—'}</div>
            {d.observacoes ? <div style={{ marginTop: 6, color: 'var(--ink-muted)', whiteSpace: 'pre-wrap' }}>{d.observacoes}</div> : null}
          </div>
        </div>
      </div>
    );
  }
}
