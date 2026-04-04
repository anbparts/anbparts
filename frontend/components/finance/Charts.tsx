import type { CSSProperties, ReactNode } from 'react';

export type ViewMode = 'grafico' | 'relatorio';

export type ChartItem = {
  label: string;
  value: number;
  note?: string;
  color?: string;
};

const palette = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6'];

function compactCurrency(value: number) {
  if (Math.abs(value) >= 1000000) return `R$ ${(value / 1000000).toFixed(1).replace('.', ',')} mi`;
  if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(1).replace('.', ',')} mil`;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toneColor(index: number, override?: string) {
  return override || palette[index % palette.length];
}

function emptyBlock(message: string) {
  return (
    <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
      {message}
    </div>
  );
}

export function ViewModeSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const wrap: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    background: 'var(--gray-50)',
    border: '1px solid var(--border)',
  };

  const button = (active: boolean): CSSProperties => ({
    border: 'none',
    background: active ? 'var(--ink)' : 'transparent',
    color: active ? 'var(--white)' : 'var(--ink-soft)',
    padding: '7px 14px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Geist, sans-serif',
    transition: 'all .18s ease',
  });

  return (
    <div style={wrap}>
      <button type="button" style={button(value === 'relatorio')} onClick={() => onChange('relatorio')}>
        Relatorio
      </button>
      <button type="button" style={button(value === 'grafico')} onClick={() => onChange('grafico')}>
        Grafico
      </button>
    </div>
  );
}

export function ChartPanel({
  title,
  subtitle,
  accent = '#2563eb',
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border)',
          background: `linear-gradient(135deg, ${accent}14, transparent 55%)`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

export function HorizontalBarChart({
  items,
  emptyText,
  valueFormatter,
}: {
  items: ChartItem[];
  emptyText?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!items.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((item, index) => {
        const color = toneColor(index, item.color);
        const width = `${Math.max((item.value / max) * 100, 6)}%`;

        return (
          <div key={`${item.label}-${index}`} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </div>
                {item.note && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{item.note}</div>}
              </div>
              <div style={{ fontSize: 12, color: color, fontFamily: 'Geist Mono, monospace', whiteSpace: 'nowrap' }}>
                {valueFormatter ? valueFormatter(item.value) : compactCurrency(item.value)}
              </div>
            </div>
            <div style={{ height: 11, borderRadius: 999, background: 'var(--gray-50)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div
                style={{
                  width,
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                  boxShadow: `0 6px 16px ${color}26`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ColumnChart({
  items,
  emptyText,
  valueFormatter,
}: {
  items: ChartItem[];
  emptyText?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!items.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 10, alignItems: 'end', minHeight: 230 }}>
      {items.map((item, index) => {
        const color = toneColor(index, item.color);
        const height = `${Math.max((item.value / max) * 100, 8)}%`;

        return (
          <div key={`${item.label}-${index}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', textAlign: 'center' }}>
              {valueFormatter ? valueFormatter(item.value) : compactCurrency(item.value)}
            </div>
            <div
              style={{
                height,
                minHeight: 26,
                borderRadius: '14px 14px 8px 8px',
                background: `linear-gradient(180deg, ${color}, ${color}88)`,
                boxShadow: `0 12px 20px ${color}22`,
              }}
            />
            <div style={{ textAlign: 'center', minHeight: 34 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
              {item.note && <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2 }}>{item.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  items,
  totalLabel,
  totalDisplay,
  emptyText,
  valueFormatter,
}: {
  items: ChartItem[];
  totalLabel: string;
  totalDisplay?: string;
  emptyText?: string;
  valueFormatter?: (value: number) => string;
}) {
  if (!items.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 22, alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 170, height: 170, margin: '0 auto' }}>
        <svg width="170" height="170" viewBox="0 0 170 170">
          <circle cx="85" cy="85" r={radius} stroke="var(--gray-100)" strokeWidth="18" fill="none" />
          {items.map((item, index) => {
            const color = toneColor(index, item.color);
            const segment = total > 0 ? (item.value / total) * circumference : 0;
            const strokeDasharray = `${segment} ${circumference - segment}`;
            const strokeDashoffset = -offset;
            offset += segment;
            return (
              <circle
                key={`${item.label}-${index}`}
                cx="85"
                cy="85"
                r={radius}
                stroke={color}
                strokeWidth="18"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 85 85)"
              />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', fontFamily: 'Geist Mono, monospace' }}>
            {totalLabel}
          </div>
          <div style={{ fontSize: 20, lineHeight: 1.15, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>
            {totalDisplay || (valueFormatter ? valueFormatter(total) : compactCurrency(total))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, index) => {
          const color = toneColor(index, item.color);
          const share = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={`${item.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: color, boxShadow: `0 0 0 4px ${color}1c` }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </div>
                {item.note && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{item.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'Geist Mono, monospace' }}>
                  {valueFormatter ? valueFormatter(item.value) : compactCurrency(item.value)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{share.toFixed(1).replace('.', ',')}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
