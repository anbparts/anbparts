import type { LoggedUser } from './auth';

export type AppAction = { key: string; label: string };
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
  '/dre': 'dre',
  '/despesas': 'despesas',
  '/prejuizos': 'prejuizos',
  '/investimentos': 'investimentos',
  '/bling/vendas': 'bling_vendas',
  '/bling/relatorio-vendas': 'bling_relatorio',
  '/bling/produtos': 'bling_produtos',
  '/bling/auditoria-automatica': 'bling_auditoria',
  '/mercado-livre/perguntas': 'mercado_livre_perguntas',
  '/nuvemshop/produtos': 'nuvemshop_produtos',
  '/detran': 'detran',
  '/detran/peca-avulsa': 'detran',
  '/detran/execucoes': 'detran',
  '/detran/logs': 'detran',
  '/configuracoes': 'configuracoes',
  '/bling': 'conexoes',
  '/configuracoes-gerais': 'conexoes',
  '/bling/config-produtos': 'conexoes',
  '/conf-gerais': 'conexoes',
  '/config-ml': 'conexoes',
  '/conf-nuvemshop': 'conexoes',
  '/conf-gmail': 'conexoes',
  '/conf-google-drive': 'conexoes',
};

export function isBruno(user?: LoggedUser | null) {
  return String(user?.username || '').trim().toLowerCase() === 'bruno';
}

export function canAccessPage(user: LoggedUser | null | undefined, href: string) {
  if (!user) return false;
  if (isBruno(user) || user.isAdmin) return true;
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
