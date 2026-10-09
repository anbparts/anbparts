// Termo de Retirada e Entrega (PDF gerado no navegador e salvo em Downloads).
// Dois modelos: retirada pelo proprio comprador, ou por terceiro autorizado por ele.

export type TermoItem = {
  idPeca: string;
  descricao: string;
  veiculo: string;
  numeroMotor: string;
  numeroPeca: string;
  etiquetasDetran: string;
  anuncioML: string;
  valor: number;
  brinde: boolean;
};

export type TermoDados = {
  pedidoNum: string;
  dataVenda: string; // AAAA-MM-DD
  numeroVenda: string;
  total: number;
  comprador: { nome: string; documento: string; tipoPessoa: string };
  itens: TermoItem[];
};

export type TermoEmpresa = {
  razaoSocial?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  enderecoCompleto?: string;
  telefoneWhats?: string;
};

export type TermoOpcoes = {
  modo: 'comprador' | 'terceiro';
  plataforma: string; // ex.: "Mercado Livre", "Shopee", "Venda direta"
  terceiroNome?: string;
  terceiroCpf?: string; // so digitos ou formatado
  autorizacaoData?: string; // AAAA-MM-DD
  autorizacaoPrint?: string; // data URL (png/jpg) da conversa, opcional
};

const AZUL: [number, number, number] = [15, 58, 122];
const AZUL_CLARO: [number, number, number] = [26, 111, 224];
const CINZA: [number, number, number] = [71, 85, 105];
const TINTA: [number, number, number] = [17, 24, 39];

const fmtMoney = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '-');
};

export function formatarCpf(v: string) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return String(v || '').trim();
}

export function cpfValido(v: string) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function carregarImagem(url: string): Promise<string> {
  return fetch(url)
    .then((r) => r.blob())
    .then((blob) => new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('Falha ao ler imagem'));
      fr.readAsDataURL(blob);
    }));
}

