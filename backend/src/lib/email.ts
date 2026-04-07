type SendResendEmailArgs = {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
};

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
