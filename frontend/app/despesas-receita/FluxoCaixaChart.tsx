'use client';

import { useMemo, useRef, useState } from 'react';
import { sensitiveMaskStyle, sensitiveText } from '@/lib/company-values';

// Grafico de LINHA do fluxo de caixa (modelo pedido pelo Nelson): as duas linhas de cima sao Receita e Despesas,
// a de baixo e' o Saldo do mes. Passar o mouse mostra os valores do mes; clicar no mes abre os registros que compoem a apuracao.
type Mes = { mes: number; receita: number; despesas: number; saldo: number };

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COR = { receita: '#16a34a', despesas: '#dc2626', saldo: '#4f46e5' };
const W = 920;
const H = 380;
const PAD = { l: 64, r: 22, t: 22, b: 34 };

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function compacto(v: number) {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return `${s}${Math.round(a)}`;
}

// passo "redondo" (1, 2, 5 x 10^n) para os rotulos do eixo
function passoBonito(faixa: number, alvo: number) {
  const bruto = faixa / Math.max(1, alvo);
  const pot = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const f = bruto / pot;
  const base = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return base * pot;
}

export default function FluxoCaixaChart({ meses, ano, ultimoMes, hidden, onSelect }: {
  meses: Mes[]; ano: number; ultimoMes: number; hidden: boolean; onSelect: (mes: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visiveis = meses.slice(0, ultimoMes);

  const { yMin, yMax, ticks } = useMemo(() => {
    const valores: number[] = [0];
    visiveis.forEach((m) => { valores.push(m.receita, m.despesas, m.saldo); });
    let min = Math.min(...valores, 0);
    let max = Math.max(...valores, 1);
    const passo = passoBonito(max - min, 5);
    min = Math.floor(min / passo) * passo;
    max = Math.ceil(max / passo) * passo;
    const t: number[] = [];
    for (let v = min; v <= max + passo / 2; v += passo) t.push(Math.round(v * 100) / 100);
    return { yMin: min, yMax: max, ticks: t };
  }, [visiveis]);

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (iw * i) / 11;
  const y = (v: number) => PAD.t + ih * (1 - (v - yMin) / ((yMax - yMin) || 1));
  const caminho = (k: 'receita' | 'despesas' | 'saldo') => visiveis.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m[k]).toFixed(1)}`).join(' ');
  const area = (k: 'receita' | 'despesas') => visiveis.length > 1
    ? `${caminho(k)} L${x(visiveis.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
    : '';

  function indiceDoPonteiro(clientX: number) {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / iw) * 11);
    return Math.max(0, Math.min(visiveis.length - 1, i));
  }

  const atual = hover !== null ? visiveis[hover] : null;
  const mask = sensitiveMaskStyle(hidden);

  const linhaTooltip = (rotulo: string, valor: number, cor: string, fundo: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginTop: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: fundo, color: cor }}>{rotulo}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 700, color: 'var(--gray-800)', ...mask }}>{sensitiveText(moeda(valor), hidden)}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--gray-600)', marginBottom: 6 }}>
        {([['Receitas', COR.receita], ['Despesas', COR.despesas], ['Saldo do mês', COR.saldo]] as const).map(([rotulo, cor]) => (
          <span key={rotulo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 3, borderRadius: 2, background: cor, display: 'inline-block' }} />{rotulo}
          </span>
        ))}
      </div>

      <div
        ref={ref}
        style={{ position: 'relative', width: '100%', cursor: 'pointer', touchAction: 'pan-y' }}
        onMouseMove={(e) => setHover(indiceDoPonteiro(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const i = indiceDoPonteiro(e.clientX); if (i !== null) onSelect(i + 1); }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Receitas, despesas e saldo mensal de ${ano}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--gray-300)' : 'var(--gray-100)'} strokeWidth={t === 0 ? 1.4 : 1} />
              {!hidden && <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--gray-500)" fontFamily="JetBrains Mono, monospace">{compacto(t)}</text>}
            </g>
          ))}
          {MESES.map((nome, i) => (
            <text key={nome} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11.5} fill={i < ultimoMes ? 'var(--gray-600)' : 'var(--gray-300)'}>{nome}</text>
          ))}

          <path d={area('receita')} fill={COR.receita} opacity={0.08} />
          <path d={area('despesas')} fill={COR.despesas} opacity={0.06} />
          <path d={caminho('receita')} fill="none" stroke={COR.receita} strokeWidth={2.4} strokeLinejoin="round" />
          <path d={caminho('despesas')} fill="none" stroke={COR.despesas} strokeWidth={2.4} strokeLinejoin="round" />
          <path d={caminho('saldo')} fill="none" stroke={COR.saldo} strokeWidth={2.4} strokeLinejoin="round" />

          {visiveis.map((m, i) => (
            <g key={m.mes}>
              <circle cx={x(i)} cy={y(m.receita)} r={hover === i ? 5 : 3} fill="var(--white)" stroke={COR.receita} strokeWidth={2} />
              <circle cx={x(i)} cy={y(m.despesas)} r={hover === i ? 5 : 3} fill="var(--white)" stroke={COR.despesas} strokeWidth={2} />
              <circle cx={x(i)} cy={y(m.saldo)} r={hover === i ? 5 : 3} fill="var(--white)" stroke={COR.saldo} strokeWidth={2} />
            </g>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--gray-300)" strokeDasharray="4 4" />}
        </svg>

        {atual && hover !== null && (
          <div
            style={{
              position: 'absolute', top: 8, pointerEvents: 'none', minWidth: 210, background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 12px', boxShadow: '0 8px 24px rgba(15,23,42,.16)',
              left: `${(x(hover) / W) * 100}%`, transform: hover > 7 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)',
            }}
          >
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', background: 'var(--gray-50)', borderRadius: 6, padding: '4px 8px' }}>{MESES[hover]}/{ano}</div>
            {linhaTooltip('Receitas', atual.receita, COR.receita, '#dcfce7')}
            {linhaTooltip('Despesas', atual.despesas, COR.despesas, '#fee2e2')}
            {linhaTooltip('Saldo', atual.saldo, COR.saldo, '#e0e7ff')}
            <div style={{ fontSize: 11, color: 'var(--gray-400)', textAlign: 'center', marginTop: 8 }}>Clique para ver os registros do mês</div>
          </div>
        )}
      </div>
    </div>
  );
}
