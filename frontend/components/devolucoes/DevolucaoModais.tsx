'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

// Modais compartilhados de devolucoes: "Informar motivo" (escolhe da lista padronizada) e "Tipos de devolucao" (configura a lista).
export type MotivoOpcao = { id: number; nome: string };
type MotivoCfg = { id: number; nome: string; ativo: boolean; ordem: number; uso: number };

const overlay: any = { position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const caixa: any = { background: 'var(--white)', borderRadius: 14, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)' };
const rotulo: any = { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const campo: any = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, background: 'var(--white)' };
const botao: any = { padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', fontFamily: 'inherit' };
const botaoPrimario: any = { ...botao, background: 'var(--gray-800)', color: '#fff', borderColor: 'var(--gray-800)' };

async function chamar(url: string, metodo: string, corpo?: any) {
  const resp = await fetch(`${API_BASE}${url}`, { method: metodo, credentials: 'include', headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
  return d;
}

export function MotivoDevolucaoModal({ titulo, subtitulo, motivos, motivoIdAtual, observacaoAtual, podeGerenciar, onSalvar, onGerenciar, onClose }: {
  titulo?: string; subtitulo?: string; motivos: MotivoOpcao[]; motivoIdAtual?: number | null; observacaoAtual?: string | null; podeGerenciar?: boolean;
  onSalvar: (motivoId: number | null, observacao: string) => Promise<void>; onGerenciar?: () => void; onClose: () => void;
}) {
  const [motivoId, setMotivoId] = useState<string>(motivoIdAtual ? String(motivoIdAtual) : '');
  const [obs, setObs] = useState(observacaoAtual || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  async function salvar() {
    if (!motivoId) { setErro('Escolha um motivo da lista.'); return; }
    setSalvando(true); setErro('');
    try { await onSalvar(Number(motivoId), obs); } catch (e: any) { setErro(e?.message || 'Erro ao salvar'); setSalvando(false); }
  }
  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...caixa, maxWidth: 460 }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>{titulo || 'Motivo da devolução'}</div>
          {subtitulo ? <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>{subtitulo}</div> : null}
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label style={rotulo}>Motivo</label>
            {podeGerenciar && onGerenciar ? <button type="button" onClick={onGerenciar} style={{ background: 'none', border: 'none', color: 'var(--blue-500)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Configurar tipos de devolução</button> : null}
          </div>
          <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} style={{ ...campo, cursor: 'pointer' }}>
            <option value="">Selecione...</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <label style={{ ...rotulo, display: 'block', marginTop: 14 }}>Observação (opcional)</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} placeholder="Ex: cliente informou que a peça não encaixou" style={campo} />
          {erro ? <div style={{ marginTop: 10, fontSize: 12.5, color: '#b91c1c' }}>{erro}</div> : null}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={botao}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} style={botaoPrimario}>{salvando ? 'Salvando...' : 'Salvar motivo'}</button>
        </div>
      </div>
    </div>
  );
}

export function TiposDevolucaoModal({ onClose, onAlterou }: { onClose: () => void; onAlterou?: () => void }) {
  const [lista, setLista] = useState<MotivoCfg[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<Record<number, string>>({});
  const [erro, setErro] = useState('');

  async function carregar() {
    try {
      const d = await chamar('/devolucoes-historico/motivos', 'GET');
      setLista(d.motivos || []); setPodeEditar(!!d.podeEditar);
    } catch (e: any) { setErro(e?.message || 'Erro ao carregar'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);

  async function agir(fn: () => Promise<any>) {
    setErro('');
    try { await fn(); await carregar(); onAlterou?.(); } catch (e: any) { setErro(e?.message || 'Erro'); }
  }
  const adicionar = () => { const nome = novo.trim(); if (!nome) return; agir(async () => { await chamar('/devolucoes-historico/motivos', 'POST', { nome }); setNovo(''); }); };
  const renomear = (m: MotivoCfg) => {
    const nome = (editando[m.id] ?? m.nome).trim();
    setEditando((e) => { const c = { ...e }; delete c[m.id]; return c; });
    if (!nome || nome === m.nome) return;
    agir(() => chamar(`/devolucoes-historico/motivos/${m.id}`, 'PATCH', { nome }));
  };
  const mover = (i: number, dir: -1 | 1) => {
    const alvo = lista[i + dir]; const atual = lista[i];
    if (!alvo || !atual || !alvo.ativo !== !atual.ativo) return;
    agir(async () => {
      await chamar(`/devolucoes-historico/motivos/${atual.id}`, 'PATCH', { ordem: alvo.ordem === atual.ordem ? alvo.ordem + dir : alvo.ordem });
      await chamar(`/devolucoes-historico/motivos/${alvo.id}`, 'PATCH', { ordem: atual.ordem });
    });
  };
  const excluir = (m: MotivoCfg) => { if (!confirm(`Excluir o motivo "${m.nome}"?`)) return; agir(() => chamar(`/devolucoes-historico/motivos/${m.id}`, 'DELETE')); };

  const icone: any = { ...botao, padding: '3px 8px', fontSize: 12 };
  return (
    <div style={{ ...overlay, zIndex: 340 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...caixa, maxWidth: 560 }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Tipos de devolução</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>Lista padrão usada para informar o motivo de cada devolução ou cancelamento. Motivos já usados não podem ser excluídos, apenas desativados.</div>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          {podeEditar ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} placeholder="Novo tipo de devolução" maxLength={80} style={{ ...campo, marginTop: 0 }} />
              <button type="button" onClick={adicionar} disabled={!novo.trim()} style={{ ...botaoPrimario, whiteSpace: 'nowrap' }}>Adicionar</button>
            </div>
          ) : <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 12 }}>Você pode apenas visualizar a lista.</div>}
          {erro ? <div style={{ marginBottom: 10, fontSize: 12.5, color: '#b91c1c' }}>{erro}</div> : null}
          {carregando ? <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Carregando...</div> : null}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {lista.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: i ? '1px solid var(--border)' : 'none', background: m.ativo ? 'var(--white)' : 'var(--gray-50, #f9fafb)', opacity: m.ativo ? 1 : 0.7 }}>
                <input
                  value={editando[m.id] ?? m.nome} disabled={!podeEditar}
                  onChange={(e) => setEditando((c) => ({ ...c, [m.id]: e.target.value }))}
                  onBlur={() => { if (editando[m.id] !== undefined) renomear(m); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ ...campo, marginTop: 0, border: '1px solid transparent', padding: '5px 8px', fontWeight: 600, flex: 1, minWidth: 0 }}
                />
                <span style={{ fontSize: 11.5, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{m.uso} uso{m.uso === 1 ? '' : 's'}</span>
                {podeEditar ? (
                  <>
                    <button type="button" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0} style={icone}>↑</button>
                    <button type="button" title="Descer" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} style={icone}>↓</button>
                    <button type="button" onClick={() => agir(() => chamar(`/devolucoes-historico/motivos/${m.id}`, 'PATCH', { ativo: !m.ativo }))} style={{ ...icone, color: m.ativo ? '#047857' : 'var(--gray-500)' }}>{m.ativo ? 'Ativo' : 'Inativo'}</button>
                    <button type="button" title={m.uso ? 'Já usado: desative em vez de excluir' : 'Excluir'} onClick={() => excluir(m)} disabled={m.uso > 0} style={{ ...icone, color: '#b91c1c' }}>✕</button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={botaoPrimario}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
