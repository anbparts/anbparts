'use client';

import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { canAccessPage, isBruno } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import ConfiguracoesPage from '../configuracoes/page';
import ConfiguracoesGeraisPage from '../configuracoes-gerais/page';
import ConfSeparacaoPage from '../conf-separacao/page';
import ConfAuditoriaPage from '../conf-auditoria/page';
import ConfGeraisPage from '../conf-gerais/page';

// Conf. Sistema: reune, em abas, as configuracoes do sistema (a pagina inteira dentro da aba).
// O acesso de cada aba segue o perfil da pagina original (as permissoes antigas continuam valendo).
type Aba = { id: string; label: string; href: string; Pagina: ComponentType<any>; soBruno?: boolean };

const ABAS: Aba[] = [
  { id: 'perfil', label: 'Perfil', href: '/configuracoes', Pagina: ConfiguracoesPage, soBruno: true },
  { id: 'emails', label: 'E-mails', href: '/configuracoes-gerais', Pagina: ConfiguracoesGeraisPage },
  { id: 'separacao', label: 'Separação', href: '/conf-separacao', Pagina: ConfSeparacaoPage },
  { id: 'auditoria', label: 'Auditoria Automática', href: '/conf-auditoria', Pagina: ConfAuditoriaPage },
  { id: 'outras', label: 'Outras Configurações', href: '/conf-gerais', Pagina: ConfGeraisPage },
];

export default function ConfSistemaPage() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const visiveis = ABAS.filter((a) => (a.soBruno ? isBruno(user as any) : canAccessPage(user as any, a.href)));
  const [aba, setAba] = usePersistentTab<string>('aba', ABAS[0].id, ABAS.map((a) => a.id));
  const atual = visiveis.find((a) => a.id === aba) || visiveis[0];

  return (
    <>
      {/* a pagina de dentro traz o proprio cabecalho: aqui ele deixa de ficar "grudado" no topo para nao cobrir as abas */}
      <style>{`.conf-sistema-aba [style*="position: sticky"] { position: static !important; }`}</style>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 60, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Sistema</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Perfis, e-mails, separação, auditoria e demais configurações</div>
        </div>
      </div>
      {visiveis.length ? (
        <>
          <TabsBar tabs={visiveis.map((a) => ({ id: a.id, label: a.label }))} active={atual.id} onChange={setAba} />
          <div className="conf-sistema-aba" key={atual.id}>
            <atual.Pagina />
          </div>
        </>
      ) : (
        <div style={{ padding: 28, fontSize: 13.5, color: 'var(--gray-500)' }}>Seu perfil não tem acesso a nenhuma das configurações.</div>
      )}
    </>
  );
}
