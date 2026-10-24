'use client';

import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { canAccessPage, isBruno } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import ConfAnthropicPage from '../conf-anthropic/page';
import ConfMetaPage from '../conf-meta/page';
import BlingConfigPage from '../bling/page';
import ConfigMlPage from '../config-ml/page';
import ConfNuvemshopPage from '../conf-nuvemshop/page';
import ConfigShopeePage from '../config-shopee/page';
import ConfigMagaluPage from '../config-magalu/page';
import ConfigOlxPage from '../config-olx/page';
import ConfGmailPage from '../conf-gmail/page';

// Conf. Conexoes: reune, em abas, as paginas de configuracao de cada conexao (a pagina inteira dentro da aba).
// O acesso de cada aba segue o perfil da pagina original (as permissoes antigas continuam valendo).
type Aba = { id: string; label: string; href: string; Pagina: ComponentType<any>; soBruno?: boolean };

const ABAS: Aba[] = [
  { id: 'anthropic', label: 'Anthropic', href: '/conf-anthropic', Pagina: ConfAnthropicPage },
  { id: 'meta', label: 'Meta', href: '/conf-meta', Pagina: ConfMetaPage, soBruno: true },
  { id: 'bling', label: 'Bling', href: '/bling', Pagina: BlingConfigPage },
  { id: 'ml', label: 'Mercado Livre', href: '/config-ml', Pagina: ConfigMlPage },
  { id: 'nuvemshop', label: 'Nuvemshop', href: '/conf-nuvemshop', Pagina: ConfNuvemshopPage },
  { id: 'shopee', label: 'Shopee', href: '/config-shopee', Pagina: ConfigShopeePage },
  { id: 'magalu', label: 'Magalu', href: '/config-magalu', Pagina: ConfigMagaluPage },
  { id: 'olx', label: 'OLX', href: '/config-olx', Pagina: ConfigOlxPage },
  { id: 'google', label: 'Google', href: '/conf-gmail', Pagina: ConfGmailPage },
];

export default function ConfConexoesPage() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const visiveis = ABAS.filter((a) => (a.soBruno ? isBruno(user as any) : canAccessPage(user as any, a.href)));
  const [aba, setAba] = usePersistentTab<string>('aba', ABAS[0].id, ABAS.map((a) => a.id));
  const atual = visiveis.find((a) => a.id === aba) || visiveis[0];

  return (
    <>
      {/* a pagina de dentro traz o proprio cabecalho: aqui ele deixa de ficar "grudado" no topo para nao cobrir as abas */}
      <style>{`.conf-conexoes-aba [style*="position: sticky"] { position: static !important; }`}</style>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 60, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Conexões</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Anthropic, Meta, Bling, marketplaces e Google</div>
        </div>
      </div>
      {visiveis.length ? (
        <>
          <TabsBar tabs={visiveis.map((a) => ({ id: a.id, label: a.label }))} active={atual.id} onChange={setAba} />
          <div className="conf-conexoes-aba" key={atual.id}>
            <atual.Pagina />
          </div>
        </>
      ) : (
        <div style={{ padding: 28, fontSize: 13.5, color: 'var(--gray-500)' }}>Seu perfil não tem acesso a nenhuma das conexões.</div>
      )}
    </>
  );
}
