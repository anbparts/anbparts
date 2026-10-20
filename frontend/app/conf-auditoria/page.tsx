'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AgendamentosSection from './AgendamentosSection';

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  btnGhost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', textDecoration: 'none' },
};

export default function ConfAuditoriaPage() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const ajustar = () => setIsPhone(typeof window !== 'undefined' && window.innerWidth <= 767);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Auditoria Automatica</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Agendamentos da auditoria: o que cada rotina verifica, quando roda e como</div>
        </div>
        <Link href="/bling/auditoria-automatica" style={s.btnGhost}>Ver Auditoria</Link>
      </div>
      <div style={{ padding: isPhone ? 14 : 28, maxWidth: 1100 }}>
        <AgendamentosSection isPhone={isPhone} />
      </div>
    </>
  );
}
