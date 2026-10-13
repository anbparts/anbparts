'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type SenhaAcessoItem = {
  id: number;
  servico: string;
  usuario: string;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
};

const cs: any = {
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 6, color: 'var(--ink)', boxSizing: 'border-box' as const },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', textDecoration: 'none' },
};

function iniciais(nome: string) {
  const p = nome.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? (p[1][0] || '') : '')).toUpperCase();
}

export default function AcessosTab({ canEdit, isPhone }: { canEdit: boolean; isPhone: boolean }) {
  const [itens, setItens] = useState<SenhaAcessoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [hover, setHover] = useState<number | null>(null);
  const [reveladas, setReveladas] = useState<Record<number, string>>({});
  const [revelando, setRevelando] = useState<number | null>(null);
  const [copiado, setCopiado] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState({ servico: '', usuario: '', senha: '', observacao: '' });
  const [verSenhaForm, setVerSenhaForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setLoading(true);
    try {
      const res = await api.empresa.senhas.list();
      setItens(Array.isArray(res?.itens) ? res.itens : []);
    } catch { /* aba independente do resto da pagina */ }
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) => [i.servico, i.usuario, i.observacao || ''].join(' ').toLowerCase().indexOf(q) >= 0);
  }, [itens, busca]);

  function abrirNovo() {
    setEditandoId(null);
    setForm({ servico: '', usuario: '', senha: '', observacao: '' });
    setVerSenhaForm(false);
    setErro('');
    setModalAberto(true);
  }

  async function abrirEditar(item: SenhaAcessoItem) {
    setEditandoId(item.id);
    setErro('');
    setVerSenhaForm(false);
    let senhaAtual = reveladas[item.id] || '';
    if (!senhaAtual) {
      try {
        const res = await api.empresa.senhas.revelar(item.id);
        senhaAtual = res?.senha || '';
      } catch { /* deixa em branco se falhar; o usuario redigita se precisar trocar */ }
    }
    setForm({ servico: item.servico || '', usuario: item.usuario || '', senha: senhaAtual, observacao: item.observacao || '' });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.servico.trim()) { setErro('Informe o serviço.'); return; }
    setSalvando(true);
    setErro('');
    try {
      if (editandoId) await api.empresa.senhas.update(editandoId, form);
      else await api.empresa.senhas.create(form);
      setModalAberto(false);
      setReveladas({});
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar.');
    }
    setSalvando(false);
  }

  async function excluir(item: SenhaAcessoItem) {
    if (!confirm(`Excluir o acesso "${item.servico}"?`)) return;
    try {
      await api.empresa.senhas.delete(item.id);
      await carregar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao excluir.');
    }
  }

  async function alternarSenha(item: SenhaAcessoItem) {
    if (reveladas[item.id] !== undefined) {
      setReveladas((atual) => { const novo = { ...atual }; delete novo[item.id]; return novo; });
      return;
    }
    setRevelando(item.id);
    try {
      const res = await api.empresa.senhas.revelar(item.id);
      setReveladas((atual) => ({ ...atual, [item.id]: res?.senha || '' }));
    } catch (e: any) {
      alert(e?.message || 'Erro ao revelar a senha.');
    }
    setRevelando(null);
  }

  async function copiar(texto: string, chave: string) {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(''), 1500);
    } catch {
      alert('Não foi possível copiar. Selecione e copie manualmente.');
    }
  }

  const secaoTitulo: any = { fontSize: 11, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...cs.fi, marginTop: 0, flex: '1 1 300px', minWidth: 200, borderRadius: 999, padding: '11px 18px', background: 'var(--gray-50)', border: '1px solid transparent' }}
          placeholder="Buscar serviço, usuário ou observação"
          value={busca} onChange={(e) => setBusca(e.target.value)}
        />
        {canEdit ? <button onClick={abrirNovo} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', marginLeft: 'auto' }}>+ Novo acesso</button> : null}
      </div>

      {loading ? <div style={{ padding: 28, fontSize: 13, color: 'var(--ink-muted)', textAlign: 'center' }}>Carregando acessos...</div> : null}
      {!loading && !filtrados.length ? (
        <div style={{ padding: 48, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>
          {itens.length ? 'Nenhum acesso encontrado.' : 'Nenhum acesso cadastrado ainda.'}
        </div>
      ) : null}

      {!loading && filtrados.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {filtrados.map((item) => {
            const sobre = hover === item.id;
            const revelada = reveladas[item.id];
            const chaveUsuario = `${item.id}-usuario`;
            const chaveSenha = `${item.id}-senha`;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setHover(item.id)}
                onMouseLeave={() => setHover((h) => (h === item.id ? null : h))}
                style={{
                  background: 'var(--white)', border: `1px solid ${sobre ? 'var(--border-strong)' : 'var(--border)'}`, borderRadius: 16,
                  padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
                  boxShadow: sobre ? '0 8px 24px rgba(15,23,42,.07)' : 'none', transition: 'box-shadow .15s ease, border-color .15s ease',
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--gray-100)', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {iniciais(item.servico)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, wordBreak: 'break-word' }}>{item.servico}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2, wordBreak: 'break-all' }}>{item.usuario || 'Sem usuário'}</div>
                  </div>
                  {canEdit ? (
                    <div style={{ display: 'flex', gap: 12, opacity: sobre || isPhone ? 1 : 0, transition: 'opacity .15s ease', flexShrink: 0 }}>
                      <button type="button" onClick={() => abrirEditar(item)} style={{ ...cs.link, color: 'var(--ink)', fontWeight: 600 }}>Editar</button>
                      <button type="button" onClick={() => excluir(item)} style={cs.link}>Excluir</button>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.5px', width: 54 }}>Usuário</span>
                    <span style={{ fontSize: 13.5, color: 'var(--ink)', wordBreak: 'break-all' }}>{item.usuario || '—'}</span>
                    {item.usuario ? (
                      <button type="button" onClick={() => copiar(item.usuario, chaveUsuario)} style={{ ...cs.link, color: copiado === chaveUsuario ? '#16a34a' : 'var(--ink-muted)' }}>{copiado === chaveUsuario ? 'Copiado' : 'Copiar'}</button>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.5px', width: 54 }}>Senha</span>
                    <span style={{ fontSize: 13.5, color: 'var(--ink)', fontFamily: 'Geist Mono, monospace', wordBreak: 'break-all' }}>{revelada !== undefined ? (revelada || '(vazia)') : '••••••••'}</span>
                    <button type="button" onClick={() => alternarSenha(item)} disabled={revelando === item.id} style={{ ...cs.link, color: 'var(--blue-500)', opacity: revelando === item.id ? 0.5 : 1 }}>
                      {revelando === item.id ? '...' : revelada !== undefined ? 'Ocultar' : 'Ver'}
                    </button>
                    {revelada ? (
                      <button type="button" onClick={() => copiar(revelada, chaveSenha)} style={{ ...cs.link, color: copiado === chaveSenha ? '#16a34a' : 'var(--ink-muted)' }}>{copiado === chaveSenha ? 'Copiado' : 'Copiar'}</button>
                    ) : null}
                  </div>
                </div>

                {item.observacao ? <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>{item.observacao}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && itens.length > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{filtrados.length} de {itens.length} acesso(s)</div>
      ) : null}

      {modalAberto ? (
        <div onClick={() => setModalAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 20, width: '100%', maxWidth: 520, maxHeight: isPhone ? '100dvh' : '92vh', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '20px 26px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600 }}>{editandoId ? 'Editar acesso' : 'Novo acesso'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>E-mails, plataformas e sistemas da empresa</div>
              </div>
              <button onClick={() => setModalAberto(false)} style={{ ...cs.link, fontSize: 24, lineHeight: 1, color: 'var(--ink-muted)' }}>×</button>
            </div>

            <div style={{ padding: '6px 26px 20px', overflowY: 'auto', display: 'grid', gap: 14 }}>
              <div style={secaoTitulo}>Acesso</div>
              <div>
                <label style={cs.fl}>Serviço *</label>
                <input style={cs.fi} value={form.servico} onChange={(e) => setForm((f) => ({ ...f, servico: e.target.value }))} placeholder="Ex: Mercado Livre, Bling, Gmail" />
              </div>
              <div>
                <label style={cs.fl}>Usuário / e-mail</label>
                <input style={cs.fi} value={form.usuario} onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))} />
              </div>
              <div>
                <label style={cs.fl}>Senha</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input style={cs.fi} type={verSenhaForm ? 'text' : 'password'} value={form.senha} onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))} autoComplete="new-password" />
                  <button type="button" onClick={() => setVerSenhaForm((v) => !v)} style={{ ...cs.link, marginTop: 6, color: 'var(--blue-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{verSenhaForm ? 'Ocultar' : 'Mostrar'}</button>
                </div>
              </div>
              <div>
                <label style={cs.fl}>Observação</label>
                <textarea style={{ ...cs.fi, minHeight: 70, resize: 'vertical' as const }} value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
              </div>
              {erro ? <div style={{ fontSize: 12.5, color: 'var(--red)' }}>! {erro}</div> : null}
            </div>

            <div style={{ padding: '14px 26px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setModalAberto(false)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
