// TEMPORARIO (diagnostico): descobre qual valor de mercadoLivre.frete.tipo o Bling aceita pra um rascunho de
// anuncio do ML que falha com "Obrigatorio informar o Metodo de Envio". Pra cada tipo: PUT no anuncio com
// frete { gratis, tipo } e tenta publicar; para no primeiro que publicar. Remover depois de fechar o fluxo.
import { Router } from 'express';
import { blingReq } from './bling';
import { ML_LOJA_BLING_ID } from '../lib/mlCategorias';

export const mlTesteEnvioRouter = Router();

// POST /mercado-livre/anuncio/teste-envio — body: { anuncio, categoriaId, tipos: number[], gratis?: boolean, soPut?: boolean }
mlTesteEnvioRouter.post('/anuncio/teste-envio', async (req, res) => {
  try {
    const anuncio = String(req.body?.anuncio || '').trim();
    const categoriaId = String(req.body?.categoriaId || '').trim();
    const tipos: number[] = Array.isArray(req.body?.tipos) ? req.body.tipos.map(Number) : [];
    const gratis = req.body?.gratis === true;
    const soPut = req.body?.soPut === true;
    if (!anuncio || !categoriaId || !tipos.length) return res.status(400).json({ error: 'anuncio, categoriaId e tipos[] obrigatorios' });

    const q = `tipoIntegracao=MercadoLivre&idLoja=${ML_LOJA_BLING_ID}`;
    const atual = (await blingReq(`/anuncios/${anuncio}?${q}`) as any)?.data;
    if (!atual) return res.status(404).json({ error: 'anuncio nao encontrado no Bling' });

    const resultados: any[] = [];
    for (const tipo of tipos) {
      const payload: any = {
        produto: { id: atual.produto?.id },
        integracao: { tipo: 'MercadoLivre' },
        loja: { id: ML_LOJA_BLING_ID },
        nome: String(atual.titulo || '').slice(0, 60),
        descricao: atual.descricao,
        preco: { valor: atual.preco?.valor },
        categoria: { id: categoriaId },
        atributos: (atual.atributos || []).filter((a: any) => a.id_externo && a.tipo === 4 || a.id_externo === 'EMPTY_GTIN_REASON').map((a: any) => ({ id: a.id_externo, valor: String(a.valor) })),
        imagens: (atual.imagens || []).map((i: any) => ({ url: i.url, ordem: i.ordem })),
        mercadoLivre: { modalidade: 'gold_pro', frete: { gratis, tipo } },
      };
      const r: any = { tipo, gratis };
      try {
        await blingReq(`/anuncios/${anuncio}?${q}`, { method: 'PUT', body: JSON.stringify(payload) });
        r.put = 'ok';
      } catch (e: any) { r.put = String(e?.message || e).slice(0, 600); resultados.push(r); continue; }
      if (soPut) { resultados.push(r); continue; }
      try {
        await blingReq(`/anuncios/${anuncio}/publicar?${q}`, { method: 'POST', body: JSON.stringify({}) });
        r.publicar = 'ok';
        resultados.push(r);
        break;
      } catch (e: any) { r.publicar = String(e?.message || e).slice(0, 900); }
      resultados.push(r);
    }
    res.json({ ok: true, resultados });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || 'erro no teste de envio' });
  }
});
