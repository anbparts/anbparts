import { getConfiguracaoGeral } from './configuracoes-gerais';
import {
  buildDatedEmailSubject,
  renderAlertEmailLayout,
  renderEmailMetricCard,
  renderEmailPanel,
  sendResendEmail,
} from './email';

export type DetranBaixaEmailItem = {
  idPeca: string;
  descricao: string;
  detranEtiqueta: string;
  motoId: number | null;
  moto?: string | null;
};

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDetranEmailHtml(items: DetranBaixaEmailItem[]) {
  const motosAfetadas = new Set(items.map((item) => item.motoId).filter((item) => item !== null)).size;
  const rows = items.map((item) => `
    <tr>
      <td style="padding:12px 12px;border-bottom:1px solid #e2e8f0;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;color:#0f172a;">${escapeHtml(item.idPeca)}</td>
      <td style="padding:12px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#0f172a;">${escapeHtml(item.descricao)}</td>
      <td style="padding:12px 12px;border-bottom:1px solid #e2e8f0;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;font-weight:700;color:#b91c1c;">${escapeHtml(item.detranEtiqueta)}</td>
      <td style="padding:12px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${escapeHtml(item.motoId ?? '-')}</td>
      <td style="padding:12px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#475569;">${escapeHtml(item.moto || '-')}</td>
    </tr>
  `).join('');

  return renderAlertEmailLayout({
    title: 'Pecas vendidas com etiqueta DETRAN pendente de baixa',
    subtitle: 'Revise e realize a baixa das etiquetas abaixo no DETRAN.',
    summaryHtml: [
      renderEmailMetricCard('Etiquetas pendentes', items.length, { tone: 'danger' }),
      renderEmailMetricCard('Motos afetadas', motosAfetadas, { tone: 'warning' }),
    ].join(''),
    contentHtml: renderEmailPanel(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:0 12px 12px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">SKU / ID Peca</th>
            <th style="text-align:left;padding:0 12px 12px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">Produto</th>
            <th style="text-align:left;padding:0 12px 12px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">Etiqueta DETRAN</th>
            <th style="text-align:left;padding:0 12px 12px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">ID Moto</th>
            <th style="text-align:left;padding:0 12px 12px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">Moto</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `, { padding: '18px 18px 6px' }),
    maxWidth: 1040,
  });
}

function renderDetranEmailText(items: DetranBaixaEmailItem[]) {
  return [
    'ALERTA ANB Parts - Baixa de Etiqueta DETRAN',
    'As pecas abaixo foram vendidas e precisam de baixa de etiqueta no DETRAN.',
    '',
    ...items.map((item) => [
      `SKU / ID Peca: ${item.idPeca}`,
      `Produto: ${item.descricao}`,
      `Etiqueta DETRAN: ${item.detranEtiqueta}`,
      `ID Moto: ${item.motoId ?? '-'}`,
      item.moto ? `Moto: ${item.moto}` : '',
      '',
    ].filter(Boolean).join('\n')),
  ].join('\n');
}

export async function sendDetranBaixaEmailIfNeeded(items: DetranBaixaEmailItem[]) {
  const targets = items
    .map((item) => ({
      ...item,
      idPeca: String(item.idPeca || '').trim(),
      descricao: String(item.descricao || '').trim(),
      detranEtiqueta: String(item.detranEtiqueta || '').trim(),
      motoId: item.motoId ?? null,
      moto: item.moto ? String(item.moto).trim() : null,
    }))
    .filter((item) => item.idPeca && item.detranEtiqueta);

  if (!targets.length) {
    return { attempted: false, sent: false, skipped: true, reason: 'sem_etiqueta' };
  }

  const config = await getConfiguracaoGeral();
  if (!config.detranEmailConfigurado) {
    return { attempted: false, sent: false, skipped: true, reason: 'configuracao_incompleta' };
  }

  await sendResendEmail({
    apiKey: config.resendApiKey,
    from: config.emailRemetente,
    to: config.detranEmailDestinatario,
    subject: buildDatedEmailSubject(config.detranEmailTitulo, 'ALERTA ANB Parts - Baixa de Etiqueta DETRAN - Verifique'),
    html: renderDetranEmailHtml(targets),
    text: renderDetranEmailText(targets),
  });

  return { attempted: true, sent: true, skipped: false, total: targets.length };
}
