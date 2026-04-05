const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Erro na requisição');
  }
  return res.json();
}

// MOTOS
export const api = {
  motos: {
    list:   ()              => req<any[]>('/motos'),
    get:    (id: number)    => req<any>(`/motos/${id}`),
    create: (data: any)     => req<any>('/motos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => req<any>(`/motos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)    => req<any>(`/motos/${id}`, { method: 'DELETE' }),
  },
  pecas: {
    list:   (params?: Record<string, any>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any>(`/pecas${qs}`);
    },
    create: (data: any)     => req<any>('/pecas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => req<any>(`/pecas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    vender: (id: number, data: any) => req<any>(`/pecas/${id}/vender`, { method: 'PATCH', body: JSON.stringify(data) }),
    marcarPrejuizo: (id: number, data: any) => req<any>(`/pecas/${id}/prejuizo`, { method: 'PATCH', body: JSON.stringify(data) }),
    cancelarVenda: (id: number) => req<any>(`/pecas/${id}/cancelar-venda`, { method: 'PATCH' }),
    delete: (id: number)    => req<any>(`/pecas/${id}`, { method: 'DELETE' }),
  },
  faturamento: {
    dashboard: () => req<any>('/faturamento/dashboard'),
    geral:     () => req<any[]>('/faturamento/geral'),
    porMoto:   () => req<any[]>('/faturamento/por-moto'),
  },
  financeiro: {
    prejuizos: {
      list: () => req<any[]>('/financeiro/prejuizos'),
      update: (id: number, data: any) => req<any>(`/financeiro/prejuizos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: number) => req<any>(`/financeiro/prejuizos/${id}`, { method: 'DELETE' }),
    },
  },
  import: {
    motos: (data: any[]) => req<any>('/import/motos', { method: 'POST', body: JSON.stringify(data) }),
    pecas: (data: any[]) => req<any>('/import/pecas', { method: 'POST', body: JSON.stringify(data) }),
  },
};
