'use client';

import type { ReactNode } from 'react';
import { useIsPhone } from '@/lib/use-is-phone';

export type TabItem = { id: string; label: string; badge?: ReactNode };

// Barra de abas padrao do sistema: abas com sublinhado, logo abaixo do cabecalho da pagina (mesmo modelo de Motos e Etiquetas Detran).
export default function TabsBar({
  tabs,
  active,
  onChange,
  paddingX,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  paddingX?: number;
}) {
  const isPhone = useIsPhone();
  const px = paddingX ?? (isPhone ? 14 : 28);
  return (
    <div style={{ padding: `${isPhone ? 8 : 10}px ${px}px 0`, display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
      {tabs.map((tab) => {
        const ativa = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: isPhone ? '8px 10px' : '10px 16px', fontSize: 13.5,
              fontWeight: ativa ? 700 : 500,
              color: ativa ? 'var(--ink)' : 'var(--ink-muted)',
              borderBottom: ativa ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1, fontFamily: 'Geist, sans-serif', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
            {tab.badge ? <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600 }}>{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
