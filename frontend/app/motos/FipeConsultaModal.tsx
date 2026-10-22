'use client';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type Marca = { id: string; nome: string; pontos: number };
type Modelo = { id: string; nome: string; pontos: number };
type Ano = { id: string; nome: string };
type Preco = { preco: number; precoTexto: string; codigoFipe: string; referencia: string; combustivel: string; anoModelo: number | null; modelo: string };

const s: any = {
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.6px', display: 'block', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink-soft)', fontFamily: 'Geist, sans-serif' },
};

async function chamar(path: string) {
  const resp = await fetch(`${API}${path}`, { credentials: 'include' });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
  return d;
}

const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Consulta a tabela FIPE (mes atual): sugere a marca e os modelos mais parecidos com o cadastro e deixa refinar na mao.
export default function FipeConsultaModal({ open, marca, modelo, ano, isPhone, onClose, onUsar }: {
  open: boolean; marca: string; modelo: string; ano: string | number | null; isPhone: boolean; onClose: () => void; onUsar: (valor: number) => void;
}) {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcaId, setMarcaId] = useState('');
  const [busca, setBusca] = useState('');
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [totalModelos, setTotalModelos] = useState(0);
  const [modeloSel, setModeloSel] = useState<Modelo | null>(null);
  const [anos, setAnos] = useState<Ano[]>([]);
  const [precos, setPrecos] = useState<Record<string, Preco | 'carregando' | string>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const seq = useRef(0);

  // ao abrir: carrega as marcas e escolhe a mais parecida com a do cadastro
  useEffect(() => {
    if (!open) return;
    setMarcaId(''); setModelos([]); setModeloSel(null); setAnos([]); setPrecos({}); setErro('');
    setBusca(String(modelo || ''));
    setCarregando(true);
    chamar(`/fipe/marcas?busca=${encodeURIComponent(marca || '')}`)
      .then((d) => { setMarcas(d.marcas || []); if (d.sugerida) setMarcaId(String(d.sugerida)); })
      .catch((e) => setErro(e?.message || 'Erro ao consultar a FIPE'))
      .finally(() => setCarregando(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // modelos da marca, ordenados pelo que mais se parece com o texto digitado
  useEffect(() => {
    if (!open || !marcaId) return;
    const minha = ++seq.current;
    const t = setTimeout(() => {
      setCarregando(true);
      chamar(`/fipe/modelos?marca=${marcaId}&busca=${encodeURIComponent(busca)}`)
        .then((d) => { if (seq.current === minha) { setModelos(d.modelos || []); setTotalModelos(d.total || 0); setErro(''); } })
        .catch((e) => { if (seq.current === minha) setErro(e?.message || 'Erro ao consultar a FIPE'); })
        .finally(() => { if (seq.current === minha) setCarregando(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [open, marcaId, busca]);

  async function escolherModelo(m: Modelo) {
    setModeloSel(m); setAnos([]); setPrecos({}); setErro(''); setCarregando(true);
    try {
      const d = await chamar(`/fipe/anos?marca=${marcaId}&modelo=${m.id}`);
      const lista: Ano[] = d.anos || [];
      setAnos(lista);
      // ja traz o valor do ano do cadastro (se existir na lista)
      const alvo = lista.find((a) => String(a.nome) === String(ano || ''));
      if (alvo) void verValor(m, alvo);
    } catch (e: any) { setErro(e?.message || 'Erro ao consultar a FIPE'); }
    setCarregando(false);
  }

  async function verValor(m: Modelo, a: Ano) {
    setPrecos((p) => ({ ...p, [a.id]: 'carregando' }));
    try {
      const d = await chamar(`/fipe/preco?marca=${marcaId}&modelo=${m.id}&ano=${encodeURIComponent(a.id)}`);
      setPrecos((p) => ({ ...p, [a.id]: d as Preco }));
    } catch (e: any) { setPrecos((p) => ({ ...p, [a.id]: `Erro: ${e?.message || e}` })); }
  }

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 330, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: 960, maxHeight: isPhone ? '100dvh' : 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600 }}>Consultar tabela FIPE</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Preço do mês de referência atual · cadastro: {marca || '—'} {modelo || ''}{ano ? ` ${ano}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>X</button>
        </div>

        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '260px minmax(0, 1fr)', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <div>
            <label style={s.label}>Marca</label>
            <select style={{ ...s.input, cursor: 'pointer' }} value={marcaId} onChange={(e) => { setMarcaId(e.target.value); setModeloSel(null); setAnos([]); setPrecos({}); }}>
              <option value="">Escolha a marca…</option>
              {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Modelo (digite para filtrar a lista)</label>
            <input style={s.input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex: F 800 GS" disabled={!marcaId} />
          </div>
        </div>

        {erro ? <div style={{ padding: '8px 20px', background: '#fef2f2', color: '#b91c1c', fontSize: 12.5, borderBottom: '1px solid #fecaca' }}>{erro}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', flex: 1, minHeight: 0, overflow: isPhone ? 'auto' : 'hidden' }}>
          <div style={{ borderRight: isPhone ? 'none' : '1px solid var(--border)', overflowY: 'auto', maxHeight: isPhone ? 260 : 'none', minHeight: 0 }}>
            <div style={{ padding: '10px 20px 4px', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Modelos {marcaId ? `(${modelos.length}${totalModelos > modelos.length ? ` de ${totalModelos}` : ''})` : ''}
            </div>
            {!marcaId ? <div style={{ padding: '10px 20px', fontSize: 13, color: 'var(--ink-muted)' }}>{carregando ? 'Consultando a FIPE…' : 'Escolha a marca para listar os modelos.'}</div> : null}
            {marcaId && !modelos.length && !carregando ? <div style={{ padding: '10px 20px', fontSize: 13, color: 'var(--ink-muted)' }}>Nenhum modelo encontrado. Ajuste o texto do modelo.</div> : null}
            {modelos.map((m) => {
              const ativo = modeloSel?.id === m.id;
              return (
                <div key={m.id} onClick={() => escolherModelo(m)} style={{ padding: '9px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: ativo ? '#eff6ff' : 'transparent', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: ativo ? 700 : 500, color: 'var(--ink)' }}>{m.nome}</span>
                  {m.pontos >= 50 ? <span style={{ fontSize: 10.5, color: m.pontos >= 85 ? '#166534' : '#92400e', background: m.pontos >= 85 ? '#dcfce7' : '#fffbeb', borderRadius: 99, padding: '1px 8px', whiteSpace: 'nowrap' }}>{m.pontos}% parecido</span> : null}
                </div>
              );
            })}
          </div>

          <div style={{ overflowY: 'auto', minHeight: 0 }}>
            <div style={{ padding: '10px 20px 4px', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Anos / valores {modeloSel ? `· ${modeloSel.nome}` : ''}</div>
            {!modeloSel ? <div style={{ padding: '10px 20px', fontSize: 13, color: 'var(--ink-muted)' }}>Clique em um modelo para ver os anos e valores.</div> : null}
            {modeloSel && !anos.length && !carregando ? <div style={{ padding: '10px 20px', fontSize: 13, color: 'var(--ink-muted)' }}>Sem anos disponíveis para este modelo.</div> : null}
            {anos.map((a) => {
              const p = precos[a.id];
              const doCadastro = String(a.nome) === String(ano || '');
              return (
                <div key={a.id} style={{ padding: '9px 20px', borderBottom: '1px solid var(--border)', background: doCadastro ? '#f0fdf4' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{a.nome === '32000' ? '0 km' : a.nome}{doCadastro ? <span style={{ marginLeft: 8, fontSize: 10.5, color: '#166534' }}>ano do cadastro</span> : null}</span>
                    {!p ? <button style={s.btn} onClick={() => verValor(modeloSel!, a)}>Ver valor</button>
                      : p === 'carregando' ? <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Consultando…</span>
                        : typeof p === 'string' ? <span style={{ fontSize: 12, color: '#b91c1c' }}>{p}</span>
                          : <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)', fontWeight: 700 }} onClick={() => onUsar(p.preco)}>Usar {brl(p.preco)}</button>}
                  </div>
                  {p && typeof p === 'object' ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 4 }}>{p.modelo} · {p.combustivel} · cód. FIPE {p.codigoFipe} · ref. {p.referencia}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
