import { prisma } from './prisma';
import { escanearFotosDrive } from './fotos-cadastro';
import { sendResendEmail, renderAlertEmailLayout, renderEmailPanel } from './email';
import { getConfiguracaoGeral, DEFAULT_RESEND_FROM } from './configuracoes-gerais';

const TICK_MS = 60 * 1000; // avalia a cada minuto; o intervalo real é o intervaloMin configurado
const DEFAULT_TITULO = 'ANB Parts - Fotos prontas no Drive - Processar';

export type FotosDriveAvisoConfig = {
  ativo: boolean;
  intervaloMin: number;
  emailDestinatario: string;
  emailTitulo: string;
  ultimaExecucaoEm: Date | null;
};

// Lê a config singleton (cria a linha padrão se não existir). Raw SQL: independe do client Prisma.
export async function getFotosDriveAvisoConfig(): Promise<FotosDriveAvisoConfig> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "ativo", "intervaloMin", "emailDestinatario", "emailTitulo", "ultimaExecucaoEm"
    FROM "FotosDrivePendenteConfig" WHERE "id" = 1
  `;
  if (!rows.length) {
    await prisma.$executeRaw`INSERT INTO "FotosDrivePendenteConfig" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING`;
    return { ativo: false, intervaloMin: 20, emailDestinatario: '', emailTitulo: DEFAULT_TITULO, ultimaExecucaoEm: null };
  }
  const r = rows[0];
  return {
    ativo: !!r.ativo,
    intervaloMin: Math.max(1, Math.min(1440, Number(r.intervaloMin) || 20)),
    emailDestinatario: String(r.emailDestinatario || ''),
    emailTitulo: String(r.emailTitulo || '') || DEFAULT_TITULO,
    ultimaExecucaoEm: r.ultimaExecucaoEm ? new Date(r.ultimaExecucaoEm) : null,
  };
}

export async function saveFotosDriveAvisoConfig(data: Partial<FotosDriveAvisoConfig>) {
  const atual = await getFotosDriveAvisoConfig();
  const ativo = data.ativo !== undefined ? !!data.ativo : atual.ativo;
  const intervaloMin = data.intervaloMin !== undefined
    ? Math.max(1, Math.min(1440, Number(data.intervaloMin) || 20)) : atual.intervaloMin;
  const emailDestinatario = data.emailDestinatario !== undefined ? String(data.emailDestinatario || '').trim() : atual.emailDestinatario;
  const emailTitulo = data.emailTitulo !== undefined ? (String(data.emailTitulo || '').trim() || DEFAULT_TITULO) : atual.emailTitulo;
  // Se mudou o intervalo ou (re)ativou, zera a última execução para rodar no próximo tick
  const reset = intervaloMin !== atual.intervaloMin || (ativo && !atual.ativo);
  await prisma.$executeRaw`
    INSERT INTO "FotosDrivePendenteConfig" ("id", "ativo", "intervaloMin", "emailDestinatario", "emailTitulo", "ultimaExecucaoEm")
    VALUES (1, ${ativo}, ${intervaloMin}, ${emailDestinatario}, ${emailTitulo}, ${reset ? null : atual.ultimaExecucaoEm})
    ON CONFLICT ("id") DO UPDATE SET
      "ativo" = EXCLUDED."ativo",
      "intervaloMin" = EXCLUDED."intervaloMin",
      "emailDestinatario" = EXCLUDED."emailDestinatario",
      "emailTitulo" = EXCLUDED."emailTitulo",
      "ultimaExecucaoEm" = ${reset ? null : atual.ultimaExecucaoEm}
  `;
  return getFotosDriveAvisoConfig();
}

function normSku(v: any) {
  return String(v || '').trim().toUpperCase();
}

function buildEmailHtml(itens: { sku: string; nome: string; fotos: number; zips: number }[]) {
  const linhas = itens.map((it) =>
    `<tr>
       <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;font-family:monospace;">${it.sku}</td>
       <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155;">${it.nome || '—'}</td>
       <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:right;white-space:nowrap;">${it.fotos} foto(s) · ${it.zips} zip</td>
     </tr>`
  ).join('');
  const tabela = `
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr>
          <th style="padding:8px 10px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">SKU</th>
          <th style="padding:8px 10px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Pasta</th>
          <th style="padding:8px 10px;text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Conteúdo</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
  return renderAlertEmailLayout({
    eyebrow: 'ANB Parts - Fotos Drive',
    title: 'Fotos prontas para processar no Drive',
    subtitle: `${itens.length} SKU(s) com fotos + zip prontos. Processe em Cadastro → Fotos Drive.`,
    contentHtml: renderEmailPanel(tabela, { accentColor: '#7c3aed' }),
  });
}

