// Cadastro de oficinas (aba "Oficinas" da pagina Empresa), no mesmo molde dos Fornecedores. Tabelas criadas sob demanda (sem migration):
//   "Oficina"      — um registro por oficina, com endereco completo, origem do contato e vinculo opcional com um cliente do Bling.
//   "OficinaMeta"  — marcadores internos (ex.: carga inicial ja feita).
// Na primeira vez as oficinas da planilha (oficinas.pdf) sao cadastradas.
import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const oficinasRouter = Router();

const txt = (v: any) => String(v ?? '').trim();

// [nome, telefone, contato, logradouro, numero, bairro, cidade, uf, cep, origem, site, especialidade, observacao]
type Seed = [string, string, string, string, string, string, string, string, string, string, string, string, string];
const SEED: Seed[] = [
  ['Tedesco Motors', '19 3199-8403', '', 'R. do Carpinteiro', '180A', 'Jardim Werner Plaas', 'Americana', 'SP', '13478-730', '', '', '', ''],
  ['American Garage', '11 93775-1089', '', 'Av. Pref. Luis Latorre', '4140', 'Jardim das Hortênsias', 'Jundiaí', 'SP', '13209-430', '', '', '', ''],
  ['GM Motos', '11 98606-9170', 'Eduardo', 'R. Tiradentes', '829', 'Jardim Florestal', 'Jundiaí', 'SP', '13214-370', '', '', '', ''],
  ['Duas Rodas', '11 4587-7618', '', 'R. Antonio Toffoli', '171', 'Jardim Guarani', 'Jundiaí', 'SP', '13208-270', '', '', '', ''],
  ['Piu Motorrad', '16 99727-6804', 'Piu', 'R. Curitiba', '744', 'Vila Mota', 'Catanduva', 'SP', '15804-055', 'Via Instagram', '', 'BMW', ''],
  ['JC MotorSport', '11 2709-5420', 'João', 'Av. Luiz Gonzaga Martins Guimarães', '164', 'Jardim Campos Elísios', 'Jundiaí', 'SP', '13209-770', '', 'http://www.jcmotorsport.com.br/', '', ''],
  ['Oficina de Motos DM Multimarcas', '11 97374-8211', '', 'Av. Fernando Arens', '1097', 'Vila Arens', 'Jundiaí', 'SP', '13202-571', '', '', '', ''],
  ['Target Race - Oficina e Loja de Motos', '11 2872-8040', 'Padre', 'R. Clodomiro Amazonas', '709', 'Itaim Bibi', 'São Paulo', 'SP', '04537-011', '', '', '', ''],
  ['Bianchi Motos', '19 99871-2416', 'Pedro', 'Av. Moisés Gádia', '39', 'Jardim do Lago', 'Campinas', 'SP', '13050-005', '', '', '', 'Falar em nome de Nelson Silva'],
  ['World Racing', '19 3396-7056', 'Gustavo', 'R. Dr. Barbosa de Barros', '355', 'Botafogo', 'Campinas', 'SP', '13020-360', '', '', '', 'Falar em nome de Nelson Silva'],
  ['457 Garage', '19 3709-7792', '', 'R. Dona Luísa de Gusmão', '495', 'Vila Nogueira', 'Campinas', 'SP', '13088-028', '', '', '', 'JÁ COMPROU CONOSCO'],
  ['Racetec', '18 93500-0386', '', 'R. Dr. Hugo Lacorte Vitale', '75', 'Vila Lessa', 'Presidente Prudente', 'SP', '19020-190', '', '', '', ''],
  ['Impacto Racing', '19 99641-4401', 'Adriano', 'R. Maria Ana Gasparini', '73', 'Jardim Emília', 'Pedreira', 'SP', '13928-202', '', '', '', ''],
  ['Sport Riders', '19 99943-2007', '', 'R. Aparício da Costa Camargo', '25', 'Lot. Remanso Campineiro', 'Hortolândia', 'SP', '13184-322', '', '', '', ''],
  ['Tecnomoto', '11 4587-1917', '', 'Av. Fernando Arens', '506', 'Vila Arens II', 'Jundiaí', 'SP', '13202-570', '', '', '', ''],
  ['Oficina Racing Motos', '11 94909-0958', '', 'R. Bom Jesus de Pirapora', '256', 'Vianelo/Bonfiglioli', 'Jundiaí', 'SP', '13207-270', '', '', '', ''],
  ['Jh motos', '11 94010-7929', '', 'Av. José Alves da Cunha Lima', '', 'Retiro', 'Jundiaí', 'SP', '13211-050', '', '', '', ''],
  ['Mecânica - Moto Sense', '11 99272-6549', '', 'Rua Francisco Alves', '204', 'Vila Arens/Vila Progresso', 'Jundiaí', 'SP', '13202-340', '', '', '', 'olá, tudo bem?'],
  ['DC MOTORCYCLE', '11 95150-6364', 'Diego', 'R. das Pitangueiras', '185', 'Jardim Pitangueiras II', 'Jundiaí', 'SP', '13206-716', '', '', '', ''],
  ['CANELA MOTOS', '11 93464-3262', '', 'Av. São Paulo', '294', 'Vila Arens', 'Jundiaí', 'SP', '13202-610', '', '', '', ''],
  ['Tuca Racing', '19 99810-2251', '', 'Av. Brasil', '372', 'Santa Rosa', 'Vinhedo', 'SP', '13289-068', '', '', '', ''],
  ['Leo Motos - Oficina mecânica e moto', '19 2512-1588', '', 'Av. Adão Focesi', '955', 'Jardim do Lago', 'Campinas', 'SP', '13050-000', '', '', '', ''],
  ['Pro Riders Oficina', '19 98155-9825', 'Fernando', 'Av. Paulo de Almeida Nogueira', '176', 'Taquaral', 'Campinas', 'SP', '13076-310', '', '', 'BMW', ''],
  ['Giba Moto Racing', '35 99854-2909', 'Giba', 'Av. Dr. Demóstenes Rio Branco', '477', 'Vila Nova', 'Santa Rita de Caldas', 'MG', '37775-000', '', '', '', ''],
  ['Pavilhão Acessórios', '', '', '', '', '', '', 'SP', '', '', '', '', ''],
];

