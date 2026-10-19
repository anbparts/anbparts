'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  label: { fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase' as const, marginBottom: 8, display: 'block' },
};

async function chamar(path: string, init?: RequestInit) {
  const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `Erro ${resp.status}`);
  return data;
}

export default function ConfigOlxPage() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const ajustar = () => setIsPhone(typeof window !== 'undefined' && window.innerWidth <= 768);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [ativandoChat, setAtivandoChat] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [telefoneOculto, setTelefoneOculto] = useState(false);
  const [salvandoContato, setSalvandoContato] = useState(false);

  async function load() {
    const data = await chamar('/olx/status');
    setStatus(data);
    setTelefone(data.telefone || '');
    setCep(data.cep || '');
    setTelefoneOculto(!!data.telefoneOculto);
  }

  useEffect(() => {
    load().catch(() => {}).finally(() => setLoading(false));
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('conectado') === '1') {
        window.history.replaceState({}, '', '/config-olx');
        setTimeout(() => alert('OLX conectada com sucesso.'), 50);
      }
      if (params.get('erro')) {
        const message = params.get('erro') || 'Falha na autorizacao da OLX';
        window.history.replaceState({}, '', '/config-olx');
        setTimeout(() => alert(message), 50);
      }
    }
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      await chamar('/olx/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      setClientId('');
      setClientSecret('');
      await load();
      alert('Credenciais da OLX salvas.');
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  async function salvarContato() {
    setSalvandoContato(true);
    try {
      await chamar('/olx/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone, cep, telefoneOculto }),
      });
      await load();
      alert('Dados de contato dos anuncios salvos.');
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar');
    }
    setSalvandoContato(false);
  }

  async function conectar() {
    setConectando(true);
    try {
      const data = await chamar('/olx/auth-url');
      window.location.href = data.url;
    } catch (e: any) {
      alert(e.message || 'Erro ao gerar o link de autorizacao');
      setConectando(false);
    }
  }

  async function desconectar() {
    if (!confirm('Desconectar a OLX? Sera preciso autorizar de novo.')) return;
    setDesconectando(true);
    try {
      await chamar('/olx/desconectar', { method: 'POST' });
      await load();
    } finally { setDesconectando(false); }
  }

  async function ativarChat() {
    setAtivandoChat(true);
    try {
      await chamar('/olx/chat/ativar', { method: 'POST' });
      await load();
      alert('Chat ativado. As mensagens dos compradores passam a chegar em OLX > Conversas.');
    } catch (e: any) { alert(e.message || 'Erro ao ativar o chat'); }
    setAtivandoChat(false);
  }

  const connected = !!status?.connected;
  const credenciais = !!status?.clientIdConfigurado && !!status?.clientSecretConfigurado;

  if (loading) {
    return (
      <>
        <div style={{ ...s.topbar, padding: '12px 14px' }}><div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. OLX</div></div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. OLX</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Conexao com a API de integradores da OLX Brasil</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: connected ? '#f0fdf4' : '#f1f5f9', color: connected ? '#16a34a' : 'var(--gray-400)', border: `1px solid ${connected ? '#86efac' : 'var(--border)'}` }}>
          {connected ? '✓ Conectado' : 'Nao conectado'}
        </span>
      </div>

      <div style={{ padding: isPhone ? 12 : 28, maxWidth: 820 }}>
        <div style={{ ...s.card, padding: isPhone ? 14 : 26 }}>
          <div style={s.h3}>1. Credenciais do integrador</div>
          <p style={s.p}>
            Recebidas da equipe de integracao da OLX. O Client Secret fica guardado no servidor e nunca volta para esta tela.
            Deixe em branco o campo que nao quiser alterar.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Client ID {status?.clientIdConfigurado ? `(atual: ${status.clientId})` : ''}</label>
              <input style={s.input} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={status?.clientIdConfigurado ? 'Configurado' : 'Cole o Client ID'} autoComplete="off" />
            </div>
            <div>
              <label style={s.label}>Client Secret {status?.clientSecretConfigurado ? '(configurado)' : ''}</label>
              <input style={s.input} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={status?.clientSecretConfigurado ? '••••••••' : 'Cole o Client Secret'} autoComplete="new-password" />
            </div>
          </div>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: salvando || (!clientId.trim() && !clientSecret.trim()) ? 0.6 : 1 }} onClick={salvar} disabled={salvando || (!clientId.trim() && !clientSecret.trim())}>
            {salvando ? 'Salvando...' : 'Salvar credenciais'}
          </button>
        </div>

        <div style={{ ...s.card, padding: isPhone ? 14 : 26 }}>
          <div style={s.h3}>2. Conectar a conta da ANB na OLX</div>
          <p style={s.p}>
            Abre o login da OLX para autorizar o sistema a publicar anuncios, receber mensagens e configurar avisos da conta.
            Use o login da conta que vende as pecas.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--ink, #111)', color: '#fff', opacity: credenciais ? 1 : 0.5 }} onClick={conectar} disabled={!credenciais || conectando}>
              {conectando ? 'Abrindo OLX...' : connected ? 'Reconectar com a OLX' : 'Conectar com a OLX'}
            </button>
            {connected && (
              <button style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', borderColor: '#fca5a5' }} onClick={desconectar} disabled={desconectando}>
                {desconectando ? 'Desconectando...' : 'Desconectar'}
              </button>
            )}
          </div>
          {!credenciais && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 10 }}>Salve o Client ID e o Client Secret acima para liberar a conexao.</div>}
          {connected && (
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 14, lineHeight: 1.7 }}>
              {status?.usuarioNome ? <div>Conta: <strong>{status.usuarioNome}</strong>{status.usuarioEmail ? ` (${status.usuarioEmail})` : ''}</div> : null}
              {status?.connectedAt ? <div>Conectado em: {new Date(status.connectedAt).toLocaleString('pt-BR')}</div> : null}
              {status?.scopes ? <div>Permissoes solicitadas: {status.scopes}</div> : null}
            </div>
          )}
        </div>

        <div style={{ ...s.card, padding: isPhone ? 14 : 26 }}>
          <div style={s.h3}>3. Recebimento de mensagens (chat)</div>
          <p style={s.p}>
            {status?.chatAtivoEm
              ? 'Chat ativo desde ' + new Date(status.chatAtivoEm).toLocaleString('pt-BR') + '. As mensagens novas dos compradores aparecem em OLX > Conversas e geram o alerta do sistema.'
              : 'Ative o chat para a OLX enviar as mensagens dos compradores para o sistema (so chegam as mensagens enviadas depois da ativacao).'}
          </p>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: connected ? 1 : 0.5 }} onClick={ativarChat} disabled={!connected || ativandoChat}>
            {ativandoChat ? 'Ativando...' : status?.chatAtivoEm ? 'Reativar chat' : 'Ativar chat'}
          </button>
        </div>

        <div style={{ ...s.card, padding: isPhone ? 14 : 26 }}>
          <div style={s.h3}>Contato dos anuncios criados pelo sistema</div>
          <p style={s.p}>
            Telefone e CEP enviados nos anuncios novos. Deixe em branco para usar os da Empresa
            {status?.contatoEfetivo ? ` (hoje: telefone ${status.contatoEfetivo.telefone || 'nao configurado'}, CEP ${status.contatoEfetivo.cep || 'nao configurado'})` : ''}.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Telefone (DDD + numero)</label>
              <input style={s.input} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="11999999999" />
            </div>
            <div>
              <label style={s.label}>CEP</label>
              <input style={s.input} value={cep} onChange={(e) => setCep(e.target.value)} placeholder="13200000" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-600)', marginBottom: 14 }}>
            <input type="checkbox" checked={telefoneOculto} onChange={(e) => setTelefoneOculto(e.target.checked)} />
            Ocultar o telefone no anuncio (so o chat da OLX)
          </label>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: salvandoContato ? 0.7 : 1 }} onClick={salvarContato} disabled={salvandoContato}>
            {salvandoContato ? 'Salvando...' : 'Salvar contato'}
          </button>
        </div>

        <div style={{ ...s.card, padding: isPhone ? 14 : 26 }}>
          <div style={s.h3}>Dados tecnicos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
            Redirect URI (cadastrada na OLX): <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace' }}>{status?.redirectUri || `${API}/olx/callback`}</code>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
            A criacao de anuncios pela API depende do plano profissional da OLX; pecas de moto usam a categoria 2103.
          </div>
        </div>
      </div>
    </>
  );
}
