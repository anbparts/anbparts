'use client';

import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { canAccessPage } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';
import DespesasReceitaPage from '../despesas-receita/page';
import FaturamentoMotoPage from '../faturamento/page';
import FaturamentoGeralPage from '../faturamento/geral/page';
import DREPage from '../dre/page';
import CurvaAbcPage from '../curva-abc/page';
import RelatorioVendasPage from '../bling/relatorio-vendas/page';

// Relatorios (Financeiro): reune, em abas, os relatorios financeiros. Cada aba e' a pagina original inteira (com as abas e botoes que ela ja tem).
// O acesso de cada aba segue o perfil da pagina original.
type Aba = { id: string; label: string; href: string; Pagina: ComponentType<any> };

const ABAS: Aba[] = [
  { id: 'despesas-receita', label: 'Despesas x Receita', href: '/despesas-receita', Pagina: DespesasReceitaPage },
  { id: 'faturamento-moto', label: 'Faturamento por Moto', href: '/faturamento', Pagina: FaturamentoMotoPage },
  { id: 'faturamento-geral', label: 'Faturamento Geral', href: '/faturamento/geral', Pagina: FaturamentoGeralPage },
  { id: 'dre', label: 'DRE', href: '/dre', Pagina: DREPage },
  { id: 'curva-abc', label: 'Curva ABC', href: '/curva-abc', Pagina: CurvaAbcPage },
  { id: 'relatorio-vendas', label: 'Relatório de Vendas', href: '/bling/relatorio-vendas', Pagina: RelatorioVendasPage },
];

export default function RelatoriosPage() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const visiveis = ABAS.filter((a) => canAccessPage(user as any, a.href));
  // chave "rel": as paginas de dentro usam "aba" para as proprias abas internas
  const [rel, setRel] = usePersistentTab<string>('rel', ABAS[0].id, ABAS.map((a) => a.id));
  const atual = visiveis.find((a) => a.id === rel) || visiveis[0];

  // ao trocar de relatorio, limpa a aba interna guardada: varias paginas usam os mesmos nomes (grafico, relatorio...) e uma herdaria a da outra
  function trocar(id: string) {
    try {
      window.sessionStorage.removeItem(`aba:${window.location.pathname}:aba`);
      const url = new URL(window.location.href);
      url.searchParams.delete('aba');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* sem acesso ao endereco/armazenamento: so troca a aba */ }
    setRel(id);
  }

  return (
    <>
      {/* a pagina de dentro traz o proprio cabecalho: aqui ele deixa de ficar "grudado" no topo, o titulo (que repete o nome da aba) some
          e ficam so os botoes da pagina, se ela tiver; sem botoes, a barra inteira some */}
      <style>{`
        .relatorios-aba > [style*="position: sticky"] { position: static !important; }
        .relatorios-aba > [style*="position: sticky"] > div:first-child { display: none !important; }
        .relatorios-aba > [style*="position: sticky"]:has(> div:only-child) { display: none !important; }
        .relatorios-aba > [style*="position: sticky"] > :not(:first-child) { margin-left: auto; }
      `}</style>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 60, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Relatórios</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Despesas x receita, faturamento, DRE, curva ABC e vendas</div>
        </div>
      </div>
      {visiveis.length ? (
        <>
          <TabsBar tabs={visiveis.map((a) => ({ id: a.id, label: a.label }))} active={atual.id} onChange={trocar} />
          <div className="relatorios-aba" key={atual.id}>
            <atual.Pagina />
          </div>
        </>
      ) : (
        <div style={{ padding: 28, fontSize: 13.5, color: 'var(--gray-500)' }}>Seu perfil não tem acesso a nenhum dos relatórios.</div>
      )}
    </>
  );
}
