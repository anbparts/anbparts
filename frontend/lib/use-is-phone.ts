'use client';

import { useEffect, useState } from 'react';

// true quando a largura da janela e' de celular (ate 768 px). Usado pelas telas que tem colunas fixas e precisam empilhar.
export function useIsPhone(limite = 768) {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const ajustar = () => setIsPhone(window.innerWidth <= limite);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [limite]);
  return isPhone;
}
