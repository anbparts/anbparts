'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';
import FluxoCaixaChart from './FluxoCaixaChart';

// Despesas x Receita = FLUXO DE CAIXA (especificacao do Nelson):
//   Receita  = todas as entradas financeiras (vendas); Despesas = todos os gastos efetuados (inclui compra de motos e de ativos
//   mesmo que nao estejam lancadas em Despesas, no mes da compra); Saldo = Receita - Despesas; visao de 12 meses do ano escolhido.
//   Clicar em um mes abre os registros considerados na apuracao. A versao antiga da tela esta em ./_old/page.tsx (sem uso).
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const anoAtual = new Date().getFullYear();

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const cs: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th: { padding: '10px 14px', textAlign: 'right' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const, background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 14px', textAlign: 'right' as const, borderBottom: '1px solid var(--gray-100)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' as const },
  sel: { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32, cursor: 'pointer' },
};

export default function DespesasReceitaPage() {
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [popupMes, setPopupMes] = useState<number | null>(null); // 0 = ano inteiro
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isCompact = isPhone || viewportMode === 'tablet-portrait';
  const mask = sensitiveMaskStyle(hidden);

  useEffect(() => {
    setCarregando(true);
    setErro('');
    api.financeiro.fluxoCaixa({ ano: String(ano) })
      .then(setDados)
      .catch((e: any) => setErro(e?.message || 'Erro ao carregar o fluxo de caixa'))
      .finally(() => setCarregando(false));
  }, [ano]);

  const meses: any[] = Array.isArray(dados?.meses) ? dados.meses : [];
  const total = dados?.total || { recPrevista: 0, despPrevista: 0, saldoProjetado: 0, receita: 0, despesas: 0, saldo: 0, despLancadas: 0, comissoes: 0, frete: 0, motos: 0, ativos: 0 };
  const anos: number[] = useMemo(() => Array.from(new Set<number>([ano, ...(Array.isArray(dados?.anosDisponiveis) ? dados.anosDisponiveis : [])])).sort((a, b) => b - a), [ano, dados?.anosDisponiveis]);
  const ultimoMes = ano === anoAtual ? new Date().getMonth() + 1 : ano > anoAtual ? 0 : 12;

  const temPrev = (m: any) => (m.recPrevista || 0) > 0 || (m.despPrevista || 0) > 0;
  const ativo = (m: any, i: number) => i < ultimoMes || temPrev(m);
  const mostraPrev = (total.recPrevista || 0) > 0 || (total.despPrevista || 0) > 0;
  const valor = (v: number, cor?: string) => <span style={{ ...mask, color: cor }}>{sensitiveText(fmt(v), hidden)}</span>;
  const corSaldo = (v: number) => (v >= 0 ? 'var(--green)' : 'var(--red)');

  const colunas = [
    { k: 'receita', rotulo: 'Receita' },
    { k: 'despLancadas', rotulo: 'Despesas lançadas' },
    { k: 'taxas', rotulo: 'Comissões + fretes' },
    { k: 'motos', rotulo: 'Compra de motos*' },
    { k: 'ativos', rotulo: 'Compra de ativos*' },
    { k: 'despesas', rotulo: 'Despesas' },
    { k: 'saldo', rotulo: 'Saldo do mês' },
    { k: 'acumulado', rotulo: 'Saldo acumulado' },
    ...(mostraPrev ? [
      { k: 'recPrevista', rotulo: 'A receber (previsto)' },
      { k: 'despPrevista', rotulo: 'A pagar (previsto)' },
      { k: 'acumuladoProjetado', rotulo: 'Saldo projetado' },
    ] : []),
  ];
  const celula = (m: any, k: string) => {
    if (k === 'taxas') return valor(m.comissoes + m.frete);
    if (k === 'saldo' || k === 'acumulado' || k === 'acumuladoProjetado') return valor(m[k] || 0, corSaldo(m[k] || 0));
    if (k === 'recPrevista') return valor(m.recPrevista || 0, 'var(--green)');
    if (k === 'despPrevista') return valor(m.despPrevista || 0, 'var(--red)');
    if (k === 'receita') return valor(m.receita, 'var(--green)');
    if (k === 'despesas') return valor(m.despesas, 'var(--red)');
    return valor(m[k]);
  };

  return (
    <>
      <div style={{ ...cs.topbar, alignItems: isCompact ? 'flex-start' : 'center', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : cs.topbar.padding }}>
        <div>
          <div style={cs.title}>Despesas x Receita</div>
          <div style={cs.sub}>Fluxo de caixa: receitas, despesas efetuadas e saldo, mês a mês</div>
        </div>
        <select style={{ ...cs.sel, width: isCompact ? '100%' : undefined }} value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div style={{ padding: isCompact ? 16 : 28, display: 'grid', gap: 20 }}>
        {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {[
            { label: `Receita ${ano}`, value: total.receita, color: 'var(--green)' },
            { label: `Despesas ${ano}`, value: total.despesas, color: 'var(--red)' },
            { label: `Saldo ${ano}`, value: total.saldo, color: corSaldo(total.saldo) },
          ].map((c) => (
            <div key={c.label} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: c.color, ...mask }}>{sensitiveText(fmt(c.value), hidden)}</div>
            </div>
          ))}
        </div>

        <div style={{ ...cs.card, padding: isCompact ? 14 : 20 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600 }}>Receitas vs Despesas · {ano}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '4px 0 12px' }}>As duas linhas de cima são Receitas e Despesas; a linha de baixo é o Saldo do mês. Clique em um mês para ver os registros.</div>
          {carregando ? (
            <div style={{ padding: 24, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando fluxo de caixa...</div>
          ) : (
            <FluxoCaixaChart meses={meses} ano={ano} ultimoMes={ultimoMes} hidden={hidden} onSelect={setPopupMes} />
          )}
        </div>

        <div style={cs.card}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Consolidado dos 12 meses</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Clique em um mês para detalhar os registros considerados na apuração.</div>
          </div>
          {carregando ? null : isCompact ? (
            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
              {meses.map((m, i) => (
                <button key={m.mes} type="button" onClick={() => setPopupMes(m.mes)} disabled={!ativo(m, i)} style={{ textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--white)', cursor: ativo(m, i) ? 'pointer' : 'default', opacity: ativo(m, i) ? 1 : 0.5 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{MESES_LONGO[i]}/{ano}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, fontSize: 12.5 }}>
                    <span>Receita<br />{valor(m.receita, 'var(--green)')}</span>
                    <span>Despesas<br />{valor(m.despesas, 'var(--red)')}</span>
                    <span>Saldo<br />{valor(m.saldo, corSaldo(m.saldo))}</span>
                    <span>Acumulado<br />{valor(m.acumulado, corSaldo(m.acumulado))}</span>
                    {temPrev(m) && <span>A receber (prev.)<br />{valor(m.recPrevista || 0, 'var(--green)')}</span>}
                    {temPrev(m) && <span>A pagar (prev.)<br />{valor(m.despPrevista || 0, 'var(--red)')}</span>}
                  </div>
                </button>
              ))}
              <button type="button" onClick={() => setPopupMes(0)} style={{ textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--gray-50)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Total {ano}: {valor(total.saldo, corSaldo(total.saldo))}
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: mostraPrev ? 1400 : 1020 }}>
                <thead>
                  <tr>
                    <th style={{ ...cs.th, textAlign: 'left' }}>Mês</th>
                    {colunas.map((c) => <th key={c.k} style={cs.th}>{c.rotulo}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m, i) => (
                    <tr key={m.mes} onClick={() => ativo(m, i) && setPopupMes(m.mes)} style={{ cursor: ativo(m, i) ? 'pointer' : 'default', opacity: ativo(m, i) ? 1 : 0.45 }}>
                      <td style={{ ...cs.td, textAlign: 'left', fontFamily: 'Geist, sans-serif', fontWeight: 600 }}>{MESES[i]}/{ano}</td>
                      {colunas.map((c) => <td key={c.k} style={cs.td}>{celula(m, c.k)}</td>)}
                    </tr>
                  ))}
                  <tr onClick={() => setPopupMes(0)} style={{ cursor: 'pointer', background: 'var(--gray-50)' }}>
                    <td style={{ ...cs.td, textAlign: 'left', fontFamily: 'Geist, sans-serif', fontWeight: 700 }}>Total {ano}</td>
                    {colunas.map((c) => (
                      <td key={c.k} style={{ ...cs.td, fontWeight: 700 }}>
                        {c.k === 'acumulado' ? valor(total.saldo, corSaldo(total.saldo)) : c.k === 'acumuladoProjetado' ? valor(total.saldoProjetado || 0, corSaldo(total.saldoProjetado || 0)) : celula({ ...total, acumulado: total.saldo }, c.k)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '10px 18px 14px', fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
            Receita = vendas de peças (todas as categorias, inclusive sucata). Despesas = despesas pagas (mês do pagamento) + comissões e fretes dos pedidos + compras de motos e de ativos.
            * Compras de motos e de ativos só entram nessas colunas quando ainda não estão lançadas em Despesas; contam no mês da compra.
            {mostraPrev ? ' Previsto = lançamentos futuros, separados do realizado: despesas a pagar (pendentes e recorrentes, pelo vencimento; as vencidas e não pagas contam no mês atual) e o saldo a liberar do Mercado Pago (mês atual). O saldo a liberar vem de vendas já contadas na Receita; o Saldo projetado é a soma do saldo realizado com o previsto, como referência.' : ''}
          </div>
        </div>
      </div>

      {popupMes !== null && <RegistrosModal ano={ano} mes={popupMes} hidden={hidden} onClose={() => setPopupMes(null)} />}
    </>
  );
}

const thBase: any = { padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const tdBase: any = { padding: '8px 14px', borderBottom: '1px solid var(--gray-100)' };

// Registros que compoem a apuracao de um mes (receitas, despesas lancadas, comissoes e fretes, compras de motos e de ativos)
function RegistrosModal({ ano, mes, hidden, onClose }: { ano: number; mes: number; hidden: boolean; onClose: () => void }) {
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const mask = sensitiveMaskStyle(hidden);

  useEffect(() => {
    setCarregando(true);
    setErro('');
    api.financeiro.fluxoCaixaLancamentos({ ano: String(ano), mes: String(mes) })
      .then(setDados)
      .catch((e: any) => setErro(e?.message || 'Erro ao carregar os registros'))
      .finally(() => setCarregando(false));
  }, [ano, mes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabelas: any[] = Array.isArray(dados?.tabelas) ? dados.tabelas : [];
  const notas: string[] = Array.isArray(dados?.notas) ? dados.notas : [];
  const celula = (col: any, item: any) => {
    const v = item[col.k];
    if (col.tipo === 'moeda') return <span style={mask}>{sensitiveText(fmt(Number(v) || 0), hidden)}</span>;
    if (col.tipo === 'data') return fmtData(v);
    return v === undefined || v === null || v === '' ? <span style={{ color: 'var(--gray-300)' }}>-</span> : String(v);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, width: '100%', maxWidth: 1040, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Registros considerados · {mes ? `${MESES_LONGO[mes - 1]} de ${ano}` : `ano de ${ano}`}</div>
            {dados ? (
              <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>Receita <b style={{ color: 'var(--green)', ...mask }}>{sensitiveText(fmt(dados.totalReceita), hidden)}</b></span>
                <span>Despesas <b style={{ color: 'var(--red)', ...mask }}>{sensitiveText(fmt(dados.totalDespesas), hidden)}</b></span>
                <span>Saldo <b style={{ color: dados.saldo >= 0 ? 'var(--green)' : 'var(--red)', ...mask }}>{sensitiveText(fmt(dados.saldo), hidden)}</b></span>
                {(dados.totalReceitaPrevista > 0 || dados.totalDespesasPrevistas > 0) && (
                  <span style={{ color: 'var(--gray-500)' }}>Previsto: a receber <b style={mask}>{sensitiveText(fmt(dados.totalReceitaPrevista || 0), hidden)}</b> · a pagar <b style={mask}>{sensitiveText(fmt(dados.totalDespesasPrevistas || 0), hidden)}</b></span>
                )}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--gray-600)', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', display: 'grid', gap: 20 }}>
          {carregando && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Carregando os registros...</div>}
          {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div>}

          {tabelas.map((t, ti) => {
            const colTotal = t.colunas.filter((c: any) => c.tipo === 'moeda').slice(-1)[0];
            return (
              <div key={ti}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 6 }}>{t.titulo}</div>
                {t.itens.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Nenhum registro neste período.</div>
                ) : (
                  <div style={{ overflow: 'auto', maxHeight: 340, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 }}>
                      <thead>
                        <tr>
                          {t.colunas.map((c: any) => (
                            <th key={c.k} style={{ ...thBase, textAlign: c.tipo === 'moeda' ? 'right' : 'left', background: 'var(--gray-50)', position: 'sticky', top: 0 }}>{c.rotulo}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.itens.map((item: any, ii: number) => (
                          <tr key={ii}>
                            {t.colunas.map((c: any) => (
                              <td key={c.k} style={{ ...tdBase, whiteSpace: c.tipo === 'texto' ? 'normal' : 'nowrap', textAlign: c.tipo === 'moeda' ? 'right' : 'left', fontFamily: c.tipo === 'moeda' ? 'JetBrains Mono, monospace' : undefined, color: 'var(--gray-700)', maxWidth: 320 }}>{celula(c, item)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {t.total !== null && colTotal ? (
                        <tfoot>
                          <tr>
                            {t.colunas.map((c: any, ci: number) => (
                              <td key={c.k} style={{ ...tdBase, background: 'var(--gray-50)', fontWeight: 700, textAlign: c.tipo === 'moeda' ? 'right' : 'left', fontFamily: c.tipo === 'moeda' ? 'JetBrains Mono, monospace' : undefined, color: 'var(--gray-800)', position: 'sticky', bottom: 0 }}>
                                {c.k === colTotal.k ? <span style={mask}>{sensitiveText(fmt(t.total), hidden)}</span> : ci === 0 ? `Total · ${t.itens.length} registro${t.itens.length === 1 ? '' : 's'}` : ''}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {notas.map((nota, i) => <div key={i} style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.5 }}>{nota}</div>)}
        </div>
      </div>
    </div>
  );
}
