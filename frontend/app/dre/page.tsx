'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

const fmt = (value: number) => value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00';
const pct = (value: number, total: number) => total ? `${((value / total) * 100).toFixed(1)}%` : '-';
const currentYear = String(new Date().getFullYear());

export default function DREPage() {
  const [dre, setDre] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtroAno, setFiltroAno] = useState(currentYear);

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

  const row = (cod: string, desc: string, val: number, pctVal?: number, indent = false, bold = false, color?: string) => (
    <tr key={cod} style={{ borderBottom: '1px solid var(--gray-100)' }}>
      <td style={{ padding: '9px 18px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--gray-400)', width: 52 }}>{cod}</td>
      <td style={{ padding: '9px 16px', paddingLeft: indent ? 36 : 16, color: bold ? 'var(--gray-800)' : 'var(--gray-600)', fontWeight: bold ? 600 : 400, fontSize: 13 }}>{desc}</td>
      <td style={{ padding: '9px 18px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: bold ? 700 : 400, color: color || (val >= 0 ? 'var(--gray-800)' : 'var(--red)') }}>{fmt(val)}</td>
      <td style={{ padding: '9px 18px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--gray-400)', width: 72 }}>{pctVal !== undefined ? pct(pctVal, dre?.receitaBruta) : ''}</td>
    </tr>
  );

  const section = (label: string) => (
    <tr key={label} style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
      <td colSpan={4} style={{ padding: '10px 18px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{label}</td>
    </tr>
  );

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>DRE</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Demonstracao de Resultado do Exercicio</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Ano</span>
          <select
            value={filtroAno}
            onChange={(event) => setFiltroAno(event.target.value)}
            style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', cursor: 'pointer' }}
          >
            {anos.map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        {loading && <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>}

        {dre && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 14, marginBottom: 24 }}>
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
                  <div style={{ fontSize: 22, fontWeight: 700, color: card.c, letterSpacing: '-0.4px' }}>{fmt(card.v)}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
                Demonstracao detalhada · {dre.qtdVendidas} pecas vendidas em {filtroAno}
              </div>
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
                    {section('1. Receita')}
                    {row('1.0', 'Receita Bruta de Vendas', dre.receitaBruta, dre.receitaBruta, false, true, 'var(--blue-500)')}
                    {row('1.1', '- Comissao / Taxas ML', -dre.comissaoML, -dre.comissaoML, true)}
                    {row('1.2', '- Frete', -dre.frete, -dre.frete, true)}
                    {row('1.3', 'Receita Liquida de Vendas', dre.receitaLiq, dre.receitaLiq, false, true)}

                    {section('2. Custo das Mercadorias (CMV)')}
                    {row('2.0', '(-) Preco compra das motos', -dre.investido, -dre.investido, true)}
                    {dre.comprasMoto > 0 && row('2.1', '(-) Compras extras (cat. Moto)', -dre.comprasMoto, -dre.comprasMoto, true)}
                    {row('2.T', 'CMV Total', -dre.cmv, -dre.cmv, false, true, 'var(--amber)')}
                    {row('2.R', 'Lucro Bruto', dre.lucroBruto, dre.lucroBruto, false, true, dre.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)')}

                    {section('3. Despesas Operacionais')}
                    {Object.entries(dre.despPorCateg || {}).map(([categoria, value]: any) =>
                      row('3.x', `- ${categoria}`, -value, -value, true)
                    )}
                    {row('3.P', '(-) Prejuizos', -dre.totalPrej, -dre.totalPrej, true)}
                    {row('3.T', 'Total Despesas', -(dre.totalDesp + dre.totalPrej), -(dre.totalDesp + dre.totalPrej), false, true, 'var(--red)')}

                    {section('4. Resultado')}
                    {row('4.0', 'Lucro Operacional (EBITDA)', dre.lucroOp, dre.lucroOp, false, true, dre.lucroOp >= 0 ? 'var(--green)' : 'var(--red)')}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
