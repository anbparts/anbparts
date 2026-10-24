'use client';

import Link from 'next/link';
import { useIsPhone } from '@/lib/use-is-phone';
import BlingConfigProdutosPage from '../bling/config-produtos/page';

// Conf. Prefixo (De/Para prefixo do SKU -> moto): pagina inteira aberta a partir de Motos, com botao de voltar (mesmo molde da Conf. Texto).
// O perfil de acesso e' o mesmo da antiga "Conf. Produtos Bling" (conf_produtos_bling).
export default function ConfPrefixoPage() {
  const isPhone = useIsPhone();
  return (
    <>
      {/* a pagina de dentro traz o proprio cabecalho: aqui ele deixa de ficar "grudado" no topo */}
      <style>{`.conf-prefixo-pagina [style*="position: sticky"] { position: static !important; }`}</style>
      <div style={{ minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '0 24px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 60, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Prefixo</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Prefixo do SKU de cada moto (usado na importação, no Cadastro e nos anúncios)</div>
        </div>
        <Link href="/motos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', textDecoration: 'none' }}>← Voltar para Motos</Link>
      </div>
      <div className="conf-prefixo-pagina">
        <BlingConfigProdutosPage />
      </div>
    </>
  );
}
