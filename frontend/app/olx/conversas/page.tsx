'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

async function chamar(path: string, init?: RequestInit) {
  const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `Erro ${resp.status}`);
  return data;
}

function quando(v: any) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function iniciais(nome: string) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? (p[1][0] || '') : '')).toUpperCase();
}

export default function OlxConversasPage() {
  const [conversas, setConversas] = useState<any[]>([]);
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const ajustar = () => setIsPhone(typeof window !== 'undefined' && window.innerWidth <= 768);
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(false);
  const [aberta, setAberta] = useState<any>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const abertaRef = useRef<any>(null);
  abertaRef.current = aberta;

  async function carregarLista() {
    try {
      const d = await chamar('/olx/conversas');
      setConversas(Array.isArray(d.itens) ? d.itens : []);
    } catch { /* mantem a lista atual */ }
    setCarregando(false);
  }

  async function abrir(c: any) {
    setAberta(c);
    setMensagens([]);
    try {
      const d = await chamar('/olx/conversas/' + encodeURIComponent(c.chatId));
      setMensagens(Array.isArray(d.mensagens) ? d.mensagens : []);
    } catch { /* sem mensagens */ }
    carregarLista();
  }

  // Atualiza sozinho a cada 20 s (lista e a conversa aberta).
  useEffect(() => {
    carregarLista();
    const t = setInterval(async () => {
      await carregarLista();
      const atual = abertaRef.current;
      if (atual) {
        try {
          const d = await chamar('/olx/conversas/' + encodeURIComponent(atual.chatId));
          setMensagens(Array.isArray(d.mensagens) ? d.mensagens : []);
        } catch { /* tenta no proximo ciclo */ }
      }
    }, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [mensagens.length, aberta?.chatId]);

  async function enviar() {
    if (!aberta || !resposta.trim()) return;
    setEnviando(true);
    try {
      await chamar('/olx/conversas/' + encodeURIComponent(aberta.chatId) + '/responder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: resposta }),
      });
      setResposta('');
      const d = await chamar('/olx/conversas/' + encodeURIComponent(aberta.chatId));
      setMensagens(Array.isArray(d.mensagens) ? d.mensagens : []);
      carregarLista();
    } catch (e: any) { alert(e.message || 'Erro ao enviar'); }
    setEnviando(false);
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (somenteNaoLidas && !(c.naoLidas > 0)) return false;
      if (!q) return true;
      return [c.nome, c.sku, c.titulo, c.ultima, c.telefone, c.listId].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }, [conversas, busca, somenteNaoLidas]);

  const totalNaoLidas = conversas.reduce((acc, c) => acc + (Number(c.naoLidas) || 0), 0);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>OLX · Conversas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Mensagens dos compradores dos anuncios da OLX</div>
        </div>
        {totalNaoLidas > 0 ? <span style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>{totalNaoLidas} nao lida(s)</span> : null}
      </div>

      <div style={{ padding: isPhone ? 10 : 20, display: 'grid', gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : 'minmax(280px, 360px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: isPhone && aberta ? 'none' : 'block' }}>
          <div style={{ padding: 14, display: 'grid', gap: 10, borderBottom: '1px solid var(--border)' }}>
            <input style={{ ...s.input, borderRadius: 999, padding: '9px 16px', background: 'var(--gray-50)', border: '1px solid transparent' }} placeholder="Buscar nome, SKU ou mensagem" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--gray-500)' }}>
              <input type="checkbox" checked={somenteNaoLidas} onChange={(e) => setSomenteNaoLidas(e.target.checked)} /> Somente nao lidas
            </label>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {carregando ? <div style={{ padding: 20, fontSize: 13, color: 'var(--gray-400)' }}>Carregando...</div> : null}
            {!carregando && !filtradas.length ? <div style={{ padding: 24, fontSize: 13, color: 'var(--gray-400)', textAlign: 'center' }}>{conversas.length ? 'Nenhuma conversa encontrada.' : 'Nenhuma mensagem recebida ainda.'}</div> : null}
            {filtradas.map((c) => {
              const ativa = aberta?.chatId === c.chatId;
              return (
                <div key={c.chatId} onClick={() => abrir(c)}
                  style={{ display: 'flex', gap: 12, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: ativa ? 'var(--gray-50)' : 'transparent' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--gray-100)', color: 'var(--gray-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{iniciais(c.nome)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 13.5, fontWeight: c.naoLidas > 0 ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome || 'Comprador'}</strong>
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', flexShrink: 0 }}>{quando(c.ultimaEm)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.titulo || ''}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)' }}>{c.sku || 'sem SKU vinculado'}</span>{c.titulo ? <span> · {c.titulo}</span> : null}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 12.5, color: c.naoLidas > 0 ? 'var(--gray-800)' : 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultima}</span>
                      {c.naoLidas > 0 ? <span style={{ fontSize: 11, background: '#d97706', color: '#fff', borderRadius: 10, padding: '1px 8px', flexShrink: 0 }}>{c.naoLidas}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: isPhone && !aberta ? 'none' : 'flex', flexDirection: 'column', minHeight: isPhone ? 0 : 420 }}>
          {!aberta ? (
            <div style={{ padding: 40, fontSize: 13.5, color: 'var(--gray-400)', textAlign: 'center', margin: 'auto' }}>Selecione uma conversa para ver o historico e responder.</div>
          ) : (
            <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                {isPhone ? <button type="button" onClick={() => setAberta(null)} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', fontSize: 13.5, cursor: 'pointer', padding: '0 0 8px', fontFamily: 'Inter, sans-serif' }}>← Conversas</button> : null}
                <div style={{ fontSize: 15, fontWeight: 600 }}>{aberta.nome || 'Comprador'}</div>
                {aberta.sku ? (
                  <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 2 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{aberta.sku}</span>{aberta.titulo ? <span> · {aberta.titulo}</span> : null}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {aberta.telefone ? <span>{aberta.telefone}</span> : null}
                  {aberta.email ? <span>{aberta.email}</span> : null}
                  {aberta.listId ? <a href={'https://www.olx.com.br/vi/' + aberta.listId + '.htm'} target="_blank" rel="noreferrer" style={{ color: 'var(--blue-500)' }}>Abrir anuncio na OLX</a> : null}
                </div>
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 8, alignContent: 'start', maxHeight: isPhone ? 'calc(100vh - 330px)' : 'calc(100vh - 360px)', minHeight: isPhone ? 160 : 240, overflowY: 'auto', flex: 1 }}>
                {mensagens.map((m) => (
                  <div key={m.messageId} style={{ justifySelf: m.origem === 'seller' ? 'end' : 'start', maxWidth: '78%', background: m.origem === 'seller' ? '#e0f2fe' : 'var(--gray-100)', borderRadius: 12, padding: '8px 12px', fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.mensagem}
                    <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginTop: 4 }}>{quando(m.enviadaEm)}</div>
                  </div>
                ))}
                <div ref={fimRef} />
              </div>
              <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
                <textarea style={{ ...s.input, minHeight: 56, resize: 'vertical' as const, flex: 1 }} placeholder="Responder ao comprador" value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } }} />
                <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: resposta.trim() ? 1 : 0.6 }} onClick={enviar} disabled={enviando || !resposta.trim()}>
                  {enviando ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
              <div style={{ padding: '0 14px 10px', fontSize: 11, color: 'var(--gray-400)' }}>Ctrl + Enter envia.</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
