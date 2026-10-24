'use client';

import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { canAccessPage } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import DespesasPage from '../despesas/page';
import PrejuizosPage from '../prejuizos/page';
import InvestimentosPage from '../investimentos/page';

// Operacional (Financeiro): reune, em abas, o dia a dia financeiro (despesas, prejuizos e investimentos). Cada aba e' a pagina original inteira
// (com as abas e botoes que ela ja tem). O acesso de cada aba segue o perfil da pagina original.
type Aba = { id: string; label: string; href: string; Pagina: ComponentType<any> };

const ABAS: Aba[] = [
  { id: 'despesas', label: 'Despesas', href: '/despesas', Pagina: DespesasPage },
  { id: 'prejuizos', label: 'Prejuízos', href: '/prejuizos', Pagina: PrejuizosPage },
  { id: 'investimentos', label: 'Investimentos', href: '/investimentos', Pagina: InvestimentosPage },
];

export default function OperacionalPage() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const visiveis = ABAS.filter((a) => canAccessPage(user as any, a.href));
  // chave "op": as paginas de dentro usam "aba" para as proprias abas internas
  const [op, setOp] = usePersistentTab<string>('op', ABAS[0].id, ABAS.map((a) => a.id));
  const atual = visiveis.find((a) => a.id === op) || visiveis[0];

  // ao trocar de aba, limpa a aba interna guardada: as paginas usam os mesmos nomes (grafico, relatorio...) e uma herdaria a da outra
  function trocar(id: string) {
    try {
      window.sessionStorage.removeItem(`aba:${window.location.pathname}:aba`);
      const url = new URL(window.location.href);
      url.searchParams.delete('aba');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* sem acesso ao endereco/armazenamento: so troca a aba */ }
    setOp(id);
  }

  return (
    <>
      {/* a pagina de dentro traz o proprio cabecalho: aqui ele deixa de ficar "grudado" no topo, o titulo (que repete o nome da aba) some
          e ficam so os botoes da pagina, se ela tiver; sem botoes, a barra inteira some */}
      <style>{`
        .operacional-aba > [style*="position: sticky"] { position: static !important; }
        .operacional-aba > [style*="position: sticky"] > div:first-child { display: none !important; }
        .operacional-aba > [style*="position: sticky"]:has(> div:only-child) { display: none !important; }
        .operacional-aba > [style*="position: sticky"] > div:not(:first-child) { margin-left: auto; }
      `}</style>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 60, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Operacional</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Despesas, prejuízos e investimentos</div>
        </div>
      </div>
      {visiveis.length ? (
        <>
          <TabsBar tabs={visiveis.map((a) => ({ id: a.id, label: a.label }))} active={atual.id} onChange={trocar} />
          <div className="operacional-aba" key={atual.id}>
            <atual.Pagina />
          </div>
        </>
      ) : (
        <div style={{ padding: 28, fontSize: 13.5, color: 'var(--gray-500)' }}>Seu perfil não tem acesso a nenhuma das áreas do Operacional.</div>
      )}
    </>
  );
}
