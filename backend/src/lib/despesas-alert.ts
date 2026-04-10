import { prisma } from './prisma';
import { getConfiguracaoGeral } from './configuracoes-gerais';
import {
  buildDatedEmailSubject,
  renderAlertEmailLayout,
  renderEmailBadge,
  renderEmailMetricCard,
  renderEmailPanel,
  sendResendEmail,
} from './email';

export type DespesaEmailItem = {
  id: number;
  data: Date;
  detalhes: string;
  categoria: string;
  valor: number;
  chavePix?: string | null;
  codigoBarras?: string | null;
  observacao?: string | null;
};

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: Date) {
  const key = new Date(date).toISOString().split('T')[0];
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateKey(date: Date) {
  return new Date(date).toISOString().split('T')[0];
}

function renderMetaCell(label: string, value: string, options?: { mono?: boolean }) {
  const mono = !!options?.mono;
  return `
    <td valign="top" style="padding:0 16px 12px 0;">
      <div style="font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">${label}</div>
      <div style="font-size:13px;line-height:1.65;color:#0f172a;${mono ? `font-family:'JetBrains Mono',Consolas,monospace;` : ''}">${value}</div>
    </td>
  `;
}

function renderMetaTable(cells: string[]) {
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const current = cells.slice(i, i + 2);
    while (current.length < 2) {
      current.push('<td valign="top" style="padding:0 16px 12px 0;"></td>');
    }
    rows.push(`<tr>${current.join('')}</tr>`);
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows.join('')}
    </table>
  `;
}

function renderItemHtml(item: DespesaEmailItem) {
  const metaCells = [
    renderMetaCell('Vencimento', escapeHtml(formatDate(item.data)), { mono: true }),
    renderMetaCell('Categoria', escapeHtml(item.categoria)),
  ];

  if (item.chavePix) {
    metaCells.push(renderMetaCell('Chave PIX', escapeHtml(item.chavePix), { mono: true }));
  }
  if (item.codigoBarras) {
    metaCells.push(renderMetaCell('Codigo de barras', escapeHtml(item.codigoBarras), { mono: true }));
  }

  return renderEmailPanel(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="padding:0 18px 14px 0;">
          ${renderEmailBadge(`Despesa #${escapeHtml(item.id)}`, { tone: 'neutral', mono: true })}
          <div style="font-size:19px;line-height:1.4;font-weight:700;color:#0f172a;margin:4px 0 0 0;">${escapeHtml(item.detalhes)}</div>
        </td>
        <td valign="top" width="210" style="padding:0;">
          <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:14px;padding:14px 16px;text-align:right;">
            <div style="font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#9a3412;margin-bottom:6px;">Valor</div>
            <div style="font-size:24px;line-height:1.2;font-weight:700;color:#b91c1c;">${escapeHtml(formatCurrency(item.valor))}</div>
          </div>
        </td>
      </tr>
    </table>
    <div style="padding-top:14px;margin-top:2px;border-top:1px solid #e2e8f0;">
      ${renderMetaTable(metaCells)}
    </div>
    ${item.observacao ? `
      <div style="margin-top:4px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
        <div style="font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Observacao</div>
        <div style="font-size:13px;line-height:1.7;color:#475569;">${escapeHtml(item.observacao)}</div>
      </div>
    ` : ''}
  `, { marginBottom: 14 });
}

function renderEmailHtml(items: DespesaEmailItem[]) {
  const blocks = items.map(renderItemHtml).join('');
  const total = items.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);

  return renderAlertEmailLayout({
    title: 'Despesas com vencimento no dia aguardando pagamento',
    subtitle: 'Revise os lancamentos abaixo e realize os pagamentos pendentes de hoje.',
    summaryHtml: [
      renderEmailMetricCard('Despesas pendentes', items.length, { tone: 'warning' }),
      renderEmailMetricCard('Total a pagar', escapeHtml(formatCurrency(total)), { tone: 'danger', align: 'right', minWidth: 180 }),
    ].join(''),
    contentHtml: blocks,
    maxWidth: 980,
  });
}

function renderEmailText(items: DespesaEmailItem[]) {
  return [
    'ALERTA ANB Parts - Despesas do Dia',
    'As despesas abaixo vencem hoje e ainda estao pendentes.',
    '',
    ...items.map((item) => {
      const lines = [
        `Despesa #${item.id}`,
        `Vencimento: ${formatDate(item.data)}`,
        `Detalhes: ${item.detalhes}`,
        `Categoria: ${item.categoria}`,
        `Valor: ${formatCurrency(item.valor)}`,
      ];
      if (item.chavePix) lines.push(`Chave PIX: ${item.chavePix}`);
      if (item.codigoBarras) lines.push(`Codigo de barras: ${item.codigoBarras}`);
      if (item.observacao) lines.push(`Observacao: ${item.observacao}`);
      return lines.join('\n');
    }),
  ].join('\n\n');
}

export async function sendDespesasDoDiaEmailIfNeeded(todayKey: string, timeZone = 'America/Sao_Paulo') {
  const config = await getConfiguracaoGeral();
  if (!config.despesasEmailConfigurado) {
    return { attempted: false, sent: false, skipped: true, reason: 'configuracao_incompleta' };
  }

  const rows = await prisma.despesa.findMany({
    where: { statusPagamento: 'pendente' },
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  });

  const items = rows
    .filter((row) => formatDateKey(row.data) === todayKey)
    .map((row) => ({
      id: row.id,
      data: row.data,
      detalhes: row.detalhes,
      categoria: row.categoria,
      valor: Number(row.valor) || 0,
      chavePix: row.chavePix,
      codigoBarras: row.codigoBarras,
      observacao: row.observacao,
    }));

  if (!items.length) {
    return { attempted: false, sent: false, skipped: true, reason: 'sem_despesas_do_dia' };
  }

  await sendResendEmail({
    apiKey: config.resendApiKey,
    from: config.emailRemetente,
    to: config.despesasEmailDestinatario,
    subject: buildDatedEmailSubject(config.despesasEmailTitulo, 'ALERTA ANB Parts - Despesas do Dia - Verifique'),
    html: renderEmailHtml(items),
    text: renderEmailText(items),
  });

  return { attempted: true, sent: true, skipped: false, total: items.length };
}
