import type { LoggedUser } from './auth';

export type AppAction = { key: string; label: string; description?: string };
export type AppPagePermission = { key: string; label: string; href: string; actions: AppAction[] };
export type AppPermissions = Record<string, string[]>;

export const PAGE_KEY_BY_HREF: Record<string, string> = {
  '/': 'dashboard',
  '/motos': 'motos',
  '/cadastro': 'cadastro',
  '/estoque': 'estoque',
  '/inventario': 'inventario',
  '/etiquetas-detran': 'etiquetas_detran',
  '/empresa': 'empresa',
  '/faturamento': 'faturamento',
  '/faturamento/geral': 'faturamento_geral',
  '/despesas-receita': 'despesas_receita',
  '/pendencias': 'pendencias',
  '/conf-anthropic': 'conf_anthropic',
  '/dre': 'dre',
  '/curva-abc': 'curva_abc',
  '/despesas': 'despesas',
  '/prejuizos': 'prejuizos',
  '/investimentos': 'investimentos',
  '/bling/vendas': 'bling_vendas',
  '/bling/relatorio-vendas': 'bling_relatorio',
  '/bling/pedidos': 'bling_pedidos',
  '/bling/clientes': 'bling_clientes',
  '/bling/auditoria-automatica': 'bling_auditoria',
  '/mercado-livre/perguntas': 'mercado_livre_perguntas',
  '/nuvemshop/produtos': 'nuvemshop_produtos',
  '/armazenagem': 'armazenagem',
  '/sucata': 'sucata',
  '/configuracoes': 'configuracoes',
  '/conf-meta': 'conf_meta',
  '/bling': 'conf_bling',
  '/configuracoes-gerais': 'conf_emails',
  '/bling/config-produtos': 'conf_produtos_bling',
  '/conf-gerais': 'conf_gerais',
  '/conf-separacao': 'conf_separacao',
  '/config-ml': 'conf_ml',
  '/conf-nuvemshop': 'conf_nuvemshop',
  '/config-shopee': 'conf_shopee',
  '/config-magalu': 'conf_magalu',
  '/config-olx': 'conf_olx',
  '/olx/conversas': 'olx_conversas',
  '/olx/anuncios': 'olx_anuncios',
  '/olx/vendas': 'olx_vendas',
  '/conf-auditoria': 'conf_auditoria',
  '/conf-gmail': 'conf_gmail',
  '/conf-monitor-conexoes': 'conf_monitor_conexoes',
  '/conf-google-drive': 'conf_google_drive',
  '/conf-conexoes': 'conf_conexoes',
  '/conf-sistema': 'conf_sistema',
};

// Conf. Conexoes reune as paginas de configuracao de cada conexao em abas: quem tem acesso a qualquer uma delas entra, e cada aba segue o perfil da pagina original.
export const CONF_CONEXOES_SUBPAGINAS = ['/conf-monitor-conexoes', '/conf-anthropic', '/bling', '/config-ml', '/conf-nuvemshop', '/config-shopee', '/config-magalu', '/config-olx', '/conf-gmail'];

// Conf. Sistema: mesma ideia (a aba Perfil e' so do Bruno, por isso nao entra na lista)
export const CONF_SISTEMA_SUBPAGINAS = ['/configuracoes-gerais', '/conf-gerais', '/conf-separacao', '/conf-auditoria'];
const PAGINAS_AGREGADAS: Array<[string, string[]]> = [['/conf-conexoes', CONF_CONEXOES_SUBPAGINAS], ['/conf-sistema', CONF_SISTEMA_SUBPAGINAS]];

export function isBruno(user?: LoggedUser | null) {
  return String(user?.username || '').trim().toLowerCase() === 'bruno';
}

export function canAccessPage(user: LoggedUser | null | undefined, href: string): boolean {
  if (!user) return false;
  if (isBruno(user) || user.isAdmin) return true;
  const limpo = href.split('?')[0].replace(/\/$/, '');
  for (const [base, subs] of PAGINAS_AGREGADAS) {
    if (limpo === base || limpo.indexOf(base + '/') === 0) return subs.some((h) => canAccessPage(user, h));
  }
  const key = resolvePageKey(href);
  if (!key) return true;
  return Array.isArray(user.permissions?.[key]) && user.permissions![key].includes('__page');
}

export function canProcessAction(user: LoggedUser | null | undefined, pageKey: string, actionKey: string) {
  if (!user) return false;
  if (isBruno(user) || user.isAdmin) return true;
  return Array.isArray(user.permissions?.[pageKey]) && user.permissions![pageKey].includes(actionKey);
}

export function resolvePageKey(pathname: string) {
  const clean = pathname.split('?')[0].replace(/\/$/, '') || '/';
  let bestHref = '';
  let bestKey = '';
  for (const [href, key] of Object.entries(PAGE_KEY_BY_HREF)) {
    const normalizedHref = href.replace(/\/$/, '') || '/';
    const matches = normalizedHref === '/' ? clean === '/' : clean === normalizedHref || clean.startsWith(`${normalizedHref}/`);
    if (matches && normalizedHref.length > bestHref.length) {
      bestHref = normalizedHref;
      bestKey = key;
    }
  }
  return bestKey;
}
