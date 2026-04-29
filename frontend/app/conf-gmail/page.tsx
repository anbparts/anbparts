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
  const [meta, setMeta] = useState<any>(null);
  const [motos, setMotos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [driveMeta, setDriveMeta] = useState<any>(null);

  // Gmail fields
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailRefreshToken, setGmailRefreshToken] = useState('');
  const [otpRemetente, setOtpRemetente] = useState('detran.sisdev@sp.gov.br');
  const [otpAssunto, setOtpAssunto] = useState('[DETRAN-SISDEV] Codigo de Verificacao');
  const [otpRegex, setOtpRegex] = useState('([A-Z0-9]{4,10})\\s+e seu codigo de verificacao');

  // Drive fields
  const [rootFolderId, setRootFolderId] = useState('');
  const [motoDirs, setMotoDirs] = useState<Record<string, string>>({});
  const [loadingPastas, setLoadingPastas] = useState(false);
  const [pastasDrive, setPastasDrive] = useState<any[]>([]);

  useEffect(() => {
    load();
    api.motos.list().then(setMotos).catch(() => {});
    carregarDriveConfig();
  }, []);

  async function load() {
    try {
      const response = await api.detran.getConfig();
      const config = response.config || {};
      setMeta(config);
      setGmailEmail(config.gmailEmail || '');
      setGmailClientId(config.gmailClientId || '');
      setOtpRemetente(config.otpRemetente || 'detran.sisdev@sp.gov.br');
      setOtpAssunto(config.otpAssunto || '[DETRAN-SISDEV] Codigo de Verificacao');
      setOtpRegex(config.otpRegex || '([A-Z0-9]{4,10})\\s+e seu codigo de verificacao');
    } catch {}
  }

  async function carregarDriveConfig() {
    try {
      const resp = await fetch(`${API}/google-drive/config`, { credentials: 'include' });
      const data = await resp.json();
      if (data.ok) {
        setDriveMeta(data);
        setRootFolderId(data.rootFolderId || '');
        setMotoDirs(data.motoDirs || {});
      }
    } catch {}
  }

  async function salvarGmail() {
    setSaving(true);
    setFeedback('');
    try {
      await api.detran.saveConfig({
        gmailEmail, gmailClientId,
        ...(gmailClientSecret ? { gmailClientSecret } : {}),
        ...(gmailRefreshToken ? { gmailRefreshToken } : {}),
        otpRemetente, otpAssunto, otpRegex,
      });
      setGmailClientSecret('');
      setGmailRefreshToken('');
      setPastasDrive([]);
      await load();
      await carregarDriveConfig();
      setFeedback('OK - Configuracoes Gmail salvas!');
      setFeedback('✓ Configurações Gmail salvas!');
      setFeedback('OK - Configuracoes Gmail salvas!');
    } catch (e: any) { setFeedback(`Erro: ${e.message}`); }
    setSaving(false);
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

  async function reconectar() {
    try {
      const resp = await fetch(`${API}/google-drive/auth-url`, { credentials: 'include' });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Erro ao gerar URL');
    } catch (e: any) { alert(String(e)); }
  }

  const driveConnected = Boolean(driveMeta?.connected);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Config. Gmail</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Configurações OAuth Google — Acesso e-mail e Google Drive</div>
        </div>
        {feedback && <span style={{ fontSize: 12, color: feedback.startsWith('✓') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{feedback}</span>}
      </div>

      <div style={{ padding: 28, display: 'grid', gap: 20, maxWidth: 860 }}>

        {/* BLOCO 1 — Configuração Acesso e-mail */}
        <div style={s.card}>
          <div style={s.sectionHead}>
            <div style={s.sectionTitle}>📧 Configuração Acesso e-mail</div>
            <div style={s.sectionSub}>OAuth Google para leitura do código OTP do SISDEV e acesso ao Google Drive</div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={s.label}>Email monitorado</label>
                <input style={s.input} value={gmailEmail} onChange={e => setGmailEmail(e.target.value)} placeholder="bruno@gmail.com" />
              </div>
              <div>
                <label style={s.label}>Gmail Client ID</label>
                <input style={s.input} value={gmailClientId} onChange={e => setGmailClientId(e.target.value)} placeholder="OAuth Client ID do projeto Google" />
              </div>
              <div>
                <label style={s.label}>Gmail Client Secret</label>
                <input style={s.input} type="password" value={gmailClientSecret} onChange={e => setGmailClientSecret(e.target.value)} placeholder={meta?.hasGmailClientSecret ? 'Já configurado — preencha só para trocar' : 'Client Secret do OAuth'} />
              </div>
              <div>
                <label style={s.label}>Gmail Refresh Token</label>
                <input style={s.input} type="password" value={gmailRefreshToken} onChange={e => setGmailRefreshToken(e.target.value)} placeholder={meta?.hasGmailRefreshToken ? 'Já configurado — preencha só para trocar' : 'Refresh Token do Gmail OAuth'} />
              </div>
              <div>
                <label style={s.label}>Remetente esperado</label>
                <input style={s.input} value={otpRemetente} onChange={e => setOtpRemetente(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Assunto esperado</label>
                <input style={s.input} value={otpAssunto} onChange={e => setOtpAssunto(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={s.label}>Regex do código OTP</label>
                <input style={s.input} value={otpRegex} onChange={e => setOtpRegex(e.target.value)} />
              </div>
            </div>

            {/* Status e indicadores */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const }}>
              {[
                { label: 'Client Secret', ok: meta?.hasGmailClientSecret },
                { label: 'Refresh Token', ok: meta?.hasGmailRefreshToken },
              ].map(item => (
                <span key={item.label} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: item.ok ? '#f0fdf4' : '#f1f5f9', color: item.ok ? '#16a34a' : 'var(--gray-400)', border: `1px solid ${item.ok ? '#86efac' : 'var(--border)'}` }}>
                  {item.ok ? '✓' : '○'} {item.label}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff' }} onClick={salvarGmail} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar configurações Gmail'}
              </button>
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
              <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: driveConnected ? '#f0fdf4' : '#fef9c3', color: driveConnected ? '#16a34a' : '#92400e', border: `1px solid ${driveConnected ? '#86efac' : '#fde68a'}` }}>
                {driveConnected ? '✓ Token disponível' : '⚠ Reconectar necessário'}
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
              <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
                <strong>Reconecte o Google</strong> para gerar um novo token com o escopo <code>drive.readonly</code> incluído.
                <button style={{ ...s.btn, background: '#1d4ed8', color: '#fff', marginLeft: 12, padding: '5px 14px' }} onClick={reconectar}>
                  🔑 Reconectar com Google
                </button>
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
