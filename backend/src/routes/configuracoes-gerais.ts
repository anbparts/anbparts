import { Router } from 'express';
import {
  DEFAULT_AUDITORIA_EMAIL_TITULO,
  DEFAULT_DESPESAS_EMAIL_HORARIO,
  DEFAULT_DESPESAS_EMAIL_TITULO,
  DEFAULT_DETRAN_EMAIL_TITULO,
  DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
  DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN,
  DEFAULT_RESEND_FROM,
  getConfiguracaoGeral,
  saveConfiguracaoGeral,
} from '../lib/configuracoes-gerais';

export const configuracoesGeraisRouter = Router();

configuracoesGeraisRouter.get('/', async (_req, res, next) => {
  try {
    const config = await getConfiguracaoGeral();
    res.json({
      emailRemetente: config.emailRemetente || DEFAULT_RESEND_FROM,
      auditoriaEmailDestinatario: config.auditoriaEmailDestinatario || '',
      auditoriaEmailTitulo: config.auditoriaEmailTitulo || DEFAULT_AUDITORIA_EMAIL_TITULO,
      detranEmailDestinatario: config.detranEmailDestinatario || '',
      detranEmailTitulo: config.detranEmailTitulo || DEFAULT_DETRAN_EMAIL_TITULO,
      despesasEmailAtivo: !!config.despesasEmailAtivo,
      despesasEmailHorario: config.despesasEmailHorario || DEFAULT_DESPESAS_EMAIL_HORARIO,
      despesasEmailDestinatario: config.despesasEmailDestinatario || '',
      despesasEmailTitulo: config.despesasEmailTitulo || DEFAULT_DESPESAS_EMAIL_TITULO,
      mercadoLivrePerguntasAtivo: !!config.mercadoLivrePerguntasAtivo,
      mercadoLivrePerguntasIntervaloMin: Number(config.mercadoLivrePerguntasIntervaloMin || DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN),
      mercadoLivrePerguntasEmailDestinatario: config.mercadoLivrePerguntasEmailDestinatario || '',
      mercadoLivrePerguntasEmailTitulo: config.mercadoLivrePerguntasEmailTitulo || DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
      resendApiKeyConfigured: !!config.resendApiKey,
      auditoriaEmailConfigurado: !!config.auditoriaEmailConfigurado,
      detranEmailConfigurado: !!config.detranEmailConfigurado,
      despesasEmailConfigurado: !!config.despesasEmailConfigurado,
      mercadoLivrePerguntasEmailConfigurado: !!config.mercadoLivrePerguntasEmailConfigurado,
    });
  } catch (e) {
    next(e);
  }
});

configuracoesGeraisRouter.post('/', async (req, res, next) => {
  try {
    const payload: Record<string, any> = {
      emailRemetente: req.body?.emailRemetente,
      auditoriaEmailDestinatario: req.body?.auditoriaEmailDestinatario,
      auditoriaEmailTitulo: req.body?.auditoriaEmailTitulo,
      detranEmailDestinatario: req.body?.detranEmailDestinatario,
      detranEmailTitulo: req.body?.detranEmailTitulo,
      despesasEmailAtivo: req.body?.despesasEmailAtivo,
      despesasEmailHorario: req.body?.despesasEmailHorario,
      despesasEmailDestinatario: req.body?.despesasEmailDestinatario,
      despesasEmailTitulo: req.body?.despesasEmailTitulo,
      mercadoLivrePerguntasAtivo: req.body?.mercadoLivrePerguntasAtivo,
      mercadoLivrePerguntasIntervaloMin: req.body?.mercadoLivrePerguntasIntervaloMin,
      mercadoLivrePerguntasEmailDestinatario: req.body?.mercadoLivrePerguntasEmailDestinatario,
      mercadoLivrePerguntasEmailTitulo: req.body?.mercadoLivrePerguntasEmailTitulo,
    };

    const resendApiKey = String(req.body?.resendApiKey || '').trim();
    if (resendApiKey) {
      payload.resendApiKey = resendApiKey;
    }

    await saveConfiguracaoGeral(payload);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
