'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function today() { return new Date().toISOString().split('T')[0]; }

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th:     { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const },
  td:     { padding: '10px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  sel:    { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32, cursor: 'pointer' },
  fi:     { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' },
};

function PecaModal({ open, onClose, onSave, peca, motos }: any) {
  const empty = { motoId: '', descricao: '', precoML: '', valorLiq: '', valorFrete: '', valorTaxas: '', disponivel: 'true', dataVenda: '', cadastro: today() };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (peca) {
      setForm({ motoId: peca.motoId, descricao: peca.descricao, precoML: peca.precoML, valorLiq: peca.valorLiq, valorFrete: peca.valorFrete, valorTaxas: peca.valorTaxas, disponivel: peca.disponivel ? 'true' : 'false', dataVenda: peca.dataVenda?.split('T')[0] || '', cadastro: peca.cadastro?.split('T')[0] || today() });
    } else setForm(empty);
    setErr('');
  }, [peca, open]);

  if (!open) return null;

  async function save() {
    if (!form.descricao || !form.motoId) { setErr('Moto e descrição são obrigatórios'); return; }
    setSaving(true);
    try {
      await onSave({ motoId: Number(form.motoId), descricao: form.descricao, precoML: Number(form.precoML)||0, valorLiq: Number(form.valorLiq)||0, valorFrete: Number(form.valorFrete)||0, valorTaxas: Number(form.valorTaxas)||0, disponivel: form.disponivel === 'true', dataVenda: form.dataVenda || null, cadastro: form.cadastro });
    } catch(e: any) { setErr(e.message); }
    setSaving(false);
  }

  const f = (label: string, field: string, type = 'text', ph = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>{label}</label>
      <input style={cs.fi} type={type} placeholder={ph} value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>{peca ? 'Editar peça' : 'Nova peça'}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Moto *</label>
            <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.motoId} onChange={e => setForm({ ...form, motoId: e.target.value })}>
              <option value="">Selecione...</option>
              {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo}</option>)}
            </select>
          </div>
          {f('Data de cadastro', 'cadastro', 'date')}
          {f('Descrição da peça *', 'descricao', 'text', 'Ex: Tampa Lateral Direita')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {f('Preço ML (R$)', 'precoML', 'number', '0,00')}
            {f('Valor Líquido (R$)', 'valorLiq', 'number', '0,00')}
            {f('Frete (R$)', 'valorFrete', 'number', '0,00')}
            {f('Taxas (R$)', 'valorTaxas', 'number', '0,00')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Status</label>
              <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.disponivel} onChange={e => setForm({ ...form, disponivel: e.target.value })}>
                <option value="true">Em estoque</option>
                <option value="false">Vendido</option>
              </select>
            </div>
            {f('Data de venda', 'dataVenda', 'date')}
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {err}</div>}
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }}>{saving ? 'Salvando...' : 'Salvar peça'}</button>
        </div>
      </div>
    </div>
  );
}

