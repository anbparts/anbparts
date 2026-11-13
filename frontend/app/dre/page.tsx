'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const fmt = (value: number) => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCel = (value: number) => (Math.abs(Number(value) || 0) < 0.005 ? '-' : fmt(value));
const pct = (value: number, total: number) => (total ? `${((value / total) * 100).toFixed(1)}%` : '-');
const currentYear = String(new Date().getFullYear());
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Periodo calculado pelo backend (um por mes + o total do ano).
type Periodo = Record<string, number>;

type Linha = {
  tipo: 'secao' | 'linha';
  cod?: string;
  desc: string;
  get?: (p: Periodo, idx: number) => number; // idx: 0..11 = mes, -1 = total do ano
  indent?: 0 | 1 | 2;
  bold?: boolean;
  destaque?: 'verde-vermelho' | 'azul' | 'ambar' | 'vermelho';
  semPct?: boolean;
  drill?: string; // chave da linha para abrir os lancamentos (pop-up)
};

const COR: Record<string, string> = { azul: 'var(--blue-500)', ambar: 'var(--amber)', vermelho: 'var(--red)' };

export default function DREPage() {
  const [dre, setDre] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroAno, setFiltroAno] = useState(currentYear);
  const [periodoCompacto, setPeriodoCompacto] = useState('total');
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isCompact = isPhone || isTabletPortrait;

  useEffect(() => {
    setLoading(true);
    setErro('');
    api.financeiro.dre({ ano: filtroAno })
      .then(setDre)
      .catch((e: any) => setErro(e?.message || 'Erro ao carregar o DRE'))
      .finally(() => setLoading(false));
  }, [filtroAno]);

  // Pop-up com os lancamentos de uma linha/mes (clique no valor)
  const [popup, setPopup] = useState<{ linha: string; mes: number } | null>(null);
  function abrirLancamentos(l: Linha, idx: number, valor: number) {
    if (!l.drill || Math.abs(valor) < 0.005) return;
    setPopup({ linha: l.drill, mes: idx < 0 ? 0 : idx + 1 });
  }
  const clicavel = (l: Linha, valor: number) => !!l.drill && Math.abs(valor) >= 0.005;
  const estiloClicavel: any = { cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 };

  const anos = useMemo(() => {
    const base = Array.isArray(dre?.anosDisponiveis) ? dre.anosDisponiveis : [];
    return Array.from(new Set([Number(filtroAno), ...base])).sort((a, b) => b - a);
  }, [dre?.anosDisponiveis, filtroAno]);

  const linhas = useMemo<Linha[]>(() => {
    if (!dre) return [];
    const cats: any[] = Array.isArray(dre.catLinhas) ? dre.catLinhas : [];
    const doGrupo = (grupo: string) => cats.filter((l) => l.grupo === grupo);
    // uma linha por categoria; o rotulo mostra se e' fixa ou variavel
    const linhasCategoria = (grupo: string, prefixo: string): Linha[] => doGrupo(grupo).map((l: any, i: number): Linha => ({
      tipo: 'linha',
      cod: prefixo + (i + 1),
      desc: l.categoria + (l.tipo === 'fixa' ? ' · fixa' : ' · variável'),
      indent: 1,
      drill: 'cat:' + l.categoria,
      get: (_p, idx) => -(idx < 0 ? l.total : l.valores[idx] || 0),
    }));
    const out: Linha[] = [
      { tipo: 'secao', desc: '1. Receita operacional bruta' },
      { tipo: 'linha', cod: '1.0', desc: '(+) Receita operacional bruta', get: (p) => p.receitaBruta, bold: true, destaque: 'azul', drill: 'receitaBruta' },
      { tipo: 'linha', cod: '1.1', desc: 'Venda de peças (marketplaces e balcão)', get: (p) => p.receitaPecas, indent: 1, drill: 'receitaPecas' },
      { tipo: 'linha', cod: '1.2', desc: 'Venda de sucata / carcaça', get: (p) => p.receitaSucata, indent: 1, drill: 'receitaSucata' },

      { tipo: 'secao', desc: '2. Deduções da receita bruta' },
      { tipo: 'linha', cod: '2.1', desc: '(-) Impostos sobre vendas (DAS)', get: (p) => -p.impostos, indent: 1, drill: 'impostos' },
      { tipo: 'linha', cod: '2.R', desc: '(=) Receita operacional líquida', get: (p) => p.receitaLiquida, bold: true },

      { tipo: 'secao', desc: '3. Custo das mercadorias vendidas (CMV)' },
      { tipo: 'linha', cod: '3.1', desc: '(-) Custo das peças vendidas (rateio do valor pago na moto)', get: (p) => -p.cmvPecas, indent: 1, drill: 'cmvPecas' },
      { tipo: 'linha', cod: '3.2', desc: '(-) Custos de aquisição das motos (leilão, pátio, guincho)', get: (p) => -p.aquisicao, indent: 1, drill: 'aquisicao' },
      { tipo: 'linha', cod: '3.3', desc: '(-) Insumos diretos de desmonte e legalização', get: (p) => -p.insumos, indent: 1, drill: 'insumos' },
      { tipo: 'linha', cod: '3.4', desc: '(-) Perdas e quebras de estoque', get: (p) => -p.perdas, indent: 1, drill: 'perdas' },
      { tipo: 'linha', cod: '3.T', desc: 'CMV total', get: (p) => -p.cmv, bold: true, destaque: 'ambar' },
      { tipo: 'linha', cod: '3.R', desc: '(=) Lucro bruto', get: (p) => p.lucroBruto, bold: true, destaque: 'verde-vermelho' },

      { tipo: 'secao', desc: '4. Despesas operacionais' },
      { tipo: 'linha', cod: '4.C', desc: 'Despesas comerciais e de vendas', get: (p) => -p.despComercial, bold: true },
      { tipo: 'linha', cod: '4.C1', desc: 'Comissões de marketplaces · variável', get: (p) => -p.comissoes, indent: 1, drill: 'comissoes' },
      { tipo: 'linha', cod: '4.C2', desc: 'Fretes de envio (e-commerce) · variável', get: (p) => -p.frete, indent: 1, drill: 'frete' },
      ...linhasCategoria('comercial', '4.C').map((l, i) => ({ ...l, cod: '4.C' + (i + 3) })),
      { tipo: 'linha', cod: '4.A', desc: 'Despesas administrativas e de estrutura', get: (p) => -p.despAdm, bold: true },
      ...linhasCategoria('adm', '4.A'),
      { tipo: 'linha', cod: '4.P', desc: 'Despesas com pessoal', get: (p) => -p.despPessoal, bold: true },
      ...linhasCategoria('pessoal', '4.P'),
      { tipo: 'linha', cod: '4.T', desc: 'Total das despesas operacionais', get: (p) => -p.despesasOp, bold: true, destaque: 'vermelho' },

      { tipo: 'secao', desc: '5. Resultado' },
      { tipo: 'linha', cod: '5.1', desc: '(=) Resultado operacional (EBIT)', get: (p) => p.ebit, bold: true, destaque: 'verde-vermelho' },
      { tipo: 'linha', cod: '5.2', desc: '(=) Lucro líquido do período', get: (p) => p.lucroLiquido, bold: true, destaque: 'verde-vermelho' },

      { tipo: 'secao', desc: '6. Análise de custos (fixas × variáveis)' },
      { tipo: 'linha', cod: '6.1', desc: 'Despesas fixas', get: (p) => -p.despFixas, indent: 1 },
      { tipo: 'linha', cod: '6.2', desc: 'Despesas variáveis', get: (p) => -p.despVariaveis, indent: 1 },
      { tipo: 'linha', cod: '6.3', desc: '(=) Margem de contribuição (receita líquida − CMV − despesas variáveis)', get: (p) => p.margemContribuicao, bold: true, destaque: 'verde-vermelho' },
    ];
    return out;
  }, [dre]);

  const periodos: Periodo[] = dre ? [...dre.meses, dre.total] : [];
  const total: Periodo = dre?.total || {};
  const valorLinha = (l: Linha, idx: number) => (l.get && dre ? l.get(idx < 0 ? dre.total : dre.meses[idx], idx) : 0);
  const corValor = (l: Linha, v: number) => {
    if (l.destaque === 'verde-vermelho') return v >= 0 ? 'var(--green)' : 'var(--red)';
    if (l.destaque) return COR[l.destaque];
    return v < 0 ? 'var(--red)' : 'var(--gray-800)';
  };

  const cards = dre ? [
    { l: 'Receita bruta', v: total.receitaBruta, c: 'var(--blue-500)' },
    { l: 'Receita líquida', v: total.receitaLiquida, c: 'var(--blue-400)' },
    { l: 'CMV', v: -total.cmv, c: 'var(--amber)' },
    { l: 'Lucro bruto', v: total.lucroBruto, c: total.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)', sub: pct(total.lucroBruto, total.receitaBruta) + ' da receita' },
    { l: 'Despesas operac.', v: -total.despesasOp, c: 'var(--red)' },
    { l: 'Lucro líquido', v: total.lucroLiquido, c: total.lucroLiquido >= 0 ? 'var(--green)' : 'var(--red)', sub: pct(total.lucroLiquido, total.receitaBruta) + ' da receita' },
  ] : [];

  const idxCompacto = periodoCompacto === 'total' ? -1 : Number(periodoCompacto);

  return (
    <>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: isCompact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>DRE</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Demonstração do Resultado do Exercício · mês a mês</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isCompact ? '100%' : 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>Ano</span>
          <select
            value={filtroAno}
            onChange={(event) => setFiltroAno(event.target.value)}
            style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', cursor: 'pointer', width: isCompact ? '100%' : 'auto' }}
          >
            {anos.map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: isCompact ? 16 : 28 }}>
        {loading && <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>}
        {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13, marginBottom: 14 }}>{erro}</div>}

        {dre && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(auto-fit, minmax(175px, 1fr))', gap: 14, marginBottom: 24 }}>
              {cards.map((card) => (
                <div key={card.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{card.l}</div>
                  <div style={{ fontSize: isPhone ? 17 : 22, fontWeight: 700, color: card.c, letterSpacing: '-0.4px', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(card.v), hidden)}</div>
                  {card.sub ? <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(card.sub, hidden, '')}</div> : null}
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
                  Demonstração detalhada · <span style={sensitiveMaskStyle(hidden)}>{sensitiveText(`${total.qtdVendidas || 0} peças vendidas em ${filtroAno}`, hidden)}</span>
                  <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--gray-400)', marginTop: 2 }}>Clique em um valor sublinhado para ver os lançamentos que o compõem.</div>
                </div>
                {isCompact && (
                  <select
                    value={periodoCompacto}
                    onChange={(e) => setPeriodoCompacto(e.target.value)}
                    style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif' }}
                  >
                    <option value="total">Ano inteiro</option>
                    {MESES.map((m, i) => <option key={m} value={String(i)}>{m}/{filtroAno}</option>)}
                  </select>
                )}
              </div>

              {isCompact ? (
                <div style={{ display: 'grid', gap: 8, padding: 14 }}>
                  {linhas.map((l, index) => l.tipo === 'secao' ? (
                    <div key={`s-${index}`} style={{ padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{l.desc}</div>
                  ) : (
                    <div key={`${l.cod}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderBottom: '1px solid var(--gray-100)' }}>
                      <div style={{ fontSize: 13, fontWeight: l.bold ? 700 : 400, color: l.bold ? 'var(--gray-800)' : 'var(--gray-600)', paddingLeft: (l.indent || 0) * 14 }}>{l.desc}</div>
                      <div
                        onClick={() => abrirLancamentos(l, idxCompacto, valorLinha(l, idxCompacto))}
                        style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontWeight: l.bold ? 700 : 500, color: corValor(l, valorLinha(l, idxCompacto)), whiteSpace: 'nowrap', ...(clicavel(l, valorLinha(l, idxCompacto)) ? estiloClicavel : {}), ...sensitiveMaskStyle(hidden) }}
                      >
                        {sensitiveText(fmtCel(valorLinha(l, idxCompacto)), hidden)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1380 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, background: 'var(--gray-50)', minWidth: 320 }}>Descrição</th>
                        {MESES.map((m) => <th key={m} style={{ ...thBase, textAlign: 'right', background: 'var(--gray-50)' }}>{m}</th>)}
                        <th style={{ ...thBase, textAlign: 'right', background: 'var(--gray-100)', color: 'var(--gray-600)' }}>Total {filtroAno}</th>
                        <th style={{ ...thBase, textAlign: 'right', background: 'var(--gray-100)' }}>% rec. bruta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l, index) => l.tipo === 'secao' ? (
                        <tr key={`s-${index}`}>
                          <td colSpan={15} style={{ padding: '10px 18px', background: 'var(--gray-50)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{l.desc}</td>
                        </tr>
                      ) : (
                        <tr key={`${l.cod}-${index}`}>
                          <td style={{ ...tdBase, position: 'sticky', left: 0, background: 'var(--white)', zIndex: 2, paddingLeft: 18 + (l.indent || 0) * 18, fontWeight: l.bold ? 600 : 400, color: l.bold ? 'var(--gray-800)' : 'var(--gray-600)', fontSize: 13 }}>{l.desc}</td>
                          {MESES.map((m, i) => {
                            const v = valorLinha(l, i);
                            return (
                              <td key={m} onClick={() => abrirLancamentos(l, i, v)} title={clicavel(l, v) ? 'Ver lançamentos' : undefined} style={{ ...tdBase, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: l.bold ? 700 : 400, color: Math.abs(v) < 0.005 ? 'var(--gray-300)' : corValor(l, v), ...(clicavel(l, v) ? estiloClicavel : {}), ...sensitiveMaskStyle(hidden) }}>
                                {sensitiveText(fmtCel(v), hidden)}
                              </td>
                            );
                          })}
                          {(() => {
                            const v = valorLinha(l, -1);
                            return (
                              <>
                                <td onClick={() => abrirLancamentos(l, -1, v)} title={clicavel(l, v) ? 'Ver lançamentos do ano' : undefined} style={{ ...tdBase, textAlign: 'right', background: 'var(--gray-50)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 700, color: Math.abs(v) < 0.005 ? 'var(--gray-300)' : corValor(l, v), ...(clicavel(l, v) ? estiloClicavel : {}), ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmtCel(v), hidden)}</td>
                                <td style={{ ...tdBase, textAlign: 'right', background: 'var(--gray-50)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--gray-400)', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(Math.abs(v) < 0.005 ? '' : pct(v, total.receitaBruta), hidden, '')}</td>
                              </>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <CmvDetalhe dre={dre} hidden={hidden} isCompact={isCompact} />

            {popup && <LancamentosModal ano={filtroAno} linha={popup.linha} mes={popup.mes} hidden={hidden} onClose={() => setPopup(null)} />}

            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.6 }}>
              Despesas consideradas: somente as pagas, com data até hoje. Devoluções já saem da receita (a peça volta ao estoque). Resultado financeiro e IRPJ/CSLL não se aplicam: o regime é Simples Nacional, e o imposto (DAS) está nas deduções.
            </div>
          </>
        )}
      </div>
    </>
  );
}

const thBase: any = { padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const tdBase: any = { padding: '8px 14px', borderBottom: '1px solid var(--gray-100)', whiteSpace: 'nowrap' };

function CmvDetalhe({ dre, hidden, isCompact }: { dre: any; hidden: boolean; isCompact: boolean }) {
  const detalhe: any[] = Array.isArray(dre.cmvDetalhe) ? dre.cmvDetalhe : [];
  const prem = dre.premissas || {};
  const mask = sensitiveMaskStyle(hidden);

  return (
    <details style={{ marginTop: 18, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <summary style={{ cursor: 'pointer', padding: '14px 18px', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
        Como o CMV foi calculado ({detalhe.length} moto{detalhe.length === 1 ? '' : 's'} com peças vendidas em {dre.ano})
      </summary>
      <div style={{ padding: '4px 18px 18px', display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 12.5, color: 'var(--gray-600)', lineHeight: 1.7 }}>
          <div><b>Custo da peça</b> = (valor de venda da peça ÷ soma do valor de venda de todas as peças da moto) × valor pago na moto. A soma considera todas as peças da moto, vendidas ou em estoque. Se nenhuma peça tem preço, divide igual.</div>
          <div><b>CMV do mês</b> = custo das peças vendidas no mês + custos de aquisição das motos pagos no mês + insumos pagos no mês + perdas (prejuízos) do mês.</div>
        </div>

        {(prem.motosSemCusto > 0 || prem.pecasVendidasSemPreco > 0) && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5, lineHeight: 1.5 }}>
            {prem.motosSemCusto > 0 ? `${prem.motosSemCusto} moto(s) com peça vendida estão com preço de compra zerado (CMV subestimado). ` : ''}
            {prem.pecasVendidasSemPreco > 0 ? `${prem.pecasVendidasSemPreco} peça(s) vendida(s) sem preço registrado.` : ''}
          </div>
        )}

        {detalhe.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Nenhuma peça vendida neste ano.</div>
        ) : isCompact ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {detalhe.map((d) => (
              <div key={d.motoId} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>{d.moto}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, ...mask }}>
                  {sensitiveText(`Valor pago ${fmt(d.custoTotal)} · ${d.pecasVendidasAno}/${d.pecasTotal} peças vendidas · Receita ${fmt(d.receitaVendidaAno)} · CMV ${fmt(d.cmvAno)}`, hidden)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5, minWidth: 880 }}>
              <thead>
                <tr>
                  {['Moto', 'Valor pago', 'Peças vend./total', 'Receita vendida', 'CMV reconhecido', 'Margem'].map((h, i) => (
                    <th key={h} style={{ ...thBase, textAlign: i === 0 ? 'left' : 'right', position: 'sticky', top: 0, background: 'var(--gray-50)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalhe.map((d) => (
                  <tr key={d.motoId}>
                    <td style={{ ...tdBase, color: 'var(--gray-800)', fontWeight: 600 }}>{d.moto}</td>
                    <td style={{ ...tdBase, textAlign: 'right', ...mask }}>{sensitiveText(fmt(d.custoCompra), hidden)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', ...mask }}>{sensitiveText(`${d.pecasVendidasAno}/${d.pecasTotal}`, hidden)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', ...mask }}>{sensitiveText(fmt(d.receitaVendidaAno), hidden)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, ...mask }}>{sensitiveText(fmt(d.cmvAno), hidden)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', color: d.margemPct !== null && d.margemPct < 0 ? 'var(--red)' : 'var(--green)', ...mask }}>{sensitiveText(d.margemPct === null ? '-' : `${d.margemPct}%`, hidden)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

function LancamentosModal({ ano, linha, mes, hidden, onClose }: { ano: string; linha: string; mes: number; hidden: boolean; onClose: () => void }) {
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const mask = sensitiveMaskStyle(hidden);

  useEffect(() => {
    setCarregando(true);
    setErro('');
    api.financeiro.dreLancamentos({ ano, mes: String(mes), linha })
      .then(setDados)
      .catch((e: any) => setErro(e?.message || 'Erro ao carregar os lançamentos'))
      .finally(() => setCarregando(false));
  }, [ano, mes, linha]);

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
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 12, width: '100%', maxWidth: 980, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>{dados?.titulo || 'Lançamentos'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-400)', marginTop: 2 }}>{dados ? `Período: ${dados.periodo}` : 'Carregando...'}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--gray-600)' }}>×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', display: 'grid', gap: 18 }}>
          {carregando && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Carregando os lançamentos...</div>}
          {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div>}

          {tabelas.map((t, ti) => {
            const colTotal = t.colunas.filter((c: any) => c.tipo === 'moeda').slice(-1)[0];
            return (
              <div key={ti}>
                {t.titulo ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 6 }}>{t.titulo}</div> : null}
                {t.itens.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Nenhum lançamento neste período.</div>
                ) : (
                  <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
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
                              <td key={c.k} style={{ ...tdBase, background: 'var(--gray-50)', fontWeight: 700, textAlign: c.tipo === 'moeda' ? 'right' : 'left', fontFamily: c.tipo === 'moeda' ? 'JetBrains Mono, monospace' : undefined, color: 'var(--gray-800)' }}>
                                {c.k === colTotal.k ? <span style={mask}>{sensitiveText(fmt(t.total), hidden)}</span> : ci === 0 ? `Total · ${t.itens.length} lançamento${t.itens.length === 1 ? '' : 's'}` : ''}
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
