type SendResendEmailArgs = {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

type EmailTone = 'neutral' | 'danger' | 'success' | 'warning' | 'info';

type RenderAlertEmailLayoutArgs = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  summaryHtml?: string;
  contentHtml?: string;
  maxWidth?: number;
};

function normalizeSubject(value: any, fallback: string) {
  return String(value || '').trim() || fallback;
}

function formatSubjectDate(date: Date | string = new Date()) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  return parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getEmailTonePalette(tone: EmailTone) {
  switch (tone) {
    case 'danger':
      return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' };
    case 'success':
      return { bg: '#ecfdf3', border: '#86efac', text: '#166534' };
    case 'warning':
      return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' };
    case 'info':
      return { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' };
    default:
      return { bg: '#f8fafc', border: '#dbe3ef', text: '#0f172a' };
  }
}

export function renderAlertEmailLayout(args: RenderAlertEmailLayoutArgs) {
  const maxWidth = Math.max(680, Number(args.maxWidth) || 960);
  const eyebrow = String(args.eyebrow || 'ALERTA ANB Parts').trim() || 'ALERTA ANB Parts';
  const subtitle = String(args.subtitle || '').trim();
  const summaryHtml = String(args.summaryHtml || '').trim();
  const contentHtml = String(args.contentHtml || '').trim();

  return `
    <div style="background:#f3f6fb;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;margin:0 auto;border-collapse:collapse;">
              <tr>
                <td style="padding:0 0 18px 0;">
                  <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:20px;padding:24px 28px;box-shadow:0 1px 2px rgba(15,23,42,.04);">
                    <div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b91c1c;margin-bottom:10px;">${eyebrow}</div>
                    <div style="font-size:22px;line-height:1.35;font-weight:700;color:#0f172a;margin:0 0 8px 0;">${args.title}</div>
                    ${subtitle ? `<div style="font-size:14px;line-height:1.65;color:#475569;">${subtitle}</div>` : ''}
                    ${summaryHtml ? `<div style="padding-top:16px;margin-top:16px;border-top:1px solid #e2e8f0;">${summaryHtml}</div>` : ''}
                  </div>
                </td>
              </tr>
              ${contentHtml ? `<tr><td>${contentHtml}</td></tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

export function renderEmailPanel(
  contentHtml: string,
  options?: { accentColor?: string; marginBottom?: number; padding?: string },
) {
  const accentColor = String(options?.accentColor || '').trim();
  const marginBottom = Math.max(0, Number(options?.marginBottom) || 16);
  const padding = String(options?.padding || '20px 22px').trim() || '20px 22px';
  const accentStyle = accentColor ? `border-left:4px solid ${accentColor};` : '';

  return `
    <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:16px;padding:${padding};margin-bottom:${marginBottom}px;${accentStyle}box-shadow:0 1px 2px rgba(15,23,42,.03);">
      ${contentHtml}
    </div>
  `;
}

export function renderEmailMetricCard(
  label: string,
  value: any,
  options?: { tone?: EmailTone; align?: 'left' | 'right'; minWidth?: number },
) {
  const tone = getEmailTonePalette(options?.tone || 'neutral');
  const align = options?.align === 'right' ? 'right' : 'left';
  const minWidth = Math.max(120, Number(options?.minWidth) || 132);

  return `
    <div style="display:inline-block;vertical-align:top;min-width:${minWidth}px;background:${tone.bg};border:1px solid ${tone.border};border-radius:14px;padding:12px 14px;margin:0 10px 10px 0;text-align:${align};">
      <div style="font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">${label}</div>
      <div style="font-size:20px;line-height:1.2;font-weight:700;color:${tone.text};">${value}</div>
    </div>
  `;
}

export function renderEmailBadge(
  text: string,
  options?: { tone?: EmailTone; mono?: boolean },
) {
  const tone = getEmailTonePalette(options?.tone || 'neutral');
  const mono = !!options?.mono;
  return `
    <span style="display:inline-block;background:${tone.bg};border:1px solid ${tone.border};border-radius:999px;padding:5px 10px;font-size:11px;line-height:1.2;font-weight:700;color:${tone.text};margin:0 8px 8px 0;${mono ? `font-family:'JetBrains Mono',Consolas,monospace;` : ''}">
      ${text}
    </span>
  `;
}

export function renderEmailEmptyState(message: string, tone: EmailTone = 'success') {
  const palette = getEmailTonePalette(tone);
  return `
    <div style="background:${palette.bg};border:1px solid ${palette.border};border-radius:16px;padding:18px 20px;color:${palette.text};font-size:14px;font-weight:600;">
      ${message}
    </div>
  `;
}

export function buildDatedEmailSubject(title: any, fallback: string, date: Date | string = new Date()) {
  return `${normalizeSubject(title, fallback)} - ${formatSubjectDate(date)}`;
}

export function buildQuestionEmailSubject(title: any, fallback: string, questionIds: any[]) {
  const base = normalizeSubject(title, fallback);
  const ids = (Array.isArray(questionIds) ? questionIds : [questionIds])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (!ids.length) return base;
  return `${ids.map((id) => `#${id}`).join(', ')} - ${base}`;
}

export async function sendResendEmail(args: SendResendEmailArgs) {
  const apiKey = String(args.apiKey || '').trim();
  const from = String(args.from || '').trim();
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  const to = recipients.map((item) => String(item || '').trim()).filter(Boolean);
  const subject = String(args.subject || '').trim();

  if (!apiKey) throw new Error('API Key do Resend nao configurada');
  if (!from) throw new Error('Email remetente nao configurado');
  if (!to.length) throw new Error('Email destinatario nao configurado');
  if (!subject) throw new Error('Titulo do email nao configurado');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: args.html,
      text: args.text,
    }),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Resend ${response.status}`);
  }

  return payload;
}
