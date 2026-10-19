'use client';

import { useCallback, useState } from 'react';

// Aba/visao ativa que sobrevive a "atualizar a pagina" (F5): fica no endereco (?aba=...) e, de reserva, no sessionStorage.
// Atualizar a pagina recarrega so os dados da tela em exibicao, sem voltar para a primeira aba.
export function usePersistentTab<T extends string>(chave: string, padrao: T, validos?: readonly T[]): [T, (valor: T) => void] {
  const [valor, setValorEstado] = useState<T>(() => {
    if (typeof window === 'undefined') return padrao;
    try {
      const doEndereco = new URLSearchParams(window.location.search).get(chave);
      const guardado = window.sessionStorage.getItem(`aba:${window.location.pathname}:${chave}`);
      const candidato = (doEndereco || guardado) as T | null;
      if (candidato && (!validos || validos.includes(candidato))) return candidato;
    } catch { /* sem acesso ao endereco/armazenamento: usa a aba padrao */ }
    return padrao;
  });

  const definir = useCallback((novo: T) => {
    setValorEstado(novo);
    try {
      window.sessionStorage.setItem(`aba:${window.location.pathname}:${chave}`, novo);
      const url = new URL(window.location.href);
      url.searchParams.set(chave, novo);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* nao impede a troca de aba */ }
  }, [chave]);

  return [valor, definir];
}
