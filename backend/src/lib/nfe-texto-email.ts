import { prisma } from './prisma';
import { getConfiguracaoGeral } from './configuracoes-gerais';
import {
  buildDatedEmailSubject,
  renderAlertEmailLayout,
  renderEmailMetricCard,
  renderEmailPanel,
  sendResendEmail,
} from './email';
import { DETRAN_TIPOS, posicaoDaEtiqueta, tipoPorPosicao, preencherTemplateNfe } from './nfe-texto';

type NfeTextoTarget = { idPeca: string; descricao: string; tipo: string; texto: string };

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mesma regra do relatorio: avulsa pelo tipoPecaAvulsa, cartela pela posicao da etiqueta.
function resolveTipoPeca(peca: any): string | null {
  const avulsa = String(peca?.tipoPecaAvulsa || '').trim();
  if (avulsa && DETRAN_TIPOS.includes(avulsa)) return avulsa;
  const pos = posicaoDaEtiqueta(peca?.detranEtiqueta);
  return pos ? tipoPorPosicao(pos) : null;
}

// Bloco por peca: cabecalho (SKU + descricao + tipo) e o texto preenchido, em destaque e facil de copiar.
function renderNfeTextoHtml(targets: NfeTextoTarget[]) {
  const blocos = targets.map((t) => renderEmailPanel(`
    <div style="margin-bottom:12px;">
      <span style="font-family:'JetBrains Mono',Consolas,monospace;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(t.idPeca)}</span>
      <span style="font-size:13px;color:#475569;"> &nbsp;&mdash;&nbsp; ${escapeHtml(t.descricao)}</span>
      <div style="display:inline-block;margin-top:8px;background:#eff6ff;border:1px solid #93c5fd;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;color:#1d4ed8;">${escapeHtml(t.tipo)}</div>
    </div>
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Texto para a NF-e</div>
    <pre style="margin:0;white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid #dbe3ef;border-radius:10px;padding:14px 16px;font-family:'JetBrains Mono',Consolas,monospace;font-size:12.5px;line-height:1.7;color:#0f172a;">${escapeHtml(t.texto)}</pre>
  `, { accentColor: '#2563eb', padding: '18px 20px' })).join('');

  return renderAlertEmailLayout({
    eyebrow: 'ANB Parts - Texto NF-e',
    title: 'Pecas vendidas que exigem texto na NF-e',
    subtitle: 'Copie o texto abaixo e cole na NF-e da respectiva peca.',
    summaryHtml: renderEmailMetricCard('Pecas com texto', targets.length, { tone: 'info' }),
    contentHtml: blocos,
    maxWidth: 880,
  });
}

function renderNfeTextoText(targets: NfeTextoTarget[]) {
  return [
    'ANB Parts - Texto da NF-e necessario',
    'As pecas abaixo foram vendidas e exigem o texto padrao na NF-e. Copie o texto e cole na NF-e correspondente.',
    '',
    ...targets.map((t) => [
      `SKU / ID Peca: ${t.idPeca}`,
      `Produto: ${t.descricao}`,
      `Tipo de peca: ${t.tipo}`,
      '--- Texto para a NF-e ---',
      t.texto,
      '-------------------------',
      '',
    ].join('\n')),
  ].join('\n');
}

// Dispara o e-mail com o(s) texto(s) preenchido(s) das pecas vendidas cujo tipo tem template ativo.
// Chamado junto com o e-mail da baixa DETRAN, no POST /baixar.
export async function sendNfeTextoEmailIfNeeded(pecaIds: number[]) {
  const ids = Array.from(new Set((pecaIds || []).map((id) => Number(id)).filter(Boolean)));
  if (!ids.length) {
    return { attempted: false, sent: false, skipped: true, reason: 'sem_pecas' };
  }

  let templateRows: { tipo: string; template: string }[] = [];
  try {
    templateRows = await prisma.$queryRaw<{ tipo: string; template: string }[]>`
      SELECT "tipo", "template" FROM "TextoTipoPeca" WHERE "ativo" = true AND length(btrim("template")) > 0
    `;
  } catch {
    return { attempted: false, sent: false, skipped: true, reason: 'sem_template' }; // tabela ainda nao migrada
  }
  if (!templateRows.length) {
    return { attempted: false, sent: false, skipped: true, reason: 'sem_template' };
  }
  const templates = new Map(templateRows.map((r) => [String(r.tipo), String(r.template)]));

  const pecas = await (prisma as any).peca.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, idPeca: true, descricao: true, detranEtiqueta: true, tipoPecaAvulsa: true, numeroMotor: true,
      moto: { select: { marca: true, modelo: true, ano: true, cor: true, placa: true, chassi: true, renavam: true, cilindros: true, combustivel: true, cilindrada: true, potencia: true } },
    },
  });

  const targets: NfeTextoTarget[] = [];
  for (const peca of pecas as any[]) {
    const tipo = resolveTipoPeca(peca);
    const template = tipo ? templates.get(tipo) : null;
    if (!tipo || !template) continue;
    const texto = String(preencherTemplateNfe(template, { moto: peca.moto, peca }) || '').trim();
    if (!texto) continue;
    targets.push({
      idPeca: String(peca.idPeca || '').trim(),
      descricao: String(peca.descricao || '').trim(),
      tipo,
      texto,
    });
  }

  if (!targets.length) {
    return { attempted: false, sent: false, skipped: true, reason: 'nenhuma_peca_com_texto' };
  }

  const config = await getConfiguracaoGeral();
  if (!config.nfeTextoEmailConfigurado) {
    return { attempted: false, sent: false, skipped: true, reason: 'configuracao_incompleta' };
  }

  await sendResendEmail({
    apiKey: config.resendApiKey,
    from: config.emailRemetente,
    to: config.nfeTextoEmailDestinatario,
    subject: buildDatedEmailSubject(config.nfeTextoEmailTitulo, 'ANB Parts - Texto da NF-e necessario - Verifique'),
    html: renderNfeTextoHtml(targets),
    text: renderNfeTextoText(targets),
  });

  return { attempted: true, sent: true, skipped: false, total: targets.length };
}
