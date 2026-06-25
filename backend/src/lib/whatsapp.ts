import { prisma } from './prisma';
import { getConfiguracaoGeral } from './configuracoes-gerais';

// Integracao com a API oficial da Meta (WhatsApp Cloud API).
// As credenciais ficam na tabela ConfiguracaoGeral (configuradas na pagina Conf. Meta).
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type WhatsappConfig = {
  id: number;
  token: string;
  phoneNumberId: string;
  wabaId: string;
  templateNome: string;
  ativo: boolean;
};

export type WhatsappTemplateInfo = {
  name: string;
  language: string;
  status: string;
  category: string;
  bodyText: string;
  varCount: number;
};

function txt(value: any) {
  return String(value ?? '').trim();
}

// Le as credenciais do WhatsApp da linha unica de ConfiguracaoGeral (garante que ela exista).
export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  const cfg = await getConfiguracaoGeral();
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "whatsappToken", "whatsappPhoneNumberId", "whatsappWabaId", "whatsappTemplateNome", "whatsappAtivo"
    FROM "ConfiguracaoGeral" WHERE "id" = ${cfg.id}
  `;
  const r = rows[0] || {};
  return {
    id: cfg.id,
    token: txt(r.whatsappToken),
    phoneNumberId: txt(r.whatsappPhoneNumberId),
    wabaId: txt(r.whatsappWabaId),
    templateNome: txt(r.whatsappTemplateNome),
    ativo: !!r.whatsappAtivo,
  };
}

// Salva as credenciais. O token so e atualizado quando um novo valor (nao vazio) e enviado.
export async function saveWhatsappConfig(data: {
  whatsappToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappWabaId?: string;
  whatsappTemplateNome?: string;
  whatsappAtivo?: boolean;
}) {
  const cfg = await getConfiguracaoGeral();
  await prisma.$executeRaw`
    UPDATE "ConfiguracaoGeral" SET
      "whatsappPhoneNumberId" = ${txt(data.whatsappPhoneNumberId)},
      "whatsappWabaId" = ${txt(data.whatsappWabaId)},
      "whatsappTemplateNome" = ${txt(data.whatsappTemplateNome)},
      "whatsappAtivo" = ${!!data.whatsappAtivo}
    WHERE "id" = ${cfg.id}
  `;
  const novoToken = txt(data.whatsappToken);
  if (novoToken) {
    await prisma.$executeRaw`
      UPDATE "ConfiguracaoGeral" SET "whatsappToken" = ${novoToken} WHERE "id" = ${cfg.id}
    `;
  }
}

// Lista os templates da conta (WABA) direto na Meta, ja com a contagem de variaveis do corpo.
export async function listWhatsappTemplates(token: string, wabaId: string): Promise<WhatsappTemplateInfo[]> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components&limit=200&access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url);
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Falha ao listar templates (${resp.status})`);
  }
  return (data?.data || []).map((t: any) => {
    const body = (t.components || []).find((c: any) => String(c.type).toUpperCase() === 'BODY');
    const bodyText = txt(body?.text);
    const varCount = (bodyText.match(/\{\{\s*\d+\s*\}\}/g) || []).length;
    return {
      name: txt(t.name),
      language: txt(t.language),
      status: txt(t.status),
      category: txt(t.category),
      bodyText,
      varCount,
    };
  });
}

// Envia uma mensagem de template via Cloud API. variaveis -> parametros do corpo, na ordem.
export async function sendWhatsappTemplate(params: {
  token: string;
  phoneNumberId: string;
  to: string;
  templateNome: string;
  language: string;
  variaveis?: string[];
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string; detalhe?: any }> {
  const to = txt(params.to).replace(/\D/g, '');
  const variaveis = (params.variaveis || []).map((v) => txt(v));
  const components = variaveis.length
    ? [{ type: 'body', parameters: variaveis.map((text) => ({ type: 'text', text })) }]
    : [];
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: params.templateNome,
      language: { code: params.language },
      ...(components.length ? { components } : {}),
    },
  };
  const resp = await fetch(`${GRAPH_BASE}/${encodeURIComponent(params.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: data?.error?.error_user_msg || data?.error?.message || `Falha ao enviar (${resp.status})`,
      detalhe: data?.error,
    };
  }
  return { ok: true, id: data?.messages?.[0]?.id || null };
}
