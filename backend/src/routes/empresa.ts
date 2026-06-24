import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { getConfiguracaoGeral } from '../lib/configuracoes-gerais';

export const empresaRouter = Router();

const contaBancariaSchema = z.object({
  banco:    z.string().default(''),
  agencia:  z.string().default(''),
  conta:    z.string().default(''),
  cnpj:     z.string().default(''),
  titular:  z.string().default(''),
});

const empresaPayloadSchema = z.object({
  razaoSocial: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  inscricaoEstadual: z.string().optional().nullable(),
  inscricaoMunicipal: z.string().optional().nullable(),
  enderecoCompleto: z.string().optional().nullable(),
  telefoneWhats: z.string().optional().nullable(),
  contasBancarias: z.array(contaBancariaSchema).optional().default([]),
  anexos: z.record(z.any()).optional().default({}),
  removidos: z.array(z.string()).optional().default([]),
});

const EMPRESA_DADOS_KEY          = '__dadosEmpresa';
const EMPRESA_BANCARIOS_KEY      = '__dadosBancarios';

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

function normalizeContasBancarias(value: unknown): Array<{ banco: string; agencia: string; conta: string; cnpj: string; titular: string }> {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const raw = source[EMPRESA_BANCARIOS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => ({
    banco:   normalizeText(item?.banco),
    agencia: normalizeText(item?.agencia),
    conta:   normalizeText(item?.conta),
    cnpj:    normalizeText(item?.cnpj),
    titular: normalizeText(item?.titular),
  }));
}

function normalizeEmpresaDadosExtras(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const dados = source[EMPRESA_DADOS_KEY];
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return { inscricaoEstadual: '', inscricaoMunicipal: '' };
  }
  return {
    inscricaoEstadual: normalizeText((dados as any).inscricaoEstadual),
    inscricaoMunicipal: normalizeText((dados as any).inscricaoMunicipal),
  };
}

// Carrega só os NOMES dos anexos da tabela dedicada (sem o base64 — leve).
async function loadEmpresaAnexosNomes(): Promise<Record<string, { name: string }>> {
  const rows = await prisma.$queryRaw<{ chave: string; nome: string }[]>`
    SELECT "chave", "nome" FROM "EmpresaAnexo"
  `;
  const anexos: Record<string, { name: string }> = {};
  for (const row of rows) {
    const key = String(row.chave);
    if (EMPRESA_ANEXO_KEYS.includes(key as typeof EMPRESA_ANEXO_KEYS[number]) || /^extra_\d+$/.test(key)) {
      anexos[key] = { name: String(row.nome) };
    }
  }
  return anexos;
}

function buildEmpresaResponse(config: any, anexos: Record<string, { name: string }>) {
  const dadosExtras = normalizeEmpresaDadosExtras(config?.empresaAnexos);
  const contasBancarias = normalizeContasBancarias(config?.empresaAnexos);
  const responseAnexos = Object.fromEntries(
    Object.entries(anexos).map(([key, attachment]) => [key, { name: attachment.name }]),
  );
  return {
    ok: true,
    razaoSocial: normalizeText(config?.empresaRazaoSocial),
    cnpj: normalizeText(config?.empresaCnpj),
    inscricaoEstadual: dadosExtras.inscricaoEstadual,
    inscricaoMunicipal: dadosExtras.inscricaoMunicipal,
    enderecoCompleto: normalizeText(config?.empresaEnderecoCompleto),
    telefoneWhats: normalizeText(config?.empresaTelefoneWhats),
    contasBancarias,
    anexos: responseAnexos,
    totalAnexos: Object.keys(anexos).length,
  };
}

empresaRouter.get('/', async (_req, res, next) => {
  try {
    const config = await getConfiguracaoGeral();
    const anexos = await loadEmpresaAnexosNomes();
    res.json(buildEmpresaResponse(config, anexos));
  } catch (e) {
    next(e);
  }
});

empresaRouter.get('/anexos/:key', async (req, res, next) => {
  try {
    const key = normalizeText(req.params.key);
    const isAllowedKey = EMPRESA_ANEXO_KEYS.includes(key as typeof EMPRESA_ANEXO_KEYS[number]) || /^extra_\d+$/.test(key);
    if (!isAllowedKey) return res.status(400).json({ error: 'Anexo invalido' });

    const rows = await prisma.$queryRaw<{ nome: string; arquivo: string }[]>`
      SELECT "nome", "arquivo" FROM "EmpresaAnexo" WHERE "chave" = ${key}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Anexo nao encontrado' });

    res.json({ ok: true, key, name: rows[0].nome, dataUrl: rows[0].arquivo });
  } catch (e) {
    next(e);
  }
});

empresaRouter.post('/', async (req, res, next) => {
  try {
    const current = await getConfiguracaoGeral();
    const payload = empresaPayloadSchema.parse(req.body || {});
    const anexosAtualizados = normalizeEmpresaAnexos(payload.anexos);
    const removidos = Array.isArray(payload.removidos)
      ? payload.removidos.filter((key) => EMPRESA_ANEXO_KEYS.includes(key as typeof EMPRESA_ANEXO_KEYS[number]) || /^extra_\d+$/.test(key))
      : [];

    // Upsert dos anexos enviados (cada um na sua linha) — só os que vieram com arquivo novo.
    for (const [key, attachment] of Object.entries(anexosAtualizados)) {
      await prisma.$executeRaw`
        INSERT INTO "EmpresaAnexo" ("chave", "nome", "arquivo", "updatedAt")
        VALUES (${key}, ${attachment.name}, ${attachment.dataUrl}, now())
        ON CONFLICT ("chave") DO UPDATE
          SET "nome" = EXCLUDED."nome", "arquivo" = EXCLUDED."arquivo", "updatedAt" = now()
      `;
    }
    // Remove os anexos marcados.
    for (const key of removidos) {
      await prisma.$executeRaw`DELETE FROM "EmpresaAnexo" WHERE "chave" = ${key}`;
    }

    const dadosExtras = {
      inscricaoEstadual: normalizeText(payload.inscricaoEstadual),
      inscricaoMunicipal: normalizeText(payload.inscricaoMunicipal),
    };

    const dadosBancarios = (payload.contasBancarias || []).map((c) => ({
      banco:   normalizeText(c.banco),
      agencia: normalizeText(c.agencia),
      conta:   normalizeText(c.conta),
      cnpj:    normalizeText(c.cnpj),
      titular: normalizeText(c.titular),
    }));

    // empresaAnexos guarda APENAS os metadados pequenos (sem base64) — os documentos vão pra EmpresaAnexo.
    const updated = await prisma.configuracaoGeral.update({
      where: { id: current.id },
      data: {
        empresaRazaoSocial: normalizeText(payload.razaoSocial),
        empresaCnpj: normalizeText(payload.cnpj),
        empresaEnderecoCompleto: normalizeText(payload.enderecoCompleto),
        empresaTelefoneWhats: normalizeText(payload.telefoneWhats),
        empresaAnexos: {
          [EMPRESA_DADOS_KEY]:     dadosExtras,
          [EMPRESA_BANCARIOS_KEY]: dadosBancarios,
        },
      },
    });

    const anexos = await loadEmpresaAnexosNomes();
    res.json(buildEmpresaResponse(updated, anexos));
  } catch (e) {
    next(e);
  }
});
