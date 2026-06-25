import { Router } from 'express';
import { z } from 'zod';
import {
  getWhatsappConfig,
  saveWhatsappConfig,
  listWhatsappTemplates,
  sendWhatsappTemplate,
} from '../lib/whatsapp';

export const confMetaRouter = Router();

// Pagina/rota restrita ao Bruno (admin). O token nunca e devolvido ao front.
function requireBruno(req: any, res: any) {
  const username = String(req.authUser?.username || '').trim().toLowerCase();
  if (username !== 'bruno') {
    res.status(403).json({ ok: false, error: 'Acesso permitido somente para o administrador.' });
    return false;
  }
  return true;
}

// GET /conf-meta — config atual (token mascarado: so um booleano "configurado").
confMetaRouter.get('/', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const cfg = await getWhatsappConfig();
    res.json({
      ok: true,
      whatsappTokenConfigured: !!cfg.token,
      whatsappPhoneNumberId: cfg.phoneNumberId,
      whatsappWabaId: cfg.wabaId,
      whatsappTemplateNome: cfg.templateNome,
      whatsappAtivo: cfg.ativo,
      whatsappFotosPendentesAtivo: cfg.fotosPendentesAtivo,
      whatsappFotosPendentesIntervaloHoras: cfg.fotosPendentesIntervaloHoras,
      whatsappFotosPendentesUltimaExecucaoEm: cfg.fotosPendentesUltimaEm,
    });
  } catch (e) {
    next(e);
  }
});

const saveSchema = z.object({
  whatsappToken: z.string().optional(),
  whatsappPhoneNumberId: z.string().optional().default(''),
  whatsappWabaId: z.string().optional().default(''),
  whatsappTemplateNome: z.string().optional().default(''),
  whatsappAtivo: z.boolean().optional().default(false),
  whatsappFotosPendentesAtivo: z.boolean().optional().default(false),
  whatsappFotosPendentesIntervaloHoras: z.number().optional().default(1),
});

// POST /conf-meta — salva (token so e gravado quando vem preenchido).
confMetaRouter.post('/', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const body = saveSchema.parse(req.body || {});
    await saveWhatsappConfig(body);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /conf-meta/templates — lista os templates da WABA direto na Meta.
confMetaRouter.get('/templates', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const cfg = await getWhatsappConfig();
    if (!cfg.token || !cfg.wabaId) {
      return res.status(400).json({ ok: false, error: 'Configure e salve o Token e o WABA ID antes de listar os templates.' });
    }
    const templates = await listWhatsappTemplates(cfg.token, cfg.wabaId);
    res.json({ ok: true, templates });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || 'Falha ao listar templates' });
  }
});

const testSchema = z.object({
  to: z.string().trim().min(8, 'Informe o numero do destinatario.'),
  templateNome: z.string().trim().min(1, 'Selecione um template.'),
  language: z.string().trim().min(2, 'Idioma do template invalido.'),
  variaveis: z.array(z.string()).optional().default([]),
});

// POST /conf-meta/testar — envia um template de teste pro destinatario informado.
confMetaRouter.post('/testar', async (req, res, next) => {
  try {
    if (!requireBruno(req, res)) return;
    const body = testSchema.parse(req.body || {});
    const cfg = await getWhatsappConfig();
    if (!cfg.token || !cfg.phoneNumberId) {
      return res.status(400).json({ ok: false, error: 'Configure e salve o Token e o Phone Number ID antes de testar.' });
    }
    const resultado = await sendWhatsappTemplate({
      token: cfg.token,
      phoneNumberId: cfg.phoneNumberId,
      to: body.to,
      templateNome: body.templateNome,
      language: body.language,
      variaveis: body.variaveis,
    });
    if (!resultado.ok) {
      return res.status(400).json({ ok: false, error: resultado.error, detalhe: resultado.detalhe });
    }
    res.json({ ok: true, id: resultado.id });
  } catch (e: any) {
    next(e);
  }
});
