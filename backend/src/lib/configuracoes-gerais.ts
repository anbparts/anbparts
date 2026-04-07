import { prisma } from './prisma';

export const DEFAULT_RESEND_FROM = 'alertas@mail.anbparts.com.br';
export const DEFAULT_AUDITORIA_EMAIL_TITULO = 'ALERTA ANB Parts - Divergência de Produtos / Anúncios - Verifique';
export const DEFAULT_DETRAN_EMAIL_TITULO = 'ALERTA ANB Parts - Baixa de Etiqueta DETRAN - Verifique';

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeEmailFrom(value: any) {
  return normalizeText(value) || DEFAULT_RESEND_FROM;
}

function buildGeneralConfigSeed(blingConfig: any) {
  const auditoriaEmailDestinatario = normalizeText(blingConfig?.auditoriaEmailDestinatario);

  return {
    resendApiKey: normalizeText(blingConfig?.auditoriaResendApiKey),
    emailRemetente: normalizeEmailFrom(blingConfig?.auditoriaResendFrom),
    auditoriaEmailDestinatario,
    auditoriaEmailTitulo: DEFAULT_AUDITORIA_EMAIL_TITULO,
    detranEmailDestinatario: auditoriaEmailDestinatario,
    detranEmailTitulo: DEFAULT_DETRAN_EMAIL_TITULO,
  };
}

export function getConfiguracaoGeralDefaults(config: any) {
  return {
    resendApiKey: normalizeText(config?.resendApiKey),
    emailRemetente: normalizeEmailFrom(config?.emailRemetente),
    auditoriaEmailDestinatario: normalizeText(config?.auditoriaEmailDestinatario),
    auditoriaEmailTitulo: normalizeText(config?.auditoriaEmailTitulo) || DEFAULT_AUDITORIA_EMAIL_TITULO,
    detranEmailDestinatario: normalizeText(config?.detranEmailDestinatario),
    detranEmailTitulo: normalizeText(config?.detranEmailTitulo) || DEFAULT_DETRAN_EMAIL_TITULO,
  };
}

export async function getConfiguracaoGeral() {
  let config = await prisma.configuracaoGeral.findFirst();
  if (!config) {
    const blingConfig = await prisma.blingConfig.findFirst();
    config = await prisma.configuracaoGeral.create({
      data: buildGeneralConfigSeed(blingConfig),
    });
  }

  const normalized = getConfiguracaoGeralDefaults(config);
  return {
    ...config,
    ...normalized,
    resendApiKeyConfigured: !!normalized.resendApiKey,
    auditoriaEmailConfigurado: !!(normalized.resendApiKey && normalized.emailRemetente && normalized.auditoriaEmailDestinatario && normalized.auditoriaEmailTitulo),
    detranEmailConfigurado: !!(normalized.resendApiKey && normalized.emailRemetente && normalized.detranEmailDestinatario && normalized.detranEmailTitulo),
  };
}

export async function saveConfiguracaoGeral(data: Record<string, any>) {
  const current = await getConfiguracaoGeral();
  const payload = {
    resendApiKey: data.resendApiKey !== undefined ? normalizeText(data.resendApiKey) : current.resendApiKey,
    emailRemetente: data.emailRemetente !== undefined ? normalizeEmailFrom(data.emailRemetente) : current.emailRemetente,
    auditoriaEmailDestinatario: data.auditoriaEmailDestinatario !== undefined ? normalizeText(data.auditoriaEmailDestinatario) : current.auditoriaEmailDestinatario,
    auditoriaEmailTitulo: data.auditoriaEmailTitulo !== undefined ? (normalizeText(data.auditoriaEmailTitulo) || DEFAULT_AUDITORIA_EMAIL_TITULO) : current.auditoriaEmailTitulo,
    detranEmailDestinatario: data.detranEmailDestinatario !== undefined ? normalizeText(data.detranEmailDestinatario) : current.detranEmailDestinatario,
    detranEmailTitulo: data.detranEmailTitulo !== undefined ? (normalizeText(data.detranEmailTitulo) || DEFAULT_DETRAN_EMAIL_TITULO) : current.detranEmailTitulo,
  };

  return prisma.configuracaoGeral.update({
    where: { id: current.id },
    data: payload,
  });
}
