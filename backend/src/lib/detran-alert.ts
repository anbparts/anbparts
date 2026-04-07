import { getConfiguracaoGeral } from './configuracoes-gerais';
import { sendResendEmail } from './email';

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
  const rows = items.map((item) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:JetBrains Mono, monospace;font-size:12px;color:#0f172a;">${escapeHtml(item.idPeca)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${escapeHtml(item.descricao)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:JetBrains Mono, monospace;font-size:12px;color:#b91c1c;font-weight:700;">${escapeHtml(item.detranEtiqueta)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${escapeHtml(item.motoId ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${escapeHtml(item.moto || '-')}</td>
    </tr>
  `).join('');

  return `
    <div style="background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:1040px;margin:0 auto;">
        <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;padding:24px;margin-bottom:18px;">
          <div style="font-size:28px;font-weight:800;color:#dc2626;margin-bottom:8px;">ALERTA ANB Parts</div>
          <div style="font-size:16px;color:#334155;margin-bottom:8px;">Peças vendidas com etiqueta DETRAN pendente de baixa</div>
          <div style="font-size:13px;color:#64748b;">Revise e realize a baixa das etiquetas abaixo no DETRAN.</div>
        </div>
        <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:18px;padding:18px 20px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">SKU / ID Peça</th>
                <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">Produto</th>
                <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">Etiqueta DETRAN</th>
                <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">ID Moto</th>
                <th style="text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #dbe3ef;">Moto</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderDetranEmailText(items: DetranBaixaEmailItem[]) {
  return [
    'ALERTA ANB Parts - Baixa de Etiqueta DETRAN',
    'As peças abaixo foram vendidas e precisam de baixa de etiqueta no DETRAN.',
    '',
    ...items.map((item) => [
      `SKU / ID Peça: ${item.idPeca}`,
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
    subject: config.detranEmailTitulo,
    html: renderDetranEmailHtml(targets),
    text: renderDetranEmailText(targets),
  });

  return { attempted: true, sent: true, skipped: false, total: targets.length };
}
