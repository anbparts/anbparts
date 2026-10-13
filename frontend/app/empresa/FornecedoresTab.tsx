'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

type Fornecedor = {
  id: number;
  empresa: string;
  cnpj: string;
  insumoServico: string;
  contato: string;
  telefones: string[];
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairroRegiao: string;
  cidade: string;
  uf: string;
  observacao: string;
  ativo: boolean;
};

const VAZIO: Omit<Fornecedor, 'id'> = {
  empresa: '', cnpj: '', insumoServico: '', contato: '', telefones: [''], email: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairroRegiao: '', cidade: '', uf: 'SP',
  observacao: '', ativo: true,
};

// Paleta usada para identificar visualmente cada insumo/servico e o avatar do fornecedor.
const PALETA: Array<{ fundo: string; texto: string; borda: string }> = [
  { fundo: '#eff6ff', texto: '#1d4ed8', borda: '#bfdbfe' },
  { fundo: '#ecfdf5', texto: '#047857', borda: '#a7f3d0' },
  { fundo: '#fff7ed', texto: '#c2410c', borda: '#fed7aa' },
  { fundo: '#f5f3ff', texto: '#6d28d9', borda: '#ddd6fe' },
  { fundo: '#fef2f2', texto: '#b91c1c', borda: '#fecaca' },
  { fundo: '#f0fdfa', texto: '#0f766e', borda: '#99f6e4' },
  { fundo: '#fefce8', texto: '#a16207', borda: '#fde68a' },
  { fundo: '#f1f5f9', texto: '#334155', borda: '#cbd5e1' },
];
function corDe(texto: string) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}
function iniciais(nome: string) {
  const p = nome.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? (p[1][0] || '') : '')).toUpperCase();
}

const cs: any = {
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)', boxSizing: 'border-box' as const },
  fl: { fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const, background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
};

