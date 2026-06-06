'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  sectionHead: { padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' },
  sectionSub: { fontSize: 12, color: 'var(--gray-400)', marginTop: 2 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5, display: 'block' },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' as const, border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function ConfGmailPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [driveMeta, setDriveMeta] = useState<any>(null);

  // Credenciais OAuth Google Drive (bloco novo)
  const [driveClientId, setDriveClientId] = useState('');
  const [driveClientSecret, setDriveClientSecret] = useState('');
  const [driveRefreshToken, setDriveRefreshToken] = useState('');
  const [driveClientSecretConfigured, setDriveClientSecretConfigured] = useState(false);
  const [driveRefreshTokenConfigured, setDriveRefreshTokenConfigured] = useState(false);
  const [savingDriveCreds, setSavingDriveCreds] = useState(false);
  const [driveCredsMsg, setDriveCredsMsg] = useState('');

  // Drive fields
  const [rootFolderId, setRootFolderId] = useState('');
  const [motoDirs, setMotoDirs] = useState<Record<string, string>>({});
  const [loadingPastas, setLoadingPastas] = useState(false);
  const [pastasDrive, setPastasDrive] = useState<any[]>([]);

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    carregarDriveConfig();

    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') {
      setFeedback('OK - Google conectado e token atualizado!');
      window.history.replaceState({}, '', '/conf-gmail');
    }
  }, []);

  async function carregarDriveConfig() {
    try {
      const resp = await fetch(`${API}/google-drive/config`, { credentials: 'include' });
      const data = await resp.json();
      if (data.ok) {
        setDriveMeta(data);
        setDriveClientId(data.clientId || '');
        setDriveClientSecretConfigured(!!data.clientSecretConfigured);
        setDriveRefreshTokenConfigured(!!data.refreshTokenConfigured);
        setRootFolderId(data.rootFolderId || '');
        setMotoDirs(data.motoDirs || {});
      }
    } catch {}
  }


  async function salvarDrive() {
    setSaving(true);
    setFeedback('');
    try {
      const resp = await fetch(`${API}/google-drive/config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootFolderId, motoDirs }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Erro ao salvar Drive (${resp.status})`);
      }
      await carregarDriveConfig();
      setFeedback('OK - Configuracoes Drive salvas!');
      setFeedback('✓ Configurações Drive salvas!');
      setFeedback('OK - Configuracoes Drive salvas!');
    } catch (e: any) { setFeedback(`Erro: ${e.message}`); }
    setSaving(false);
  }

  async function listarPastas() {
    setLoadingPastas(true);
    setFeedback('Buscando pastas no Google Drive...');
    try {
      const resp = await fetch(`${API}/google-drive/listar-pastas-moto`, { credentials: 'include' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || `Erro ao listar pastas (${resp.status})`);

      const pastas = data.pastas || [];
      setPastasDrive(pastas);
      if (pastas.length) {
        setFeedback(`âœ“ ${pastas.length} pasta(s) carregada(s) do Drive.`);
        setFeedback(`OK - ${pastas.length} pasta(s) carregada(s) do Drive.`);
      } else {
        const diag = data.diagnostico;
        const raiz = diag?.rootFolderName ? ` "${diag.rootFolderName}"` : '';
        setFeedback(`Nenhuma subpasta encontrada na pasta raiz${raiz}. Verifique se o token atual tem acesso ao conteúdo dessa pasta.`);
      }
      await carregarDriveConfig();
    } catch (e: any) {
      setPastasDrive([]);
      setFeedback(`Erro Drive: ${e.message || e}`);
    }
    setLoadingPastas(false);
  }

  const driveConnected = Boolean(driveMeta?.connected);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Google</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Credenciais OAuth Google e configuração do Google Drive</div>
        </div>
        {feedback && <span style={{ fontSize: 12, color: feedback.startsWith('OK') || feedback.startsWith('Salvando') || feedback.startsWith('Abrindo') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{feedback}</span>}
      </div>

      <div style={{ padding: 28, display: 'grid', gap: 20, maxWidth: 860 }}>

        {/* BLOCO 1 — Credenciais OAuth Google Drive */}
        <div style={s.card}>
          <div style={s.sectionHead}>
            <div style={s.sectionTitle}>🔑 Credenciais OAuth Google Drive</div>
            <div style={s.sectionSub}>Client ID, Client Secret e Refresh Token para acesso ao Google Drive</div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={s.label}>Client ID</label>
                <input style={s.input} value={driveClientId} onChange={e => setDriveClientId(e.target.value)} placeholder="Ex: 937053908914-kkbp1gal8btl25jan30..." />
              </div>
              <div>
                <label style={s.label}>
                  Client Secret
                  {driveClientSecretConfigured && !driveClientSecret && <span style={{ marginLeft: 6, fontSize: 10, color: '#16a34a', fontWeight: 700 }}>● Configurado</span>}
                </label>
                <input style={s.input} type="password" value={driveClientSecret} onChange={e => setDriveClientSecret(e.target.value)}
                  placeholder={driveClientSecretConfigured ? 'Em branco = manter atual' : 'Cole o Client Secret'} />
              </div>
              <div>
                <label style={s.label}>
                  Refresh Token
                  {driveRefreshTokenConfigured && !driveRefreshToken && <span style={{ marginLeft: 6, fontSize: 10, color: '#16a34a', fontWeight: 700 }}>● Configurado</span>}
                </label>
                <input style={s.input} type="password" value={driveRefreshToken} onChange={e => setDriveRefreshToken(e.target.value)}
                  placeholder={driveRefreshTokenConfigured ? 'Em branco = manter atual' : 'Cole o Refresh Token'} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 14 }}>
              Gere em <strong>developers.google.com/oauthplayground</strong> com o scope <code>https://www.googleapis.com/auth/drive</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff' }} disabled={savingDriveCreds} onClick={async () => {
                setSavingDriveCreds(true);
                setDriveCredsMsg('');
                try {
                  const body: any = { clientId: driveClientId };
                  if (driveClientSecret) body.clientSecret = driveClientSecret;
                  if (driveRefreshToken) body.refreshToken = driveRefreshToken;
                  const resp = await fetch(`${API}/google-drive/config`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                  const data = await resp.json();
                  if (!data.ok) throw new Error(data.error || 'Erro ao salvar');
                  setDriveClientSecret('');
                  setDriveRefreshToken('');
                  await carregarDriveConfig();
                  setDriveCredsMsg('✓ Credenciais salvas com sucesso!');
                } catch (e: any) {
                  setDriveCredsMsg(`Erro: ${e.message}`);
                }
                setSavingDriveCreds(false);
              }}>
                {savingDriveCreds ? 'Salvando...' : 'Salvar credenciais Drive'}
              </button>
              {driveCredsMsg && <span style={{ fontSize: 12, color: driveCredsMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{driveCredsMsg}</span>}
            </div>
          </div>
        </div>

        {/* BLOCO 2 — Configuração Acesso Fotos Drive */}
        <div style={s.card}>
          <div style={s.sectionHead}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={s.sectionTitle}>📁 Configuração Acesso Fotos Drive</div>
                <div style={s.sectionSub}>Pasta raiz e mapeamento de diretórios por moto para importação de fotos na Nuvemshop</div>
              </div>
              <span style={{ display: 'none' }}>
                {driveConnected ? '✓ Token disponível' : '⚠ Reconectar necessário'}
              </span>
              <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: driveConnected ? '#f0fdf4' : '#fef9c3', color: driveConnected ? '#16a34a' : '#92400e', border: `1px solid ${driveConnected ? '#86efac' : '#fde68a'}` }}>
                {driveConnected ? 'Token validado' : 'Token pendente'}
              </span>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={s.label}>ID da Pasta Raiz das Motos (Google Drive)</label>
              <input style={s.input} value={rootFolderId} onChange={e => setRootFolderId(e.target.value)}
                placeholder="Ex: 10ZKdaibBMvPfNiE0-xvXR7QeiK0qaTvG" />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                Extraia o ID do link do Drive: drive.google.com/drive/folders/<strong>ID_AQUI</strong>
              </div>
            </div>

            {/* Reconectar para incluir escopo Drive */}
            {!driveConnected && (
              <div style={{ display: 'none' }}>
                <strong>Reconecte o Google</strong> para gerar um novo token com o escopo <code>drive.readonly</code> incluído.
                <span style={{ display: 'none' }}>
                  🔑 Reconectar com Google
                </span>
              </div>
            )}

            {driveMeta?.connectionError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.6 }}>
                Erro atual do Drive: {driveMeta.connectionError}
              </div>
            )}

            {/* Mapeamento de motos */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={{ ...s.label, marginBottom: 0 }}>Mapeamento de pastas por moto</label>
                <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', fontSize: 12, padding: '5px 12px' }}
                  onClick={listarPastas} disabled={loadingPastas}>
                  {loadingPastas ? '⏳ Carregando...' : '🔄 Listar pastas do Drive'}
                </button>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {motos.map(m => (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>#{m.id} — {m.marca} {m.modelo}</div>
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
                        {motoDirs[String(m.id)] ? '✓ Configurado (ID: ' + motoDirs[String(m.id)].slice(0, 12) + '...)' : '— Clique em "Listar pastas do Drive" —'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff' }} onClick={salvarDrive} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar configurações Drive'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
