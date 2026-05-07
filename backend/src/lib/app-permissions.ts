export type AppAction = {
  key: string;
  label: string;
};

export type AppPagePermission = {
  key: string;
  label: string;
  href: string;
  actions: AppAction[];
};

export type AppPermissions = Record<string, string[]>;

export const APP_PERMISSION_CATALOG: AppPagePermission[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/', actions: [] },
  { key: 'motos', label: 'Motos', href: '/motos', actions: [
    { key: 'criar', label: 'Criar moto' },
    { key: 'editar', label: 'Editar moto' },
    { key: 'etiqueta', label: 'Etiqueta' },
    { key: 'excluir', label: 'Excluir moto' },
  ] },
  { key: 'cadastro', label: 'Cadastro', href: '/cadastro', actions: [
    { key: 'criar_pre_cadastro', label: 'Criar pre-cadastro' },
    { key: 'editar_pre_cadastro', label: 'Editar pre-cadastro' },
    { key: 'criar_bling', label: 'Criar produto Bling' },
    { key: 'enviar_fotos', label: 'Enviar fotos' },
    { key: 'processar_categoria', label: 'Processar categoria' },
  ] },
  { key: 'estoque', label: 'Estoque', href: '/estoque', actions: [
    { key: 'editar', label: 'Editar peca' },
    { key: 'trocar_foto', label: 'Trocar foto capa' },
    { key: 'devolucoes', label: 'Devolucoes' },
  ] },
  { key: 'inventario', label: 'Inventario', href: '/inventario', actions: [
    { key: 'criar', label: 'Criar inventario' },
    { key: 'processar', label: 'Processar inventario' },
  ] },
  { key: 'etiquetas_detran', label: 'Etiquetas Detran', href: '/etiquetas-detran', actions: [
    { key: 'processar_baixa', label: 'Processar baixa' },
    { key: 'processar_devolucao', label: 'Processar devolucao' },
  ] },
  { key: 'empresa', label: 'Empresa', href: '/empresa', actions: [{ key: 'editar', label: 'Editar empresa' }] },
  { key: 'faturamento', label: 'Fat. por Moto', href: '/faturamento', actions: [] },
  { key: 'faturamento_geral', label: 'Fat. Geral', href: '/faturamento/geral', actions: [] },
  { key: 'despesas_receita', label: 'Despesas x Receita', href: '/despesas-receita', actions: [] },
  { key: 'dre', label: 'DRE', href: '/dre', actions: [] },
  { key: 'despesas', label: 'Despesas', href: '/despesas', actions: [
    { key: 'criar', label: 'Criar despesa' },
    { key: 'editar', label: 'Editar despesa' },
    { key: 'pagar', label: 'Marcar pagamento' },
  ] },
  { key: 'prejuizos', label: 'Prejuizos', href: '/prejuizos', actions: [{ key: 'criar', label: 'Criar prejuizo' }] },
  { key: 'investimentos', label: 'Investimentos', href: '/investimentos', actions: [{ key: 'criar', label: 'Criar investimento' }] },
  { key: 'bling_vendas', label: 'Vendas', href: '/bling/vendas', actions: [
    { key: 'relatorio_separacao', label: 'Relatorio de separacao' },
    { key: 'atualizar_vendas', label: 'Atualizar vendas' },
  ] },
  { key: 'bling_relatorio', label: 'Relatorio de Vendas', href: '/bling/relatorio-vendas', actions: [] },
  { key: 'bling_produtos', label: 'Produtos Bling', href: '/bling/produtos', actions: [{ key: 'auditar', label: 'Auditar produtos' }] },
  { key: 'bling_auditoria', label: 'Auditoria Automatica', href: '/bling/auditoria-automatica', actions: [{ key: 'executar', label: 'Executar auditoria' }] },
  { key: 'mercado_livre_perguntas', label: 'Perguntas ML', href: '/mercado-livre/perguntas', actions: [{ key: 'responder', label: 'Responder pergunta' }] },
  { key: 'nuvemshop_produtos', label: 'Produtos Nuvemshop', href: '/nuvemshop/produtos', actions: [
    { key: 'analisar_ia', label: 'Analisar com IA' },
    { key: 'aplicar', label: 'Aplicar na Nuvemshop' },
  ] },
  { key: 'detran', label: 'Detran', href: '/detran', actions: [{ key: 'executar', label: 'Executar Detran' }] },
  { key: 'configuracoes', label: 'Configuracoes', href: '/configuracoes', actions: [
    { key: 'usuarios', label: 'Gerenciar usuarios' },
    { key: 'permissoes', label: 'Gerenciar permissoes' },
  ] },
  { key: 'conexoes', label: 'Configuracoes tecnicas', href: '/bling', actions: [{ key: 'editar', label: 'Editar configuracoes' }] },
];

export function normalizePermissions(value: any): AppPermissions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: AppPermissions = {};
  for (const page of APP_PERMISSION_CATALOG) {
    const rawActions = Array.isArray(value[page.key]) ? value[page.key] : [];
    normalized[page.key] = rawActions.map((item: any) => String(item || '').trim()).filter(Boolean);
  }
  return normalized;
}

export function buildFullPermissions(): AppPermissions {
  return APP_PERMISSION_CATALOG.reduce<AppPermissions>((acc, page) => {
    acc[page.key] = ['__page', ...page.actions.map((action) => action.key)];
    return acc;
  }, {});
}
