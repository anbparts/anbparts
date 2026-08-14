import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const confSeparacaoRouter = Router();

// GET /conf-separacao — lista as transportadoras com suas observacoes, ja ordenadas.
confSeparacaoRouter.get('/', async (_req, res, next) => {
  try {
    const transportadoras = await prisma.$queryRaw<{ id: number; nome: string; ordem: number }[]>`
      SELECT "id", "nome", "ordem" FROM "Transportadora" ORDER BY "ordem" ASC, "nome" ASC
    `;
    const observacoes = await prisma.$queryRaw<{ id: number; transportadoraId: number; texto: string; ordem: number }[]>`
      SELECT "id", "transportadoraId", "texto", "ordem" FROM "TransportadoraObservacao" ORDER BY "ordem" ASC, "id" ASC
    `;
    const porTransportadora = new Map<number, { id: number; texto: string }[]>();
    for (const o of observacoes) {
      if (!porTransportadora.has(o.transportadoraId)) porTransportadora.set(o.transportadoraId, []);
      porTransportadora.get(o.transportadoraId)!.push({ id: o.id, texto: o.texto });
    }
    const resultado = transportadoras.map((t) => ({ id: t.id, nome: t.nome, observacoes: porTransportadora.get(t.id) || [] }));
    res.json({ ok: true, transportadoras: resultado });
  } catch (e) { next(e); }
});

const nomeSchema = z.object({ nome: z.string().trim().min(1).max(120) });

// POST /conf-separacao — cria uma nova transportadora.
confSeparacaoRouter.post('/', async (req, res, next) => {
  try {
    const body = nomeSchema.parse(req.body || {});
    const existente = await prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Transportadora" WHERE lower("nome") = lower(${body.nome})
    `;
    if (existente.length) return res.status(409).json({ ok: false, error: 'Já existe uma transportadora com esse nome.' });

    const maxOrdemRows = await prisma.$queryRaw<{ max: number | null }[]>`SELECT max("ordem") as max FROM "Transportadora"`;
    const proximaOrdem = (maxOrdemRows[0]?.max ?? -1) + 1;

    const criada = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO "Transportadora" ("nome", "ordem", "createdAt", "updatedAt")
      VALUES (${body.nome}, ${proximaOrdem}, now(), now())
      RETURNING "id"
    `;
    res.status(201).json({ ok: true, id: criada[0].id });
  } catch (e) { next(e); }
});

// PUT /conf-separacao/:id — renomeia uma transportadora.
confSeparacaoRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'id inválido' });
    const body = nomeSchema.parse(req.body || {});

    const existente = await prisma.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "Transportadora" WHERE lower("nome") = lower(${body.nome}) AND "id" != ${id}
    `;
    if (existente.length) return res.status(409).json({ ok: false, error: 'Já existe uma transportadora com esse nome.' });

    await prisma.$executeRaw`
      UPDATE "Transportadora" SET "nome" = ${body.nome}, "updatedAt" = now() WHERE "id" = ${id}
    `;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /conf-separacao/:id — remove a transportadora e suas observacoes (cascade).
confSeparacaoRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'id inválido' });
    await prisma.$executeRaw`DELETE FROM "Transportadora" WHERE "id" = ${id}`;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const textoSchema = z.object({ texto: z.string().trim().min(1) });

// POST /conf-separacao/:id/observacoes — adiciona um texto de observação pra uma transportadora.
confSeparacaoRouter.post('/:id/observacoes', async (req, res, next) => {
  try {
    const transportadoraId = Number(req.params.id);
    if (!Number.isFinite(transportadoraId) || transportadoraId <= 0) return res.status(400).json({ ok: false, error: 'id inválido' });
    const body = textoSchema.parse(req.body || {});

    const maxOrdemRows = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT max("ordem") as max FROM "TransportadoraObservacao" WHERE "transportadoraId" = ${transportadoraId}
    `;
    const proximaOrdem = (maxOrdemRows[0]?.max ?? -1) + 1;

    const criada = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO "TransportadoraObservacao" ("transportadoraId", "texto", "ordem", "createdAt", "updatedAt")
      VALUES (${transportadoraId}, ${body.texto}, ${proximaOrdem}, now(), now())
      RETURNING "id"
    `;
    res.status(201).json({ ok: true, id: criada[0].id });
  } catch (e) { next(e); }
});

// PUT /conf-separacao/observacoes/:obsId — edita um texto de observação.
confSeparacaoRouter.put('/observacoes/:obsId', async (req, res, next) => {
  try {
    const obsId = Number(req.params.obsId);
    if (!Number.isFinite(obsId) || obsId <= 0) return res.status(400).json({ ok: false, error: 'id inválido' });
    const body = textoSchema.parse(req.body || {});
    await prisma.$executeRaw`
      UPDATE "TransportadoraObservacao" SET "texto" = ${body.texto}, "updatedAt" = now() WHERE "id" = ${obsId}
    `;
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /conf-separacao/observacoes/:obsId — remove um texto de observação.
confSeparacaoRouter.delete('/observacoes/:obsId', async (req, res, next) => {
  try {
    const obsId = Number(req.params.obsId);
    if (!Number.isFinite(obsId) || obsId <= 0) return res.status(400).json({ ok: false, error: 'id inválido' });
    await prisma.$executeRaw`DELETE FROM "TransportadoraObservacao" WHERE "id" = ${obsId}`;
    res.json({ ok: true });
  } catch (e) { next(e); }
});
