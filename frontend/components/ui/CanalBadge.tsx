'use client';

// Etiqueta com o marketplace do pedido (ML, Shopee, Magalu, Nuvemshop, OLX, Manual...). Padrao unico das telas de pedidos; so aparece na tela (nunca no PDF).
export function canalEtiqueta(canal?: string | null) {
  const c = String(canal || '').trim();
  if (!c) return null;
  if (/mercado\s*livre/i.test(c)) return { texto: 'ML', bg: '#fef9c3', cor: '#854d0e', borda: '#fde047' };
  if (/shopee/i.test(c)) return { texto: 'Shopee', bg: '#fff7ed', cor: '#c2410c', borda: '#fdba74' };
  if (/magalu|magazine/i.test(c)) return { texto: 'Magalu', bg: '#eff6ff', cor: '#1d4ed8', borda: '#93c5fd' };
  if (/nuvem/i.test(c)) return { texto: 'Nuvemshop', bg: '#f5f3ff', cor: '#5b21b6', borda: '#c4b5fd' };
  if (/olx/i.test(c)) return { texto: 'OLX', bg: '#faf5ff', cor: '#6b21a8', borda: '#d8b4fe' };
  if (/^manual$/i.test(c)) return { texto: 'Manual', bg: '#f1f5f9', cor: '#475569', borda: '#cbd5e1' };
  return { texto: c.length > 18 ? c.slice(0, 17) + '…' : c, bg: '#f1f5f9', cor: '#334155', borda: '#cbd5e1' };
}

export default function CanalBadge({ canal }: { canal?: string | null }) {
  const e = canalEtiqueta(canal);
  if (!e) return null;
  return <span title={`Canal de venda: ${canal}`} style={{ border: `1px solid ${e.borda}`, background: e.bg, color: e.cor, borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{e.texto}</span>;
}
