import { Router } from 'express';
import {
  DEFAULT_AUDITORIA_EMAIL_TITULO,
  DEFAULT_DETRAN_EMAIL_TITULO,
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
      resendApiKeyConfigured: !!config.resendApiKey,
      auditoriaEmailConfigurado: !!config.auditoriaEmailConfigurado,
      detranEmailConfigurado: !!config.detranEmailConfigurado,
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
