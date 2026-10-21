// E-mail de "venda efetivada" para pedidos de marketplaces que nao avisam sozinhos (Magalu, Shopee, Nuvemshop...).
// O Mercado Livre ja manda o proprio e-mail e a OLX tem o seu; pedido manual (balcao) nao e marketplace, entao ficam de fora.
// Disparado quando a baixa da venda e gravada (importacao automatica de vendas ou manual) — ver baixarPecasVenda em routes/bling.ts.
// Cada pedido avisa uma unica vez; vendas antigas (importacao de historico) nao disparam e-mail.
import { prisma } from './prisma';
import { getConfiguracaoGeral, DEFAULT_RESEND_FROM } from './configuracoes-gerais';
import { sendResendEmail, renderAlertEmailLayout, renderEmailPanel } from './email';
import { sincronizarPedido } from './bling-pedidos';

const DIAS_MAXIMOS = 3; // venda mais antiga que isso (data da venda) nao gera e-mail
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
const txt = (v: any) => String(v ?? '').trim();
const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let tabelaPronta: Promise<void> | null = null;
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VendaMarketplaceAviso" (
      "pedidoId" TEXT PRIMARY KEY, "pedidoNum" TEXT, "canal" TEXT, "status" TEXT NOT NULL, "erro" TEXT, "criadoEm" TIMESTAMP NOT NULL DEFAULT now(), "enviadoEm" TIMESTAMP)`)
      .then(() => undefined)
      .catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

function diasDesde(dataVenda: any): number {
  const chave = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const alvo = txt(dataVenda).slice(0, 10) || chave(new Date(dataVenda));
  const hoje = chave(new Date());
  return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${alvo}T00:00:00Z`)) / 86400000);
}

async function marcar(pedidoId: string, status: string, canal?: string | null, erro?: string | null) {
  await prisma.$executeRawUnsafe(
    `UPDATE "VendaMarketplaceAviso" SET "status"=$2, "canal"=COALESCE($3,"canal"), "erro"=$4, "enviadoEm"=CASE WHEN $2='enviado' THEN now() ELSE "enviadoEm" END WHERE "pedidoId"=$1`,
    pedidoId, status, canal ?? null, erro ?? null,
  ).catch(() => undefined);
}

