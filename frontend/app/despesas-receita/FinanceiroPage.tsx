'use client';

import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { canAccessPage } from '@/lib/permissions';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import DespesasReceitaPage from './page';
import CapitalGiroPage from './CapitalGiroPage';

// Financeiro: reune Despesas x Receita (fluxo de caixa) e Capital de Giro. Cada sub-aba segue o perfil de acesso da sua origem:
// Despesas x Receita -> /despesas-receita; Capital de Giro usa os custos do DRE -> /dre.
type SubAba = { id: string; label: string; href: string; Pagina: ComponentType<any> };

const SUB_ABAS: SubAba[] = [
  { id: 'despesas-receita', label: 'Despesas x Receitas', href: '/despesas-receita', Pagina: DespesasReceitaPage },
  { id: 'capital-giro', label: 'Capital de Giro', href: '/dre', Pagina: CapitalGiroPage },
];

export default function FinanceiroPage() {
  const { user } = useAuth();
  const visiveis = SUB_ABAS.filter((a) => canAccessPage(user as any, a.href));
  // chave "aba": a mesma que as paginas de dentro usam; o relatorios/page.tsx limpa ao trocar de relatorio
  const [sub, setSub] = usePersistentTab<string>('aba', SUB_ABAS[0].id, SUB_ABAS.map((a) => a.id));
  const atual = visiveis.find((a) => a.id === sub) || visiveis[0];

  if (!atual) {
    return <div style={{ padding: 28, fontSize: 13.5, color: 'var(--gray-500)' }}>Seu perfil não tem acesso às abas do Financeiro.</div>;
  }
  const Pagina = atual.Pagina;
  return (
    <>
      <TabsBar tabs={visiveis.map((a) => ({ id: a.id, label: a.label }))} active={atual.id} onChange={setSub} />
      {/* mesma classe do relatorios/page.tsx: a pagina de dentro perde o titulo repetido e o cabecalho "grudado", e fica so com os filtros */}
      <div className="relatorios-aba" key={atual.id}>
        <Pagina />
      </div>
    </>
  );
}
