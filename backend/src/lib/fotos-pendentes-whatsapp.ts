import { prisma } from './prisma';
import { getWhatsappConfig, sendWhatsappTemplate, listWhatsappTemplates } from './whatsapp';
import { listarPastasPendentesTratamento } from './fotos-cadastro';

// Rotina que avisa por WhatsApp os SKUs com fotos pendentes de tratamento no Drive.
// Roda no intervalo configurado (Conf. Meta). Avisa cada SKU uma unica vez (tabela de controle).
const TICK_MS = 60 * 1000;
const TEMPLATE_LANGUAGE = 'pt_BR'; // idioma do template skus_pendentes_imagem
const NOTIFICATION_TYPE = 'fotos_pendentes_whatsapp';
// A Meta rejeita parametros de template com \n, tab ou 4+ espacos seguidos.
// Por isso a lista de SKUs e unida por " / " (nao por quebra de linha).
const SEPARADOR_SKUS = ' / ';
const state = { started: false, running: false };

// Monta o texto do alerta (cabecalho + corpo) substituindo as variaveis, para a prévia em tela.
function montarPreview(headerText: string, bodyText: string, qtd: string, lista: string) {
  const corpo = String(bodyText || '')
    .replace(/\{\{\s*1\s*\}\}/g, qtd)
    .replace(/\{\{\s*2\s*\}\}/g, lista)
    .replace(/\*([^*]+)\*/g, '$1'); // remove marcacao de negrito do template
  return (headerText ? `${headerText}\n\n` : '') + corpo;
}

// Roda apenas a varredura do Drive + monta a prévia da mensagem, SEM enviar nada. Para validacao.
export async function dryRunFotosPendentes() {
  const wa = await getWhatsappConfig();
  const pendentes = await listarPastasPendentesTratamento();

  const jaAvisados = await prisma.$queryRaw<{ sku: string }[]>`SELECT "sku" FROM "FotoPendenteNotificada"`;
  const avisadosSet = new Set(jaAvisados.map((r) => String(r.sku)));
  const novos = pendentes.filter((p) => p.sku && !avisadosSet.has(p.sku));

  const destinatarios = await getDestinatarios();

  const baseLista = novos.length ? novos : pendentes; // o que sairia agora (novos); se nada novo, mostra todos pra visualizar
  let previewTexto = '';
  let templateEncontrado = false;
  let templateStatus = '';
  if (wa.token && wa.wabaId && wa.templateNome) {
    try {
      const templates = await listWhatsappTemplates(wa.token, wa.wabaId);
      const tpl = templates.find((t) => t.name === wa.templateNome);
      if (tpl) {
        templateEncontrado = true;
        templateStatus = tpl.status;
        previewTexto = montarPreview(tpl.headerText, tpl.bodyText, String(baseLista.length), baseLista.map((p) => p.sku).join(SEPARADOR_SKUS));
      }
    } catch { /* sem prévia se a Meta falhar */ }
  }

  return {
    pendentes,
    novos: novos.map((p) => p.sku),
    destinatarios,
    templateNome: wa.templateNome,
    templateEncontrado,
    templateStatus,
    previewTexto,
    previewBaseadoEm: novos.length ? 'novos' : 'todos',
    rotinaAtiva: wa.fotosPendentesAtivo,
  };
}

// Destinatarios = usuarios ativos com a flag de notificacao ligada E telefone preenchido.
async function getDestinatarios(): Promise<{ nome: string; telefone: string }[]> {
  const settings = await (prisma as any).appUserNotificationSetting.findMany({
    where: { type: NOTIFICATION_TYPE, enabled: true },
    include: { user: true },
  });
  return settings
    .map((s: any) => s.user)
    .filter((u: any) => u && u.active && String(u.telefone || '').trim())
    .map((u: any) => ({ nome: String(u.displayName || u.username || ''), telefone: String(u.telefone).trim() }));
}

async function executarRotina() {
  const wa = await getWhatsappConfig();
  if (!wa.token || !wa.phoneNumberId || !wa.templateNome) {
    console.log('[fotos-pendentes-wa] credenciais/template incompletos — pulando.');
    return;
  }

  const pendentes = await listarPastasPendentesTratamento();
  if (!pendentes.length) return;

  // Dedup: remove os SKUs ja avisados.
  const jaAvisados = await prisma.$queryRaw<{ sku: string }[]>`SELECT "sku" FROM "FotoPendenteNotificada"`;
  const avisadosSet = new Set(jaAvisados.map((r) => String(r.sku)));
  const novos = pendentes.filter((p) => p.sku && !avisadosSet.has(p.sku));
  if (!novos.length) return;

  const destinatarios = await getDestinatarios();
  if (!destinatarios.length) {
    console.log(`[fotos-pendentes-wa] ${novos.length} SKU(s) novo(s), mas nenhum destinatario configurado (flag + telefone). Nao marca como avisado.`);
    return;
  }

  const lista = novos.map((p) => p.sku).join(SEPARADOR_SKUS);
  const qtd = String(novos.length);

  let algumSucesso = false;
  for (const dest of destinatarios) {
    const r = await sendWhatsappTemplate({
      token: wa.token,
      phoneNumberId: wa.phoneNumberId,
      to: dest.telefone,
      templateNome: wa.templateNome,
      language: TEMPLATE_LANGUAGE,
      variaveis: [qtd, lista],
    });
    if (r.ok) {
      algumSucesso = true;
      console.log(`[fotos-pendentes-wa] enviado para ${dest.nome} (${dest.telefone}) — ${novos.length} SKU(s).`);
    } else {
      console.error(`[fotos-pendentes-wa] falha ao enviar para ${dest.nome} (${dest.telefone}): ${r.error}`);
    }
  }

  // So marca como avisado se pelo menos um envio funcionou (senao tenta de novo no proximo ciclo).
  if (algumSucesso) {
    for (const p of novos) {
      await prisma.$executeRaw`
        INSERT INTO "FotoPendenteNotificada" ("sku", "notificadaEm")
        VALUES (${p.sku}, now())
        ON CONFLICT ("sku") DO NOTHING
      `;
    }
  }
}

async function tick() {
  if (state.running) return;
  try {
    const wa = await getWhatsappConfig();
    if (!wa.fotosPendentesAtivo) return;
    const intervaloMs = Math.max(1, wa.fotosPendentesIntervaloHoras) * 60 * 60 * 1000;
    const ultima = wa.fotosPendentesUltimaEm ? wa.fotosPendentesUltimaEm.getTime() : 0;
    if (Date.now() - ultima < intervaloMs) return;

    state.running = true;
    // Marca a execucao ANTES de processar (evita rodar de novo no mesmo ciclo).
    await prisma.$executeRaw`
      UPDATE "ConfiguracaoGeral" SET "whatsappFotosPendentesUltimaExecucaoEm" = now() WHERE "id" = ${wa.id}
    `;
    await executarRotina();
  } catch (e) {
    console.error('[fotos-pendentes-wa] erro no tick:', e);
  } finally {
    state.running = false;
  }
}

export function startFotosPendentesWhatsappScheduler() {
  if (state.started) return;
  state.started = true;
  setInterval(() => { void tick(); }, TICK_MS);
}
