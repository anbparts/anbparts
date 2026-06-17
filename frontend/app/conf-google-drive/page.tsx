'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6, display: 'block' },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' as const, border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  h3: { fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 },
  sub: { fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 },
  p: { fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 10 },
};

function ConfiguredBadge() {
  return <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#16a34a' }}>● Configurado</span>;
}

export default function ConfGoogleDrivePage() {
  const [config, setConfig] = useState<any>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [pastasDrive, setPastasDrive] = useState<any[]>([]);
  const [motoDirs, setMotoDirs] = useState<Record<string, string>>({});

  // Bloco 1 — Credenciais OAuth
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [clientSecretConfigured, setClientSecretConfigured] = useState(false);
  const [refreshTokenConfigured, setRefreshTokenConfigured] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState('');

  // Bloco 2 — Acesso Fotos Drive
  const [rootFolderId, setRootFolderId] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const [loadingPastas, setLoadingPastas] = useState(false);

  // Bloco 4 — Pasta Pré-Cadastro
  const [preCadastroPastaId, setPreCadastroPastaId] = useState('');
  const [savingPreCadastro, setSavingPreCadastro] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') window.history.replaceState({}, '', '/conf-google-drive');
    carregarConfig();
    api.motos.list().then(setMotos).catch(() => {});
  }, []);

  async function carregarConfig() {
    try {
      const resp = await fetch(`${API}/google-drive/config`, { credentials: 'include' });
      const data = await resp.json();
      if (data.ok) {
        setConfig(data);
        setClientId(data.clientId || '');
        setRootFolderId(data.rootFolderId || '');
        setMotoDirs(data.motoDirs || {});
        setClientSecretConfigured(!!data.clientSecretConfigured);
        setRefreshTokenConfigured(!!data.refreshTokenConfigured);
        setPreCadastroPastaId(data.preCadastroPastaId || '');
      }
    } catch {}
  }

  async function salvarCredenciais() {
    setSavingCreds(true);
    setCredsMsg('');
    try {
      const body: any = { clientId };
      if (clientSecret) body.clientSecret = clientSecret;
      if (refreshToken) body.refreshToken = refreshToken;
      const resp = await fetch(`${API}/google-drive/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
      setClientSecret('');
      setRefreshToken('');
      setCredsMsg('Salvo com sucesso.');
      await carregarConfig();
    } catch (e: any) {
      setCredsMsg(e.message || 'Erro ao salvar');
    }
    setSavingCreds(false);
  }

  async function salvarDrive() {
    setSavingDrive(true);
    try {
      await fetch(`${API}/google-drive/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootFolderId }),
      });
      await carregarConfig();
      alert('Configuração salva!');
    } catch {}
    setSavingDrive(false);
  }

  async function conectar() {
    const resp = await fetch(`${API}/google-drive/auth-url`, { credentials: 'include' });
    const data = await resp.json();
    if (data.url) window.location.href = data.url;
    else alert(data.error || 'Erro ao gerar URL');
  }

  async function desconectar() {
    if (!confirm('Desconectar o Google Drive?')) return;
    await fetch(`${API}/google-drive/desconectar`, { method: 'POST', credentials: 'include' });
    await carregarConfig();
  }

  async function listarPastas() {
    setLoadingPastas(true);
    try {
      const resp = await fetch(`${API}/google-drive/listar-pastas-moto`, { credentials: 'include' });
      const data = await resp.json();
      if (data.ok) setPastasDrive(data.pastas || []);
      else alert(data.error || 'Erro ao listar pastas');
    } catch (e: any) { alert(e.message); }
    setLoadingPastas(false);
  }

  async function salvarPreCadastro() {
    setSavingPreCadastro(true);
    try {
      await fetch(`${API}/google-drive/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preCadastroPastaId }),
      });
      await carregarConfig();
      alert('Pasta do pré-cadastro salva!');
    } catch {}
    setSavingPreCadastro(false);
  }

  async function salvarDirs() {
    setSavingDrive(true);
    try {
      await fetch(`${API}/google-drive/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motoDirs }),
      });
      alert('Diretórios salvos!');
    } catch {}
    setSavingDrive(false);
  }

  const connected = config?.connected;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Google Drive</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Integração com Google Drive para importação de fotos</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: connected ? '#f0fdf4' : '#f1f5f9', color: connected ? '#16a34a' : 'var(--gray-400)', border: `1px solid ${connected ? '#86efac' : 'var(--border)'}` }}>
          {connected ? '✓ Conectado' : 'Não conectado'}
        </span>
      </div>

      <div style={{ padding: 28, maxWidth: 760 }}>

        {/* ── BLOCO 1: Credenciais OAuth ── */}
        <div style={s.card}>
          <div style={s.h3}>🔑 Credenciais OAuth Google</div>
          <div style={s.sub}>Client ID, Client Secret e Refresh Token do projeto no Google Cloud Console</div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={s.label}>Client ID</label>
              <input style={s.input} value={clientId} onChange={e => setClientId(e.target.value)}
                placeholder="Ex: 937053908914-kkbp1gal8btl25jan30..." />
            </div>
            <div>
              <label style={s.label}>
                Client Secret
                {clientSecretConfigured && !clientSecret && <ConfiguredBadge />}
              </label>
              <input style={s.input} type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                placeholder={clientSecretConfigured ? '(em branco = manter atual)' : 'Cole o Client Secret'} />
            </div>
            <div>
              <label style={s.label}>
                Refresh Token
                {refreshTokenConfigured && !refreshToken && <ConfiguredBadge />}
              </label>
              <input style={s.input} type="password" value={refreshToken} onChange={e => setRefreshToken(e.target.value)}
                placeholder={refreshTokenConfigured ? '(em branco = manter atual)' : 'Cole o Refresh Token'} />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 5 }}>
                Gere em <strong>developers.google.com/oauthplayground</strong> com scope <code>https://www.googleapis.com/auth/drive</code>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarCredenciais} disabled={savingCreds}>
              {savingCreds ? 'Salvando...' : 'Salvar credenciais'}
            </button>
            {credsMsg && (
              <span style={{ fontSize: 12, color: credsMsg.includes('sucesso') ? '#16a34a' : '#dc2626' }}>{credsMsg}</span>
            )}
          </div>
        </div>

        {/* ── BLOCO 2: Configuração Acesso Fotos Drive ── */}
        <div style={s.card}>
          <div style={s.h3}>📁 Configuração Acesso Fotos Drive</div>
          <div style={s.sub}>Pasta raiz e conexão OAuth com o Google Drive</div>

          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>ID da Pasta Raiz das Motos</label>
            <input style={s.input} value={rootFolderId} onChange={e => setRootFolderId(e.target.value)}
              placeholder="Ex: 10ZKdaibBMvPfNiE0-xvXR7QeiK0qaTvG" />
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              Extraia o ID do link: drive.google.com/drive/folders/<strong>ID_AQUI</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarDrive} disabled={savingDrive}>
              {savingDrive ? 'Salvando...' : 'Salvar'}
            </button>
            {config?.clientId && !connected && (
              <button style={{ ...s.btn, background: '#4285f4', color: '#fff' }} onClick={conectar}>
                🔑 Conectar com Google
              </button>
            )}
            {connected && (
              <button style={{ ...s.btn, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }} onClick={desconectar}>
                Desconectar
              </button>
            )}
          </div>
        </div>

        {/* ── BLOCO 4: Pasta Pré-Cadastro ── */}
        <div style={s.card}>
          <div style={s.h3}>📂 Pasta do Pré-Cadastro</div>
          <div style={s.sub}>Pasta raiz do Drive usada para verificar fotos do pré-cadastro completo</div>

          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>
              ID da Pasta Raiz do Pré-Cadastro
              {preCadastroPastaId && <ConfiguredBadge />}
            </label>
            <input style={s.input} value={preCadastroPastaId} onChange={e => setPreCadastroPastaId(e.target.value)}
              placeholder="Ex: 1aBcDeFgHiJkLmNoPqRsT..." />
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              Dentro desta pasta, cada SKU deve ter uma subpasta cujo nome começa com o código do SKU (ex: HD04_0008 - MÓDULO CDI ECU)
            </div>
          </div>

          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvarPreCadastro} disabled={savingPreCadastro}>
            {savingPreCadastro ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

        {/* ── BLOCO 3: Mapeamento por Moto ── */}
        {connected && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={s.h3}>🗂️ Mapeamento de Pastas por Moto</div>
                <div style={s.sub}>Associe a pasta do Drive correspondente a cada moto</div>
              </div>
              <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-700)', fontSize: 12 }}
                onClick={listarPastas} disabled={loadingPastas}>
                {loadingPastas ? '⏳ Carregando...' : '🔄 Listar pastas'}
              </button>
            </div>
            <p style={s.p}>
              {pastasDrive.length > 0
                ? 'Selecione a pasta do Drive correspondente a cada moto.'
                : 'Clique em "Listar pastas" para carregar as pastas disponíveis.'}
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {motos.map(m => (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>
                    #{m.id} — {m.marca} {m.modelo}
                  </div>
                  {pastasDrive.length > 0 ? (
                    <select style={s.input} value={motoDirs[String(m.id)] || ''}
                      onChange={e => setMotoDirs(prev => ({ ...prev, [String(m.id)]: e.target.value }))}>
                      <option value="">— Selecione a pasta —</option>
                      {pastasDrive.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.marca} / {p.nome}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontSize: 12, color: motoDirs[String(m.id)] ? 'var(--green)' : 'var(--gray-300)' }}>
                      {motoDirs[String(m.id)] ? '✓ Configurado' : 'Não configurado'}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {pastasDrive.length > 0 && (
              <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff' }} onClick={salvarDirs} disabled={savingDrive}>
                {savingDrive ? 'Salvando...' : 'Salvar mapeamento'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
