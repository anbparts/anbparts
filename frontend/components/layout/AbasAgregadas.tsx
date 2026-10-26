'use client';

import type { ComponentType } from 'react';
import { useAuth } from '@/lib/auth';
import { canAccessPage } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';
import { usePersistentTab } from '@/lib/use-persistent-tab';
import TabsBar from '@/components/ui/TabsBar';

// Pagina que reune, em abas, paginas que ja existiam (cada aba e' a pagina original inteira, com as abas e botoes dela).
// O acesso de cada aba segue o perfil da pagina original; a escolha da aba fica em "?<chave>=" porque as paginas de dentro usam "aba".
export type AbaAgregada = { id: string; label: string; href: string; Pagina: ComponentType<any> };

export default function AbasAgregadas({ titulo, subtitulo, abas, chave, cssExtra }: { titulo: string; subtitulo: string; abas: AbaAgregada[]; chave: string; cssExtra?: string }) {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const visiveis = abas.filter((a) => canAccessPage(user as any, a.href));
  const [sel, setSel] = usePersistentTab<string>(chave, abas[0].id, abas.map((a) => a.id));
  const atual = visiveis.find((a) => a.id === sel) || visiveis[0];

  // ao trocar de aba, limpa a aba interna guardada: varias paginas usam os mesmos nomes e uma herdaria a da outra
  function trocar(id: string) {
    try {
      window.sessionStorage.removeItem(`aba:${window.location.pathname}:aba`);
      const url = new URL(window.location.href);
      url.searchParams.delete('aba');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* sem acesso ao endereco/armazenamento: so troca a aba */ }
    setSel(id);
  }

  // Cabecalho da pagina de dentro: deixa de ficar "grudado" no topo, o titulo (que repete o nome da aba) some e ficam so os botoes dela
  // (sem botoes, a barra inteira some). Reconhece o cabecalho pelo bloco de titulo (fonte 17px).
  const TITULO = '> div:first-child > div[style*="font-size: 17px"]';
  const css = `
    .agregada-aba [style*="position: sticky"]:has(${TITULO}) { position: static !important; }
    .agregada-aba [style*="position: sticky"] > div:first-child:has(> div[style*="font-size: 17px"]) { display: none !important; }
    .agregada-aba [style*="position: sticky"]:has(> div:only-child > div[style*="font-size: 17px"]) { display: none !important; }
    .agregada-aba [style*="position: sticky"]:has(${TITULO}) > :not(:first-child) { margin-left: auto; }
    ${cssExtra || ''}
  `;

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 60, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>{titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{subtitulo}</div>
        </div>
      </div>
      {visiveis.length ? (
        <>
          <TabsBar tabs={visiveis.map((a) => ({ id: a.id, label: a.label }))} active={atual.id} onChange={trocar} />
          <div className="agregada-aba" key={atual.id}>
            <atual.Pagina />
          </div>
        </>
      ) : (
        <div style={{ padding: 28, fontSize: 13.5, color: 'var(--gray-500)' }}>Seu perfil não tem acesso a nenhuma das áreas desta página.</div>
      )}
    </>
  );
}
