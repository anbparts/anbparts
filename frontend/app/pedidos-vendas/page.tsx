'use client';

import AbasAgregadas, { type AbaAgregada } from '@/components/layout/AbasAgregadas';
import BlingPedidosPage from '../bling/pedidos/page';
import VendasBlingPage from '../bling/vendas/page';
import OlxAnunciosPage from '../olx/anuncios/page';
import SucataPage from '../sucata/page';

// Pedidos - Vendas (Operacao): pedidos do Bling, relatorio de separacao (vendas do Bling), OLX (anuncios, pendentes e vendas) e sucatas.
const ABAS: AbaAgregada[] = [
  { id: 'pedidos', label: 'Pedidos', href: '/bling/pedidos', Pagina: BlingPedidosPage },
  { id: 'rel-separacao', label: 'Rel. De Separação', href: '/bling/vendas', Pagina: VendasBlingPage },
  { id: 'olx-anuncios', label: 'OLX - Anúncios', href: '/olx/anuncios', Pagina: OlxAnunciosPage },
  { id: 'sucatas', label: 'Sucatas', href: '/sucata', Pagina: SucataPage },
];

export default function PedidosVendasPage() {
  return <AbasAgregadas titulo="Pedidos - Vendas" subtitulo="Pedidos do Bling, separação, OLX (anúncios e vendas) e sucatas" abas={ABAS} chave="pv" />;
}
