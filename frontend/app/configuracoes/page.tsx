'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useAuth } from '@/lib/auth';
import { isBruno, type AppPagePermission, type AppPermissions } from '@/lib/permissions';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5, display: 'block' },
  input: { width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 13, color: 'var(--gray-800)', outline: 'none', background: '#fff', boxSizing: 'border-box' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid transparent', borderRadius: 8, padding: '9px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  th: { fontSize: 11, fontWeight: 800, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '11px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left' },
  td: { fontSize: 13, color: 'var(--gray-700)', padding: '11px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
};

type AppUser = {
  id: number;
  username: string;
  displayName: string;
  active: boolean;
  isAdmin: boolean;
  permissions: AppPermissions;
};

const EMPTY_FORM = {
  username: '',
  displayName: '',
  password: '',
  active: true,
  isAdmin: false,
  permissions: {} as AppPermissions,
};

async function readApi(resp: Response, fallback: string) {
  const text = await resp.text().catch(() => '');
  let data: any = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = {}; }
  }
  if (!resp.ok || data.ok === false) throw new Error(data.error || data.message || fallback);
  return data;
}

function hasPage(permissions: AppPermissions, pageKey: string) {
  return Array.isArray(permissions[pageKey]) && permissions[pageKey].includes('__page');
}

function hasAction(permissions: AppPermissions, pageKey: string, actionKey: string) {
  return Array.isArray(permissions[pageKey]) && permissions[pageKey].includes(actionKey);
}

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<AppUser[]>([]);
  const [catalogo, setCatalogo] = useState<AppPagePermission[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [senhaReset, setSenhaReset] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [isPhone, setIsPhone] = useState(false);

  const selecionado = useMemo(() => usuarios.find((item) => item.id === selecionadoId) || null, [usuarios, selecionadoId]);
  const isNovo = !selecionado;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    setMsg('');
    try {
      const [catResp, userResp] = await Promise.all([
        fetch(`${API}/configuracoes/catalogo`, { credentials: 'include' }),
        fetch(`${API}/configuracoes/usuarios`, { credentials: 'include' }),
      ]);
      const catData = await readApi(catResp, 'Erro ao carregar catalogo');
      const userData = await readApi(userResp, 'Erro ao carregar usuarios');
      setCatalogo(Array.isArray(catData.catalogo) ? catData.catalogo : []);
      const lista = Array.isArray(userData.usuarios) ? userData.usuarios : [];
      setUsuarios(lista);
      if (!selecionadoId && lista.length) selecionarUsuario(lista[0]);
    } catch (e: any) {
      setMsg(e.message || 'Erro ao carregar configuracoes');
    } finally {
      setLoading(false);
    }
  }

  function selecionarUsuario(usuario: AppUser) {
    setSelecionadoId(usuario.id);
    setSenhaReset('');
    setForm({
      username: usuario.username,
      displayName: usuario.displayName,
      password: '',
      active: usuario.active,
      isAdmin: usuario.isAdmin,
      permissions: usuario.permissions || {},
    });
  }

  function novoUsuario() {
    setSelecionadoId(null);
    setSenhaReset('');
    setForm(EMPTY_FORM);
  }

  function togglePage(pageKey: string, checked: boolean) {
    setForm((prev) => {
      const permissions = { ...prev.permissions };
      const atual = new Set(permissions[pageKey] || []);
      if (checked) atual.add('__page');
      else atual.clear();
      permissions[pageKey] = Array.from(atual);
      return { ...prev, permissions };
    });
  }

  function toggleAction(pageKey: string, actionKey: string, checked: boolean) {
    setForm((prev) => {
      const permissions = { ...prev.permissions };
      const atual = new Set(permissions[pageKey] || []);
      atual.add('__page');
      checked ? atual.add(actionKey) : atual.delete(actionKey);
      permissions[pageKey] = Array.from(atual);
      return { ...prev, permissions };
    });
  }

  function liberarTudo() {
    const permissions = catalogo.reduce<AppPermissions>((acc, page) => {
      acc[page.key] = ['__page', ...page.actions.map((action) => action.key)];
      return acc;
    }, {});
    setForm((prev) => ({ ...prev, permissions }));
  }

  function limparPermissoes() {
    setForm((prev) => ({ ...prev, permissions: {} }));
  }

  async function salvar() {
    setSaving(true);
    setMsg('');
    try {
      const url = isNovo ? `${API}/configuracoes/usuarios` : `${API}/configuracoes/usuarios/${selecionadoId}`;
      const payload = isNovo ? form : { ...form, password: undefined };
      const resp = await fetch(url, {
        method: isNovo ? 'POST' : 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await readApi(resp, 'Erro ao salvar usuario');
      setMsg('Usuario salvo.');
      await carregar();
    } catch (e: any) {
      setMsg(e.message || 'Erro ao salvar usuario');
    } finally {
      setSaving(false);
    }
  }

  async function resetarSenha() {
    if (!selecionadoId || senhaReset.trim().length < 4) return alert('Informe uma nova senha com pelo menos 4 caracteres.');
    setSaving(true);
    setMsg('');
    try {
      const resp = await fetch(`${API}/configuracoes/usuarios/${selecionadoId}/reset-senha`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: senhaReset }),
      });
      await readApi(resp, 'Erro ao resetar senha');
      setSenhaReset('');
      setMsg('Senha resetada.');
    } catch (e: any) {
      setMsg(e.message || 'Erro ao resetar senha');
    } finally {
      setSaving(false);
    }
  }

  if (!isBruno(user)) {
    return (
      <div style={{ padding: 24 }}>
        <div style={s.card}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Acesso bloqueado</div>
          <div style={{ marginTop: 8, color: '#64748b' }}>Somente o Bruno pode acessar Configuracoes.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...s.topbar, height: isPhone ? 'auto' : 'var(--topbar-h)', minHeight: 'var(--topbar-h)', padding: isPhone ? '12px 14px' : '0 28px', gap: 10, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Configuracoes</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Usuarios, senhas e permissoes do sistema</div>
        </div>
        <button onClick={novoUsuario} style={{ ...s.btn, background: '#0f172a', color: '#fff', width: isPhone ? '100%' : undefined }}>+ Novo usuario</button>
      </div>

      <div style={{ padding: isPhone ? 14 : 22, display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(260px, 340px) 1fr', gap: 16 }}>
        <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Usuarios</div>
          {loading ? (
            <div style={{ padding: 18, color: '#64748b' }}>Carregando...</div>
          ) : usuarios.length === 0 ? (
            <div style={{ padding: 18, color: '#64748b' }}>Nenhum usuario cadastrado.</div>
          ) : (
            <div>
              {usuarios.map((usuario) => (
                <button key={usuario.id} onClick={() => selecionarUsuario(usuario)}
                  style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--border)', background: usuario.id === selecionadoId ? '#eff6ff' : '#fff', padding: 14, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{usuario.displayName}</div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: usuario.active ? '#16a34a' : '#dc2626' }}>{usuario.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>{usuario.username}</div>
                  {usuario.isAdmin && <div style={{ marginTop: 6, fontSize: 11, color: '#2563eb', fontWeight: 800 }}>Administrador</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', marginBottom: 14 }}>{isNovo ? 'Novo usuario' : `Editar ${selecionado?.displayName || ''}`}</div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div><label style={s.label}>Usuario</label><input style={s.input} value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().trim() }))} placeholder="ex: nelson" /></div>
              <div><label style={s.label}>Nome</label><input style={s.input} value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} placeholder="Nome exibido" /></div>
              {isNovo && <div><label style={s.label}>Senha inicial</label><input type="password" style={s.input} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Senha inicial" /></div>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', fontWeight: 700 }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
                Usuario ativo
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', fontWeight: 700 }}>
                <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm((p) => ({ ...p, isAdmin: e.target.checked }))} />
                Administrador
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button onClick={salvar} disabled={saving || !form.username || !form.displayName || (isNovo && !form.password)}
                style={{ ...s.btn, background: '#2563eb', color: '#fff', opacity: saving ? 0.7 : 1 }}>{saving ? 'Salvando...' : 'Salvar usuario'}</button>
              <button onClick={liberarTudo} style={{ ...s.btn, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>Liberar tudo</button>
              <button onClick={limparPermissoes} style={{ ...s.btn, background: '#fff', borderColor: 'var(--border)', color: '#64748b' }}>Limpar permissoes</button>
            </div>
            {msg && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: msg.includes('Erro') || msg.includes('erro') ? '#dc2626' : '#166534' }}>{msg}</div>}
          </div>

          {!isNovo && (
            <div style={s.card}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginBottom: 12 }}>Resetar senha</div>
              <div style={{ display: 'flex', gap: 10, flexDirection: isPhone ? 'column' : 'row' }}>
                <input type="password" style={s.input} value={senhaReset} onChange={(e) => setSenhaReset(e.target.value)} placeholder="Nova senha" />
                <button onClick={resetarSenha} disabled={saving || senhaReset.length < 4} style={{ ...s.btn, background: '#0f172a', color: '#fff', whiteSpace: 'nowrap', opacity: saving ? 0.7 : 1 }}>Resetar senha</button>
              </div>
            </div>
          )}

          <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Perfil de acesso</div>
                <div style={{ marginTop: 3, fontSize: 12, color: '#64748b' }}>Marque a pagina e depois os botoes que o usuario pode processar.</div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <th style={s.th}>Pagina</th>
                    <th style={s.th}>Acesso</th>
                    <th style={s.th}>Botoes / processos</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogo.map((page) => (
                    <tr key={page.key}>
                      <td style={{ ...s.td, fontWeight: 800, color: '#0f172a', minWidth: 180 }}>{page.label}</td>
                      <td style={s.td}>
                        <input type="checkbox" checked={form.isAdmin || hasPage(form.permissions, page.key)} disabled={form.isAdmin} onChange={(e) => togglePage(page.key, e.target.checked)} />
                      </td>
                      <td style={{ ...s.td, minWidth: 260 }}>
                        {page.actions.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>Sem botoes especificos</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {page.actions.map((action) => (
                              <label key={action.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', fontWeight: 700 }}>
                                <input type="checkbox" checked={form.isAdmin || hasAction(form.permissions, page.key, action.key)} disabled={form.isAdmin} onChange={(e) => toggleAction(page.key, action.key, e.target.checked)} />
                                {action.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
