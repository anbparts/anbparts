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
      nfeTextoEmailDestinatario: config.nfeTextoEmailDestinatario || '',
      nfeTextoEmailTitulo: config.nfeTextoEmailTitulo || '',
      despesasEmailAtivo: !!config.despesasEmailAtivo,
      despesasEmailHorario: config.despesasEmailHorario || DEFAULT_DESPESAS_EMAIL_HORARIO,
      despesasEmailDestinatario: config.despesasEmailDestinatario || '',
      despesasEmailTitulo: config.despesasEmailTitulo || DEFAULT_DESPESAS_EMAIL_TITULO,
      mercadoLivrePerguntasAtivo: !!config.mercadoLivrePerguntasAtivo,
      mercadoLivrePerguntasIntervaloMin: Number(config.mercadoLivrePerguntasIntervaloMin || DEFAULT_MERCADO_LIVRE_PERGUNTAS_INTERVALO_MIN),
      mercadoLivrePerguntasEmailDestinatario: config.mercadoLivrePerguntasEmailDestinatario || '',
      mercadoLivrePerguntasEmailTitulo: config.mercadoLivrePerguntasEmailTitulo || DEFAULT_MERCADO_LIVRE_PERGUNTAS_EMAIL_TITULO,
      limpezaFotosPecaAtivo: !!config.limpezaFotosPecaAtivo,
      limpezaFotosPecaHorario: config.limpezaFotosPecaHorario || '03:00',
      limpezaFotosPecaDias: Number(config.limpezaFotosPecaDias || 30),
      limpezaFotosPecaUltimaExecucaoEm: config.limpezaFotosPecaUltimaExecucaoEm || null,
      resendApiKeyConfigured: !!config.resendApiKey,
      auditoriaEmailConfigurado: !!config.auditoriaEmailConfigurado,
      detranEmailConfigurado: !!config.detranEmailConfigurado,
      nfeTextoEmailConfigurado: !!config.nfeTextoEmailConfigurado,
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
      nfeTextoEmailDestinatario: req.body?.nfeTextoEmailDestinatario,
      nfeTextoEmailTitulo: req.body?.nfeTextoEmailTitulo,
      despesasEmailAtivo: req.body?.despesasEmailAtivo,
      despesasEmailHorario: req.body?.despesasEmailHorario,
      despesasEmailDestinatario: req.body?.despesasEmailDestinatario,
      despesasEmailTitulo: req.body?.despesasEmailTitulo,
      mercadoLivrePerguntasAtivo: req.body?.mercadoLivrePerguntasAtivo,
      mercadoLivrePerguntasIntervaloMin: req.body?.mercadoLivrePerguntasIntervaloMin,
      mercadoLivrePerguntasEmailDestinatario: req.body?.mercadoLivrePerguntasEmailDestinatario,
      mercadoLivrePerguntasEmailTitulo: req.body?.mercadoLivrePerguntasEmailTitulo,
      limpezaFotosPecaAtivo: req.body?.limpezaFotosPecaAtivo,
      limpezaFotosPecaHorario: req.body?.limpezaFotosPecaHorario,
      limpezaFotosPecaDias: req.body?.limpezaFotosPecaDias,
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