let tabelasProntas: Promise<void> | null = null;
function garantirTabelas(): Promise<void> {
  if (!tabelasProntas) {
    tabelasProntas = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Oficina" (
        "id" SERIAL PRIMARY KEY,
        "nome" TEXT NOT NULL,
        "cnpj" TEXT,
        "especialidade" TEXT,
        "contato" TEXT,
        "telefones" TEXT NOT NULL DEFAULT '[]',
        "email" TEXT,
        "cep" TEXT,
        "logradouro" TEXT,
        "numero" TEXT,
        "complemento" TEXT,
        "bairro" TEXT,
        "cidade" TEXT,
        "uf" TEXT NOT NULL DEFAULT 'SP',
        "origem" TEXT,
        "site" TEXT,
        "observacao" TEXT,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "clienteBlingId" BIGINT,
        "criadoEm" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "atualizadoEm" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Oficina_cliente_uq" ON "Oficina" ("clienteBlingId") WHERE "clienteBlingId" IS NOT NULL`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OficinaMeta" ("chave" TEXT PRIMARY KEY)`);
      const jaSemeado = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "OficinaMeta" WHERE "chave" = 'seed_pdf'`);
      if (!jaSemeado.length) {
        const total = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM "Oficina"`);
        if (!Number(total[0]?.n)) {
          for (const [nome, tel, contato, logradouro, numero, bairro, cidade, uf, cep, origem, site, especialidade, obs] of SEED) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO "Oficina" ("nome","telefones","contato","logradouro","numero","bairro","cidade","uf","cep","origem","site","especialidade","observacao")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              nome, JSON.stringify(tel ? [tel] : []), contato || null, logradouro || null, numero || null, bairro || null, cidade || null, uf || 'SP', cep || null,
              origem || null, site || null, especialidade || null, obs || null,
            );
          }
        }
        await prisma.$executeRawUnsafe(`INSERT INTO "OficinaMeta" ("chave") VALUES ('seed_pdf') ON CONFLICT DO NOTHING`);
      }
    })().catch((e) => { tabelasProntas = null; throw e; });
  }
  return tabelasProntas;
}

function paraRegistro(r: any) {
  let telefones: string[] = [];
  try { const j = JSON.parse(String(r.telefones || '[]')); if (Array.isArray(j)) telefones = j.map(txt).filter(Boolean); } catch { /* telefones invalidos: lista vazia */ }
  return {
    id: Number(r.id), nome: txt(r.nome), cnpj: txt(r.cnpj), especialidade: txt(r.especialidade), contato: txt(r.contato), telefones, email: txt(r.email),
    cep: txt(r.cep), logradouro: txt(r.logradouro), numero: txt(r.numero), complemento: txt(r.complemento), bairro: txt(r.bairro), cidade: txt(r.cidade), uf: txt(r.uf) || 'SP',
    origem: txt(r.origem), site: txt(r.site), observacao: txt(r.observacao), ativo: r.ativo !== false,
    clienteBlingId: r.clienteBlingId != null ? String(r.clienteBlingId) : null, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm,
  };
}

function lerCorpo(b: any) {
  const telefones = Array.isArray(b?.telefones) ? b.telefones.map(txt).filter(Boolean) : [];
  return {
    nome: txt(b?.nome), cnpj: txt(b?.cnpj) || null, especialidade: txt(b?.especialidade) || null, contato: txt(b?.contato) || null,
    telefones: JSON.stringify(telefones), email: txt(b?.email) || null, cep: txt(b?.cep) || null, logradouro: txt(b?.logradouro) || null,
    numero: txt(b?.numero) || null, complemento: txt(b?.complemento) || null, bairro: txt(b?.bairro) || null, cidade: txt(b?.cidade) || null,
    uf: (txt(b?.uf) || 'SP').toUpperCase().slice(0, 2), origem: txt(b?.origem) || null, site: txt(b?.site) || null,
    observacao: txt(b?.observacao) || null, ativo: b?.ativo === false ? false : true,
  };
}

// GET /oficinas — itens + opcoes ja usadas de especialidade e origem
oficinasRouter.get('/', async (_req, res, next) => {
  try {
    await garantirTabelas();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Oficina" ORDER BY lower("nome") ASC`);
    const itens = rows.map(paraRegistro);
    const unicos = (campo: 'especialidade' | 'origem') => Array.from(new Set(itens.map((i) => i[campo]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    res.json({ ok: true, itens, especialidades: unicos('especialidade'), origens: unicos('origem') });
  } catch (e) { next(e); }
});

// GET /oficinas/clientes-ids — ids de clientes do Bling ja levados para Oficinas (selo na tela de Clientes)
oficinasRouter.get('/clientes-ids', async (_req, res, next) => {
  try {
    await garantirTabelas();
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "clienteBlingId"::text AS id FROM "Oficina" WHERE "clienteBlingId" IS NOT NULL`);
    res.json({ ok: true, ids: rows.map((r) => String(r.id)) });
  } catch (e) { next(e); }
});

// POST /oficinas/de-cliente { clienteId } — leva um cliente (Bling) para Oficinas, copiando os dados de cadastro
oficinasRouter.post('/de-cliente', async (req, res, next) => {
  try {
    await garantirTabelas();
    const clienteId = txt(req.body?.clienteId);
    if (!/^\d+$/.test(clienteId)) return res.status(400).json({ ok: false, error: 'Cliente invalido.' });
    const [ja] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Oficina" WHERE "clienteBlingId" = $1::bigint`, clienteId);
    if (ja) return res.json({ ok: true, jaExistia: true, item: paraRegistro(ja) });
    const [c] = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BlingCliente" WHERE "id" = $1::bigint`, clienteId);
    if (!c) return res.status(404).json({ ok: false, error: 'Cliente nao encontrado.' });
    const telefones = Array.from(new Set([txt(c.celular), txt(c.telefone)].filter(Boolean)));
    const [r] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "Oficina" ("nome","cnpj","telefones","email","cep","logradouro","bairro","cidade","uf","origem","clienteBlingId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Cliente do sistema',$10::bigint) RETURNING *`,
      txt(c.nome) || 'Cliente sem nome', txt(c.documento) || null, JSON.stringify(telefones), txt(c.email) || null, txt(c.cep) || null,
      txt(c.endereco) || null, txt(c.bairro) || null, txt(c.cidade) || null, (txt(c.uf) || 'SP').toUpperCase().slice(0, 2), clienteId,
    );
    res.status(201).json({ ok: true, jaExistia: false, item: paraRegistro(r) });
  } catch (e) { next(e); }
});

