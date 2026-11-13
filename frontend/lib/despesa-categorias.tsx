'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

export type CategoriaDespesa = {
  nome: string;
  grupo: string;
  tipo: 'fixa' | 'variavel';
  ativa: boolean;
  legado: boolean;
  ordem: number;
  qtdDespesas?: number;
};

export type GrupoDespesa = { valor: string; rotulo: string; ajuda: string };

// Usado so se a API do catalogo estiver indisponivel (mantem as telas funcionando com as categorias antigas).
const FALLBACK: CategoriaDespesa[] = ['Insumo', 'Servicos', 'Taxas', 'Aluguel', 'Sistemas', 'Imposto', 'Moto', 'Outros'].map((nome, i) => ({
  nome, grupo: 'adm', tipo: 'variavel', ativa: true, legado: false, ordem: i,
}));

export const ROTULO_TIPO: Record<string, string> = { fixa: 'Fixa', variavel: 'Variável' };

// Catalogo de categorias de despesa (grupo do DRE + fixa/variavel), carregado do backend.
export function useCategoriasDespesa() {
  const [categorias, setCategorias] = useState<CategoriaDespesa[]>(FALLBACK);
  const [grupos, setGrupos] = useState<GrupoDespesa[]>([]);
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const data = await api.financeiro.categoriasDespesa.list();
      if (data?.ok && Array.isArray(data.categorias)) {
        setCategorias(data.categorias);
        setGrupos(Array.isArray(data.grupos) ? data.grupos : []);
      }
    } catch {
      /* mantem o fallback */
    }
    setCarregado(true);
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const porNome = useMemo(() => {
    const mapa: Record<string, CategoriaDespesa> = {};
    for (const c of categorias) mapa[c.nome] = c;
    return mapa;
  }, [categorias]);

  return { categorias, grupos, porNome, carregado, recarregar };
}

// <option>s agrupados por grupo do DRE. "atual" garante que a categoria ja gravada na despesa apareca mesmo se estiver inativa.
export function opcoesCategoria(categorias: CategoriaDespesa[], grupos: GrupoDespesa[], atual?: string) {
  const ativas = categorias.filter((c) => c.ativa || c.nome === atual);
  if (!grupos.length) {
    return ativas.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>);
  }
  const blocos = grupos
    .map((g) => ({ g, itens: ativas.filter((c) => c.grupo === g.valor) }))
    .filter((b) => b.itens.length);
  return blocos.map(({ g, itens }) => (
    <optgroup key={g.valor} label={g.rotulo}>
      {itens.map((c) => <option key={c.nome} value={c.nome}>{c.nome}{c.tipo === 'fixa' ? ' · fixa' : ' · variável'}</option>)}
    </optgroup>
  ));
}