function dimensoesImagem(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

export async function gerarTermoRetiradaPdf(dados: TermoDados, empresa: TermoEmpresa, op: TermoOpcoes): Promise<string> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = ((autoTableModule as any).default || autoTableModule) as any;

  let logo = '';
  try { logo = await carregarImagem('/logo.jpg'); } catch { /* sem logo: segue so com o texto */ }
  const printDim = op.autorizacaoPrint ? await dimensoesImagem(op.autorizacaoPrint) : null;

  const terceiro = op.modo === 'terceiro';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 14;
  const cw = W - mx * 2;
  const razao = empresa.razaoSocial || 'ANB PARTS LTDA';
  const endereco = String(empresa.enderecoCompleto || '').replace(/Cidade\/Estado:|Bairo:|Bairro:/gi, '').replace(/CEP:\s*/gi, 'CEP ').split(/\r?\n/).map((p) => p.trim()).filter(Boolean).join(' - ');
  const agora = new Date();
  const emitidoEm = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const plataforma = op.plataforma || 'plataforma de venda';
  const retiranteNome = terceiro ? String(op.terceiroNome || '').trim() : dados.comprador.nome;
  const retiranteCpf = terceiro ? formatarCpf(op.terceiroCpf || '') : formatarCpf(dados.comprador.documento);
  const compradorDoc = formatarCpf(dados.comprador.documento);
  const temMotor = dados.itens.some((i) => i.numeroMotor);
  const temEtiqueta = dados.itens.some((i) => i.etiquetasDetran);
  const plural = dados.itens.length > 1;

  let y = 0;

  const cabecalho = () => {
    // faixa azul no topo + logotipo + dados da empresa + referencia do pedido
    doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.rect(0, 0, W, 3.2, 'F');
    doc.setFillColor(AZUL_CLARO[0], AZUL_CLARO[1], AZUL_CLARO[2]);
    doc.rect(W * 0.62, 0, W * 0.38, 3.2, 'F');
    if (logo) doc.addImage(logo, 'JPEG', mx, 6.5, 24, 24);
    const tx = logo ? mx + 27 : mx;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.text(razao.toUpperCase(), tx, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]);
    const linhasEmp = doc.splitTextToSize(
      `CNPJ ${empresa.cnpj || '-'}  |  I.E. ${empresa.inscricaoEstadual || '-'}  |  I.M. ${empresa.inscricaoMunicipal || '-'}\n${endereco}${empresa.telefoneWhats ? `\nWhatsApp ${empresa.telefoneWhats}` : ''}`,
      cw - (tx - mx) - 46,
    );
    doc.text(linhasEmp, tx, 17.6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.text(`PEDIDO N. ${dados.pedidoNum}`, W - mx, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]);
    doc.text(`Venda ${plataforma}${dados.numeroVenda ? ` #${dados.numeroVenda}` : ''}`, W - mx, 16.2, { align: 'right' });
    doc.text(`Data da venda: ${fmtData(dados.dataVenda)}`, W - mx, 20.2, { align: 'right' });
    doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.setLineWidth(0.5);
    doc.line(mx, 33, W - mx, 33);
    y = 38;
  };

  const novaPagina = () => { doc.addPage('a4', 'portrait'); cabecalho(); };
  const garantir = (altura: number) => { if (y + altura > H - 16) novaPagina(); };

  const secao = (titulo: string) => {
    garantir(34);
    doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.rect(mx, y, cw, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(255, 255, 255);
    doc.text(titulo, mx + 2.5, y + 4.2);
    y += 11;
  };

  const paragrafo = (texto: string, opts: { negrito?: boolean; tam?: number; recuo?: number; cor?: [number, number, number] } = {}) => {
    doc.setFont('helvetica', opts.negrito ? 'bold' : 'normal');
    doc.setFontSize(opts.tam || 8.8);
    const c = opts.cor || TINTA;
    doc.setTextColor(c[0], c[1], c[2]);
    const linhas = doc.splitTextToSize(texto, cw - (opts.recuo || 0));
    garantir(linhas.length * 4 + 1.5);
    doc.text(linhas, mx + (opts.recuo || 0), y);
    y += linhas.length * 4 + 1.5;
  };

  const tabelaChaveValor = (linhas: Array<[string, string]>) => {
    autoTable(doc, {
      startY: y,
      margin: { left: mx, right: mx, top: 38, bottom: 16 },
      body: linhas,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.9, textColor: TINTA, lineColor: [156, 163, 175], lineWidth: 0.2, valign: 'top' },
      columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold', fillColor: [238, 243, 251], textColor: AZUL }, 1: { cellWidth: cw - 46 } },
      didDrawPage: () => { /* cabecalho das paginas seguintes e' desenhado abaixo */ },
    });
    y = ((doc as any).lastAutoTable?.finalY || y) + 4;
  };

  cabecalho();

  // ---------- titulo ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.text('TERMO DE RETIRADA E ENTREGA', W / 2, y + 2, { align: 'center' });
  doc.setFontSize(9.5);
  doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
  doc.text(plural ? 'PEÇAS AUTOMOTIVAS USADAS' : 'PEÇA AUTOMOTIVA USADA', W / 2, y + 7.4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]);
  doc.text(terceiro ? 'Retirada presencial por terceiro autorizado pelo comprador' : 'Retirada presencial pelo próprio comprador', W / 2, y + 12, { align: 'center' });
  y += 17;

  // ---------- 1. partes ----------
  secao('1. PARTES');
  const partes: Array<[string, string]> = [
    ['VENDEDORA', `${razao}, CNPJ ${empresa.cnpj || '-'}${endereco ? `, ${endereco}` : ''}.`],
    [terceiro ? 'COMPRADOR' : 'COMPRADOR / RETIRANTE', `${dados.comprador.nome || '(nome não localizado)'}${compradorDoc ? ` - ${dados.comprador.tipoPessoa === 'J' ? 'CNPJ' : 'CPF'} ${compradorDoc}` : ''}\nIdentificado no pedido n. ${dados.pedidoNum} (Bling)${dados.numeroVenda ? ` e na venda n. ${dados.numeroVenda} (${plataforma})` : ''}.`],
  ];
  if (terceiro) {
    partes.push(['PESSOA AUTORIZADA A RETIRAR', `${retiranteNome || '(nome não informado)'} - CPF ${retiranteCpf || '-'}\nAutorizada pelo comprador${op.autorizacaoData ? `, por mensagem na plataforma ${plataforma} em ${fmtData(op.autorizacaoData)}` : `, por mensagem na plataforma ${plataforma}`}${op.autorizacaoPrint ? ' (registro no Anexo I)' : ''}.`]);
  }
  tabelaChaveValor(partes);

  // ---------- 2. venda ----------
  secao('2. DADOS DA VENDA');
  const anuncios = dados.itens.filter((i) => i.anuncioML).map((i) => i.anuncioML);
  const venda: Array<[string, string]> = [
    ['Pedido (Bling)', `n. ${dados.pedidoNum}  |  data da venda: ${fmtData(dados.dataVenda)}`],
  ];
  if (dados.numeroVenda) venda.push([`Venda (${plataforma})`, `#${dados.numeroVenda}`]);
  if (anuncios.length) venda.push([anuncios.length > 1 ? 'Anúncios' : 'Anúncio', anuncios.join('  |  ')]);
  const nItensVendidos = dados.itens.filter((i) => !i.brinde).length;
  const nBrindes = dados.itens.length - nItensVendidos;
  venda.push(['Valor da venda', `${fmtMoney(dados.total)}  |  ${nItensVendidos} item(ns)${nBrindes ? ` + ${nBrindes} brinde(s)` : ''}`]);
  venda.push(['Forma de entrega', terceiro ? 'Retirada pessoal na sede da vendedora, por terceiro autorizado' : 'Retirada pessoal na sede da vendedora, pelo próprio comprador']);
  tabelaChaveValor(venda);

  // ---------- 3. pecas ----------
  secao(plural ? '3. IDENTIFICAÇÃO DAS PEÇAS ENTREGUES' : '3. IDENTIFICAÇÃO DA PEÇA ENTREGUE');
  autoTable(doc, {
    startY: y,
    margin: { left: mx, right: mx, top: 38, bottom: 16 },
    head: [['SKU', 'DESCRIÇÃO', 'VALOR']],
    body: dados.itens.map((i) => {
      // Identificacao entra na propria descricao, so quando a peca tem o dado (nem toda peca tem n. de motor/etiqueta).
      const linhas: string[] = [i.descricao];
      if (i.veiculo) linhas.push(`Veículo de origem: ${i.veiculo}`);
      if (i.numeroMotor) linhas.push(`Nº do motor: ${i.numeroMotor}`);
      if (i.numeroPeca && !/^v[aá]rias$/i.test(i.numeroPeca)) linhas.push(`Nº da peça: ${i.numeroPeca}`);
      if (i.etiquetasDetran) linhas.push(`Etiquetas Detran: ${i.etiquetasDetran.split('/').join(' / ')}`);
      linhas.push('Peça usada, originária de desmontagem veicular');
      return [i.idPeca, linhas.join('\n'), i.brinde ? 'BRINDE' : fmtMoney(i.valor)];
    }),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.4, cellPadding: 1.9, textColor: TINTA, lineColor: [156, 163, 175], lineWidth: 0.2, valign: 'top' },
    headStyles: { fillColor: [238, 243, 251], textColor: AZUL, fontStyle: 'bold', fontSize: 7.8 },
    columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' }, 1: { cellWidth: cw - 26 - 30 }, 2: { cellWidth: 30, halign: 'right' } },
  });
  y = ((doc as any).lastAutoTable?.finalY || y) + 5;

  // ---------- 4. conferencia ----------
  secao('4. CONFERÊNCIA NO ATO DA ENTREGA');
  paragrafo(`A conferência abaixo é feita presencialmente, com ${plural ? 'as peças' : 'a peça'} à vista, antes da retirada:`);
  const checks: string[] = [
    terceiro
      ? 'O documento de identificação oficial com foto do retirante foi apresentado, e o nome e o CPF conferem com o item 1 deste termo.'
      : 'O documento de identificação oficial com foto do comprador foi apresentado, e o nome e o CPF/CNPJ conferem com o item 1 deste termo.',
  ];
  if (temMotor) checks.push('O número do motor gravado na peça confere com o informado no item 3.');
  if (temEtiqueta) checks.push('As etiquetas de identificação (Detran) indicadas no item 3 estão afixadas na peça.');
  checks.push(`${plural ? 'As peças correspondem' : 'A peça corresponde'} às fotos, à descrição e ao título do anúncio.`);
  checks.push(`${plural ? 'As peças foram examinadas' : 'A peça foi examinada'} pelo retirante, que não apontou divergência, avaria ou falta em relação ao anunciado.`);
  checks.push(`${plural ? 'As peças foram entregues acondicionadas' : 'A peça foi entregue acondicionada'}/apoiada${plural ? 's' : ''} em condição segura para transporte.`);
  checks.forEach((c) => {
    const linhas = doc.splitTextToSize(c, cw - 8);
    garantir(linhas.length * 4 + 2);
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.setLineWidth(0.35);
    doc.rect(mx, y - 2.7, 3, 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.text(linhas, mx + 6, y);
    y += linhas.length * 4 + 1.6;
  });
  y += 2;

  // ---------- 5. declaracoes ----------
  secao('5. DECLARAÇÕES');
  const sujeito = terceiro ? 'O retirante' : 'O comprador';
  const decl: string[] = [];
  if (terceiro) {
    decl.push(`O retirante declara que recebeu, nesta data, ${plural ? 'os produtos descritos' : 'o produto descrito'} no item 3, em mãos, em nome e por conta do comprador, ${plural ? 'tendo-os examinado' : 'tendo-o examinado'} na presença da vendedora, e que ${plural ? 'eles correspondem' : 'ele corresponde'} ao descrito e anunciado${dados.numeroVenda ? ` na venda n. ${dados.numeroVenda}` : ' na venda'} (${plataforma}).`);
    decl.push(`O retirante declara ter sido autorizado pelo comprador a receber ${plural ? 'as peças' : 'a peça'}, conforme mensagem enviada por este na plataforma ${plataforma}${op.autorizacaoPrint ? ', reproduzida no Anexo I' : ', registrada pela vendedora'}, e assume a responsabilidade pelas informações de identificação aqui prestadas.`);
  } else {
    decl.push(`O comprador declara que recebeu, nesta data, ${plural ? 'os produtos descritos' : 'o produto descrito'} no item 3, em mãos, ${plural ? 'tendo-os examinado' : 'tendo-o examinado'} na presença da vendedora, e que ${plural ? 'eles correspondem' : 'ele corresponde'} ao descrito e anunciado${dados.numeroVenda ? ` na venda n. ${dados.numeroVenda}` : ' na venda'} (${plataforma}).`);
  }
  decl.push(`As partes reconhecem que se trata de ${plural ? 'peças automotivas usadas, vendidas' : 'peça automotiva usada, vendida'} nessa condição, conforme informado no anúncio.`);
  decl.push(`A vendedora declara ter entregue ${plural ? 'as peças' : 'a peça'} e cumprido a obrigação de entrega do pedido n. ${dados.pedidoNum}. A partir da assinatura deste termo, a guarda, o transporte e o manuseio passam à responsabilidade do ${terceiro ? 'comprador e do retirante' : 'comprador'}.`);
  decl.push('O comprador permanece com os direitos previstos na lei e nas regras da plataforma, em especial quanto à garantia e ao prazo de reclamação aplicáveis; este termo comprova a entrega e a conformidade verificada no ato, e não afasta direitos que a lei não permita afastar.');
  decl.push(`${sujeito} autoriza o registro fotográfico da entrega (${plural ? 'peças' : 'peça'}${temMotor ? ', número do motor' : ''} e documento de identificação) para fins de comprovação, que será usado apenas para esse fim.`);
  decl.forEach((t, i) => paragrafo(`${i + 1}. ${t}`, { recuo: 0 }));

  // observacao + campos
  y += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  const obs = doc.splitTextToSize(`Observação: a retirada somente é concluída se ${terceiro ? 'o retirante' : 'o comprador'} apresentar documento oficial com foto e o nome e o CPF forem os indicados neste termo. Qualquer divergência deve ser registrada no campo abaixo, antes da assinatura.`, cw - 6);
  garantir(obs.length * 4 + 48);
  doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.setFillColor(238, 243, 251);
  doc.setLineWidth(0.4);
  doc.rect(mx, y, cw, obs.length * 4 + 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.text(obs, mx + 3, y + 4.4);
  y += obs.length * 4 + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: mx, right: mx, top: 38, bottom: 16 },
    body: [
      ['Ressalvas / observações', ''],
      ['Documento apresentado', 'Tipo:  (   ) RG   (   ) CNH   (   ) Outro          N.: ______________________________'],
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.9, textColor: TINTA, lineColor: [156, 163, 175], lineWidth: 0.2, minCellHeight: 9, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold', fillColor: [238, 243, 251], textColor: AZUL }, 1: { cellWidth: cw - 46 } },
    didParseCell: (data: any) => { if (data.row.index === 0 && data.column.index === 1) data.cell.styles.minCellHeight = 17; },
  });
  y = ((doc as any).lastAutoTable?.finalY || y) + 8;

  garantir(46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
  doc.text('Jundiaí/SP, ______ de ____________________ de 20____, às ______:______ h.', mx, y);
  y += 24;
  const colW = (cw - 14) / 2;
  const assinatura = (x: number, nome: string, l2: string, l3: string) => {
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.setLineWidth(0.4);
    doc.line(x, y, x + colW, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(nome || ' ', x + colW / 2, y + 4.4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(CINZA[0], CINZA[1], CINZA[2]);
    doc.text(l2, x + colW / 2, y + 8.4, { align: 'center' });
    doc.text(l3, x + colW / 2, y + 12.2, { align: 'center' });
    doc.setTextColor(TINTA[0], TINTA[1], TINTA[2]);
  };
  assinatura(mx, terceiro ? retiranteNome : dados.comprador.nome, `CPF ${terceiro ? retiranteCpf : compradorDoc || '-'}`, terceiro ? 'Retirante autorizado' : 'Comprador / retirante');
  assinatura(mx + colW + 14, razao, `CNPJ ${empresa.cnpj || '-'}`, 'Responsável: ______________________');

  // ---------- anexo ----------
  if (terceiro && op.autorizacaoPrint && printDim) {
    novaPagina();
    secao(`ANEXO I - REGISTRO DA AUTORIZAÇÃO DO COMPRADOR (CHAT ${plataforma.toUpperCase()})`);
    paragrafo(`Captura da conversa entre a vendedora e o comprador ${dados.comprador.nome || ''} na plataforma ${plataforma}${dados.numeroVenda ? `, referente à venda #${dados.numeroVenda}` : ''}. A vendedora solicitou o nome completo e o CPF da pessoa autorizada a retirar; o comprador indicou ${retiranteNome || 'o retirante'}, CPF ${retiranteCpf || '-'}.`);
    y += 2;
    const maxW = cw;
    const maxH = H - y - 22;
    let iw = maxW;
    let ih = (printDim.h / printDim.w) * iw;
    if (ih > maxH) { ih = maxH; iw = (printDim.w / printDim.h) * ih; }
    const fmt = /^data:image\/png/i.test(op.autorizacaoPrint) ? 'PNG' : 'JPEG';
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(0.3);
    doc.rect(mx, y, iw, ih);
    doc.addImage(op.autorizacaoPrint, fmt, mx, y, iw, ih);
  }

  // ---------- rodape com paginacao ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(mx, H - 11, W - mx, H - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(107, 114, 128);
    doc.text(`Termo emitido em ${emitidoEm}  |  ${razao}  |  Pedido n. ${dados.pedidoNum}`, mx, H - 7);
    doc.text(`Página ${p} de ${total}`, W - mx, H - 7, { align: 'right' });
  }

  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).replace(/-/g, '');
  const arquivo = `Termo_Retirada_Pedido${dados.pedidoNum}_${terceiro ? 'Terceiro' : 'Comprador'}_${dia}.pdf`;
  doc.setProperties({ title: arquivo.replace(/\.pdf$/i, ''), subject: 'Termo de Retirada e Entrega', author: razao, creator: razao });
  doc.save(arquivo);
  return arquivo;
}
