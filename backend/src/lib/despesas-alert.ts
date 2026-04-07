import { prisma } from './prisma';
import { getConfiguracaoGeral } from './configuracoes-gerais';
import { sendResendEmail } from './email';

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

function renderItemHtml(item: DespesaEmailItem) {
  return `
    <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;padding:18px 20px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Despesa #${escapeHtml(item.id)}</div>
          <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(item.detalhes)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Valor</div>
          <div style="font-size:20px;font-weight:800;color:#dc2626;margin-top:4px;">${escapeHtml(formatCurrency(item.valor))}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        <div><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Vencimento</div><div style="font-size:13px;color:#0f172a;margin-top:4px;">${escapeHtml(formatDate(item.data))}</div></div>
        <div><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Categoria</div><div style="font-size:13px;color:#0f172a;margin-top:4px;">${escapeHtml(item.categoria)}</div></div>
        ${item.chavePix ? `<div><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Chave PIX</div><div style="font-size:13px;color:#0f172a;margin-top:4px;">${escapeHtml(item.chavePix)}</div></div>` : ''}
        ${item.codigoBarras ? `<div><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Codigo de barras</div><div style="font-size:13px;color:#0f172a;margin-top:4px;">${escapeHtml(item.codigoBarras)}</div></div>` : ''}
      </div>
      ${item.observacao ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Observacao</div><div style="font-size:13px;color:#475569;margin-top:4px;">${escapeHtml(item.observacao)}</div></div>` : ''}
    </div>
  `;
}

function renderEmailHtml(items: DespesaEmailItem[]) {
  const blocks = items.map(renderItemHtml).join('');
  return `
    <div style="background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:1080px;margin:0 auto;">
        <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;padding:24px;margin-bottom:18px;">
          <div style="font-size:28px;font-weight:800;color:#dc2626;margin-bottom:8px;">ALERTA ANB Parts</div>
          <div style="font-size:16px;color:#334155;margin-bottom:8px;">Despesas com vencimento no dia aguardando pagamento</div>
          <div style="font-size:13px;color:#64748b;">Revise os lancamentos abaixo e realize os pagamentos pendentes de hoje.</div>
        </div>
        ${blocks}
      </div>
    </div>
  `;
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
    subject: config.despesasEmailTitulo,
    html: renderEmailHtml(items),
    text: renderEmailText(items),
  });

  return { attempted: true, sent: true, skipped: false, total: items.length };
}
