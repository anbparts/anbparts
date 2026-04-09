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
    detranEtiquetas: (id: number) => req<any>(`/motos/${id}/detran-etiquetas`),
    anexos: (id: number) => req<any>(`/motos/${id}/anexos`),
    updateAnexos: (id: number, anexos: any) => req<any>(`/motos/${id}/anexos`, {
      method: 'PUT',
      body: JSON.stringify({ anexos }),
    }),
    setDetranEtiquetaStatus: (pecaId: number, status: 'ativa' | 'baixada') => req<any>(`/motos/pecas/${pecaId}/detran-status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    create: (data: any)     => req<any>('/motos', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => req<any>(`/motos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number)    => req<any>(`/motos/${id}`, { method: 'DELETE' }),
  },
  pecas: {
    list:   (params?: Record<string, any>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any>(`/pecas${qs}`);
    },
    sugerirId: (motoId: number) => req<any>(`/pecas/sugestao-id?motoId=${motoId}`),
    create: (data: any)     => req<any>('/pecas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => req<any>(`/pecas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    vender: (id: number, data: any) => req<any>(`/pecas/${id}/vender`, { method: 'PATCH', body: JSON.stringify(data) }),
    marcarPrejuizo: (id: number, data: any) => req<any>(`/pecas/${id}/prejuizo`, { method: 'PATCH', body: JSON.stringify(data) }),
    cancelarVenda: (id: number) => req<any>(`/pecas/${id}/cancelar-venda`, { method: 'PATCH' }),
    delete: (id: number)    => req<any>(`/pecas/${id}`, { method: 'DELETE' }),
  },
  inventario: {
    atual: () => req<any>('/inventario/atual'),
    novo: () => req<any>('/inventario/novo', { method: 'POST' }),
    cancelarAtual: () => req<any>('/inventario/atual', { method: 'DELETE' }),
    caixa: (caixa: string, inventarioId?: number) => {
      const qs = inventarioId ? `?inventarioId=${inventarioId}` : '';
      return req<any>(`/inventario/caixas/${encodeURIComponent(caixa)}${qs}`);
    },
    confirmarItem: (id: number) => req<any>(`/inventario/itens/${id}/confirmar`, { method: 'POST' }),
    registrarDiferenca: (id: number, tipo: 'nao_localizado' | 'diferenca_estoque') => req<any>(`/inventario/itens/${id}/diferenca`, {
      method: 'POST',
      body: JSON.stringify({ tipo }),
    }),
    finalizarCaixa: (caixa: string, inventarioId: number) => req<any>(`/inventario/caixas/${encodeURIComponent(caixa)}/finalizar`, {
      method: 'POST',
      body: JSON.stringify({ inventarioId }),
    }),
    finalizar: (id: number) => req<any>(`/inventario/${id}/finalizar`, { method: 'POST' }),
    logs: (params?: Record<string, any>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any>(`/inventario/logs${qs}`);
    },
    log: (id: number) => req<any>(`/inventario/logs/${id}`),
    excluirLog: (id: number) => req<any>(`/inventario/logs/${id}`, { method: 'DELETE' }),
  },
  faturamento: {
    dashboard: () => req<any>('/faturamento/dashboard'),
    geral:     () => req<any[]>('/faturamento/geral'),
    porMoto:   () => req<any[]>('/faturamento/por-moto'),
  },
  financeiro: {
    dre: (params?: Record<string, any>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any>(`/financeiro/dre${qs}`);
    },
    despesasReceita: (params?: Record<string, any>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any>(`/financeiro/despesas-receita${qs}`);
    },
    despesas: {
      list: () => req<any[]>('/financeiro/despesas'),
      create: (data: any) => req<any>('/financeiro/despesas', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: number, data: any) => req<any>(`/financeiro/despesas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      setStatus: (id: number, data: any) => req<any>(`/financeiro/despesas/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
      bulkDelete: (ids: number[]) => req<any>('/financeiro/despesas/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
      delete: (id: number, scope?: 'single' | 'future_series') => req<any>(`/financeiro/despesas/${id}${scope ? `?scope=${scope}` : ''}`, { method: 'DELETE' }),
      solicitarRelatorioMercadoPago: (data: any) => req<any>('/mercado-livre/mercado-pago/despesas/request-release-report', { method: 'POST', body: JSON.stringify(data) }),
      previewImportacaoMercadoPago: (data: any) => req<any>('/mercado-livre/mercado-pago/despesas/preview-csv', { method: 'POST', body: JSON.stringify(data) }),
      importarMercadoPagoCsv: (data: any) => req<any>('/mercado-livre/mercado-pago/despesas/import-csv', { method: 'POST', body: JSON.stringify(data) }),
    },
    investimentos: {
      list: () => req<any[]>('/financeiro/investimentos'),
      create: (data: any) => req<any>('/financeiro/investimentos', { method: 'POST', body: JSON.stringify(data) }),
      clear: () => req<any>('/financeiro/investimentos', { method: 'DELETE' }),
      delete: (id: number) => req<any>(`/financeiro/investimentos/${id}`, { method: 'DELETE' }),
    },
    prejuizos: {
      list: () => req<any[]>('/financeiro/prejuizos'),
      update: (id: number, data: any) => req<any>(`/financeiro/prejuizos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id: number) => req<any>(`/financeiro/prejuizos/${id}`, { method: 'DELETE' }),
    },
  },
  configuracoesGerais: {
    get: () => req<any>('/configuracoes-gerais'),
    save: (data: any) => req<any>('/configuracoes-gerais', { method: 'POST', body: JSON.stringify(data) }),
  },
  mercadoLivre: {
    getConfig: () => req<any>('/mercado-livre/config'),
    saveConfig: (data: any) => req<any>('/mercado-livre/config', { method: 'POST', body: JSON.stringify(data) }),
    authUrl: () => req<any>('/mercado-livre/auth-url'),
    status: () => req<any>('/mercado-livre/status'),
    disconnect: () => req<any>('/mercado-livre/disconnect', { method: 'DELETE' }),
    authUrlMercadoPago: () => req<any>('/mercado-livre/mercado-pago/auth-url'),
    statusMercadoPago: () => req<any>('/mercado-livre/mercado-pago/status'),
    syncReportsMercadoPago: () => req<any>('/mercado-livre/mercado-pago/reports/sync', { method: 'POST' }),
    saveRotinaMercadoPago: (data: any) => req<any>('/mercado-livre/mercado-pago/rotina', { method: 'POST', body: JSON.stringify(data) }),
    disconnectMercadoPago: () => req<any>('/mercado-livre/mercado-pago/disconnect', { method: 'DELETE' }),
    perguntas: () => req<any[]>('/mercado-livre/perguntas'),
    syncPerguntas: () => req<any>('/mercado-livre/perguntas/sync', { method: 'POST' }),
    responderPergunta: (questionId: string, text: string) => req<any>(`/mercado-livre/perguntas/${questionId}/responder`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
    excluirPergunta: (questionId: string) => req<any>(`/mercado-livre/perguntas/${questionId}`, {
      method: 'DELETE',
    }),
  },
  import: {
    motos: (data: any[]) => req<any>('/import/motos', { method: 'POST', body: JSON.stringify(data) }),
    pecas: (data: any[]) => req<any>('/import/pecas', { method: 'POST', body: JSON.stringify(data) }),
    despesas: (data: any[]) => req<any>('/import/despesas', { method: 'POST', body: JSON.stringify(data) }),
    investimentos: (data: any[]) => req<any>('/import/investimentos', { method: 'POST', body: JSON.stringify(data) }),
  },
};
