import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getConfiguracaoGeral } from '../lib/configuracoes-gerais';

export const empresaRouter = Router();

const empresaPayloadSchema = z.object({
  razaoSocial: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  enderecoCompleto: z.string().optional().nullable(),
  telefoneWhats: z.string().optional().nullable(),
  anexos: z.record(z.any()).optional().default({}),
  removidos: z.array(z.string()).optional().default([]),
});

const EMPRESA_ANEXO_KEYS = [
  'cartaoCnpj',
  'contratoSocial',
  'detran',
  'cetesb',
  'inscricaoEstadual',
  'inscricaoMunicipal',
  'alvaraMunicipal',
  'avcb',
  'jucesp',
  'contratoAluguel',
] as const;

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeAttachment(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = normalizeText((value as any).name);
  const dataUrl = normalizeText((value as any).dataUrl);
  if (!name || !dataUrl.startsWith('data:')) return null;
  return { name, dataUrl };
}

function normalizeEmpresaAnexos(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const anexos: Record<string, { name: string; dataUrl: string }> = {};
  // Campos fixos
  for (const key of EMPRESA_ANEXO_KEYS) {
    const attachment = normalizeAttachment(source[key]);
    if (attachment) anexos[key] = attachment;
  }
  // Campos adicionais dinâmicos (extra_0, extra_1, ...)
  for (const key of Object.keys(source)) {
    if (/^extra_\d+$/.test(key)) {
      const attachment = normalizeAttachment(source[key]);
      if (attachment) anexos[key] = attachment;
    }
  }
  return anexos;
}

function buildEmpresaResponse(config: any) {
  const anexos = normalizeEmpresaAnexos(config?.empresaAnexos);
  return {
    ok: true,
    razaoSocial: normalizeText(config?.empresaRazaoSocial),
    cnpj: normalizeText(config?.empresaCnpj),
    enderecoCompleto: normalizeText(config?.empresaEnderecoCompleto),
    telefoneWhats: normalizeText(config?.empresaTelefoneWhats),
    anexos,
    totalAnexos: Object.keys(anexos).length,
  };
}

empresaRouter.get('/', async (_req, res, next) => {
  try {
    const config = await getConfiguracaoGeral();
    res.json(buildEmpresaResponse(config));
  } catch (e) {
    next(e);
  }
});

empresaRouter.post('/', async (req, res, next) => {
  try {
    const current = await getConfiguracaoGeral();
    const payload = empresaPayloadSchema.parse(req.body || {});
    const anexosAtuais = normalizeEmpresaAnexos(current?.empresaAnexos);
    const anexosAtualizados = normalizeEmpresaAnexos(payload.anexos);
    const removidos = Array.isArray(payload.removidos)
      ? payload.removidos.filter((key) => EMPRESA_ANEXO_KEYS.includes(key as typeof EMPRESA_ANEXO_KEYS[number]) || /^extra_\d+$/.test(key))
      : [];
    const anexos = {
      ...anexosAtuais,
      ...anexosAtualizados,
    } as Record<string, { name: string; dataUrl: string }>;

    for (const key of removidos) {
      delete anexos[key];
    }

    const updated = await prisma.configuracaoGeral.update({
      where: { id: current.id },
      data: {
        empresaRazaoSocial: normalizeText(payload.razaoSocial),
        empresaCnpj: normalizeText(payload.cnpj),
        empresaEnderecoCompleto: normalizeText(payload.enderecoCompleto),
        empresaTelefoneWhats: normalizeText(payload.telefoneWhats),
        empresaAnexos: anexos,
      },
    });

    res.json(buildEmpresaResponse(updated));
  } catch (e) {
    next(e);
  }
});
