'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility, useFinancialViewportMode } from '@/lib/company-values';

const fmt = (value: number) => value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00';
const pct = (value: number, total: number) => total ? `${((value / total) * 100).toFixed(1)}%` : '-';
const currentYear = String(new Date().getFullYear());

type DreRow = {
  cod: string;
  desc: string;
  val?: number;
  pctVal?: number;
  indent?: boolean;
  bold?: boolean;
  color?: string;
  section?: string;
};

export default function DREPage() {
  const [dre, setDre] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtroAno, setFiltroAno] = useState(currentYear);
  const { hidden } = useCompanyValueVisibility();
  const viewportMode = useFinancialViewportMode();
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isCompact = isPhone || isTabletPortrait;

  useEffect(() => {
    setLoading(true);
    api.financeiro.dre({ ano: filtroAno })
      .then(setDre)
      .finally(() => setLoading(false));
  }, [filtroAno]);

  const anos = useMemo(() => {
    const base = Array.isArray(dre?.anosDisponiveis) ? dre.anosDisponiveis : [];
    return Array.from(new Set([Number(filtroAno), ...base])).sort((a, b) => b - a);
  }, [dre?.anosDisponiveis, filtroAno]);

  const rows = useMemo<DreRow[]>(() => {
    if (!dre) return [];

    return [
      { section: '1. Receita', cod: '', desc: '' },
      { cod: '1.0', desc: 'Receita Bruta de Vendas', val: dre.receitaBruta, pctVal: dre.receitaBruta, bold: true, color: 'var(--blue-500)' },
      { cod: '1.1', desc: '- Comissao / Taxas ML', val: -dre.comissaoML, pctVal: -dre.comissaoML, indent: true },
      { cod: '1.2', desc: '- Frete', val: -dre.frete, pctVal: -dre.frete, indent: true },
      { cod: '1.3', desc: 'Receita Liquida de Vendas', val: dre.receitaLiq, pctVal: dre.receitaLiq, bold: true },

      { section: '2. Custo das Mercadorias (CMV)', cod: '', desc: '' },
      { cod: '2.0', desc: '(-) Preco compra das motos', val: -dre.investido, pctVal: -dre.investido, indent: true },
      ...(dre.comprasMoto > 0 ? [{ cod: '2.1', desc: '(-) Compras extras (cat. Moto)', val: -dre.comprasMoto, pctVal: -dre.comprasMoto, indent: true }] : []),
      { cod: '2.T', desc: 'CMV Total', val: -dre.cmv, pctVal: -dre.cmv, bold: true, color: 'var(--amber)' },
      { cod: '2.R', desc: 'Lucro Bruto', val: dre.lucroBruto, pctVal: dre.lucroBruto, bold: true, color: dre.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)' },

      { section: '3. Despesas Operacionais', cod: '', desc: '' },
      ...Object.entries(dre.despPorCateg || {}).map(([categoria, value]: any) => ({
        cod: '3.x',
        desc: `- ${categoria}`,
        val: -value,
        pctVal: -value,
        indent: true,
      })),
      { cod: '3.P', desc: '(-) Prejuizos', val: -dre.totalPrej, pctVal: -dre.totalPrej, indent: true },
      { cod: '3.T', desc: 'Total Despesas', val: -(dre.totalDesp + dre.totalPrej), pctVal: -(dre.totalDesp + dre.totalPrej), bold: true, color: 'var(--red)' },

      { section: '4. Resultado', cod: '', desc: '' },
      { cod: '4.0', desc: 'Lucro Operacional (EBITDA)', val: dre.lucroOp, pctVal: dre.lucroOp, bold: true, color: dre.lucroOp >= 0 ? 'var(--green)' : 'var(--red)' },
    ];
  }, [dre]);

  return (
    <>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: isCompact ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isCompact ? 'column' : 'row', gap: 10, padding: isCompact ? '14px 16px' : '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>DRE</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Demonstracao de Resultado do Exercicio</div>
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

        {dre && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(175px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { l: 'Receita Bruta', v: dre.receitaBruta, c: 'var(--blue-500)' },
                { l: 'Receita Liquida', v: dre.receitaLiq, c: 'var(--blue-400)' },
                { l: 'CMV (Motos)', v: -dre.cmv, c: 'var(--amber)' },
                { l: 'Lucro Bruto', v: dre.lucroBruto, c: dre.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)' },
                { l: 'Despesas Op.', v: -dre.totalDesp, c: 'var(--red)' },
                { l: 'Lucro Operac.', v: dre.lucroOp, c: dre.lucroOp >= 0 ? 'var(--green)' : 'var(--red)' },
              ].map((card) => (
                <div key={card.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{card.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: card.c, letterSpacing: '-0.4px', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(card.v), hidden)}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
                Demonstracao detalhada · <span style={sensitiveMaskStyle(hidden)}>{sensitiveText(`${dre.qtdVendidas} pecas vendidas em ${filtroAno}`, hidden)}</span>
              </div>

              {isCompact ? (
                <div style={{ display: 'grid', gap: 12, padding: 14 }}>
                  {rows.map((item, index) => item.section ? (
                    <div key={`section-${index}`} style={{ padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--gray-400)' }}>
                      {item.section}
                    </div>
                  ) : (
                    <div key={`${item.cod}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)' }}>{item.cod}</div>
                          <div style={{ marginTop: 6, fontSize: 13, fontWeight: item.bold ? 700 : 500, color: item.color || 'var(--gray-800)', paddingLeft: item.indent ? 14 : 0 }}>{item.desc}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: item.color || ((item.val || 0) >= 0 ? 'var(--gray-800)' : 'var(--red)'), fontWeight: item.bold ? 700 : 500, ...sensitiveMaskStyle(hidden) }}>
                            {sensitiveText(fmt(Number(item.val || 0)), hidden)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 5, ...sensitiveMaskStyle(hidden) }}>
                            {sensitiveText(item.pctVal !== undefined ? pct(item.pctVal, dre?.receitaBruta) : '', hidden, '')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                        {['Cod.', 'Descricao', 'Valor', '%'].map((header, index) => (
                          <th key={header} style={{ padding: '9px 18px', textAlign: index >= 2 ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item, index) => item.section ? (
                        <tr key={`section-${index}`} style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={4} style={{ padding: '10px 18px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{item.section}</td>
                        </tr>
                      ) : (
                        <tr key={`${item.cod}-${index}`} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '9px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--gray-400)', width: 52 }}>{item.cod}</td>
                          <td style={{ padding: '9px 16px', paddingLeft: item.indent ? 36 : 16, color: item.bold ? 'var(--gray-800)' : 'var(--gray-600)', fontWeight: item.bold ? 600 : 400, fontSize: 13 }}>{item.desc}</td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: item.bold ? 700 : 400, color: item.color || ((item.val || 0) >= 0 ? 'var(--gray-800)' : 'var(--red)'), ...sensitiveMaskStyle(hidden) }}>{sensitiveText(fmt(Number(item.val || 0)), hidden)}</td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--gray-400)', width: 72, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(item.pctVal !== undefined ? pct(item.pctVal, dre?.receitaBruta) : '', hidden, '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
