'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

// Capital de Giro = quanto de caixa a empresa precisa ter para sustentar a operacao por N meses (visao do Nelson):
//   Custo fixo mensal + Custo variavel mensal de cada mes -> media dos meses -> soma das medias -> x meses de cobertura.
// Os custos vem do DRE (mesma classificacao fixa/variavel das categorias de despesa; so despesas pagas, comissoes e fretes das vendas
// entram como variaveis). A depreciacao dos ativos fica de fora do fixo: nao e' saida de caixa. Nao inclui compra de motos (CMV) nem impostos.
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const OPCOES_MESES = [3, 4, 5, 6, 9, 12];
const OPCOES_COBERTURA = [1, 2, 3, 4, 5, 6, 9, 12];
const LS_KEY = 'anb:capital-giro:params';
const COR_FIXO = 'var(--blue-500)';
const COR_VAR = 'var(--amber)';

const fmt = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCurto = (v: number) => {
  const n = Number(v) || 0;
  return Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmt(n);
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
  kpiLabel: { fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase' as const, marginBottom: 8 },
};

type Janela = { ano: number; mes: number };
type Linha = { ano: number; mes: number; fixo: number; variavel: number; total: number; temDados: boolean };
type Parcela = { nome: string; valor: number };

// Ultimos N meses (o mes atual so entra se pedido, pois esta incompleto).
function montarJanela(n: number, incluirAtual: boolean): Janela[] {
  const hoje = new Date();
  let a = hoje.getFullYear();
  let m = hoje.getMonth() + 1;
  if (!incluirAtual) { m -= 1; if (m < 1) { m = 12; a -= 1; } }
  const out: Janela[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift({ ano: a, mes: m });
    m -= 1;
    if (m < 1) { m = 12; a -= 1; }
  }
  return out;
}

// Soma por nome e devolve as maiores parcelas (media mensal), agrupando o resto em "Demais".
function topParcelas(mapa: Record<string, number>, divisor: number, limite: number): Parcela[] {
  const lista = Object.keys(mapa).map((nome) => ({ nome, valor: mapa[nome] / (divisor || 1) })).filter((p) => p.valor > 0.005).sort((a, b) => b.valor - a.valor);
  const topo = lista.slice(0, limite);
  const resto = lista.slice(limite).reduce((s, p) => s + p.valor, 0);
  return resto > 0.005 ? [...topo, { nome: 'Demais categorias', valor: resto }] : topo;
}

export default function CapitalGiroPage() {
  const [nMeses, setNMeses] = useState(5);
  const [cobertura, setCobertura] = useState(3);
  const [incluirAtual, setIncluirAtual] = useState(false);
  const [porAno, setPorAno] = useState<Record<number, any>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isCompact = isPhone || viewportMode === 'tablet-portrait';
  const mask = sensitiveMaskStyle(hidden);
  const valor = (v: number, cor?: string) => <span style={{ ...mask, color: cor }}>{sensitiveText(fmt(v), hidden)}</span>;

  // parametros escolhidos ficam guardados neste navegador
  useEffect(() => {
    try {
      const salvo = JSON.parse(window.localStorage.getItem(LS_KEY) || 'null');
      if (salvo) {
        if (OPCOES_MESES.indexOf(Number(salvo.nMeses)) >= 0) setNMeses(Number(salvo.nMeses));
        if (OPCOES_COBERTURA.indexOf(Number(salvo.cobertura)) >= 0) setCobertura(Number(salvo.cobertura));
        if (typeof salvo.incluirAtual === 'boolean') setIncluirAtual(salvo.incluirAtual);
      }
    } catch { /* sem armazenamento: usa o padrao */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify({ nMeses, cobertura, incluirAtual })); } catch { /* ignora */ }
  }, [nMeses, cobertura, incluirAtual]);

  const janela = useMemo(() => montarJanela(nMeses, incluirAtual), [nMeses, incluirAtual]);
  const anosNecessarios = useMemo(() => Array.from(new Set(janela.map((j) => j.ano))), [janela]);
  const anosKey = anosNecessarios.join(',');

  useEffect(() => {
    const faltando = anosNecessarios.filter((a) => !porAno[a]);
    if (!faltando.length) { setCarregando(false); return; }
    let cancelado = false;
    setCarregando(true);
    setErro('');
    Promise.all(faltando.map((a) => api.financeiro.dre({ ano: String(a) }).then((d: any) => [a, d] as [number, any])))
      .then((res) => {
        if (cancelado) return;
        setPorAno((atual) => {
          const novo = { ...atual };
          res.forEach(([a, d]) => { novo[a] = d; });
          return novo;
        });
      })
      .catch((e: any) => { if (!cancelado) setErro(e?.message || 'Erro ao carregar os custos'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anosKey]);

  const calc = useMemo(() => {
    const linhas: Linha[] = janela.map((j) => {
      const mm = porAno[j.ano]?.meses?.[j.mes - 1];
      // fixo de caixa = fixas do DRE sem a depreciacao (nao sai dinheiro)
      const fixo = mm ? Math.max(0, (Number(mm.despFixas) || 0) - (Number(mm.depreciacao) || 0)) : 0;
      const variavel = mm ? Math.max(0, Number(mm.despVariaveis) || 0) : 0;
      const total = fixo + variavel;
      return { ano: j.ano, mes: j.mes, fixo, variavel, total, temDados: total > 0.005 };
    });
    const validas = linhas.filter((l) => l.temDados);
    const n = validas.length;
    const somaFixo = validas.reduce((s, l) => s + l.fixo, 0);
    const somaVar = validas.reduce((s, l) => s + l.variavel, 0);
    const mediaFixo = n ? somaFixo / n : 0;
    const mediaVar = n ? somaVar / n : 0;
    const mediaTotal = mediaFixo + mediaVar;

    // composicao (media mensal por categoria) so dos meses validos
    const fixos: Record<string, number> = {};
    const variaveis: Record<string, number> = {};
    validas.forEach((l) => {
      const d = porAno[l.ano];
      const mm = d?.meses?.[l.mes - 1];
      (d?.catLinhas || []).forEach((c: any) => {
        const v = Number(c.valores?.[l.mes - 1]) || 0;
        if (!v) return;
        const alvo = c.tipo === 'fixa' ? fixos : variaveis;
        alvo[c.categoria] = (alvo[c.categoria] || 0) + v;
      });
      if (mm) {
        variaveis['Comissões de marketplaces'] = (variaveis['Comissões de marketplaces'] || 0) + (Number(mm.comissoes) || 0);
        variaveis['Fretes de envio'] = (variaveis['Fretes de envio'] || 0) + (Number(mm.frete) || 0);
      }
    });

    return {
      linhas, n, mediaFixo, mediaVar, mediaTotal,
      necessario: mediaTotal * cobertura,
      pctFixo: mediaTotal ? (mediaFixo / mediaTotal) * 100 : 0,
      topFixos: topParcelas(fixos, n, 6),
      topVars: topParcelas(variaveis, n, 6),
      maxTotal: Math.max(1, ...linhas.map((l) => l.total)),
    };
  }, [janela, porAno, cobertura]);

  const rotuloMes = (l: { ano: number; mes: number }) => `${MESES[l.mes - 1]}/${String(l.ano).slice(2)}`;
  const periodo = janela.length ? `${rotuloMes(janela[0])} a ${rotuloMes(janela[janela.length - 1])}` : '';
  const semDados = !carregando && !erro && calc.n === 0;
  const alturaGrafico = isPhone ? 150 : 200;
  const linhaMediaPct = (calc.mediaTotal / calc.maxTotal) * 100;

  return (
    <>
      <div style={{ ...cs.topbar, alignItems: isCompact ? 'flex-start' : 'center', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : cs.topbar.padding }}>
        <div>
          <div style={cs.title}>Capital de Giro</div>
          <div style={cs.sub}>Quanto de caixa a operação precisa para se sustentar, pela média dos custos fixos e variáveis</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isCompact ? '100%' : undefined }}>
          <label style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Meses analisados
            <select style={cs.sel} value={nMeses} onChange={(e) => setNMeses(Number(e.target.value))} aria-label="Meses analisados">
              {OPCOES_MESES.map((m) => <option key={m} value={m}>{m} meses</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Cobertura
            <select style={cs.sel} value={cobertura} onChange={(e) => setCobertura(Number(e.target.value))} aria-label="Meses de cobertura">
              {OPCOES_COBERTURA.map((m) => <option key={m} value={m}>{m} {m === 1 ? 'mês' : 'meses'}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={incluirAtual} onChange={(e) => setIncluirAtual(e.target.checked)} />
            Incluir mês atual (parcial)
          </label>
        </div>
      </div>

      <div style={{ padding: isCompact ? 16 : 28, display: 'grid', gap: 20 }}>
        {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div>}

        {/* destaque: capital de giro necessario */}
        <div style={{ borderRadius: 14, padding: isCompact ? '22px 20px' : '28px 32px', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', color: '#fff', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontFamily: 'Geist Mono, monospace', letterSpacing: '.8px', textTransform: 'uppercase', opacity: 0.75 }}>Capital de giro necessário · {cobertura} {cobertura === 1 ? 'mês' : 'meses'}</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: isPhone ? 34 : 46, fontWeight: 500, lineHeight: 1.1, marginTop: 8, ...mask }}>
              {carregando ? '...' : sensitiveText(fmt(calc.necessario), hidden)}
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 10, lineHeight: 1.5 }}>
              {calc.n ? <>Média de {calc.n} {calc.n === 1 ? 'mês' : 'meses'} ({periodo}) × {cobertura} {cobertura === 1 ? 'mês' : 'meses'} de cobertura</> : 'Sem custos lançados no período escolhido'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6, fontSize: 12.5, minWidth: isPhone ? '100%' : 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, opacity: 0.9 }}><span>Soma da média mensal</span><b style={mask}>{sensitiveText(fmt(calc.mediaTotal), hidden)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, opacity: 0.9 }}><span>Custo por dia</span><b style={mask}>{sensitiveText(fmt(calc.mediaTotal / 30), hidden)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, opacity: 0.9 }}><span>Custo por semana</span><b style={mask}>{sensitiveText(fmt((calc.mediaTotal / 30) * 7), hidden)}</b></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={cs.sCard}>
            <div style={cs.kpiLabel}>Custo fixo mensal (média)</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: COR_FIXO, ...mask }}>{sensitiveText(fmt(calc.mediaFixo), hidden)}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>{calc.pctFixo.toFixed(0)}% do custo mensal</div>
          </div>
          <div style={cs.sCard}>
            <div style={cs.kpiLabel}>Custo variável mensal (média)</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: COR_VAR, ...mask }}>{sensitiveText(fmt(calc.mediaVar), hidden)}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>{(calc.mediaTotal ? 100 - calc.pctFixo : 0).toFixed(0)}% do custo mensal</div>
          </div>
          <div style={cs.sCard}>
            <div style={cs.kpiLabel}>Soma média mensal</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, ...mask }}>{sensitiveText(fmt(calc.mediaTotal), hidden)}</div>
            <div style={{ height: 8, borderRadius: 99, overflow: 'hidden', background: 'var(--border)', display: 'flex', marginTop: 12 }}>
              <div style={{ width: `${calc.pctFixo}%`, background: COR_FIXO }} />
              <div style={{ flex: 1, background: COR_VAR }} />
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 8 }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: COR_FIXO, marginRight: 5 }} />Fixo</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: COR_VAR, marginRight: 5 }} />Variável</span>
            </div>
          </div>
        </div>

        {/* grafico: custo de cada mes (fixo + variavel) e a media */}
        <div style={{ ...cs.card, padding: isCompact ? 14 : 20 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600 }}>Custo mensal · {periodo}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', margin: '4px 0 16px' }}>Cada coluna soma o custo fixo e o variável do mês. A linha tracejada é a média usada no cálculo.</div>
          {carregando ? (
            <div style={{ padding: 24, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando custos...</div>
          ) : (
            <div style={{ position: 'relative', height: alturaGrafico + 44, paddingTop: 8 }}>
              {calc.n > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 28 + (alturaGrafico * linhaMediaPct) / 100, borderTop: '2px dashed var(--ink-muted)', opacity: 0.55, zIndex: 1, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', right: 0, top: -18, fontSize: 11, color: 'var(--ink-muted)', background: 'var(--white)', padding: '0 4px', ...mask }}>média {sensitiveText(fmtCurto(calc.mediaTotal), hidden)}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: isPhone ? 6 : 16, height: '100%' }}>
                {calc.linhas.map((l) => {
                  const hFixo = (l.fixo / calc.maxTotal) * alturaGrafico;
                  const hVar = (l.variavel / calc.maxTotal) * alturaGrafico;
                  return (
                    <div key={`${l.ano}-${l.mes}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', opacity: l.temDados ? 1 : 0.4 }} title={`${MESES_LONGO[l.mes - 1]}/${l.ano}: fixo ${fmt(l.fixo)} + variável ${fmt(l.variavel)} = ${fmt(l.total)}`}>
                      <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink)', marginBottom: 4, whiteSpace: 'nowrap', ...mask }}>{l.temDados ? sensitiveText(fmtCurto(l.total), hidden) : ''}</div>
                      <div style={{ width: '100%', maxWidth: 72, display: 'flex', flexDirection: 'column-reverse', borderRadius: '6px 6px 0 0', overflow: 'hidden' }}>
                        <div style={{ height: hFixo, background: COR_FIXO }} />
                        <div style={{ height: hVar, background: COR_VAR }} />
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 8, height: 16, fontWeight: 600 }}>{rotuloMes(l)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* tabela no formato da visao do Nelson */}
        <div style={cs.card}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Custos mês a mês</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Fixo e variável de cada mês, a média dos meses e o capital de giro para {cobertura} {cobertura === 1 ? 'mês' : 'meses'} de cobertura.</div>
          </div>
          {semDados ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-muted)' }}>Não há despesas pagas nos meses escolhidos. Aumente o número de meses analisados.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={{ ...cs.th, textAlign: 'left' }}>Mês</th>
                    <th style={cs.th}>Custo fixo mensal</th>
                    <th style={cs.th}>Custo variável mensal</th>
                    <th style={cs.th}>Total do mês</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.linhas.map((l) => (
                    <tr key={`${l.ano}-${l.mes}`} style={{ opacity: l.temDados ? 1 : 0.45 }}>
                      <td style={{ ...cs.td, textAlign: 'left', fontFamily: 'Geist, sans-serif', fontWeight: 600 }}>{MESES_LONGO[l.mes - 1]}/{l.ano}{!l.temDados ? <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}> · sem lançamentos</span> : null}</td>
                      <td style={cs.td}>{valor(l.fixo)}</td>
                      <td style={cs.td}>{valor(l.variavel)}</td>
                      <td style={{ ...cs.td, fontWeight: 600 }}>{valor(l.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <td style={{ ...cs.td, textAlign: 'left', fontFamily: 'Geist, sans-serif', fontWeight: 700 }}>Média dos meses</td>
                    <td style={{ ...cs.td, fontWeight: 700, color: COR_FIXO }}>{valor(calc.mediaFixo, COR_FIXO)}</td>
                    <td style={{ ...cs.td, fontWeight: 700 }}>{valor(calc.mediaVar, COR_VAR)}</td>
                    <td style={{ ...cs.td, fontWeight: 700 }}>{valor(calc.mediaTotal)}</td>
                  </tr>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <td style={{ ...cs.td, textAlign: 'left', fontFamily: 'Geist, sans-serif', fontWeight: 700 }}>Soma da média mensal</td>
                    <td style={cs.td} />
                    <td style={cs.td} />
                    <td style={{ ...cs.td, fontWeight: 700 }}>{valor(calc.mediaTotal)}</td>
                  </tr>
                  <tr style={{ background: '#eff6ff' }}>
                    <td style={{ ...cs.td, textAlign: 'left', fontFamily: 'Geist, sans-serif', fontWeight: 800, color: '#1e3a5f' }}>Capital de giro necessário ({cobertura} {cobertura === 1 ? 'mês' : 'meses'})</td>
                    <td style={cs.td} />
                    <td style={cs.td} />
                    <td style={{ ...cs.td, fontWeight: 800, fontSize: 14 }}>{valor(calc.necessario, '#1e3a5f')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* de onde vem o custo */}
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 1fr', gap: 20 }}>
          {[
            { titulo: 'O que pesa no custo fixo', cor: COR_FIXO, itens: calc.topFixos, total: calc.mediaFixo },
            { titulo: 'O que pesa no custo variável', cor: COR_VAR, itens: calc.topVars, total: calc.mediaVar },
          ].map((bloco) => (
            <div key={bloco.titulo} style={cs.card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>{bloco.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Média mensal por categoria</div>
              </div>
              <div style={{ padding: '12px 18px 16px', display: 'grid', gap: 12 }}>
                {!bloco.itens.length ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Sem lançamentos no período.</div>
                ) : bloco.itens.map((p) => (
                  <div key={p.nome}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', ...mask }}>{sensitiveText(fmt(p.valor), hidden)} <span style={{ color: 'var(--ink-muted)' }}>· {bloco.total ? ((p.valor / bloco.total) * 100).toFixed(0) : 0}%</span></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginTop: 5 }}>
                      <div style={{ width: `${bloco.total ? Math.min(100, (p.valor / bloco.total) * 100) : 0}%`, height: '100%', background: bloco.cor, borderRadius: 99 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Como é calculado: custo fixo e variável de cada mês vêm do DRE (despesas pagas, classificadas como fixas ou variáveis em Despesas; comissões e fretes dos pedidos contam como variáveis).
          A depreciação dos ativos não entra, pois não é saída de caixa. Compra de motos para desmonte, impostos sobre vendas e compra de ativos não fazem parte desta visão.
          Meses sem nenhuma despesa lançada ficam fora da média. Capital de giro necessário = (média do fixo + média do variável) × meses de cobertura.
        </div>
      </div>
    </>
  );
}
