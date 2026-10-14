'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
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
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [aba, setAba] = useState<'conexao' | 'anuncios' | 'conversas'>('conexao');
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [novoSku, setNovoSku] = useState('');
  const [novoListId, setNovoListId] = useState('');
  const [conversas, setConversas] = useState<any[]>([]);
  const [chatAberto, setChatAberto] = useState<any>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ativandoChat, setAtivandoChat] = useState(false);

  async function carregarAnuncios() {
    const d = await chamar('/olx/anuncios');
    setAnuncios(Array.isArray(d.itens) ? d.itens : []);
  }
  async function carregarConversas() {
    const d = await chamar('/olx/conversas');
    setConversas(Array.isArray(d.itens) ? d.itens : []);
  }
  async function abrirChat(c: any) {
    setChatAberto(c);
    setMensagens([]);
    const d = await chamar('/olx/conversas/' + encodeURIComponent(c.chatId));
    setMensagens(Array.isArray(d.mensagens) ? d.mensagens : []);
    carregarConversas().catch(() => {});
  }
  async function vincular() {
    try {
      const r = await chamar('/olx/anuncios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: novoSku, listId: novoListId }) });
      if (r.confirmado) alert('Vinculado e confirmado na OLX (' + (r.statusOlx || 'ok') + ').');
      else alert('Vinculado. A OLX nao confirmou esse ID pela API (comum em anuncios criados manualmente); as mensagens serao ligadas ao SKU pelo ID informado.');
      setNovoSku('');
      setNovoListId('');
      await carregarAnuncios();
    } catch (e: any) { alert(e.message || 'Erro ao vincular'); }
  }
  async function removerVinculo(sku: string) {
    if (!confirm('Remover o vinculo do SKU ' + sku + ' com o anuncio da OLX?')) return;
    await chamar('/olx/anuncios/' + encodeURIComponent(sku), { method: 'DELETE' });
    await carregarAnuncios();
  }
  async function ativarChat() {
    setAtivandoChat(true);
    try {
      await chamar('/olx/chat/ativar', { method: 'POST' });
      await load();
      alert('Chat ativado. As mensagens dos compradores passam a chegar aqui.');
    } catch (e: any) { alert(e.message || 'Erro ao ativar o chat'); }
    setAtivandoChat(false);
  }
  async function enviarResposta() {
    if (!chatAberto || !resposta.trim()) return;
    setEnviando(true);
    try {
      await chamar('/olx/conversas/' + encodeURIComponent(chatAberto.chatId) + '/responder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: resposta }) });
      setResposta('');
      await abrirChat(chatAberto);
    } catch (e: any) { alert(e.message || 'Erro ao enviar'); }
    setEnviando(false);
  }
  useEffect(() => {
    if (aba === 'anuncios') carregarAnuncios().catch(() => {});
    if (aba === 'conversas') carregarConversas().catch(() => {});
  }, [aba]);

  async function load() {
    const data = await chamar('/olx/status');
    setStatus(data);
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

  const connected = !!status?.connected;
  const credenciais = !!status?.clientIdConfigurado && !!status?.clientSecretConfigurado;

  if (loading) {
    return (
      <>
        <div style={s.topbar}><div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. OLX</div></div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. OLX</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Conexao com a API de integradores da OLX Brasil</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: connected ? '#f0fdf4' : '#f1f5f9', color: connected ? '#16a34a' : 'var(--gray-400)', border: `1px solid ${connected ? '#86efac' : 'var(--border)'}` }}>
          {connected ? '✓ Conectado' : 'Nao conectado'}
        </span>
      </div>

      <div style={{ padding: '0 28px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
        {([['conexao', 'Conexao'], ['anuncios', 'Anuncios'], ['conversas', 'Conversas']] as Array<['conexao' | 'anuncios' | 'conversas', string]>).map(([id, rotulo]) => (
          <button key={id} type="button" onClick={() => setAba(id)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '12px 16px', fontSize: 13.5, fontWeight: aba === id ? 700 : 500, color: aba === id ? 'var(--gray-800)' : 'var(--gray-400)', borderBottom: aba === id ? '2px solid var(--gray-800)' : '2px solid transparent', marginBottom: -1, fontFamily: 'Inter, sans-serif' }}>
            {rotulo}{id === 'conversas' && conversas.some((c) => c.naoLidas > 0) ? <span style={{ color: '#d97706', marginLeft: 6 }}>●</span> : null}
          </button>
        ))}
      </div>

      {aba === 'anuncios' && (
        <div style={{ padding: 28, maxWidth: 820 }}>
          <div style={s.card}>
            <div style={s.h3}>Vincular anuncio da OLX a um SKU</div>
            <p style={s.p}>
              Informe o SKU do sistema e o ID do anuncio na OLX (o numero no final do link do anuncio — pode colar o link inteiro).
              Com o vinculo, as mensagens do comprador aparecem ligadas ao SKU.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input style={{ ...s.input, flex: '1 1 180px', width: 'auto' }} placeholder="SKU (ex: HD01_0190)" value={novoSku} onChange={(e) => setNovoSku(e.target.value)} />
              <input style={{ ...s.input, flex: '2 1 280px', width: 'auto' }} placeholder="ID ou link do anuncio na OLX" value={novoListId} onChange={(e) => setNovoListId(e.target.value)} />
              <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: novoSku.trim() && novoListId.trim() ? 1 : 0.6 }} onClick={vincular} disabled={!novoSku.trim() || !novoListId.trim()}>Vincular</button>
            </div>
          </div>
          <div style={s.card}>
            <div style={s.h3}>Anuncios vinculados ({anuncios.length})</div>
            {!anuncios.length ? <p style={s.p}>Nenhum anuncio vinculado ainda.</p> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {anuncios.map((a) => (
                  <div key={a.sku} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <strong style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{a.sku}</strong>
                    <span style={{ flex: '1 1 240px', fontSize: 13, color: 'var(--gray-500)' }}>{a.titulo || '—'}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--gray-500)', fontFamily: 'JetBrains Mono, monospace' }}>{a.listId}</span>
                    <button style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--red)', borderColor: '#fca5a5' }} onClick={() => removerVinculo(a.sku)}>Remover</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {aba === 'conversas' && (
        <div style={{ padding: 28, maxWidth: 1000 }}>
          <div style={s.card}>
            <div style={s.h3}>Recebimento de mensagens</div>
            <p style={s.p}>
              {status?.chatAtivoEm
                ? 'Chat ativo desde ' + new Date(status.chatAtivoEm).toLocaleString('pt-BR') + '. As mensagens novas dos compradores chegam aqui automaticamente (so as enviadas depois da ativacao).'
                : 'Ative o chat para a OLX enviar as mensagens dos compradores para o sistema.'}
            </p>
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: connected ? 1 : 0.5 }} onClick={ativarChat} disabled={!connected || ativandoChat}>
              {ativandoChat ? 'Ativando...' : status?.chatAtivoEm ? 'Reativar chat' : 'Ativar chat'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
            <div style={s.card}>
              <div style={s.h3}>Conversas ({conversas.length})</div>
              {!conversas.length ? <p style={s.p}>Nenhuma mensagem recebida ainda.</p> : conversas.map((c) => (
                <div key={c.chatId} onClick={() => abrirChat(c)}
                  style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: chatAberto?.chatId === c.chatId ? 'var(--gray-50)' : 'transparent', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13.5 }}>{c.nome || 'Comprador'}{c.sku ? ' · ' + c.sku : ''}</strong>
                    {c.naoLidas > 0 ? <span style={{ fontSize: 11, background: '#d97706', color: '#fff', borderRadius: 10, padding: '1px 8px' }}>{c.naoLidas}</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultima}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{c.ultimaEm ? new Date(c.ultimaEm).toLocaleString('pt-BR') : ''}</div>
                </div>
              ))}
            </div>

            <div style={s.card}>
              {!chatAberto ? <p style={s.p}>Selecione uma conversa.</p> : (
                <>
                  <div style={s.h3}>{chatAberto.nome || 'Comprador'}{chatAberto.sku ? ' · ' + chatAberto.sku : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                    {[chatAberto.telefone, chatAberto.email, chatAberto.listId ? 'anuncio ' + chatAberto.listId : ''].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', marginBottom: 12 }}>
                    {mensagens.map((m) => (
                      <div key={m.messageId} style={{ justifySelf: m.origem === 'seller' ? 'end' : 'start', maxWidth: '85%', background: m.origem === 'seller' ? '#e0f2fe' : 'var(--gray-100)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
                        {m.mensagem}
                        <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginTop: 4 }}>{m.enviadaEm ? new Date(m.enviadaEm).toLocaleString('pt-BR') : ''}</div>
                      </div>
                    ))}
                  </div>
                  <textarea style={{ ...s.input, minHeight: 70, resize: 'vertical' as const }} placeholder="Responder ao comprador" value={resposta} onChange={(e) => setResposta(e.target.value)} />
                  <div style={{ marginTop: 10 }}>
                    <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: resposta.trim() ? 1 : 0.6 }} onClick={enviarResposta} disabled={enviando || !resposta.trim()}>
                      {enviando ? 'Enviando...' : 'Enviar resposta'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {aba === 'conexao' && (
      <div style={{ padding: 28, maxWidth: 820 }}>
        <div style={s.card}>
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

        <div style={s.card}>
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

        <div style={s.card}>
          <div style={s.h3}>Dados tecnicos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
            Redirect URI (cadastrada na OLX): <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace' }}>{status?.redirectUri || `${API}/olx/callback`}</code>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
            Importacao de anuncios exige plano profissional na OLX; pecas de moto usam a categoria 2103.
          </div>
        </div>
      </div>
      )}
    </>
  );
}