function buildEmailText(itens: { sku: string; nome: string; fotos: number; zips: number }[]) {
  return [
    `${itens.length} SKU(s) com fotos prontas no Drive (zip + fotos):`,
    '',
    ...itens.map((it) => `- ${it.sku} | ${it.nome || '—'} | ${it.fotos} foto(s), ${it.zips} zip`),
    '',
    'Processe em Cadastro → Fotos Drive.',
  ].join('\n');
}

let running = false;

async function tick() {
  if (running) return;
  const cfg = await getFotosDriveAvisoConfig();
  if (!cfg.ativo) return;

  const intervalMs = cfg.intervaloMin * 60 * 1000;
  if (cfg.ultimaExecucaoEm && Date.now() - cfg.ultimaExecucaoEm.getTime() < intervalMs) return;

  running = true;
  try {
    const scan = await escanearFotosDrive({});
    if (!scan.ok) return; // Drive indisponível/não configurado: não mexe nos avisos, tenta no próximo tick

    // SKUs atualmente prontos (dedup por SKU base)
    const atuais = new Map<string, { sku: string; nome: string; fotos: number; zips: number }>();
    for (const p of scan.pastas) {
      const sku = normSku(p.sku) || normSku(p.nome);
      if (!sku) continue;
      if (!atuais.has(sku)) atuais.set(sku, { sku, nome: p.nome || '', fotos: p.fotosForaPadrao || 0, zips: p.zips || 0 });
    }
    const skusAtuais = Array.from(atuais.keys());

    // Poda: remove dos "avisados" os SKUs que não estão mais no scan (foram processados/movidos).
    // Assim, se reaparecerem com fotos novas no futuro, avisam de novo.
    if (skusAtuais.length) {
      await prisma.$executeRaw`DELETE FROM "FotosDrivePendenteNotificado" WHERE "sku" <> ALL(${skusAtuais})`;
    } else {
      await prisma.$executeRaw`DELETE FROM "FotosDrivePendenteNotificado"`;
    }

    // Descobre quais ainda não foram avisados
    const jaAvisados = await prisma.$queryRaw<{ sku: string }[]>`SELECT "sku" FROM "FotosDrivePendenteNotificado"`;
    const setAvisados = new Set(jaAvisados.map((r) => normSku(r.sku)));
    const novos = skusAtuais.filter((sku) => !setAvisados.has(sku)).map((sku) => atuais.get(sku)!);

    if (novos.length) {
      const geral = await getConfiguracaoGeral();
      if (geral.resendApiKey && cfg.emailDestinatario) {
        await sendResendEmail({
          apiKey: geral.resendApiKey,
          from: geral.emailRemetente || DEFAULT_RESEND_FROM,
          to: cfg.emailDestinatario,
          subject: `${cfg.emailTitulo || DEFAULT_TITULO} (${novos.length} SKU${novos.length > 1 ? 's' : ''})`,
          html: buildEmailHtml(novos),
          text: buildEmailText(novos),
        });
        // Marca como avisados só depois do envio dar certo
        for (const it of novos) {
          await prisma.$executeRaw`
            INSERT INTO "FotosDrivePendenteNotificado" ("sku", "nomePasta", "notificadoEm")
            VALUES (${it.sku}, ${it.nome}, now())
            ON CONFLICT ("sku") DO UPDATE SET "nomePasta" = EXCLUDED."nomePasta", "notificadoEm" = now()
          `;
        }
        console.log(`[fotos-drive-aviso] e-mail enviado com ${novos.length} SKU(s) novo(s)`);
      } else {
        console.log('[fotos-drive-aviso] há SKUs novos mas o e-mail não está configurado (Resend/destinatário)');
      }
    }

    await prisma.$executeRaw`UPDATE "FotosDrivePendenteConfig" SET "ultimaExecucaoEm" = now() WHERE "id" = 1`;
  } finally {
    running = false;
  }
}

export function startFotosDrivePendentesScheduler() {
  setTimeout(() => { void tick().catch((e) => { console.error('[fotos-drive-aviso] falha:', e); running = false; }); }, 15000);
  setInterval(() => { void tick().catch((e) => { console.error('[fotos-drive-aviso] falha:', e); running = false; }); }, TICK_MS);
}
