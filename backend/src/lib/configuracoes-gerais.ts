import { prisma } from './prisma';

export const DEFAULT_RESEND_FROM = 'alertas@mail.anbparts.com.br';
export const DEFAULT_AUDITORIA_EMAIL_TITULO = 'ALERTA ANB Parts - Divergencia de Produtos / Anuncios - Verifique';
export const DEFAULT_DETRAN_EMAIL_TITULO = 'ALERTA ANB Parts - Baixa de Etiqueta DETRAN - Verifique';
export const DEFAULT_DESPESAS_EMAIL_TITULO = 'ALERTA ANB Parts - Despesas do Dia - Verifique';
export const DEFAULT_DESPESAS_EMAIL_HORARIO = '07:00';
export const DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO = 'ALERTA ANB Parts - Perguntas Mercado Livre - Verifique';
export const DEFAULT_NFE_TEXTO_EMAIL_TITULO = 'ANB Parts - Texto da NF-e necessario - Verifique';
export const DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN = 5;

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

export const DEFAULT_LIMPEZA_FOTOS_PECA_HORARIO = '03:00';
export const DEFAULT_LIMPEZA_FOTOS_PECA_DIAS = 30;

function normalizeHorarioLimpeza(value: any) {
  const text = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : DEFAULT_LIMPEZA_FOTOS_PECA_HORARIO;
}

function normalizeDiasLimpeza(value: any) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMPEZA_FOTOS_PECA_DIAS;
  return Math.max(1, Math.min(3650, n));
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
    nfeTextoEmailDestinatario: auditoriaEmailDestinatario,
    nfeTextoEmailTitulo: DEFAULT_NFE_TEXTO_EMAIL_TITULO,
    despesasEmailAtivo: false,
    despesasEmailHorario: DEFAULT_DESPESAS_EMAIL_HORARIO,
    despesasEmailDestinatario: auditoriaEmailDestinatario,
    despesasEmailTitulo: DEFAULT_DESPESAS_EMAIL_TITULO,
    despesasEmailUltimaExecucaoChave: null,
    despesasEmailUltimaExecucaoEm: null,
    mercadoLivrePerguntasAtivo: false,
    mercadoLivrePerguntasIntervaloMin: DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN,
    mercadoLivrePerguntasEmailDestinatario: auditoriaEmailDestinatario,
    mercadoLivrePerguntasEmailTitulo: DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
    mercadoLivrePerguntasUltimaLeituraEm: null,
    limpezaFotosPecaAtivo: false,
    limpezaFotosPecaHorario: DEFAULT_LIMPEZA_FOTOS_PECA_HORARIO,
    limpezaFotosPecaDias: DEFAULT_LIMPEZA_FOTOS_PECA_DIAS,
    limpezaFotosPecaUltimaExecucaoChave: null,
    limpezaFotosPecaUltimaExecucaoEm: null,
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
    nfeTextoEmailDestinatario: normalizeText(config?.nfeTextoEmailDestinatario),
    nfeTextoEmailTitulo: normalizeText(config?.nfeTextoEmailTitulo) || DEFAULT_NFE_TEXTO_EMAIL_TITULO,
    despesasEmailAtivo: !!config?.despesasEmailAtivo,
    despesasEmailHorario: normalizeHorario(config?.despesasEmailHorario),
    despesasEmailDestinatario: normalizeText(config?.despesasEmailDestinatario),
    despesasEmailTitulo: normalizeText(config?.despesasEmailTitulo) || DEFAULT_DESPESAS_EMAIL_TITULO,
    despesasEmailUltimaExecucaoChave: normalizeText(config?.despesasEmailUltimaExecucaoChave) || null,
    despesasEmailUltimaExecucaoEm: config?.despesasEmailUltimaExecucaoEm || null,
    mercadoLivrePerguntasAtivo: !!config?.mercadoLivrePerguntasAtivo,
    mercadoLivrePerguntasIntervaloMin: Math.max(1, Math.min(1440, Number(config?.mercadoLivrePerguntasIntervaloMin) || DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN)),
    mercadoLivrePerguntasEmailDestinatario: normalizeText(config?.mercadoLivrePerguntasEmailDestinatario),
    mercadoLivrePerguntasEmailTitulo: normalizeText(config?.mercadoLivrePerguntasEmailTitulo) || DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
    mercadoLivrePerguntasUltimaLeituraEm: config?.mercadoLivrePerguntasUltimaLeituraEm || null,
    limpezaFotosPecaAtivo: !!config?.limpezaFotosPecaAtivo,
    limpezaFotosPecaHorario: normalizeHorarioLimpeza(config?.limpezaFotosPecaHorario),
    limpezaFotosPecaDias: normalizeDiasLimpeza(config?.limpezaFotosPecaDias),
    limpezaFotosPecaUltimaExecucaoChave: normalizeText(config?.limpezaFotosPecaUltimaExecucaoChave) || null,
    limpezaFotosPecaUltimaExecucaoEm: config?.limpezaFotosPecaUltimaExecucaoEm || null,
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
    mercadoLivrePerguntasEmailConfigurado: !!(normalized.resendApiKey && normalized.emailRemetente && normalized.mercadoLivrePerguntasEmailDestinatario && normalized.mercadoLivrePerguntasEmailTitulo),
  };
}