export async function avisarVendaMarketplace(p: { pedidoId?: any; pedidoNum?: any; dataVenda: any; pecaIds: number[] }) {
  const pedidoId = txt(p.pedidoId);
  if (!pedidoId || !/^\d+$/.test(pedidoId)) return; // sem pedido do Bling nao da pra saber o canal
  try {
    await garantirTabela();
    // reserva o pedido: se ja existe registro, outro caminho (ou execucao anterior) ja tratou
    const reservado = await prisma.$executeRawUnsafe(
      `INSERT INTO "VendaMarketplaceAviso" ("pedidoId","pedidoNum","status") VALUES ($1,$2,'processando') ON CONFLICT ("pedidoId") DO NOTHING`,
      pedidoId, txt(p.pedidoNum) || null,
    );
    if (!reservado) return;
    if (diasDesde(p.dataVenda) > DIAS_MAXIMOS) { await marcar(pedidoId, 'antigo'); return; }

    let sincronizado = false;
    let ultimoErro = '';
    for (let tentativa = 0; tentativa < 3 && !sincronizado; tentativa += 1) {
      try { await sincronizarPedido(pedidoId); sincronizado = true; } catch (e: any) { ultimoErro = String(e?.message || e); await sleep(2500); }
    }
    if (!sincronizado) { await marcar(pedidoId, 'erro', null, `Nao leu o pedido no Bling: ${ultimoErro}`.slice(0, 300)); console.error('[venda-marketplace] pedido', pedidoId, ultimoErro); return; }

    const ped = (await prisma.$queryRawUnsafe<any[]>(
      `SELECT "numero","numeroLoja","data"::text AS data,"canal","clienteNome","totalProdutos","total","frete","desconto","entregaCidade","entregaUf","cancelado" FROM "BlingPedido" WHERE "id"=$1::bigint`, pedidoId,
    ))[0];
    if (!ped) { await marcar(pedidoId, 'erro', null, 'Pedido nao encontrado apos sincronizar'); return; }
    const canal = txt(ped.canal);
    if (/mercado\s*livre/i.test(canal)) { await marcar(pedidoId, 'ignorado', canal); return; } // o ML ja manda o e-mail dele
    if (!canal || /^manual$/i.test(canal)) { await marcar(pedidoId, 'ignorado', canal || 'Manual'); return; } // balcao/OLX: nao e marketplace integrado
    if (ped.cancelado) { await marcar(pedidoId, 'ignorado', canal); return; }

    const itensPedido = await prisma.$queryRawUnsafe<any[]>(`SELECT "sku","descricao","quantidade","valor","total" FROM "BlingPedidoItem" WHERE "pedidoId"=$1::bigint ORDER BY "id"`, pedidoId);
    const pecas = p.pecaIds.length ? await prisma.peca.findMany({ where: { id: { in: p.pecaIds } }, select: { idPeca: true, descricao: true, valorLiq: true, precoML: true } }) : [];
    const liquido = pecas.reduce((acc, x) => acc + Number(x.valorLiq || 0), 0);
    const numero = txt(ped.numero) || txt(p.pedidoNum) || pedidoId;
    const primeiro = txt(itensPedido[0]?.descricao) || txt(pecas[0]?.descricao) || `pedido ${numero}`;
    const qtdTotal = itensPedido.reduce((acc, i) => acc + Number(i.quantidade || 0), 0);

    const geral: any = await getConfiguracaoGeral();
    const to = txt(geral.auditoriaEmailDestinatario);
    if (!geral.resendApiKey || !to) { await marcar(pedidoId, 'sem_email', canal, 'Resend/destinatario nao configurado'); console.log('[venda-marketplace] e-mail nao enviado: Resend/destinatario nao configurado'); return; }

    const linhasItens = itensPedido.map((i) => `
      <tr>
        <td style="padding:10px 10px;border-bottom:1px solid #e2e8f0;font-family:Consolas,monospace;font-size:13px;color:#2563eb;font-weight:700;white-space:nowrap;vertical-align:top;">${esc(i.sku || '-')}</td>
        <td style="padding:10px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;vertical-align:top;">${esc(i.descricao)}<div style="font-size:12px;color:#64748b;margin-top:3px;">Quantidade: ${esc(Number(i.quantidade || 1))}u.</div></td>
        <td style="padding:10px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;text-align:right;white-space:nowrap;vertical-align:top;">${esc(brl(i.total || i.valor))}</td>
      </tr>`).join('');
    const info = (k: string, v: string) => (txt(v) ? `<tr><td style="padding:7px 10px;color:#64748b;width:150px;vertical-align:top;">${esc(k)}</td><td style="padding:7px 10px;color:#0f172a;">${esc(v)}</td></tr>` : '');
    const local = [txt(ped.entregaCidade), txt(ped.entregaUf)].filter(Boolean).join('/');
    const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const botao = frontend ? `<div style="margin-top:16px;"><a href="${esc(frontend + '/bling/pedidos')}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;">Ver pedido no sistema</a></div>` : '';

    const html = renderAlertEmailLayout({
      eyebrow: `Venda · ${esc(canal)} · ANB Parts`,
      title: esc(`Você vendeu no ${canal}! ${primeiro.length > 90 ? primeiro.slice(0, 87) + '...' : primeiro}`),
      subtitle: esc(`Pedido #${numero}${txt(ped.numeroLoja) ? ` · pedido na loja ${txt(ped.numeroLoja)}` : ''}${ped.data ? ` · ${String(ped.data).slice(8, 10)}/${String(ped.data).slice(5, 7)}/${String(ped.data).slice(0, 4)}` : ''} · prepare o pacote e emita a etiqueta`),
      contentHtml: renderEmailPanel(
        `<table style="width:100%;border-collapse:collapse;"><thead><tr>
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #cbd5e1;">SKU</th>
            <th style="text-align:left;padding:6px 10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #cbd5e1;">Peça</th>
            <th style="text-align:right;padding:6px 10px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #cbd5e1;">Valor</th></tr></thead><tbody>${linhasItens}</tbody></table>
         <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;"><tbody>
           ${info('Te comprou', txt(ped.clienteNome))}
           ${info('Entrega para', local)}
           ${info('Canal', canal)}
           ${info('Itens', qtdTotal ? `${qtdTotal} unidade(s)` : '')}
           ${info('Valor dos produtos', ped.totalProdutos != null ? brl(ped.totalProdutos) : '')}
           ${Number(ped.frete) > 0 ? info('Frete', brl(ped.frete)) : ''}
           ${Number(ped.desconto) > 0 ? info('Desconto', brl(ped.desconto)) : ''}
           ${info('Total do pedido', ped.total != null ? brl(ped.total) : '')}
           ${liquido > 0 ? info('Líquido estimado', brl(liquido)) : ''}
         </tbody></table>${botao}`,
        { accentColor: '#16a34a' },
      ),
    });
    const textoLinhas = [
      `Você vendeu no ${canal}!`, `Pedido #${numero}${txt(ped.numeroLoja) ? ` (loja ${txt(ped.numeroLoja)})` : ''}`, '',
      ...itensPedido.map((i) => `${i.sku || '-'} - ${i.descricao} (${Number(i.quantidade || 1)}u.) ${brl(i.total || i.valor)}`), '',
      txt(ped.clienteNome) ? `Te comprou: ${txt(ped.clienteNome)}` : '', local ? `Entrega: ${local}` : '', `Total do pedido: ${brl(ped.total)}`, liquido > 0 ? `Líquido estimado: ${brl(liquido)}` : '',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
    await sendResendEmail({
      apiKey: geral.resendApiKey, from: geral.emailRemetente || DEFAULT_RESEND_FROM, to,
      subject: `Você vendeu no ${canal}! ${primeiro.length > 70 ? primeiro.slice(0, 67) + '...' : primeiro}`, html, text: textoLinhas.join('\n'),
    });
    await marcar(pedidoId, 'enviado', canal);
  } catch (e: any) {
    console.error('[venda-marketplace] falha:', e?.message || e);
    await marcar(pedidoId, 'erro', null, String(e?.message || e).slice(0, 300));
  }
}
