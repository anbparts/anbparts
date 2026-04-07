import { prisma } from './prisma';

export const DEFAULT_RESEND_FROM = 'alertas@mail.anbparts.com.br';
export const DEFAULT_AUDITORIA_EMAIL_TITULO = 'ALERTA ANB Parts - Divergencia de Produtos / Anuncios - Verifique';
export const DEFAULT_DETRAN_EMAIL_TITULO = 'ALERTA ANB Parts - Baixa de Etiqueta DETRAN - Verifique';
export const DEFAULT_DESPESAS_EMAIL_TITULO = 'ALERTA ANB Parts - Despesas do Dia - Verifique';
export const DEFAULT_DESPESAS_EMAIL_HORARIO = '07:00';

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeEmailFrom(value: any) {
  return normalizeText(value) || DEFAULT_RESEND_FROM;
}

function normalizeHorario(value: any) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : DEFAULT_DESPESAS_EMAIL_HORARIO;
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
    despesasEmailAtivo: false,
    despesasEmailHorario: DEFAULT_DESPESAS_EMAIL_HORARIO,
    despesasEmailDestinatario: auditoriaEmailDestinatario,
    despesasEmailTitulo: DEFAULT_DESPESAS_EMAIL_TITULO,
    despesasEmailUltimaExecucaoChave: null,
    despesasEmailUltimaExecucaoEm: null,
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
    despesasEmailAtivo: !!config?.despesasEmailAtivo,
    despesasEmailHorario: normalizeHorario(config?.despesasEmailHorario),
    despesasEmailDestinatario: normalizeText(config?.despesasEmailDestinatario),
    despesasEmailTitulo: normalizeText(config?.despesasEmailTitulo) || DEFAULT_DESPESAS_EMAIL_TITULO,
    despesasEmailUltimaExecucaoChave: normalizeText(config?.despesasEmailUltimaExecucaoChave) || null,
    despesasEmailUltimaExecucaoEm: config?.despesasEmailUltimaExecucaoEm || null,
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
    despesasEmailConfigurado: !!(normalized.resendApiKey && normalized.emailRemetente && normalized.despesasEmailDestinatario && normalized.despesasEmailTitulo),
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
    despesasEmailAtivo: data.despesasEmailAtivo !== undefined ? !!data.despesasEmailAtivo : current.despesasEmailAtivo,
    despesasEmailHorario: data.despesasEmailHorario !== undefined ? normalizeHorario(data.despesasEmailHorario) : current.despesasEmailHorario,
    despesasEmailDestinatario: data.despesasEmailDestinatario !== undefined ? normalizeText(data.despesasEmailDestinatario) : current.despesasEmailDestinatario,
    despesasEmailTitulo: data.despesasEmailTitulo !== undefined ? (normalizeText(data.despesasEmailTitulo) || DEFAULT_DESPESAS_EMAIL_TITULO) : current.despesasEmailTitulo,
    despesasEmailUltimaExecucaoChave: data.despesasEmailUltimaExecucaoChave !== undefined
      ? (normalizeText(data.despesasEmailUltimaExecucaoChave) || null)
      : current.despesasEmailUltimaExecucaoChave,
    despesasEmailUltimaExecucaoEm: data.despesasEmailUltimaExecucaoEm !== undefined
      ? data.despesasEmailUltimaExecucaoEm
      : current.despesasEmailUltimaExecucaoEm,
  };

  return prisma.configuracaoGeral.update({
    where: { id: current.id },
    data: payload,
  });
}
