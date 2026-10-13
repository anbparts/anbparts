// Cadastro de fornecedores (aba "Fornecedores" da pagina Empresa). Tabelas criadas sob demanda (sem migration):
//   "Fornecedor"        — um registro por fornecedor, com endereco completo.
//   "FornecedorInsumo"  — opcoes de "Insumo / Servico" criadas direto no cadastro (alem das ja usadas pelos fornecedores).
// Na primeira vez os 11 fornecedores da planilha antiga sao cadastrados (marcador "__seed__" na tabela de opcoes).
import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const fornecedoresRouter = Router();

const txt = (v: any) => String(v ?? '').trim();

let tabelasProntas: Promise<void> | null = null;
function garantirTabelas(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Fornecedor" (
        "id" SERIAL PRIMARY KEY,
        "empresa" TEXT NOT NULL,
        "cnpj" TEXT,
        "insumoServico" TEXT,
        "contato" TEXT,
        "telefones" TEXT NOT NULL DEFAULT '[]',
        "email" TEXT,
        "cep" TEXT,
        "logradouro" TEXT,
        "numero" TEXT,
        "complemento" TEXT,
        "bairroRegiao" TEXT,
        "cidade" TEXT,
        "uf" TEXT NOT NULL DEFAULT 'SP',
        "observacao" TEXT,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FornecedorInsumo" ("nome" TEXT PRIMARY KEY)`);

      const jaSemeado = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "FornecedorInsumo" WHERE "nome" = '__seed__'`);
      if (!jaSemeado.length) {
        const total = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "Fornecedor"`);
        if (!Number(total[0]?.n)) {
          // [empresa, telefone, contato, insumo/servico, bairro/regiao, cidade, observacao]
          const SEED: Array<[string, string, string, string, string, string, string]> = [
            ['Formosa Plastic - Caixas', '11 97800-3333', 'Márcia', 'Caixas de Armazenagem', 'Zona Leste', 'São Paulo', ''],
            ['Lalamove - Luiz', '11 97077-5424', 'Luiz', 'Transportes de SP para Jundiaí', 'Zona Leste', 'São Paulo', ''],
            ['Eletricista', '11 97491-6888', 'Clésio Brito', 'Eletricista', '', 'Jundiaí', ''],
            ['Sucata', '11 99205-9792', 'Maria Peixoto', 'Compra de Sucata', '', 'Jundiaí', 'NÃO TEM CNPJ'],
            ['Creeart Estamparia', '11 96189-3284', '', 'Estamparia de Camisetas', '', 'Jundiaí', ''],
            ['TMZ299 Mototransporte', '11 99983-7843', 'Tomaz', 'Transporte de Motos', '', 'Jundiaí', ''],
            ['Locação CD', '11 99969-7626', 'Vitor', 'Locação CD', '', 'Jundiaí', ''],
            ['A Industrial Ferramentas', '11 99943-8114', '', 'Loja de Ferramentas', '', 'Jundiaí', ''],
            ['Despachante Bestestti', '11 94456-4174', 'Bestetti', 'Despachante', '', 'Jundiaí', ''],
            ['Jundescart', '11 2709-9789', '', 'Plástico Bolha', '', 'Jundiaí', ''],
            ['Pintor Epoxi', '11 95304-6557', 'Bruno', 'Pintura Epoxi no Chão', '', 'Jundiaí', ''],
          ];
          for (const [empresa, tel, contato, insumo, bairro, cidade, obs] of SEED) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "Fornecedor" ("empresa","insumoServico","contato","telefones","bairroRegiao","cidade","uf","observacao")
               VALUES ($1,$2,$3,$4,$5,$6,'SP',$7)`,
              empresa, insumo, contato || null, JSON.stringify(tel ? [tel] : []), bairro || null, cidade, obs || null,
            );
          }
        }
        await prisma.$executeRawUnsafe(`INSERT INTO "FornecedorInsumo" ("nome") VALUES ('__seed__') ON CONFLICT DO NOTHING`);
      }
    })().catch((e) => { tabelasProntas = null; throw e; });
  }
  return tabelasProntas;
}

function paraRegistro(r: any) {
  let telefones: string[] = [];
  try { const j = JSON.parse(String(r.telefones || '[]')); if (Array.isArray(j)) telefones = j.map(txt).filter(Boolean); } catch { /* telefones invalidos: lista vazia */ }
  return {
    id: Number(r.id),
    empresa: txt(r.empresa),
    cnpj: txt(r.cnpj),
    insumoServico: txt(r.insumoServico),
    contato: txt(r.contato),
    telefones,
    email: txt(r.email),
    cep: txt(r.cep),
    logradouro: txt(r.logradouro),
    numero: txt(r.numero),
    complemento: txt(r.complemento),
    bairroRegiao: txt(r.bairroRegiao),
    cidade: txt(r.cidade),
    uf: txt(r.uf) || 'SP',
    observacao: txt(r.observacao),
    ativo: r.ativo !== false,
    criadoEm: r.criadoEm,
    atualizadoEm: r.atualizadoEm,
  };
}

function lerCorpo(b: any) {
  const telefones = Array.isArray(b?.telefones) ? b.telefones.map(txt).filter(Boolean) : [];
  return {
    empresa: txt(b?.empresa),
    cnpj: txt(b?.cnpj) || null,
    insumoServico: txt(b?.insumoServico) || null,
    contato: txt(b?.contato) || null,
    telefones: JSON.stringify(telefones),
    email: txt(b?.email) || null,
    cep: txt(b?.cep) || null,
    logradouro: txt(b?.logradouro) || null,
    numero: txt(b?.numero) || null,
    complemento: txt(b?.complemento) || null,
    bairroRegiao: txt(b?.bairroRegiao) || null,
    cidade: txt(b?.cidade) || null,
    uf: (txt(b?.uf) || 'SP').toUpperCase().slice(0, 2),
    observacao: txt(b?.observacao) || null,
    ativo: b?.ativo === false ? false : true,
  };
}

// GET /fornecedores — itens + opcoes de "Insumo / Servico" (as ja usadas + as criadas direto no cadastro).
fornecedoresRouter.get('/', async (_req, res, next) => {
  try {
    await garantirTabelas();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Fornecedor" ORDER BY lower("empresa") ASC`);
    const extras = await prisma.$queryRawUnsafe<any[]>(`SELECT "nome" FROM "FornecedorInsumo" WHERE "nome" NOT LIKE '\\_\\_%' ESCAPE '\\'`);
    const itens = rows.map(paraRegistro);
    const set: Record<string, true> = {};
    itens.forEach((i) => { if (i.insumoServico) set[i.insumoServico] = true; });
    extras.forEach((e) => { const n = txt(e.nome); if (n) set[n] = true; });
    const insumos = Object.keys(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    res.json({ ok: true, itens, insumos });
  } catch (e) { next(e); }
});

