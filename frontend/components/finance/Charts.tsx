'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { sensitiveMaskStyle, sensitiveText, useCompanyValueVisibility } from '@/lib/company-values';

export type ViewMode = 'grafico' | 'relatorio';

export type ChartItem = {
  label: string;
  value: number;
  note?: string;
  color?: string;
  share?: string;
};

export type HeatmapCell = {
  label: string;
  value: number;
  note?: string;
  displayValue?: string;
};

export type HeatmapRow = {
  label: string;
  note?: string;
  cells: HeatmapCell[];
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

function normalizeToneText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
    flexWrap: 'wrap',
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
      <button type="button" style={button(value === 'grafico')} onClick={() => onChange('grafico')}>
        Grafico
      </button>
      <button type="button" style={button(value === 'relatorio')} onClick={() => onChange('relatorio')}>
        Relatorio
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
  const { hidden } = useCompanyValueVisibility();
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
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.label}
                </div>
                {item.note && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(item.note, hidden)}</div>}
              </div>
              <div style={{ fontSize: 12, color: color, fontFamily: 'Geist Mono, monospace', whiteSpace: 'nowrap', ...sensitiveMaskStyle(hidden) }}>
                {sensitiveText(valueFormatter ? valueFormatter(item.value) : compactCurrency(item.value), hidden)}
                {item.share ? <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, textAlign: 'right' }}>{sensitiveText(item.share, hidden)}</div> : null}
              </div>
            </div>
            <div
              style={{
                height: 11,
                borderRadius: 999,
                background: 'var(--gray-50)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}
            >
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
  const { hidden } = useCompanyValueVisibility();
  if (!items.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 10,
        alignItems: 'end',
        minHeight: 230,
      }}
    >
      {items.map((item, index) => {
        const color = toneColor(index, item.color);
        const height = `${Math.max((item.value / max) * 100, 8)}%`;

        return (
          <div key={`${item.label}-${index}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', textAlign: 'center', ...sensitiveMaskStyle(hidden) }}>
              {sensitiveText(valueFormatter ? valueFormatter(item.value) : compactCurrency(item.value), hidden)}
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
              {item.note && <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(item.note, hidden)}</div>}
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
  const { hidden } = useCompanyValueVisibility();
  if (!items.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 22, alignItems: 'center' }}>
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.7px',
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            {totalLabel}
          </div>
          <div style={{ fontSize: 20, lineHeight: 1.15, fontWeight: 700, color: 'var(--ink)', marginTop: 6, ...sensitiveMaskStyle(hidden) }}>
            {sensitiveText(totalDisplay || (valueFormatter ? valueFormatter(total) : compactCurrency(total)), hidden)}
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
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.label}
                </div>
                {item.note && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, ...sensitiveMaskStyle(hidden) }}>{sensitiveText(item.note, hidden)}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--ink)', fontFamily: 'Geist Mono, monospace', ...sensitiveMaskStyle(hidden) }}>
                  {sensitiveText(valueFormatter ? valueFormatter(item.value) : compactCurrency(item.value), hidden)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', ...sensitiveMaskStyle(hidden) }}>{sensitiveText(`${share.toFixed(1).replace('.', ',')}%`, hidden)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HeatmapChart({
  rows,
  emptyText,
  valueFormatter,
  normalizeByRow = false,
  rowHeaderLabel = 'Linha',
}: {
  rows: HeatmapRow[];
  emptyText?: string;
  valueFormatter?: (value: number) => string;
  normalizeByRow?: boolean;
  rowHeaderLabel?: string;
}) {
  const { hidden } = useCompanyValueVisibility();
  if (!rows.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const columns = rows[0]?.cells || [];
  if (!columns.length) return emptyBlock(emptyText || 'Sem dados para exibir.');

  const globalMax = Math.max(...rows.flatMap((row) => row.cells.map((cell) => cell.value)), 1);
  const rowMaxMap = new Map<string, number>(
    rows.map((row) => [row.label, Math.max(...row.cells.map((cell) => cell.value), 1)]),
  );

  const cellTone = (value: number, rowLabel: string) => {
    const normalizedRowLabel = normalizeToneText(rowLabel);
    const isResultadoBruto = normalizedRowLabel === 'resultado bruto';

    if (isResultadoBruto) {
      if (value > 0) {
        return {
          background: 'rgba(22, 163, 74, 0.10)',
          accent: 'rgba(22, 163, 74, 0.28)',
          textColor: 'var(--green)',
          noteColor: 'var(--green)',
        };
      }

      if (value < 0) {
        return {
          background: 'rgba(239, 68, 68, 0.10)',
          accent: 'rgba(239, 68, 68, 0.28)',
          textColor: 'var(--red)',
          noteColor: 'var(--red)',
        };
      }
    }

    if (value <= 0) {
      return {
        background: 'var(--white)',
        accent: 'transparent',
        textColor: 'var(--ink-muted)',
        noteColor: 'var(--ink-muted)',
      };
    }

    const max = normalizeByRow ? (rowMaxMap.get(rowLabel) || 1) : globalMax;
    const ratio = max > 0 ? value / max : 0;
    const alpha = Math.min(0.12, 0.025 + ratio * 0.095);
    const accentAlpha = Math.min(0.3, 0.08 + ratio * 0.22);

    return {
      background: `rgba(15, 23, 42, ${alpha})`,
      accent: `rgba(37, 99, 235, ${accentAlpha})`,
      textColor: 'var(--ink)',
      noteColor: 'var(--ink-muted)',
    };
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: Math.max(1180, 190 + columns.length * 96),
          display: 'grid',
          gridTemplateColumns: `190px repeat(${columns.length}, 96px)`,
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--gray-50)',
            fontSize: 10,
            fontFamily: 'Geist Mono, monospace',
            color: 'var(--ink-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.7px',
          }}
        >
          {rowHeaderLabel}
        </div>

        {columns.map((column) => (
          <div
            key={`head-${column.label}`}
            style={{
              padding: '10px 4px',
              background: 'var(--gray-50)',
              textAlign: 'center',
              fontSize: 10,
              fontFamily: 'Geist Mono, monospace',
              color: 'var(--ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.7px',
            }}
          >
            {column.label}
          </div>
        ))}

        {rows.flatMap((row, rowIndex) => {
          const rowLabelCell = (
              <div
                key={`row-label-${rowIndex}`}
                style={{
                  background: 'var(--white)',
                  padding: '10px 12px',
                minHeight: 54,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  lineHeight: 1.15,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {row.label}
              </div>
              {row.note ? (
                <div
                  style={{ ...{
                    marginTop: 4,
                    fontSize: 10,
                    color: 'var(--ink-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }, ...sensitiveMaskStyle(hidden) }}
                >
                  {sensitiveText(row.note, hidden)}
                </div>
              ) : null}
            </div>
          );

          const valueCells = row.cells.map((cell, cellIndex) => {
            const tone = cellTone(cell.value, row.label);
            const formatted = cell.displayValue || (valueFormatter ? valueFormatter(cell.value) : compactCurrency(cell.value));

            return (
              <div
                key={`row-${rowIndex}-cell-${cellIndex}`}
                title={`${row.label} - ${cell.label}${cell.note ? ` - ${cell.note}` : ''} - ${formatted}`}
                style={{
                  background: tone.background,
                  minHeight: 54,
                  padding: '8px 6px',
                  borderTop: `2px solid ${tone.accent}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 4,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: tone.textColor,
                    lineHeight: 1.1,
                    letterSpacing: '-0.1px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={sensitiveMaskStyle(hidden)}>
                    {sensitiveText(formatted, hidden)}
                  </span>
                </div>
                {cell.note ? (
                  <div
                    style={{
                      fontSize: 9,
                      color: tone.noteColor,
                      lineHeight: 1,
                      fontFamily: 'Geist Mono, monospace',
                      whiteSpace: 'nowrap',
                      ...sensitiveMaskStyle(hidden),
                    }}
                  >
                    {sensitiveText(cell.note, hidden)}
                  </div>
                ) : null}
              </div>
            );
          });

          return [rowLabelCell, ...valueCells];
        })}
      </div>
    </div>
  );
}
