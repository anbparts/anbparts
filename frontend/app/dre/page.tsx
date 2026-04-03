'use client';
import { useEffect, useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00';
const pct = (v: number, t: number) => t ? `${(v / t * 100).toFixed(1)}%` : '—';

export default function DREPage() {
  const [dre, setDre]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/financeiro/dre`).then(r => r.json()).then(setDre).finally(() => setLoading(false));
  }, []);

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
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>DRE</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Demonstração de Resultado do Exercício</div>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        {loading && <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>}

        {dre && (
          <>
            {/* Cards resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { l: 'Receita Bruta',   v: dre.receitaBruta, c: 'var(--blue-500)' },
                { l: 'Receita Líquida', v: dre.receitaLiq,   c: 'var(--blue-400)' },
                { l: 'CMV (Motos)',     v: -dre.cmv,         c: 'var(--amber)' },
                { l: 'Lucro Bruto',     v: dre.lucroBruto,   c: dre.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)' },
                { l: 'Despesas Op.',    v: -dre.totalDesp,    c: 'var(--red)' },
                { l: 'Lucro Operac.',   v: dre.lucroOp,      c: dre.lucroOp >= 0 ? 'var(--green)' : 'var(--red)' },
              ].map(c => (
                <div key={c.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{c.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c.c, letterSpacing: '-0.4px' }}>{fmt(c.v)}</div>
                </div>
              ))}
            </div>

            {/* Tabela DRE */}
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
                Demonstração detalhada · {dre.qtdVendidas} peças vendidas
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                      {['Cód.', 'Descrição', 'Valor', '%'].map((h, i) => (
                        <th key={h} style={{ padding: '9px 18px', textAlign: i >= 2 ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section('1. Receita')}
                    {row('1.0', 'Receita Bruta de Vendas', dre.receitaBruta, dre.receitaBruta, false, true, 'var(--blue-500)')}
                    {row('1.1', '- Comissão / Taxas ML', -dre.comissaoML, -dre.comissaoML, true)}
                    {row('1.2', '- Frete', -dre.frete, -dre.frete, true)}
                    {row('1.3', 'Receita Líquida de Vendas', dre.receitaLiq, dre.receitaLiq, false, true)}

                    {section('2. Custo')}
                    {row('2.0', '(-) Custo das Motos (CMV)', -dre.cmv, -dre.cmv, false, true, 'var(--amber)')}
                    {row('2.1', 'Lucro Bruto', dre.lucroBruto, dre.lucroBruto, false, true, dre.lucroBruto >= 0 ? 'var(--green)' : 'var(--red)')}

                    {section('3. Despesas Operacionais')}
                    {Object.entries(dre.despPorCateg || {}).map(([cat, val]: any) =>
                      row('3.x', `- ${cat}`, -val, -val, true)
                    )}
                    {row('3.P', '(-) Prejuízos', -dre.totalPrej, -dre.totalPrej, true)}
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
