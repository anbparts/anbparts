'use client';

import AbasAgregadas, { type AbaAgregada } from '@/components/layout/AbasAgregadas';
import ArmazenagemPage from '../armazenagem/page';
import InventarioPage from '../inventario/page';
import AuditoriaAutomaticaPage from '../bling/auditoria-automatica/page';

// WM - Gerenciamento (Operacao): armazenagem, inventario e auditoria automatica.
const ABAS: AbaAgregada[] = [
  { id: 'armazenagem', label: 'Armazenagem', href: '/armazenagem', Pagina: ArmazenagemPage },
  { id: 'inventario', label: 'Inventário', href: '/inventario', Pagina: InventarioPage },
  { id: 'auditoria', label: 'Auditoria Automática', href: '/bling/auditoria-automatica', Pagina: AuditoriaAutomaticaPage },
];

// Armazenagem ocupa a altura da tela (arvore + conteudo): desconta o cabecalho e as abas desta pagina para nao criar uma segunda barra de rolagem
const CSS_EXTRA = `.agregada-aba [style*="calc(100dvh - var(--topbar-h))"] { height: calc(100dvh - 2 * var(--topbar-h) - 48px) !important; }`;

export default function WmGerenciamentoPage() {
  return <AbasAgregadas titulo="WM - Gerenciamento" subtitulo="Armazenagem, inventário e auditoria automática" abas={ABAS} chave="wm" cssExtra={CSS_EXTRA} />;
}
