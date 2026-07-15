import { prisma } from './prisma';
import { sendDetranBaixaEmailIfNeeded, DetranBaixaEmailItem } from './detran-alert';

const TICK_MS = 60 * 1000; // avalia a cada minuto; o intervalo real é o intervaloMin configurado

export type DetranBaixaDigestConfig = {
  ativo: boolean;
  intervaloMin: number;
  ultimaExecucaoEm: Date | null;
};

export async function getDetranBaixaConfig(): Promise<DetranBaixaDigestConfig> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "ativo", "intervaloMin", "ultimaExecucaoEm" FROM "DetranBaixaConfig" WHERE "id" = 1
  `;
  if (!rows.length) {
    await prisma.$executeRaw`INSERT INTO "DetranBaixaConfig" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING`;
    return { ativo: false, intervaloMin: 20, ultimaExecucaoEm: null };
  }
  const r = rows[0];
  return {
    ativo: !!r.ativo,
    intervaloMin: Math.max(1, Math.min(1440, Number(r.intervaloMin) || 20)),
    ultimaExecucaoEm: r.ultimaExecucaoEm ? new Date(r.ultimaExecucaoEm) : null,
  };
}

export async function saveDetranBaixaConfig(data: Partial<DetranBaixaDigestConfig>) {
  const atual = await getDetranBaixaConfig();
  const ativo = data.ativo !== undefined ? !!data.ativo : atual.ativo;
  const intervaloMin = data.intervaloMin !== undefined
    ? Math.max(1, Math.min(1440, Number(data.intervaloMin) || 20)) : atual.intervaloMin;
  // Se mudou o intervalo ou (re)ativou, zera a última execução para rodar no próximo tick
  const reset = intervaloMin !== atual.intervaloMin || (ativo && !atual.ativo);
  await prisma.$executeRaw`
    INSERT INTO "DetranBaixaConfig" ("id", "ativo", "intervaloMin", "ultimaExecucaoEm")
    VALUES (1, ${ativo}, ${intervaloMin}, ${reset ? null : atual.ultimaExecucaoEm})
    ON CONFLICT ("id") DO UPDATE SET
      "ativo" = EXCLUDED."ativo",
      "intervaloMin" = EXCLUDED."intervaloMin",
      "ultimaExecucaoEm" = ${reset ? null : atual.ultimaExecucaoEm}
  `;
  return getDetranBaixaConfig();
}

function splitEtiquetas(value: unknown) {
  return String(value || '').split('/').map((s) => s.trim()).filter(Boolean);
}

type Pendente = DetranBaixaEmailItem & { chave: string };

// Peças vendidas com etiqueta DETRAN ainda NÃO baixada (mesma regra do pendencias-resumo).
async function scanPendentesBaixa(): Promise<Pendente[]> {
  const pecas = await prisma.peca.findMany({
    where: {
      detranEtiqueta: { not: null }, detranBaixada: false, disponivel: false, emPrejuizo: false,
      OR: [{ blingPedidoId: { not: null } }, { blingPedidoNum: { not: null } }],
    },
    select: {
      id: true, idPeca: true, descricao: true, detranEtiqueta: true, motoId: true,
      moto: { select: { marca: true, modelo: true } },
    },
  });

  // Status de baixa por etiqueta (tabela DetranEtiquetaBaixa; tolera não migrada)
  const ids = pecas.map((p) => p.id);
  const baixadas = new Set<string>();
  if (ids.length) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ pecaId: number; etiqueta: string }[]>(
        `SELECT "pecaId", "etiqueta" FROM "DetranEtiquetaBaixa" WHERE "pecaId" IN (${ids.join(',')})`,
      );
      for (const r of rows) baixadas.add(`${Number(r.pecaId)}|${String(r.etiqueta).trim()}`);
    } catch { /* tabela não migrada — usa só peca.detranBaixada (já filtrado acima) */ }
  }

  const pendentes: Pendente[] = [];
  for (const p of pecas) {
    for (const etq of splitEtiquetas(p.detranEtiqueta)) {
      if (baixadas.has(`${p.id}|${etq}`)) continue;
      pendentes.push({
        chave: `${p.id}|${etq}`,
        idPeca: p.idPeca,
        descricao: p.descricao,
        detranEtiqueta: etq,
        motoId: p.motoId,
        moto: p.moto ? `${p.moto.marca} ${p.moto.modelo}`.trim() : null,
      });
    }
  }
  return pendentes;
}

let running = false;

async function tick() {
  if (running) return;
  const cfg = await getDetranBaixaConfig();
  if (!cfg.ativo) return;

  const intervalMs = cfg.intervaloMin * 60 * 1000;
  if (cfg.ultimaExecucaoEm && Date.now() - cfg.ultimaExecucaoEm.getTime() < intervalMs) return;

  running = true;
  try {
    const pendentes = await scanPendentesBaixa();
    const chavesAtuais = pendentes.map((p) => p.chave);

    // Poda os já avisados que não estão mais pendentes (baixados/removidos) → se voltarem, avisam de novo.
    if (chavesAtuais.length) {
      await prisma.$executeRaw`DELETE FROM "DetranBaixaNotificado" WHERE "chave" <> ALL(${chavesAtuais})`;
    } else {
      await prisma.$executeRaw`DELETE FROM "DetranBaixaNotificado"`;
    }

    const jaAvisados = await prisma.$queryRaw<{ chave: string }[]>`SELECT "chave" FROM "DetranBaixaNotificado"`;
    const setAvisados = new Set(jaAvisados.map((r) => r.chave));
    const novos = pendentes.filter((p) => !setAvisados.has(p.chave));

    if (novos.length) {
      const resultado = await sendDetranBaixaEmailIfNeeded(novos.map(({ chave, ...item }) => item));
      if (resultado?.sent) {
        for (const p of novos) {
          await prisma.$executeRaw`
            INSERT INTO "DetranBaixaNotificado" ("chave", "notificadoEm")
            VALUES (${p.chave}, now())
            ON CONFLICT ("chave") DO UPDATE SET "notificadoEm" = now()
          `;
        }
        console.log(`[detran-baixa-digest] e-mail enviado com ${novos.length} etiqueta(s) nova(s)`);
      } else {
        console.log('[detran-baixa-digest] há pendências novas mas o e-mail não está configurado');
      }
    }

    await prisma.$executeRaw`UPDATE "DetranBaixaConfig" SET "ultimaExecucaoEm" = now() WHERE "id" = 1`;
  } finally {
    running = false;
  }
}

export function startDetranBaixaDigestScheduler() {
  setTimeout(() => { void tick().catch((e) => { console.error('[detran-baixa-digest] falha:', e); running = false; }); }, 20000);
  setInterval(() => { void tick().catch((e) => { console.error('[detran-baixa-digest] falha:', e); running = false; }); }, TICK_MS);
}
