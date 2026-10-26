'use client';

import AbasAgregadas, { type AbaAgregada } from '@/components/layout/AbasAgregadas';
import MercadoLivrePerguntasPage from '../mercado-livre/perguntas/page';
import OlxConversasPage from '../olx/conversas/page';

// Mensagens Clientes (Operacao): perguntas do Mercado Livre e conversas da OLX.
const ABAS: AbaAgregada[] = [
  { id: 'ml-perguntas', label: 'ML - Perguntas', href: '/mercado-livre/perguntas', Pagina: MercadoLivrePerguntasPage },
  { id: 'olx-perguntas', label: 'OLX - Perguntas', href: '/olx/conversas', Pagina: OlxConversasPage },
];

// o cabecalho do ML e proprio (titulo grande): so deixa de ficar "grudado" no topo para nao cobrir as abas
const CSS_EXTRA = `.agregada-aba [style*="position: sticky"] { position: static !important; }`;

export default function MensagensClientesPage() {
  return <AbasAgregadas titulo="Mensagens Clientes" subtitulo="Perguntas do Mercado Livre e conversas da OLX" abas={ABAS} chave="msg" cssExtra={CSS_EXTRA} />;
}