// POST /oficinas
oficinasRouter.post('/', async (req, res, next) => {
  try {
    await garantirTabelas();
    const d = lerCorpo(req.body);
    if (!d.nome) return res.status(400).json({ ok: false, error: 'Informe o nome da oficina.' });
    const r = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "Oficina" ("nome","cnpj","especialidade","contato","telefones","email","cep","logradouro","numero","complemento","bairro","cidade","uf","origem","site","observacao","ativo")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      d.nome, d.cnpj, d.especialidade, d.contato, d.telefones, d.email, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.origem, d.site, d.observacao, d.ativo,
    );
    res.status(201).json({ ok: true, item: paraRegistro(r[0]) });
  } catch (e) { next(e); }
});

// PUT /oficinas/:id
oficinasRouter.put('/:id(\\d+)', async (req, res, next) => {
  try {
    await garantirTabelas();
    const id = Number(req.params.id);
    const d = lerCorpo(req.body);
    if (!d.nome) return res.status(400).json({ ok: false, error: 'Informe o nome da oficina.' });
    const r = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE "Oficina" SET "nome"=$2,"cnpj"=$3,"especialidade"=$4,"contato"=$5,"telefones"=$6,"email"=$7,"cep"=$8,"logradouro"=$9,"numero"=$10,
         "complemento"=$11,"bairro"=$12,"cidade"=$13,"uf"=$14,"origem"=$15,"site"=$16,"observacao"=$17,"ativo"=$18,"atualizadoEm"=now()
       WHERE "id"=$1::int RETURNING *`,
      id, d.nome, d.cnpj, d.especialidade, d.contato, d.telefones, d.email, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.origem, d.site, d.observacao, d.ativo,
    );
    if (!r.length) return res.status(404).json({ ok: false, error: 'Oficina nao encontrada.' });
    res.json({ ok: true, item: paraRegistro(r[0]) });
  } catch (e) { next(e); }
});

// DELETE /oficinas/:id
oficinasRouter.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    await garantirTabelas();
    await prisma.$executeRawUnsafe(`DELETE FROM "Oficina" WHERE "id" = $1::int`, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