function somenteDigitos(v: string) { return String(v || '').replace(/\D/g, ''); }
function linkWhatsapp(tel: string) {
  const d = somenteDigitos(tel);
  if (d.length < 10) return '';
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}
function ruaNumero(f: Fornecedor) { return [f.logradouro, f.numero].filter(Boolean).join(', '); }
function localResumo(f: Fornecedor) { return [f.bairroRegiao, [f.cidade, f.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '); }

function Chip({ texto }: { texto: string }) {
  const c = corDe(texto);
  return <span style={{ display: 'inline-block', background: c.fundo, color: c.texto, border: `1px solid ${c.borda}`, borderRadius: 999, padding: '3px 11px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{texto}</span>;
}

function Avatar({ nome, tamanho = 38 }: { nome: string; tamanho?: number }) {
  const c = corDe(nome);
  return (
    <div style={{ width: tamanho, height: tamanho, borderRadius: 10, background: c.fundo, color: c.texto, border: `1px solid ${c.borda}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: tamanho * 0.36, flexShrink: 0, letterSpacing: '0.5px' }}>
      {iniciais(nome)}
    </div>
  );
}

export default function FornecedoresTab({ canEdit, isPhone }: { canEdit: boolean; isPhone: boolean }) {
  const API = API_BASE;
  const [itens, setItens] = useState<Fornecedor[]>([]);
  const [insumos, setInsumos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroInsumo, setFiltroInsumo] = useState('');
  const [filtroCidade, setFiltroCidade] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [visao, setVisao] = useState<'tabela' | 'cartoes'>('tabela');
  const [editando, setEditando] = useState<(Omit<Fornecedor, 'id'> & { id?: number }) | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [copiado, setCopiado] = useState('');

  async function carregar() {
    setLoading(true);
    setErro('');
    try {
      const r = await fetch(`${API}/fornecedores`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao carregar fornecedores');
      setItens(d.itens || []);
      setInsumos(d.insumos || []);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar fornecedores');
    }
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  const cidades = useMemo(() => {
    const m: Record<string, true> = {};
    itens.forEach((i) => { if (i.cidade) m[i.cidade] = true; });
    return Object.keys(m).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens]);

  const resumo = useMemo(() => {
    const ativos = itens.filter((i) => i.ativo);
    const cat: Record<string, true> = {};
    ativos.forEach((i) => { if (i.insumoServico) cat[i.insumoServico] = true; });
    return { ativos: ativos.length, inativos: itens.length - ativos.length, categorias: Object.keys(cat).length, cidades: cidades.length };
  }, [itens, cidades]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (!mostrarInativos && !i.ativo) return false;
      if (filtroInsumo && i.insumoServico !== filtroInsumo) return false;
      if (filtroCidade && i.cidade !== filtroCidade) return false;
      if (!q) return true;
      const alvo = [i.empresa, i.contato, i.insumoServico, i.cidade, i.bairroRegiao, i.cnpj, i.email, i.observacao, i.telefones.join(' ')].join(' ').toLowerCase();
      return alvo.indexOf(q) >= 0;
    });
  }, [itens, busca, filtroInsumo, filtroCidade, mostrarInativos]);

  function novo() { setErroForm(''); setEditando({ ...VAZIO, telefones: [''] }); }
  function editar(f: Fornecedor) { setErroForm(''); setEditando({ ...f, telefones: f.telefones.length ? [...f.telefones] : [''] }); }
  function set(campo: string, valor: any) { setEditando((e) => (e ? { ...e, [campo]: valor } : e)); }

  async function novaOpcaoInsumo() {
    const nome = (typeof window !== 'undefined' ? window.prompt('Nome do novo insumo / serviço:') : '') || '';
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch(`${API}/fornecedores/insumos`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: limpo }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao criar a opção');
      setInsumos((p) => (p.indexOf(d.nome) >= 0 ? p : [...p, d.nome].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))));
      set('insumoServico', d.nome);
    } catch (e: any) {
      alert(e?.message || 'Erro ao criar a opção');
    }
  }

  async function buscarCep() {
    if (!editando) return;
    const cep = somenteDigitos(editando.cep);
    if (cep.length !== 8) { setErroForm('Informe o CEP com 8 dígitos para buscar o endereço.'); return; }
    setBuscandoCep(true);
    setErroForm('');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d?.erro) { setErroForm('CEP não encontrado.'); }
      else {
        setEditando((e) => (e ? {
          ...e,
          logradouro: e.logradouro || d.logradouro || '',
          bairroRegiao: e.bairroRegiao || d.bairro || '',
          cidade: d.localidade || e.cidade,
          uf: d.uf || e.uf,
        } : e));
      }
    } catch {
      setErroForm('Não consegui consultar o CEP agora. Preencha o endereço manualmente.');
    }
    setBuscandoCep(false);
  }

  async function salvar() {
    if (!editando) return;
    if (!editando.empresa.trim()) { setErroForm('Informe o nome da empresa.'); return; }
    setSalvando(true);
    setErroForm('');
    try {
      const corpo = { ...editando, telefones: editando.telefones.map((t) => t.trim()).filter(Boolean) };
      const r = await fetch(editando.id ? `${API}/fornecedores/${editando.id}` : `${API}/fornecedores`, {
        method: editando.id ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao salvar o fornecedor');
      setEditando(null);
      await carregar();
    } catch (e: any) {
      setErroForm(e?.message || 'Erro ao salvar o fornecedor');
    }
    setSalvando(false);
  }

  async function excluir(f: Fornecedor) {
    if (!confirm(`Excluir o fornecedor "${f.empresa}"? Se só quiser tirar da lista, inative-o na edição.`)) return;
    try {
      const r = await fetch(`${API}/fornecedores/${f.id}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'Erro ao excluir');
      await carregar();
    } catch (e: any) {
      alert(e?.message || 'Erro ao excluir');
    }
  }

  async function copiar(texto: string, chave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(''), 1400);
    } catch { /* sem permissao de area de transferencia */ }
  }

  const iconeBtn: any = { width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 14, textDecoration: 'none', color: 'var(--ink-soft)', padding: 0 };

  function Telefones({ f }: { f: Fornecedor }) {
    if (!f.telefones.length) return <span style={{ color: 'var(--gray-300)' }}>—</span>;
    return (
      <div style={{ display: 'grid', gap: 5 }}>
        {f.telefones.map((t) => {
          const wa = linkWhatsapp(t);
          const chave = `${f.id}|${t}`;
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--ink)' }}>{t}</span>
              <button type="button" title="Copiar telefone" onClick={() => copiar(t, chave)} style={{ ...iconeBtn, width: 24, height: 24, fontSize: 12, color: copiado === chave ? '#16a34a' : 'var(--ink-muted)' }}>{copiado === chave ? '✓' : '⧉'}</button>
              {wa ? <a href={wa} target="_blank" rel="noreferrer" title="Abrir no WhatsApp" style={{ ...iconeBtn, width: 24, height: 24, fontSize: 12, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' }}>💬</a> : null}
            </div>
          );
        })}
      </div>
    );
  }

  function Acoes({ f }: { f: Fornecedor }) {
    if (!canEdit) return null;
    return (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" title="Editar" onClick={() => editar(f)} style={iconeBtn}>✎</button>
        <button type="button" title="Excluir" onClick={() => excluir(f)} style={{ ...iconeBtn, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }}>🗑</button>
      </div>
    );
  }

  const KPI = ({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) => (
    <div style={{ ...cs.card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>{rotulo}</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 600, color: destaque ? '#1d4ed8' : 'var(--ink)', lineHeight: 1.1 }}>{valor}</div>
    </div>
  );

  const secao: any = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12, background: 'var(--white)' };
  const secaoTitulo: any = { fontSize: 11, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <KPI rotulo="Fornecedores ativos" valor={resumo.ativos} destaque />
        <KPI rotulo="Insumos / serviços" valor={resumo.categorias} />
        <KPI rotulo="Cidades" valor={resumo.cidades} />
        <KPI rotulo="Inativos" valor={resumo.inativos} />
      </div>

      {/* Barra de ferramentas */}
      <div style={{ ...cs.card, padding: isPhone ? 12 : 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--ink-muted)' }}>🔍</span>
          <input style={{ ...cs.fi, marginTop: 0, paddingLeft: 36 }} placeholder="Buscar por empresa, contato, serviço, cidade, telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select style={{ ...cs.fi, marginTop: 0, flex: '0 1 230px', cursor: 'pointer' }} value={filtroInsumo} onChange={(e) => setFiltroInsumo(e.target.value)}>
          <option value="">Todos os insumos / serviços</option>
          {insumos.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select style={{ ...cs.fi, marginTop: 0, flex: '0 1 170px', cursor: 'pointer' }} value={filtroCidade} onChange={(e) => setFiltroCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12.5, color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos
        </label>
        {!isPhone ? (
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {([{ id: 'tabela', rot: '☰ Tabela' }, { id: 'cartoes', rot: '▦ Cartões' }] as Array<{ id: 'tabela' | 'cartoes'; rot: string }>).map((v) => (
              <button key={v.id} type="button" onClick={() => setVisao(v.id)} style={{ border: 'none', cursor: 'pointer', padding: '8px 12px', fontSize: 12.5, fontWeight: 600, background: visao === v.id ? 'var(--ink)' : 'var(--white)', color: visao === v.id ? 'var(--white)' : 'var(--ink-soft)' }}>{v.rot}</button>
            ))}
          </div>
        ) : null}
        {canEdit ? <button onClick={novo} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', marginLeft: 'auto' }}>+ Novo fornecedor</button> : null}
      </div>

      {erro ? <div style={{ fontSize: 12.5, color: 'var(--red)' }}>! {erro}</div> : null}
      {loading ? <div style={{ ...cs.card, padding: 24, fontSize: 13, color: 'var(--ink-muted)', textAlign: 'center' }}>Carregando fornecedores...</div> : null}
      {!loading && !filtrados.length ? (
        <div style={{ ...cs.card, padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🔎</div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Nenhum fornecedor encontrado</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 4 }}>Ajuste a busca e os filtros{canEdit ? ' ou cadastre um novo fornecedor.' : '.'}</div>
        </div>
      ) : null}

      {/* Tabela (desktop) */}
      {!loading && filtrados.length > 0 && !isPhone && visao === 'tabela' ? (
        <div style={{ ...cs.card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr>
                <th style={cs.th}>Fornecedor</th>
                <th style={cs.th}>Insumo / Serviço</th>
                <th style={cs.th}>Telefone</th>
                <th style={cs.th}>Localização</th>
                <th style={cs.th}>Observação</th>
                <th style={{ ...cs.th, textAlign: 'right' }}>{canEdit ? 'Ações' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f) => (
                <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.55 }}>
                  <td style={cs.td}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Avatar nome={f.empresa} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>
                          {f.empresa}{!f.ativo ? <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 8px' }}>INATIVO</span> : null}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                          {[f.contato, f.cnpj ? `CNPJ/CPF ${f.cnpj}` : '', f.email].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={cs.td}>{f.insumoServico ? <Chip texto={f.insumoServico} /> : <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                  <td style={cs.td}><Telefones f={f} /></td>
                  <td style={cs.td}>
                    {localResumo(f) || ruaNumero(f) ? (
                      <div style={{ fontSize: 12.5 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{localResumo(f) || '—'}</div>
                        {ruaNumero(f) ? <div style={{ color: 'var(--ink-muted)', marginTop: 2 }}>{ruaNumero(f)}{f.complemento ? ` — ${f.complemento}` : ''}</div> : null}
                      </div>
                    ) : <span style={{ color: 'var(--gray-300)' }}>—</span>}
                  </td>
                  <td style={{ ...cs.td, maxWidth: 200 }}>
                    {f.observacao ? <span title={f.observacao} style={{ display: 'inline-block', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 8px' }}>{f.observacao}</span> : <span style={{ color: 'var(--gray-300)' }}>—</span>}
                  </td>
                  <td style={{ ...cs.td, textAlign: 'right' }}><Acoes f={f} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink-muted)', background: 'var(--gray-50)' }}>{filtrados.length} fornecedor(es) exibido(s)</div>
        </div>
      ) : null}

      {/* Cartoes (celular, ou escolha no desktop) */}
      {!loading && filtrados.length > 0 && (isPhone || visao === 'cartoes') ? (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtrados.map((f) => (
            <div key={f.id} style={{ ...cs.card, opacity: f.ativo ? 1 : 0.6, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 16, display: 'grid', gap: 12, flex: 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Avatar nome={f.empresa} tamanho={44} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.25 }}>{f.empresa}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {f.insumoServico ? <Chip texto={f.insumoServico} /> : null}
                      {!f.ativo ? <span style={{ fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '3px 9px' }}>INATIVO</span> : null}
                    </div>
                  </div>
                </div>

                {(f.contato || f.telefones.length || f.email) ? (
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
                    {f.contato ? <div style={{ fontSize: 13, fontWeight: 600 }}>👤 {f.contato}</div> : null}
                    <Telefones f={f} />
                    {f.email ? <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', wordBreak: 'break-all' }}>✉ {f.email}</div> : null}
                  </div>
                ) : null}

                {(localResumo(f) || ruaNumero(f)) ? (
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10, fontSize: 12.5 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>📍 {localResumo(f) || '—'}</div>
                    {ruaNumero(f) ? <div style={{ color: 'var(--ink-muted)', marginTop: 2 }}>{ruaNumero(f)}{f.complemento ? ` — ${f.complemento}` : ''}{f.cep ? ` · CEP ${f.cep}` : ''}</div> : null}
                  </div>
                ) : null}

                {f.cnpj ? <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>CNPJ/CPF: <span style={{ fontFamily: 'Geist Mono, monospace' }}>{f.cnpj}</span></div> : null}
                {f.observacao ? <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }}>{f.observacao}</div> : null}
              </div>
              {canEdit ? (
                <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                  <Acoes f={f} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Janela de cadastro / edicao */}
      {editando ? (
        <div onClick={() => setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--gray-50)', borderRadius: isPhone ? 0 : 16, width: '100%', maxWidth: 780, maxHeight: isPhone ? '100dvh' : '92vh', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '16px 22px', background: 'var(--white)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Avatar nome={editando.empresa || 'Novo'} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600 }}>{editando.id ? 'Editar fornecedor' : 'Novo fornecedor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editando.empresa || 'Preencha os dados abaixo'}</div>
                </div>
              </div>
              <button onClick={() => setEditando(null)} style={{ ...iconeBtn, width: 34, height: 34, fontSize: 18 }}>×</button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14 }}>
              <div style={secao}>
                <div style={secaoTitulo}>Dados do fornecedor</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>Empresa *</label>
                    <input style={cs.fi} value={editando.empresa} onChange={(e) => set('empresa', e.target.value)} placeholder="Nome do fornecedor" />
                  </div>
                  <div>
                    <label style={cs.fl}>CNPJ / CPF</label>
                    <input style={cs.fi} value={editando.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="Opcional" />
                  </div>
                </div>
                <div>
                  <label style={cs.fl}>Insumo / Serviço</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select style={{ ...cs.fi, cursor: 'pointer' }} value={editando.insumoServico} onChange={(e) => set('insumoServico', e.target.value)}>
                      <option value="">Selecione...</option>
                      {insumos.map((i) => <option key={i} value={i}>{i}</option>)}
                      {editando.insumoServico && insumos.indexOf(editando.insumoServico) < 0 ? <option value={editando.insumoServico}>{editando.insumoServico}</option> : null}
                    </select>
                    <button type="button" onClick={novaOpcaoInsumo} title="Criar nova opção de insumo / serviço" style={{ ...cs.btn, marginTop: 5, padding: '9px 15px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 800 }}>+</button>
                  </div>
                </div>
              </div>

              <div style={secao}>
                <div style={secaoTitulo}>Contato</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>Pessoa de contato</label>
                    <input style={cs.fi} value={editando.contato} onChange={(e) => set('contato', e.target.value)} />
                  </div>
                  <div>
                    <label style={cs.fl}>E-mail</label>
                    <input style={cs.fi} value={editando.email} onChange={(e) => set('email', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={cs.fl}>Telefones / WhatsApp</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {editando.telefones.map((t, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6 }}>
                        <input style={cs.fi} value={t} onChange={(e) => set('telefones', editando.telefones.map((x, j) => (j === i ? e.target.value : x)))} placeholder="11 99999-9999" />
                        {editando.telefones.length > 1 ? <button type="button" onClick={() => set('telefones', editando.telefones.filter((_, j) => j !== i))} style={{ ...cs.btn, marginTop: 5, padding: '6px 12px', background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca' }}>×</button> : null}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => set('telefones', [...editando.telefones, ''])} style={{ ...cs.btn, marginTop: 8, padding: '5px 12px', fontSize: 12, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>+ Adicionar telefone</button>
                </div>
              </div>

              <div style={secao}>
                <div style={secaoTitulo}>Endereço completo</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>CEP</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={cs.fi} value={editando.cep} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
                      <button type="button" onClick={buscarCep} disabled={buscandoCep} title="Preencher o endereço pelo CEP" style={{ ...cs.btn, marginTop: 5, padding: '6px 12px', background: 'var(--white)', border: '1px solid var(--border)' }}>{buscandoCep ? '...' : '🔍'}</button>
                    </div>
                  </div>
                  <div>
                    <label style={cs.fl}>Logradouro</label>
                    <input style={cs.fi} value={editando.logradouro} onChange={(e) => set('logradouro', e.target.value)} placeholder="Rua, avenida..." />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : '1fr 1.2fr 1.4fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>Número</label>
                    <input style={cs.fi} value={editando.numero} onChange={(e) => set('numero', e.target.value)} />
                  </div>
                  <div>
                    <label style={cs.fl}>Complemento</label>
                    <input style={cs.fi} value={editando.complemento} onChange={(e) => set('complemento', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: isPhone ? '1 / -1' : undefined }}>
                    <label style={cs.fl}>Bairro / Região</label>
                    <input style={cs.fi} value={editando.bairroRegiao} onChange={(e) => set('bairroRegiao', e.target.value)} placeholder="Ex: Zona Leste" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>Cidade</label>
                    <input style={cs.fi} value={editando.cidade} onChange={(e) => set('cidade', e.target.value)} />
                  </div>
                  <div>
                    <label style={cs.fl}>UF</label>
                    <input style={cs.fi} value={editando.uf} maxLength={2} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>

              <div style={secao}>
                <div style={secaoTitulo}>Observações</div>
                <textarea style={{ ...cs.fi, marginTop: 0, minHeight: 74, resize: 'vertical' as const }} value={editando.observacao} onChange={(e) => set('observacao', e.target.value)} placeholder="Informações importantes sobre este fornecedor" />
                <label style={{ fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editando.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Fornecedor ativo
                </label>
              </div>

              {erroForm ? <div style={{ fontSize: 12.5, color: 'var(--red)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>! {erroForm}</div> : null}
            </div>

            <div style={{ padding: '12px 22px 16px', background: 'var(--white)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditando(null)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar fornecedor'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
