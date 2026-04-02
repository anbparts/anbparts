'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  th:     { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const, cursor: 'pointer' },
  td:     { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  input:  { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32 },
  fi:     { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' },
  fl:     { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
};

function Modal({ open, title, onClose, onSave, moto }: any) {
  const empty = { marca: '', modelo: '', ano: '', cor: '', placa: '', chassi: '', dataCompra: '', precoCompra: '', origemCompra: '', observacoes: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (moto) setForm({ marca: moto.marca||'', modelo: moto.modelo||'', ano: moto.ano||'', cor: moto.cor||'', placa: moto.placa||'', chassi: moto.chassi||'', dataCompra: moto.dataCompra?.split('T')[0]||'', precoCompra: moto.precoCompra||'', origemCompra: moto.origemCompra||'', observacoes: moto.observacoes||'' });
    else setForm(empty);
    setErr('');
  }, [moto, open]);

  if (!open) return null;

  async function save() {
    if (!form.marca || !form.modelo) { setErr('Marca e modelo são obrigatórios'); return; }
    setSaving(true);
    try {
      await onSave({ ...form, ano: form.ano ? Number(form.ano) : null, precoCompra: Number(form.precoCompra) || 0 });
    } catch(e: any) { setErr(e.message); }
    setSaving(false);
  }

  const row = (label: string, field: string, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={cs.fl}>{label}</label>
      <input style={cs.fi} type={type} placeholder={placeholder} value={(form as any)[field]}
        onChange={e => setForm({ ...form, [field]: e.target.value })} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Identificação</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {row('Marca *', 'marca', 'text', 'Ex: YAMAHA')}
            {row('Modelo *', 'modelo', 'text', 'Ex: CROSSER')}
            {row('Ano', 'ano', 'number', '2024')}
            {row('Cor', 'cor', 'text', 'Ex: Preto')}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '16px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Documentação</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {row('Placa', 'placa', 'text', 'ABC-1234')}
            {row('Chassi', 'chassi', 'text')}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '16px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Compra</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {row('Data de compra', 'dataCompra', 'date')}
            {row('Preço de compra (R$) *', 'precoCompra', 'number', '0,00')}
          </div>
          {row('Origem da compra', 'origemCompra', 'text', 'Ex: Leilão, Particular...')}
          <div style={{ marginBottom: 14 }}>
            <label style={cs.fl}>Observações</label>
            <textarea style={{ ...cs.fi, resize: 'vertical', minHeight: 64 }} value={form.observacoes}
              onChange={e => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>⚠ {err}</div>}
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }}>{saving ? 'Salvando...' : 'Salvar moto'}</button>
        </div>
      </div>
    </div>
  );
}

export default function MotosPage() {
  const [motos, setMotos]   = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState<any>(null);
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api.motos.list();
    setMotos(data); setFiltered(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? motos.filter(m => m.marca.toLowerCase().includes(q) || m.modelo.toLowerCase().includes(q) || String(m.id).includes(q)) : motos);
  }, [search, motos]);

  async function handleSave(data: any) {
    if (editing) await api.motos.update(editing.id, data);
    else await api.motos.create(data);
    setModal(false); setEditing(null);
    load();
  }

  return (
    <>
      <div style={cs.topbar}>
        <div><div style={cs.title}>Motos</div><div style={cs.sub}>Cadastro e gestão de motos</div></div>
      </div>
      <div style={{ padding: 28 }}>
        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>
              Motos cadastradas <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', fontWeight: 400 }}>— {filtered.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={cs.input} placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              <button style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }} onClick={() => { setEditing(null); setModal(true); }}>+ Nova moto</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['ID','Marca','Modelo','Ano','Compra','Estoque','Vendidas','Receita','Lucro',''].map(h => (
                    <th key={h} style={cs.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Nenhuma moto encontrada</td></tr>
                ) : filtered.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cs.td}><span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>#{m.id}</span></td>
                    <td style={{ ...cs.td, color: 'var(--ink-muted)', fontSize: 12 }}>{m.marca}</td>
                    <td style={cs.td}><strong>{m.modelo}</strong></td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{m.ano || '—'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{fmt(m.precoCompra)}</td>
                    <td style={cs.td}><span style={{ background: 'var(--sage-light)', color: 'var(--sage)', border: '1px solid var(--sage-mid)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>{m.qtdDisp} disp.</span></td>
                    <td style={cs.td}><span style={{ background: 'var(--gray-100)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>{m.qtdVendidas} vend.</span></td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--amber)' }}>{fmt(m.receitaTotal||0)}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--sage)' }}>{fmt(m.lucro||0)}</td>
                    <td style={cs.td}>
                      <button onClick={() => { setEditing(m); setModal(true); }} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'transparent', color: 'var(--ink-muted)', borderColor: 'transparent' }}>✏</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Modal open={modal} title={editing ? 'Editar moto' : 'Nova moto'} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} moto={editing} />
    </>
  );
}
