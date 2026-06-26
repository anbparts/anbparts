// Tipos de peça DETRAN (34 posições) e variáveis disponíveis para os templates de Texto NF-e.
// Posição N (1..34) corresponde a DETRAN_TIPOS[N-1]. Ex.: posição 5 = 'Bloco do motor'.
export const DETRAN_TIPOS = [
  'Balança', 'Banco', 'Bengala direita', 'Bengala esquerda', 'Bloco do motor',
  'Cabeçote', 'Carburador', 'Carenagem direita', 'Carenagem esquerda',
  'Carenagem frontal', 'Carenagem traseira', 'Estribo', 'Farol',
  'Guidão / semi-guidão', 'Lanterna', 'Mesa', 'Módulo de injeção/CDI',
  'Motor de arranque', 'Painel', 'Para-lama dianteiro', 'Para-lama traseiro',
  'Pedaleira direita', 'Pedaleira esquerda', 'Retrovisor direito',
  'Retrovisor esquerdo', 'Roda dianteira', 'Roda traseira', 'Tanque',
  'Cardã', 'Cavalete lateral', 'Corpo de injeção', 'Diferencial',
  'Escapamento', 'Radiador',
];

// Variáveis que o usuário pode inserir no template. `key` vira {{key}} no texto;
// `fonte` indica de onde o valor é puxado na hora de preencher o PDF/e-mail.
export type NfeVariavel = { key: string; label: string; fonte: 'moto' | 'peca' };

export const NFE_VARIAVEIS: NfeVariavel[] = [
  { key: 'marca', label: 'Marca', fonte: 'moto' },
  { key: 'modelo', label: 'Modelo', fonte: 'moto' },
  { key: 'ano', label: 'Ano', fonte: 'moto' },
  { key: 'cor', label: 'Cor', fonte: 'moto' },
  { key: 'placa', label: 'Placa', fonte: 'moto' },
  { key: 'chassi', label: 'Chassi', fonte: 'moto' },
  { key: 'renavam', label: 'Renavam', fonte: 'moto' },
  { key: 'cilindros', label: 'Cilindros', fonte: 'moto' },
  { key: 'combustivel', label: 'Combustível', fonte: 'moto' },
  { key: 'cilindrada', label: 'Cilindrada', fonte: 'moto' },
  { key: 'potencia', label: 'Potência', fonte: 'moto' },
  { key: 'etiqueta', label: 'Etiqueta DETRAN', fonte: 'peca' },
  { key: 'sku', label: 'SKU', fonte: 'peca' },
  { key: 'descricao', label: 'Descrição', fonte: 'peca' },
];

// Resolve o tipo de peça DETRAN a partir da posição (últimos 3 dígitos da etiqueta de cartela).
export function tipoPorPosicao(posicao: number): string | null {
  if (!Number.isFinite(posicao) || posicao < 1 || posicao > DETRAN_TIPOS.length) return null;
  return DETRAN_TIPOS[posicao - 1];
}

// Extrai a posição (1..34) de uma etiqueta de cartela (ex.: SP22102020206005 -> 5).
export function posicaoDaEtiqueta(etiqueta: string | null | undefined): number | null {
  const m = String(etiqueta || '').trim().match(/(\d{3})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= DETRAN_TIPOS.length ? n : null;
}

// Substitui as variáveis {{key}} pelos valores (moto/peça). O que nao tiver valor fica em branco.
export function preencherTemplateNfe(
  template: string,
  dados: { moto?: any; peca?: any },
): string {
  const moto = dados.moto || {};
  const peca = dados.peca || {};
  const valores: Record<string, any> = {
    marca: moto.marca,
    modelo: moto.modelo,
    ano: moto.ano,
    cor: moto.cor,
    placa: moto.placa,
    chassi: moto.chassi,
    renavam: moto.renavam,
    cilindros: moto.cilindros,
    combustivel: moto.combustivel,
    cilindrada: moto.cilindrada,
    potencia: moto.potencia,
    etiqueta: peca.detranEtiqueta,
    sku: peca.idPeca,
    descricao: peca.descricao,
  };
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    const v = valores[String(key)];
    return v === undefined || v === null ? '' : String(v);
  });
}
