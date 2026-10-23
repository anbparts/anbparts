'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

// Numero de nota fiscal clicavel: abre a chave de acesso completa, consultada no Bling.
type Candidato = { numero: string; serie?: string | null; chave: string | null; tipo?: number | null; situacao?: any; dataEmissao?: string | null; cliente?: string | null; origem?: string };

const agrupar = (c: string) => c.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');

function ModalChave({ numero, pedido, pedidoId, onClose }: { numero: string; pedido?: string | null; pedidoId?: string | null; onClose: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [lista, setLista] = useState<Candidato[]>([]);
  const [copiado, setCopiado] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ numero, pedido: pedido || '', pedidoId: pedidoId || '' });
        const resp = await fetch(`${API_BASE}/devolucoes-historico/nf-chave?${qs}`, { credentials: 'include' });
        const d = await resp.json().catch(() => ({}));
        if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
        if (cancelado) return;
        setLista(Array.isArray(d.candidatos) ? d.candidatos : []);
        setAviso(d.aviso || '');
      } catch (e: any) { if (!cancelado) setErro(e?.message || 'Não foi possível consultar o Bling'); }
      if (!cancelado) setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [numero, pedido, pedidoId]);

  async function copiar(chave: string) {
    try { await navigator.clipboard.writeText(chave.replace(/\s+/g, '')); setCopiado(chave); setTimeout(() => setCopiado(''), 1800); } catch { /* sem permissao de area de transferencia */ }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Chave da nota fiscal</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>NF nº <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>{numero}</strong></div>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 12 }}>
          {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Consultando o Bling...</div> : null}
          {erro ? <div style={{ fontSize: 13, color: '#b91c1c' }}>{erro}</div> : null}
          {!carregando && !erro && !lista.length ? <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>{aviso || 'O Bling não retornou uma nota com esse número.'}</div> : null}
          {lista.map((c, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              {c.chave ? (
                <>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', wordBreak: 'break-all', lineHeight: 1.5 }}>{agrupar(c.chave)}</div>
                  <button type="button" onClick={() => copiar(c.chave!)} style={{ marginTop: 8, border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: copiado === c.chave ? '#15803d' : 'var(--gray-700)' }}>{copiado === c.chave ? 'Copiada ✓' : 'Copiar chave'}</button>
                </>
              ) : <div style={{ fontSize: 13, color: '#b45309' }}>O Bling não retornou a chave desta nota (ela pode ainda não ter sido autorizada pela SEFAZ).</div>}
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {c.serie ? <span>Série {c.serie}</span> : null}
                {c.dataEmissao ? <span>Emissão {String(c.dataEmissao).slice(0, 10).split('-').reverse().join('/')}</span> : null}
                {c.cliente ? <span>{c.cliente}</span> : null}
              </div>
            </div>
          ))}
          {lista.length > 1 ? <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Foram encontradas várias notas com esse número (séries ou tipos diferentes). Confira a série e a data de emissão.</div> : null}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--gray-800)', background: 'var(--gray-800)', color: '#fff' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Mostra o numero como link; ao clicar abre a chave completa.
export function NfNumero({ numero, pedido, pedidoId }: { numero?: string | null; pedido?: string | null; pedidoId?: string | null }) {
  const [aberto, setAberto] = useState(false);
  if (!numero) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setAberto(true); }} title="Ver a chave da nota"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'inherit', fontWeight: 700, color: 'var(--blue-500)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>{numero}</button>
      {aberto ? <ModalChave numero={numero} pedido={pedido} pedidoId={pedidoId} onClose={() => setAberto(false)} /> : null}
    </>
  );
}
