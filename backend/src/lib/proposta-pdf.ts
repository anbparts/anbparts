// PDF da proposta comercial (A4), no mesmo conteudo do PDF do Bling mas com texto vetorial (nitido), imagem da peca e layout mais limpo.
import PDFDocument from 'pdfkit';
import { prisma } from './prisma';

const EMPRESA = {
  nome: 'ANB PARTS LTDA',
  linhas: ['Avenida Doutor Paulo Moutram, Nº 247, PAVMTO SUB', '13208360 - Jundiaí, SP', 'Telefone: (11) 91603-7454', 'CNPJ: 60.100.111/0001-00'],
};
const COR = '#1f2937';
const COR_SUAVE = '#6b7280';
const COR_LINHA = '#d1d5db';
const COR_DESTAQUE = '#0f766e';

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtdFmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const dataBR = (iso?: string | null) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d && m && a ? `${d}/${m}/${a}` : ''; };
const baseSku = (v: any) => String(v || '').trim().toUpperCase().replace(/-\d+$/, '');

async function fotosPorCodigo(codigos: string[]): Promise<Map<string, Buffer>> {
  const mapa = new Map<string, Buffer>();
  const bases = Array.from(new Set(codigos.map(baseSku).filter(Boolean)));
  if (!bases.length) return mapa;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT UPPER("idPeca") AS "idPeca", "fotoCapaArquivo" AS foto FROM "Peca" WHERE UPPER("idPeca") = ANY($1::text[]) AND "fotoCapaArquivo" IS NOT NULL AND "fotoCapaArquivo" <> ''`, bases,
  ).catch(() => [] as any[]);
  for (const r of rows) {
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/s.exec(String(r.foto || ''));
    if (m) { try { mapa.set(r.idPeca, Buffer.from(m[2], 'base64')); } catch { /* foto invalida: segue sem imagem */ } }
  }
  return mapa;
}

export async function gerarPropostaPdf(p: any, opts: { documentoCliente?: string } = {}): Promise<Buffer> {
  const itens: any[] = Array.isArray(p.itens) ? p.itens : [];
  const fotos = await fotosPorCodigo(itens.map((i) => i.codigo));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Proposta Comercial Nº ${p.numero ?? ''}`, Author: EMPRESA.nome } });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const L = doc.page.margins.left;
    const W = doc.page.width - L - doc.page.margins.right;
    const fundoCinza = '#f3f4f6';

    // ── cabecalho ──
    doc.fillColor(COR).font('Helvetica-Bold').fontSize(15).text(EMPRESA.nome, L, 36);
    doc.font('Helvetica').fontSize(8.5).fillColor(COR_SUAVE);
    for (const l of EMPRESA.linhas) doc.text(l, L, doc.y + 1);
    doc.fillColor(COR_DESTAQUE).font('Helvetica-Bold').fontSize(20).text(`Proposta Nº ${p.numero ?? ''}`, L, 36, { width: W, align: 'right' });
    doc.fillColor(COR_SUAVE).font('Helvetica').fontSize(9).text(`Data: ${dataBR(p.data)}`, L, 62, { width: W, align: 'right' });
    if (p.situacao) doc.text(`Situação: ${p.situacao}`, L, 75, { width: W, align: 'right' });
    let y = Math.max(doc.y, 92) + 8;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(1.2).strokeColor(COR_DESTAQUE).stroke();
    y += 12;

    // ── Para ──
    doc.fillColor(COR_SUAVE).font('Helvetica-Bold').fontSize(8).text('PARA', L, y);
    doc.fillColor(COR).font('Helvetica-Bold').fontSize(12).text(p.clienteNome || '—', L, y + 11, { width: W * 0.7 });
    let yy = doc.y;
    if (opts.documentoCliente) { doc.font('Helvetica').fontSize(9).fillColor(COR_SUAVE).text(opts.documentoCliente, L, yy + 1); yy = doc.y; }
    if (p.aosCuidadosDe) { doc.font('Helvetica').fontSize(9).fillColor(COR_SUAVE).text(`Aos cuidados de: ${p.aosCuidadosDe}`, L, yy + 1); yy = doc.y; }
    y = yy + 10;
    if (p.introducao) {
      doc.font('Helvetica').fontSize(9.5).fillColor(COR).text(String(p.introducao), L, y, { width: W });
      y = doc.y + 10;
    }

    // ── tabela ──
    const col = [
      { t: 'Imagem', w: 50, a: 'center' }, { t: 'Descrição do produto/serviço', w: 0, a: 'left' }, { t: 'Código', w: 58, a: 'left' }, { t: 'Un', w: 22, a: 'center' },
      { t: 'Qtd.', w: 30, a: 'right' }, { t: 'Preço lista', w: 54, a: 'right' }, { t: 'Desc. %', w: 36, a: 'right' }, { t: 'Preço un.', w: 54, a: 'right' }, { t: 'Preço total', w: 58, a: 'right' },
    ] as Array<{ t: string; w: number; a: 'left' | 'right' | 'center' }>;
    col[1].w = W - col.reduce((s, c) => s + c.w, 0);
    const xs: number[] = []; col.reduce((x, c) => { xs.push(x); return x + c.w; }, L);

    const cabecalhoTabela = (yTop: number) => {
      doc.rect(L, yTop, W, 20).fill(fundoCinza);
      doc.fillColor(COR).font('Helvetica-Bold').fontSize(7.5);
      col.forEach((c, i) => doc.text(c.t, xs[i] + 3, yTop + 6.5, { width: c.w - 6, align: c.a, lineBreak: false }));
      return yTop + 20;
    };
    doc.fillColor(COR).font('Helvetica-Bold').fontSize(10).text('Itens da proposta comercial', L, y);
    y = cabecalhoTabela(doc.y + 6);

    let somaQtd = 0, somaLista = 0, somaLiquido = 0;
    const ALT = 50;
    for (const it of itens) {
      const qtd = Number(it.quantidade) || 0, lista = Number(it.valorLista) || 0, d = Number(it.descontoPct) || 0;
      const un = Math.round(lista * (1 - d / 100) * 100) / 100;
      const total = Math.round(un * qtd * 100) / 100;
      somaQtd += qtd; somaLista += lista * qtd; somaLiquido += total;

      if (y + ALT > doc.page.height - doc.page.margins.bottom - 60) { doc.addPage(); y = cabecalhoTabela(doc.page.margins.top); }
      const foto = fotos.get(baseSku(it.codigo));
      if (foto) { try { doc.image(foto, xs[0] + 5, y + 4, { fit: [40, 42], align: 'center', valign: 'center' }); } catch { /* imagem ilegivel */ } }
      doc.fillColor(COR).font('Helvetica-Bold').fontSize(8.5).text(String(it.descricao || ''), xs[1] + 3, y + 6, { width: col[1].w - 8, height: ALT - 10, ellipsis: true });
      if (it.descricaoDetalhada) doc.font('Helvetica').fontSize(7.5).fillColor(COR_SUAVE).text(String(it.descricaoDetalhada), xs[1] + 3, doc.y + 1, { width: col[1].w - 8, height: 14, ellipsis: true });
      doc.fillColor(COR).font('Helvetica').fontSize(8.5);
      const cel = (i: number, s: string) => doc.text(s, xs[i] + 3, y + 6, { width: col[i].w - 6, align: col[i].a, lineBreak: false });
      cel(2, String(it.codigo || '')); cel(3, String(it.unidade || 'UN')); cel(4, qtdFmt(qtd)); cel(5, brl(lista)); cel(6, qtdFmt(d)); cel(7, brl(un));
      doc.font('Helvetica-Bold'); cel(8, brl(total));
      y += ALT;
      doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor(COR_LINHA).stroke();
    }

    // ── totais ──
    const descItens = Math.round((somaLista - somaLiquido) * 100) / 100;
    const descontoGeral = Number(p.desconto) || 0, outras = Number(p.outrasDespesas) || 0, frete = Number(p.frete) || 0;
    const totalProposta = p.total != null && Number(p.total) > 0 ? Number(p.total) : Math.round((somaLiquido - descontoGeral + outras + frete) * 100) / 100;
    const linhas: Array<[string, string, boolean?]> = [
      ['Nº de itens', String(itens.length)], ['Soma das qtdes', qtdFmt(somaQtd)], ['Desconto total dos itens', brl(descItens)], ['Total dos itens', brl(somaLiquido)],
    ];
    if (descontoGeral) linhas.push(['Desconto', brl(descontoGeral)]);
    if (outras) linhas.push(['Outras despesas', brl(outras)]);
    linhas.push(['Frete', brl(frete)], ['Total da proposta', `R$ ${brl(totalProposta)}`, true]);

    const altTotais = linhas.length * 16 + 12;
    if (y + altTotais + 80 > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; }
    y += 14;
    const wBox = 230, xBox = L + W - wBox;
    for (const [rot, val, destaque] of linhas) {
      if (destaque) { doc.rect(xBox, y - 2, wBox, 20).fill(COR_DESTAQUE); doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11); }
      else doc.fillColor(COR).font('Helvetica').fontSize(9);
      doc.text(rot, xBox + 6, y + (destaque ? 3 : 0), { width: wBox / 2, lineBreak: false });
      doc.text(val, xBox + wBox / 2, y + (destaque ? 3 : 0), { width: wBox / 2 - 6, align: 'right', lineBreak: false });
      y += destaque ? 22 : 16;
    }

    // ── textos finais ──
    y += 12;
    const bloco = (titulo: string, texto?: string | null) => {
      if (!texto) return;
      if (y + 50 > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; }
      doc.fillColor(COR_SUAVE).font('Helvetica-Bold').fontSize(8).text(titulo.toUpperCase(), L, y);
      doc.fillColor(COR).font('Helvetica').fontSize(9.5).text(String(texto), L, doc.y + 2, { width: W });
      y = doc.y + 10;
    };
    bloco('Prazo de entrega', p.prazoEntrega);
    bloco('Observações', p.observacoes);
    if (y + 40 > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top; }
    doc.fillColor(COR).font('Helvetica').fontSize(10).text('Atenciosamente,', L, y + 6);
    doc.font('Helvetica-Bold').text('Departamento de vendas', L, doc.y + 1);
    doc.end();
  });
}
