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

const cs: any = {
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)', boxSizing: 'border-box' as const },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', fontWeight: 500, whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' },
  td: { padding: '13px 14px', verticalAlign: 'top' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  link: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', textDecoration: 'none' },
};

function somenteDigitos(v: string) { return String(v || '').replace(/\D/g, ''); }
function linkWhatsapp(tel: string) {
  const d = somenteDigitos(tel);
  if (d.length < 10) return '';
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}
function ruaNumero(f: Fornecedor) { return [f.logradouro, f.numero].filter(Boolean).join(', '); }
function localResumo(f: Fornecedor) { return [f.bairroRegiao, [f.cidade, f.uf].filter(Boolean).join('/')].filter(Boolean).join(' · '); }

const VAZIO_TXT = <span style={{ color: 'var(--gray-300)' }}>—</span>;

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

  const ativos = itens.filter((i) => i.ativo).length;

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

  function Telefones({ f }: { f: Fornecedor }) {
    if (!f.telefones.length) return VAZIO_TXT;
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {f.telefones.map((t) => {
          const wa = linkWhatsapp(t);
          const chave = `${f.id}|${t}`;
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{t}</span>
              <button type="button" onClick={() => copiar(t, chave)} style={{ ...cs.link, color: copiado === chave ? '#16a34a' : 'var(--ink-muted)' }}>{copiado === chave ? 'Copiado' : 'Copiar'}</button>
              {wa ? <a href={wa} target="_blank" rel="noreferrer" style={{ ...cs.link, color: 'var(--blue-500)' }}>WhatsApp</a> : null}
            </div>
          );
        })}
      </div>
    );
  }

  function Acoes({ f }: { f: Fornecedor }) {
    if (!canEdit) return null;
    return (
      <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => editar(f)} style={{ ...cs.link, color: 'var(--ink)', fontWeight: 500, fontSize: 12.5 }}>Editar</button>
        <button type="button" onClick={() => excluir(f)} style={{ ...cs.link, fontSize: 12.5 }}>Excluir</button>
      </div>
    );
  }

  const secaoTitulo: any = { fontSize: 11, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', paddingBottom: 8, borderBottom: '1px solid var(--border)' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Barra de ferramentas */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...cs.fi, marginTop: 0, flex: '1 1 260px', minWidth: 180 }} placeholder="Buscar fornecedor, contato, serviço ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={{ ...cs.fi, marginTop: 0, flex: '0 1 220px', cursor: 'pointer' }} value={filtroInsumo} onChange={(e) => setFiltroInsumo(e.target.value)}>
          <option value="">Todos os insumos / serviços</option>
          {insumos.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select style={{ ...cs.fi, marginTop: 0, flex: '0 1 160px', cursor: 'pointer' }} value={filtroCidade} onChange={(e) => setFiltroCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12.5, color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Inativos
        </label>
        {canEdit ? <button onClick={novo} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', marginLeft: 'auto' }}>+ Novo fornecedor</button> : null}
      </div>

      {erro ? <div style={{ fontSize: 12.5, color: 'var(--red)' }}>! {erro}</div> : null}
      {loading ? <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-muted)', textAlign: 'center' }}>Carregando fornecedores...</div> : null}
      {!loading && !filtrados.length ? (
        <div style={{ ...cs.card, padding: 36, textAlign: 'center', fontSize: 13, color: 'var(--ink-muted)' }}>Nenhum fornecedor encontrado.</div>
      ) : null}

      {/* Tabela (computador) */}
      {!loading && filtrados.length > 0 && !isPhone ? (
        <div style={{ ...cs.card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <th style={cs.th}>Fornecedor</th>
                <th style={cs.th}>Insumo / Serviço</th>
                <th style={cs.th}>Telefone</th>
                <th style={cs.th}>Localização</th>
                <th style={cs.th}>Observação</th>
                <th style={cs.th} />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f) => (
                <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.5 }}>
                  <td style={cs.td}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13.5 }}>
                      {f.empresa}{!f.ativo ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>(inativo)</span> : null}
                    </div>
                    {[f.contato, f.email].filter(Boolean).length ? <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{[f.contato, f.email].filter(Boolean).join(' · ')}</div> : null}
                    {f.cnpj ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>CNPJ/CPF {f.cnpj}</div> : null}
                  </td>
                  <td style={cs.td}>{f.insumoServico || VAZIO_TXT}</td>
                  <td style={cs.td}><Telefones f={f} /></td>
                  <td style={cs.td}>
                    {localResumo(f) || ruaNumero(f) ? (
                      <div>
                        <div>{localResumo(f) || '—'}</div>
                        {ruaNumero(f) ? <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{ruaNumero(f)}{f.complemento ? ` — ${f.complemento}` : ''}</div> : null}
                      </div>
                    ) : VAZIO_TXT}
                  </td>
                  <td style={{ ...cs.td, maxWidth: 200, fontSize: 12.5, color: 'var(--ink-soft)' }}>{f.observacao || VAZIO_TXT}</td>
                  <td style={{ ...cs.td, textAlign: 'right', whiteSpace: 'nowrap' }}><Acoes f={f} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Lista simples (celular) */}
      {!loading && filtrados.length > 0 && isPhone ? (
        <div style={cs.card}>
          {filtrados.map((f, idx) => (
            <div key={f.id} style={{ padding: 14, borderTop: idx ? '1px solid var(--border)' : 'none', opacity: f.ativo ? 1 : 0.5, display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{f.empresa}{!f.ativo ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)' }}>(inativo)</span> : null}</div>
              {f.insumoServico ? <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{f.insumoServico}</div> : null}
              {f.contato ? <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{f.contato}</div> : null}
              <Telefones f={f} />
              {localResumo(f) ? <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{localResumo(f)}{ruaNumero(f) ? ` — ${ruaNumero(f)}` : ''}</div> : null}
              {f.observacao ? <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{f.observacao}</div> : null}
              <div style={{ marginTop: 4 }}><Acoes f={f} /></div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && itens.length > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          {filtrados.length} de {itens.length} fornecedor(es) · {ativos} ativo(s)
        </div>
      ) : null}

      {/* Janela de cadastro / edicao */}
      {editando ? (
        <div onClick={() => setEditando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 12, width: '100%', maxWidth: 720, maxHeight: isPhone ? '100dvh' : '92vh', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,.18)' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600 }}>{editando.id ? 'Editar fornecedor' : 'Novo fornecedor'}</div>
              <button onClick={() => setEditando(null)} style={{ ...cs.link, fontSize: 22, lineHeight: 1, color: 'var(--ink-muted)' }}>×</button>
            </div>

            <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'grid', gap: 22 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Dados</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>Empresa *</label>
                    <input style={cs.fi} value={editando.empresa} onChange={(e) => set('empresa', e.target.value)} />
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
                    <button type="button" onClick={novaOpcaoInsumo} title="Criar nova opção" style={{ ...cs.btn, marginTop: 5, padding: '8px 14px', background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--border)', fontWeight: 600 }}>+</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
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
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input style={cs.fi} value={t} onChange={(e) => set('telefones', editando.telefones.map((x, j) => (j === i ? e.target.value : x)))} placeholder="11 99999-9999" />
                        {editando.telefones.length > 1 ? <button type="button" onClick={() => set('telefones', editando.telefones.filter((_, j) => j !== i))} style={{ ...cs.link, marginTop: 5, fontSize: 12.5 }}>Remover</button> : null}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => set('telefones', [...editando.telefones, ''])} style={{ ...cs.link, marginTop: 8, color: 'var(--blue-500)', fontSize: 12.5 }}>+ Adicionar telefone</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Endereço</div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 2fr', gap: 12 }}>
                  <div>
                    <label style={cs.fl}>CEP</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input style={cs.fi} value={editando.cep} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
                      <button type="button" onClick={buscarCep} disabled={buscandoCep} style={{ ...cs.link, marginTop: 5, color: 'var(--blue-500)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{buscandoCep ? 'Buscando...' : 'Buscar'}</button>
                    </div>
                  </div>
                  <div>
                    <label style={cs.fl}>Logradouro</label>
                    <input style={cs.fi} value={editando.logradouro} onChange={(e) => set('logradouro', e.target.value)} />
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

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={secaoTitulo}>Observações</div>
                <textarea style={{ ...cs.fi, marginTop: 0, minHeight: 70, resize: 'vertical' as const }} value={editando.observacao} onChange={(e) => set('observacao', e.target.value)} />
                <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editando.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Fornecedor ativo
                </label>
              </div>

              {erroForm ? <div style={{ fontSize: 12.5, color: 'var(--red)' }}>! {erroForm}</div> : null}
            </div>

            <div style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEditando(null)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