function VendaModal({ open, peca, onClose, onConfirm }: any) {
  const [dataVenda, setDataVenda] = useState(today());
  const [precoML, setPrecoML]     = useState('');
  const [saving, setSaving]       = useState(false);
  useEffect(() => { if (peca) setPrecoML(''); }, [peca]);
  if (!open || !peca) return null;
  async function confirm() {
    setSaving(true);
    try { await onConfirm({ dataVenda, precoML: precoML ? Number(precoML) : undefined }); }
    catch(e) {} setSaving(false);
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Registrar venda</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>{peca.idPeca} — {peca.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Data da venda *</label>
            <input style={cs.fi} type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Preço de venda (R$)</label>
            <input style={cs.fi} type="number" step="0.01" placeholder={`Preço ML atual: ${fmt(Number(peca.precoML))}`} value={precoML} onChange={e => setPrecoML(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>Deixe vazio para manter o Preço ML atual</div>
          </div>
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving} style={{ ...cs.btn, background: 'var(--sage)', color: 'var(--white)' }}>{saving ? 'Salvando...' : '✓ Confirmar venda'}</button>
        </div>
      </div>
    </div>
  );
}

export default function EstoquePage() {
  const [data, setData]       = useState<any>({ total: 0, totalDisp: 0, totalVend: 0, data: [] });
  const [motos, setMotos]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [editPeca, setEditPeca] = useState<any>(null);
  const [vendaModal, setVendaModal] = useState(false);
  const [vendaPeca, setVendaPeca]   = useState<any>(null);
  const [filters, setFilters] = useState({ motoId: '', disponivel: '', search: '', page: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    const params: any = { page: filters.page, per: 20 };
    if (filters.motoId)    params.motoId    = filters.motoId;
    if (filters.disponivel !== '') params.disponivel = filters.disponivel;
    if (filters.search)    params.search    = filters.search;
    const [d, m] = await Promise.all([api.pecas.list(params), api.motos.list()]);
    setData(d); setMotos(m); setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  async function handleSavePeca(formData: any) {
    if (editPeca) await api.pecas.update(editPeca.id, formData);
    else await api.pecas.create(formData);
    setModal(false); setEditPeca(null); load();
  }

  async function handleVenda({ dataVenda, precoML }: any) {
    await api.pecas.vender(vendaPeca.id, { dataVenda, ...(precoML ? { precoML } : {}) });
    setVendaModal(false); setVendaPeca(null); load();
  }

  const pecasDisp = data.data.filter((p: any) => p.disponivel);
  const pecasVend = data.data.filter((p: any) => !p.disponivel);

  return (
    <>
      <div style={cs.topbar}>
        <div><div style={cs.title}>Estoque</div><div style={cs.sub}>Controle de peças e disponibilidade</div></div>
      </div>
      <div style={{ padding: 28 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Total', v: data.total, c: 'var(--ink)' },
            { l: 'Em estoque', v: data.totalDisp, c: 'var(--sage)' },
            { l: 'Vendidas',   v: data.totalVend, c: 'var(--amber)' },
          ].map(c => (
            <div key={c.l} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>{c.l}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 500, color: c.c }}>{c.v}</div>
            </div>
          ))}
        </div>

        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Peças</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={cs.sel} value={filters.motoId} onChange={e => setFilters({ ...filters, motoId: e.target.value, page: 1 })}>
                <option value="">Todas motos</option>
                {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo}</option>)}
              </select>
              <select style={cs.sel} value={filters.disponivel} onChange={e => setFilters({ ...filters, disponivel: e.target.value, page: 1 })}>
                <option value="">Todos status</option>
                <option value="true">Em estoque</option>
                <option value="false">Vendido</option>
              </select>
              <input style={{ ...cs.sel, paddingLeft: 11 }} placeholder="🔍 ID ou descrição..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })} />
              <button style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', padding: '6px 14px', fontSize: 13 }} onClick={() => { setEditPeca(null); setModal(true); }}>+ Nova peça</button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['ID Moto','ID Peça','Moto','Descrição','Cadastro','Preço ML','Vl. Líq.','Frete','Taxas','Data Venda','Status',''].map(h => (
                    <th key={h} style={cs.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                ) : data.data.length === 0 ? (
                  <tr><td colSpan={12} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Nenhuma peça encontrada</td></tr>
                ) : data.data.map((p: any) => (
                  <tr key={p.id}>
                    <td style={cs.td}><span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>#{p.motoId}</span></td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--blue)' }}>{p.idPeca}</td>
                    <td style={{ ...cs.td, color: 'var(--ink-muted)', fontSize: 12 }}>{p.moto?.marca} {p.moto?.modelo}</td>
                    <td style={{ ...cs.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descricao}>{p.descricao}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)' }}>{p.cadastro?.split('T')[0] || '—'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{fmt(Number(p.precoML))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{fmt(Number(p.valorLiq))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{fmt(Number(p.valorFrete))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{fmt(Number(p.valorTaxas))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)' }}>{p.dataVenda?.split('T')[0] || '—'}</td>
                    <td style={cs.td}>
                      {p.disponivel
                        ? <span style={{ background: 'var(--sage-light)', color: 'var(--sage)', border: '1px solid var(--sage-mid)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>● Estoque</span>
                        : <span style={{ background: 'var(--gray-100)', color: 'var(--ink-muted)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>○ Vendido</span>}
                    </td>
                    <td style={cs.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditPeca(p); setModal(true); }} style={{ ...cs.btn, padding: '4px 8px', fontSize: 11, background: 'transparent', borderColor: 'transparent', color: 'var(--ink-muted)' }} title="Editar">✏</button>
                        {p.disponivel && <button onClick={() => { setVendaPeca(p); setVendaModal(true); }} style={{ ...cs.btn, padding: '4px 9px', fontSize: 11, background: 'var(--amber-light)', color: 'var(--amber)', borderColor: 'var(--amber-mid)' }}>💰 Vender</button>}
                        <button onClick={async () => { if (!confirm(`Excluir peça ${p.idPeca}?`)) return; await api.pecas.delete(p.id); load(); }} style={{ ...cs.btn, padding: '4px 8px', fontSize: 11, background: 'transparent', borderColor: 'transparent', color: '#fca5a5' }} title="Excluir">🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>
            <span>Página {filters.page} · {data.total} total</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>‹ Anterior</button>
              <button disabled={data.data.length < 20} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>Próxima ›</button>
            </div>
          </div>
        </div>
      </div>
      <PecaModal open={modal} onClose={() => { setModal(false); setEditPeca(null); }} onSave={handleSavePeca} peca={editPeca} motos={motos} />
      <VendaModal open={vendaModal} peca={vendaPeca} onClose={() => setVendaModal(false)} onConfirm={handleVenda} />
    </>
  );
}


// ADDED perPage control
// const [perPage, setPerPage] = useState(10);