// POST /fornecedores
fornecedoresRouter.post('/', async (req, res, next) => {
  try {
    await garantirTabelas();
    const d = lerCorpo(req.body);
    if (!d.empresa) return res.status(400).json({ ok: false, error: 'Informe o nome da empresa.' });
    const r = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "Fornecedor" ("empresa","cnpj","insumoServico","contato","telefones","email","cep","logradouro","numero","complemento","bairroRegiao","cidade","uf","observacao","ativo")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      d.empresa, d.cnpj, d.insumoServico, d.contato, d.telefones, d.email, d.cep, d.logradouro, d.numero, d.complemento, d.bairroRegiao, d.cidade, d.uf, d.observacao, d.ativo,
    );
    res.status(201).json({ ok: true, item: paraRegistro(r[0]) });
  } catch (e) { next(e); }
});

// PUT /fornecedores/:id
fornecedoresRouter.put('/:id', async (req, res, next) => {
  try {
    await garantirTabelas();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'id invalido' });
    const d = lerCorpo(req.body);
    if (!d.empresa) return res.status(400).json({ ok: false, error: 'Informe o nome da empresa.' });
    const r = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE "Fornecedor" SET "empresa"=$2,"cnpj"=$3,"insumoServico"=$4,"contato"=$5,"telefones"=$6,"email"=$7,"cep"=$8,"logradouro"=$9,"numero"=$10,
         "complemento"=$11,"bairroRegiao"=$12,"cidade"=$13,"uf"=$14,"observacao"=$15,"ativo"=$16,"atualizadoEm"=now()
       WHERE "id"=$1 RETURNING *`,
      id, d.empresa, d.cnpj, d.insumoServico, d.contato, d.telefones, d.email, d.cep, d.logradouro, d.numero, d.complemento, d.bairroRegiao, d.cidade, d.uf, d.observacao, d.ativo,
    );
    if (!r.length) return res.status(404).json({ ok: false, error: 'Fornecedor nao encontrado.' });
    res.json({ ok: true, item: paraRegistro(r[0]) });
  } catch (e) { next(e); }
});

// DELETE /fornecedores/:id
fornecedoresRouter.delete('/:id', async (req, res, next) => {
  try {
    await garantirTabelas();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'id invalido' });
    await prisma.$executeRawUnsafe(`DELETE FROM "Fornecedor" WHERE "id" = $1`, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /fornecedores/insumos — cria uma nova opcao de "Insumo / Servico" (o "+" do cadastro).
fornecedoresRouter.post('/insumos', async (req, res, next) => {
  try {
    await garantirTabelas();
    const nome = txt(req.body?.nome).slice(0, 80);
    if (!nome || nome.startsWith('__')) return res.status(400).json({ ok: false, error: 'Informe o nome da opcao.' });
    await prisma.$executeRawUnsafe(`INSERT INTO "FornecedorInsumo" ("nome") VALUES ($1) ON CONFLICT DO NOTHING`, nome);
    res.status(201).json({ ok: true, nome });
  } catch (e) { next(e); }
});
