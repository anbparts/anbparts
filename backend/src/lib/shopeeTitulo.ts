// Titulo do anuncio na Shopee (max 120). Teste de contorno da remocao em massa de anuncios Harley-Davidson:
// cita so "Harley" (nunca "Harley-Davidson"/"HD") e termina sempre com "USADO".
// Usado quando o pedido de criacao manda padronizarTitulo=true (padronizacao para todos fica pra depois do teste).
export function tituloShopeePadrao(descricao: any): string {
  const original = String(descricao || '').replace(/\s+/g, ' ').trim();
  if (!original) return '';
  const tudoMaiusculo = original === original.toUpperCase();
  let t = original
    .replace(/\bharley[\s\-]*davidson\b/gi, 'Harley')
    .replace(/\bH\.?D\.?(?=\s|$)/g, 'Harley')
    // tira "usado/usada/usd" solto (no fim ou no meio) pra reaplicar uma unica vez no final
    .replace(/\s*\b(usado|usada|usd)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (tudoMaiusculo) t = t.toUpperCase();
  const sufixo = ' USADO';
  if (t.length + sufixo.length > 120) t = t.slice(0, 120 - sufixo.length).trim();
  return `${t}${sufixo}`;
}
