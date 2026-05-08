export type AppAction = {
  key: string;
  label: string;
  description?: string;
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
    { key: 'criar', label: 'Criar moto', description: 'Libera o botao + Nova moto na tela Motos.' },
    { key: 'editar', label: 'Editar moto', description: 'Libera editar dados da moto, texto modelo e anexos.' },
    { key: 'etiqueta', label: 'Etiqueta', description: 'Libera a area de etiquetas DETRAN da moto.' },
    { key: 'contratos', label: 'Contratos', description: 'Libera a aba Contratos dentro de Motos, incluindo criar, editar, excluir, detalhes da moto e gerar PDF.' },
    { key: 'excluir', label: 'Excluir moto', description: 'Libera excluir uma moto.' },
  ] },
  { key: 'cadastro', label: 'Cadastro', href: '/cadastro', actions: [
    { key: 'criar_pre_cadastro', label: 'Novo pre-cadastro', description: 'Libera o botao + Novo Pre-cadastro no topo da tela Cadastro.' },
    { key: 'editar_pre_cadastro', label: 'Botao Pre-Cadastro', description: 'Libera editar o pre-cadastro pendente, incluindo o botao verde Pre-Cadastro/OK na linha e o botao Editar.' },
    { key: 'criar_bling', label: 'Botao Cadastro', description: 'Libera o botao Cadastro/Pendente da linha para finalizar o item e criar/atualizar o produto no Bling.' },
    { key: 'enviar_fotos', label: 'Enviar fotos', description: 'Libera envio de fotos na aba Fotos da tela Cadastro.' },
    { key: 'processar_categoria', label: 'Processar categoria', description: 'Libera analise de IA e atualizacao de categorias/tags na aba Categoria.' },
  ] },
  { key: 'estoque', label: 'Estoque', href: '/estoque', actions: [
    { key: 'editar', label: 'Editar peca', description: 'Libera editar peca, vender, marcar prejuizo, cancelar venda e excluir.' },
    { key: 'trocar_foto', label: 'Trocar foto capa', description: 'Libera importar ou trocar a foto capa da peca.' },
    { key: 'impressao_caixa', label: 'Impressao caixa', description: 'Libera o botao Impressao Caixa para imprimir etiquetas termicas das caixas.' },
    { key: 'devolucoes', label: 'Devolucoes', description: 'Libera historico e registro de devolucoes de venda.' },
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
  { key: 'conf_bling', label: 'Conf. Conexao Bling', href: '/bling', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_emails', label: 'Conf. E-mails', href: '/configuracoes-gerais', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_produtos_bling', label: 'Conf. Produtos Bling', href: '/bling/config-produtos', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_gerais', label: 'Conf. Gerais', href: '/conf-gerais', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_ml', label: 'Config. ML', href: '/config-ml', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_nuvemshop', label: 'Conf. Nuvemshop', href: '/conf-nuvemshop', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_gmail', label: 'Config. Gmail', href: '/conf-gmail', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
  { key: 'conf_google_drive', label: 'Config. Google Drive', href: '/conf-google-drive', actions: [{ key: 'editar', label: 'Editar configuracao' }] },
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

export function canAccessPage(permissions: AppPermissions | null | undefined, pageKey: string) {
  return Array.isArray(permissions?.[pageKey]) && permissions![pageKey].includes('__page');
}

export function canProcessAction(permissions: AppPermissions | null | undefined, pageKey: string, actionKey: string) {
  return Array.isArray(permissions?.[pageKey]) && permissions![pageKey].includes(actionKey);
}
