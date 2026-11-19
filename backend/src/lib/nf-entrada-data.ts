// Data de emissao (AAAA-MM-DD) de uma nota fiscal de ENTRADA, consultada no Bling pelo numero.
// Usada na listagem de pendencias de ativacao de etiqueta avulsa (NF da compra da moto ou NF de entrada da devolucao).
// Devolve null se o Bling nao achar (ou estiver indisponivel); falhas ficam em cache curto pra nao martelar o Bling a cada abertura da tela.

const cache = new Map<string, { data: string | null; ts: number }>();
const TTL_ACHOU_MS = 24 * 60 * 60 * 1000;
const TTL_FALHOU_MS = 10 * 60 * 1000;

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function dataEmissaoNfEntrada(numeroBruto: unknown, refDia?: string | null): Promise<string | null> {
  const numero = String(numeroBruto ?? '').trim();
  if (!numero) return null;
  const ref = /^\d{4}-\d{2}-\d{2}/.test(String(refDia || '')) ? String(refDia).slice(0, 10) : dia(new Date());
  const chave = `${numero}|${ref}`;
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.ts < (hit.data ? TTL_ACHOU_MS : TTL_FALHOU_MS)) return hit.data;

  let data: string | null = null;
  try {
    const { blingReq } = await import('../routes/bling');
    const igual = (a: any) => {
      const x = String(a ?? '').trim();
      return x === numero || (/^\d+$/.test(x) && /^\d+$/.test(numero) && Number(x) === Number(numero));
    };
    const diaDe = (nota: any) => {
      const d = String(nota?.dataEmissao || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    };
    const escolher = (linhas: any[]) => {
      const achadas = linhas.filter((l) => igual(l?.numero));
      // prefere nota de entrada (tipo 0)
      return achadas.find((l) => Number(l?.tipo) === 0 && diaDe(l)) || achadas.find((l) => diaDe(l)) || null;
    };

    // 1) filtro direto por numero (nem sempre aceito pelo Bling)
    for (const filtro of [`numero=${encodeURIComponent(numero)}`, `numeroNota=${encodeURIComponent(numero)}`]) {
      try {
        const linhas = ((await blingReq(`/nfe?pagina=1&limite=20&${filtro}`)) as any)?.data || [];
        const nota = escolher(linhas);
        if (nota) { data = diaDe(nota); break; }
      } catch { /* tenta o proximo */ }
    }

    // 2) varredura por periodo: janelas crescentes ao redor da data de referencia (so entrada, depois qualquer tipo)
    if (!data) {
      const base = new Date(`${ref}T12:00:00Z`);
      const hoje = Date.now() + 86400000;
      const janelas: Array<[number, number]> = [[-120, 30], [-400, 30]];
      for (const [antes, depois] of janelas) {
        const ini = dia(new Date(base.getTime() + antes * 86400000));
        const fim = dia(new Date(Math.min(base.getTime() + depois * 86400000, hoje)));
        for (const tipo of ['&tipo=0', '']) {
          for (let pagina = 1; pagina <= 8 && !data; pagina++) {
            let linhas: any[] = [];
            try {
              linhas = ((await blingReq(`/nfe?pagina=${pagina}&limite=100${tipo}&dataEmissaoInicial=${encodeURIComponent(`${ini} 00:00:00`)}&dataEmissaoFinal=${encodeURIComponent(`${fim} 23:59:59`)}`)) as any)?.data || [];
            } catch { break; }
            const nota = escolher(linhas);
            if (nota) data = diaDe(nota);
            if (linhas.length < 100) break;
          }
          if (data) break;
        }
        if (data) break;
      }
    }
    if (!data) console.warn(`[nf-entrada-data] Bling nao retornou a data de emissao da NF ${numero}`);
  } catch (e: any) {
    console.warn(`[nf-entrada-data] falha ao consultar o Bling para a NF ${numero}: ${String(e?.message || e)}`);
  }
  cache.set(chave, { data, ts: Date.now() });
  return data;
}