export async function saveConfiguracaoGeral(data: Record<string, any>) {
  const current = await getConfiguracaoGeral();
  const horarioAtual = current.despesasEmailHorario;
  const proximoHorario = data.despesasEmailHorario !== undefined ? normalizeHorario(data.despesasEmailHorario) : horarioAtual;
  const resetDespesaExecucao = proximoHorario !== horarioAtual;
  const intervaloAtual = current.mercadoLivrePerguntasIntervaloMin;
  const proximoIntervalo = data.mercadoLivrePerguntasIntervaloMin !== undefined
    ? Math.max(1, Math.min(1440, Number(data.mercadoLivrePerguntasIntervaloMin) || DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN))
    : intervaloAtual;
  const resetMercadoLivreUltimaLeitura =
    proximoIntervalo !== intervaloAtual
    || (data.mercadoLivrePerguntasAtivo !== undefined && !!data.mercadoLivrePerguntasAtivo !== current.mercadoLivrePerguntasAtivo);
  const horarioLimpezaAtual = current.limpezaFotosPecaHorario;
  const proximoHorarioLimpeza = data.limpezaFotosPecaHorario !== undefined ? normalizeHorarioLimpeza(data.limpezaFotosPecaHorario) : horarioLimpezaAtual;
  const diasLimpezaAtual = current.limpezaFotosPecaDias;
  const proximoDiasLimpeza = data.limpezaFotosPecaDias !== undefined ? normalizeDiasLimpeza(data.limpezaFotosPecaDias) : diasLimpezaAtual;
  const resetLimpezaExecucao = proximoHorarioLimpeza !== horarioLimpezaAtual || proximoDiasLimpeza !== diasLimpezaAtual;
  const payload = {
    resendApiKey: data.resendApiKey !== undefined ? normalizeText(data.resendApiKey) : current.resendApiKey,
    emailRemetente: data.emailRemetente !== undefined ? normalizeEmailFrom(data.emailRemetente) : current.emailRemetente,
    auditoriaEmailDestinatario: data.auditoriaEmailDestinatario !== undefined ? normalizeText(data.auditoriaEmailDestinatario) : current.auditoriaEmailDestinatario,
    auditoriaEmailTitulo: data.auditoriaEmailTitulo !== undefined ? (normalizeText(data.auditoriaEmailTitulo) || DEFAULT_AUDITORIA_EMAIL_TITULO) : current.auditoriaEmailTitulo,
    detranEmailDestinatario: data.detranEmailDestinatario !== undefined ? normalizeText(data.detranEmailDestinatario) : current.detranEmailDestinatario,
    detranEmailTitulo: data.detranEmailTitulo !== undefined ? (normalizeText(data.detranEmailTitulo) || DEFAULT_DETRAN_EMAIL_TITULO) : current.detranEmailTitulo,
    nfeTextoEmailDestinatario: data.nfeTextoEmailDestinatario !== undefined ? normalizeText(data.nfeTextoEmailDestinatario) : current.nfeTextoEmailDestinatario,
    nfeTextoEmailTitulo: data.nfeTextoEmailTitulo !== undefined ? (normalizeText(data.nfeTextoEmailTitulo) || DEFAULT_NFE_TEXTO_EMAIL_TITULO) : current.nfeTextoEmailTitulo,
    despesasEmailAtivo: data.despesasEmailAtivo !== undefined ? !!data.despesasEmailAtivo : current.despesasEmailAtivo,
    despesasEmailHorario: proximoHorario,
    despesasEmailDestinatario: data.despesasEmailDestinatario !== undefined ? normalizeText(data.despesasEmailDestinatario) : current.despesasEmailDestinatario,
    despesasEmailTitulo: data.despesasEmailTitulo !== undefined ? (normalizeText(data.despesasEmailTitulo) || DEFAULT_DESPESAS_EMAIL_TITULO) : current.despesasEmailTitulo,
    despesasEmailUltimaExecucaoChave: data.despesasEmailUltimaExecucaoChave !== undefined
      ? (normalizeText(data.despesasEmailUltimaExecucaoChave) || null)
      : resetDespesaExecucao
        ? null
      : current.despesasEmailUltimaExecucaoChave,
    despesasEmailUltimaExecucaoEm: data.despesasEmailUltimaExecucaoEm !== undefined
      ? data.despesasEmailUltimaExecucaoEm
      : resetDespesaExecucao
        ? null
      : current.despesasEmailUltimaExecucaoEm,
    mercadoLivrePerguntasAtivo: data.mercadoLivrePerguntasAtivo !== undefined ? !!data.mercadoLivrePerguntasAtivo : current.mercadoLivrePerguntasAtivo,
    mercadoLivrePerguntasIntervaloMin: proximoIntervalo,
    mercadoLivrePerguntasEmailDestinatario: data.mercadoLivrePerguntasEmailDestinatario !== undefined
      ? normalizeText(data.mercadoLivrePerguntasEmailDestinatario)
      : current.mercadoLivrePerguntasEmailDestinatario,
    mercadoLivrePerguntasEmailTitulo: data.mercadoLivrePerguntasEmailTitulo !== undefined
      ? (normalizeText(data.mercadoLivrePerguntasEmailTitulo) || DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO)
      : current.mercadoLivrePerguntasEmailTitulo,
    mercadoLivrePerguntasUltimaLeituraEm: data.mercadoLivrePerguntasUltimaLeituraEm !== undefined
      ? data.mercadoLivrePerguntasUltimaLeituraEm
      : resetMercadoLivreUltimaLeitura
        ? null
        : current.mercadoLivrePerguntasUltimaLeituraEm,
    limpezaFotosPecaAtivo: data.limpezaFotosPecaAtivo !== undefined ? !!data.limpezaFotosPecaAtivo : current.limpezaFotosPecaAtivo,
    limpezaFotosPecaHorario: proximoHorarioLimpeza,
    limpezaFotosPecaDias: proximoDiasLimpeza,
    limpezaFotosPecaUltimaExecucaoChave: data.limpezaFotosPecaUltimaExecucaoChave !== undefined
      ? (normalizeText(data.limpezaFotosPecaUltimaExecucaoChave) || null)
      : resetLimpezaExecucao
        ? null
        : current.limpezaFotosPecaUltimaExecucaoChave,
    limpezaFotosPecaUltimaExecucaoEm: data.limpezaFotosPecaUltimaExecucaoEm !== undefined
      ? data.limpezaFotosPecaUltimaExecucaoEm
      : resetLimpezaExecucao
        ? null
        : current.limpezaFotosPecaUltimaExecucaoEm,
  };

  return prisma.configuracaoGeral.update({
    where: { id: current.id },
    data: payload,
  });
}
