'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

// Empresa > Oficinas: cadastro das oficinas parceiras/clientes do ramo (mesmo molde dos Fornecedores).
type Oficina = {
  id: number;
  nome: string;
  cnpj: string;
  especialidade: string;
  contato: string;
  telefones: string[];
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  origem: string;
  site: string;
  observacao: string;
  ativo: boolean;
  clienteBlingId: string | null;
};

const VAZIO: Omit<Oficina, 'id' | 'clienteBlingId'> = {
  nome: '', cnpj: '', especialidade: '', contato: '', telefones: [''], email: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SP',
  origem: '', site: '', observacao: '', ativo: true,
};

const cs: any = {
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 6, color: 'var(--ink)', boxSizing: 'border-box' as const },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', textDecoration: 'none' },
};

function somenteDigitos(v: string) { return String(v || '').replace(/\D/g, ''); }
function linkWhatsapp(tel: string) {
  const d = somenteDigitos(tel);
  if (d.length < 10) return '';
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}
function ruaNumero(f: Oficina) { return [f.logradouro, f.numero].filter(Boolean).join(', '); }
function localResumo(f: Oficina) { return [f.bairro, [f.cidade, f.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '); }
function iniciais(nome: string) {
  const p = nome.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? (p[1][0] || '') : '')).toUpperCase();
}
function urlSite(s: string) { const t = String(s || '').trim(); return !t ? '' : /^https?:\/\//i.test(t) ? t : `https://${t}`; }

export default function OficinasTab({ canEdit, isPhone }: { canEdit: boolean; isPhone: boolean }) {
  const API = API_BASE;
  const [itens, setItens] = useState<Oficina[]>([]);
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroEsp, setFiltroEsp] = useState('');
  const [filtroCidade, setFiltroCidade] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [editando, setEditando] = useState<(Omit<Oficina, 'id' | 'clienteBlingId'> & { id?: number }) | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [copiado, setCopiado] = useState('');

  async function carregar() {
    setLoading(true);
    setErro('');
    try {
      const r = await fetch(`${API}/oficinas`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao carregar oficinas');
      setItens(d.itens || []);
      setEspecialidades(d.especialidades || []);
      setOrigens(d.origens || []);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar oficinas');
    }
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  const cidades = useMemo(() => {
    const m: Record<string, true> = {};
    itens.forEach((i) => { if (i.cidade) m[i.cidade] = true; });
    return Object.keys(m).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [itens]);

  const baseSemEsp = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (!mostrarInativos && !i.ativo) return false;
      if (filtroCidade && i.cidade !== filtroCidade) return false;
      if (!q) return true;
      const alvo = [i.nome, i.contato, i.especialidade, i.cidade, i.bairro, i.cnpj, i.email, i.observacao, i.origem, i.telefones.join(' ')].join(' ').toLowerCase();
      return alvo.indexOf(q) >= 0;
    });
  }, [itens, busca, filtroCidade, mostrarInativos]);

  const categorias = useMemo(() => {
    const cont: Record<string, number> = {};
    baseSemEsp.forEach((i) => { if (i.especialidade) cont[i.especialidade] = (cont[i.especialidade] || 0) + 1; });
    return Object.keys(cont).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })).map((nome) => ({ nome, n: cont[nome] }));
  }, [baseSemEsp]);

  const filtrados = useMemo(() => (filtroEsp ? baseSemEsp.filter((i) => i.especialidade === filtroEsp) : baseSemEsp), [baseSemEsp, filtroEsp]);

  function novo() { setErroForm(''); setEditando({ ...VAZIO, telefones: [''] }); }
  function editar(f: Oficina) { setErroForm(''); setEditando({ ...f, telefones: f.telefones.length ? [...f.telefones] : [''] }); }
  function set(campo: string, valor: any) { setEditando((e) => (e ? { ...e, [campo]: valor } : e)); }

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
        setEditando((e) => (e ? { ...e, logradouro: e.logradouro || d.logradouro || '', bairro: e.bairro || d.bairro || '', cidade: d.localidade || e.cidade, uf: d.uf || e.uf } : e));
      }
    } catch {
      setErroForm('Não consegui consultar o CEP agora. Preencha o endereço manualmente.');
    }
    setBuscandoCep(false);
  }

  async function salvar() {
    if (!editando) return;
    if (!editando.nome.trim()) { setErroForm('Informe o nome da oficina.'); return; }
    setSalvando(true);
    setErroForm('');
    try {
      const corpo = { ...editando, telefones: editando.telefones.map((t) => t.trim()).filter(Boolean) };
      const r = await fetch(editando.id ? `${API}/oficinas/${editando.id}` : `${API}/oficinas`, {
        method: editando.id ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Erro ao salvar a oficina');
      setEditando(null);
      await carregar();
    } catch (e: any) {
      setErroForm(e?.message || 'Erro ao salvar a oficina');
    }
    setSalvando(false);
  }

  async function excluir(f: Oficina) {
    if (!confirm(`Excluir a oficina "${f.nome}"? Se só quiser tirar da lista, inative-a na edição.`)) return;
    try {
      const r = await fetch(`${API}/oficinas/${f.id}`, { method: 'DELETE', credentials: 'include' });
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

  const pilula = (ativa: boolean): any => ({
    border: ativa ? '1px solid var(--ink)' : '1px solid var(--border)',
    background: ativa ? 'var(--ink)' : 'var(--white)',
    color: ativa ? 'var(--white)' : 'var(--ink-soft)',
    borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Geist, sans-serif', whiteSpace: 'nowrap',
  });
  const secaoTitulo: any = { fontSize: 11, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' };
  const chip = (texto: string, bg: string, cor: string, borda: string) => (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: bg, color: cor, border: `1px solid ${borda}`, whiteSpace: 'nowrap' }}>{texto}</span>
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 300px', minWidth: 200, position: 'relative' }}>
          <input
            style={{ ...cs.fi, marginTop: 0, borderRadius: 999, padding: '11px 18px', background: 'var(--gray-50)', border: '1px solid transparent' }}
            placeholder="Buscar oficina, contato, especialidade ou cidade"
            value={busca} onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select style={{ ...cs.fi, marginTop: 0, flex: '0 1 170px', borderRadius: 999, padding: '10px 16px', cursor: 'pointer', background: 'var(--gray-50)', border: '1px solid transparent' }} value={filtroCidade} onChange={(e) => setFiltroCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12.5, color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Inativas
        </label>
        <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{filtrados.length} oficina(s)</span>
        {canEdit ? <button onClick={novo} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', marginLeft: 'auto' }}>+ Nova oficina</button> : null}
      </div>

      {categorias.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setFiltroEsp('')} style={pilula(!filtroEsp)}>Todas <span style={{ opacity: 0.6, marginLeft: 4 }}>{baseSemEsp.length}</span></button>
          {categorias.map((c) => (
            <button key={c.nome} type="button" onClick={() => setFiltroEsp(filtroEsp === c.nome ? '' : c.nome)} style={pilula(filtroEsp === c.nome)}>
              {c.nome} <span style={{ opacity: 0.6, marginLeft: 4 }}>{c.n}</span>
            </button>
          ))}
        </div>
      ) : null}

      {erro ? <div style={{ fontSize: 12.5, color: 'var(--red)' }}>! {erro}</div> : null}
      {loading ? <div style={{ padding: 28, fontSize: 13, color: 'var(--ink-muted)', textAlign: 'center' }}>Carregando oficinas...</div> : null}
      {!loading && !filtrados.length ? (
        <div style={{ padding: 48, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>Nenhuma oficina encontrada.</div>
      ) : null}

      {!loading && filtrados.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {filtrados.map((f) => {
            const sobre = hover === f.id;
            return (
              <div
                key={f.id}
                onMouseEnter={() => setHover(f.id)}
                onMouseLeave={() => setHover((h) => (h === f.id ? null : h))}
                style={{
                  background: 'var(--white)', border: `1px solid ${sobre ? 'var(--border-strong)' : 'var(--border)'}`, borderRadius: 16,
                  padding: 20, display: 'flex', flexDirection: 'column', gap: 14, opacity: f.ativo ? 1 : 0.55,
                  boxShadow: sobre ? '0 8px 24px rgba(15,23,42,.07)' : 'none', transition: 'box-shadow .15s ease, border-color .15s ease',
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--gray-100)', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {iniciais(f.nome)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, wordBreak: 'break-word' }}>{f.nome}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                      {f.especialidade ? chip(f.especialidade, '#eff6ff', '#1d4ed8', '#bfdbfe') : null}
                      {f.origem ? chip(f.origem, '#f5f3ff', '#5b21b6', '#ddd6fe') : null}
                      {f.clienteBlingId ? chip('Cliente do sistema', '#f0fdf4', '#15803d', '#bbf7d0') : null}
                      {!f.ativo ? chip('inativa', '#f1f5f9', '#475569', '#cbd5e1') : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <div style={{ display: 'flex', gap: 12, opacity: sobre || isPhone ? 1 : 0, transition: 'opacity .15s ease', flexShrink: 0 }}>
                      <button type="button" onClick={() => editar(f)} style={{ ...cs.link, color: 'var(--ink)', fontWeight: 600 }}>Editar</button>
                      <button type="button" onClick={() => excluir(f)} style={cs.link}>Excluir</button>
                    </div>
                  ) : null}
                </div>

                {(f.contato || f.telefones.length || f.email) ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {f.contato ? <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{f.contato}</div> : null}
                    {f.telefones.map((t) => {
                      const wa = linkWhatsapp(t);
                      const chave = `${f.id}|${t}`;
                      return (
                        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, color: 'var(--ink)' }}>{t}</span>
                          <button type="button" onClick={() => copiar(t, chave)} style={{ ...cs.link, color: copiado === chave ? '#16a34a' : 'var(--ink-muted)' }}>{copiado === chave ? 'Copiado' : 'Copiar'}</button>
                          {wa ? <a href={wa} target="_blank" rel="noreferrer" style={{ ...cs.link, color: 'var(--blue-500)' }}>WhatsApp</a> : null}
                        </div>
                      );
                    })}
                    {f.email ? <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', wordBreak: 'break-all' }}>{f.email}</div> : null}
                  </div>
                ) : null}

                {(localResumo(f) || ruaNumero(f)) ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    <div>{localResumo(f)}</div>
                    {ruaNumero(f) ? <div style={{ color: 'var(--ink-muted)' }}>{ruaNumero(f)}{f.complemento ? ` — ${f.complemento}` : ''}{f.cep ? ` · ${f.cep}` : ''}</div> : null}
                  </div>
                ) : null}

                {f.site ? <a href={urlSite(f.site)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--blue-500)', wordBreak: 'break-all', textDecoration: 'none' }}>{f.site}</a> : null}
                {f.observacao ? <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontStyle: 'italic' }}>{f.observacao}</div> : null}
                {f.cnpj ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>CNPJ/CPF {f.cnpj}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {editando ? (
        <div onClick={() => setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 20, width: '100%', maxWidth: 720, maxHeight: isPhone ? '100dvh' : '92vh', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '20px 26px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600 }}>{editando.id ? 'Editar oficina' : 'Nova oficina'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 2 }}>Dados, contato e endereço</div>
              </div>
              <button onClick={() => setEditando(null)} style={{ ...cs.link, fontSize: 24, lineHeight: 1, color: 'var(--ink-muted)' }}>×</button>
            </div>

            <div style={{ padding: '6px 26px 20px', overflowY: 'auto', display: 'grid', gap: 26 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Dados</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr', gap: 14 }}>
                  <div>
                    <label style={cs.fl}>Oficina *</label>
                    <input style={cs.fi} value={editando.nome} onChange={(e) => set('nome', e.target.value)} />
                  </div>
                  <div>
                    <label style={cs.fl}>CNPJ / CPF</label>
                    <input style={cs.fi} value={editando.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="Opcional" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={cs.fl}>Especialidade</label>
                    <input style={cs.fi} list="oficina-esp" value={editando.especialidade} onChange={(e) => set('especialidade', e.target.value)} placeholder="Ex: BMW, Harley, multimarcas" />
                    <datalist id="oficina-esp">{especialidades.map((x) => <option key={x} value={x} />)}</datalist>
                  </div>
                  <div>
                    <label style={cs.fl}>Origem do contato</label>
                    <input style={cs.fi} list="oficina-origem" value={editando.origem} onChange={(e) => set('origem', e.target.value)} placeholder="Ex: Via Instagram, indicação" />
                    <datalist id="oficina-origem">{origens.map((x) => <option key={x} value={x} />)}</datalist>
                  </div>
                </div>
                <div>
                  <label style={cs.fl}>Site / Instagram</label>
                  <input style={cs.fi} value={editando.site} onChange={(e) => set('site', e.target.value)} placeholder="Opcional" />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Contato</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
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
                  <div style={{ display: 'grid', gap: 4 }}>
                    {editando.telefones.map((t, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input style={cs.fi} value={t} onChange={(e) => set('telefones', editando.telefones.map((x, j) => (j === i ? e.target.value : x)))} placeholder="11 99999-9999" />
                        {editando.telefones.length > 1 ? <button type="button" onClick={() => set('telefones', editando.telefones.filter((_, j) => j !== i))} style={{ ...cs.link, marginTop: 6, fontSize: 12.5 }}>Remover</button> : null}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => set('telefones', [...editando.telefones, ''])} style={{ ...cs.link, marginTop: 10, color: 'var(--blue-500)', fontSize: 12.5 }}>+ Adicionar telefone</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Endereço</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 2fr', gap: 14 }}>
                  <div>
                    <label style={cs.fl}>CEP</label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input style={cs.fi} value={editando.cep} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
                      <button type="button" onClick={buscarCep} disabled={buscandoCep} style={{ ...cs.link, marginTop: 6, color: 'var(--blue-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{buscandoCep ? 'Buscando...' : 'Buscar'}</button>
                    </div>
                  </div>
                  <div>
                    <label style={cs.fl}>Logradouro</label>
                    <input style={cs.fi} value={editando.logradouro} onChange={(e) => set('logradouro', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : '1fr 1.2fr 1.4fr', gap: 14 }}>
                  <div>
                    <label style={cs.fl}>Número</label>
                    <input style={cs.fi} value={editando.numero} onChange={(e) => set('numero', e.target.value)} />
                  </div>
                  <div>
                    <label style={cs.fl}>Complemento</label>
                    <input style={cs.fi} value={editando.complemento} onChange={(e) => set('complemento', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: isPhone ? '1 / -1' : undefined }}>
                    <label style={cs.fl}>Bairro</label>
                    <input style={cs.fi} value={editando.bairro} onChange={(e) => set('bairro', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 14 }}>
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

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Observações</div>
                <textarea style={{ ...cs.fi, marginTop: 0, minHeight: 72, resize: 'vertical' as const }} value={editando.observacao} onChange={(e) => set('observacao', e.target.value)} />
                <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editando.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Oficina ativa
                </label>
              </div>

              {erroForm ? <div style={{ fontSize: 12.5, color: 'var(--red)' }}>! {erroForm}</div> : null}
            </div>

            <div style={{ padding: '14px 26px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setEditando(null)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
