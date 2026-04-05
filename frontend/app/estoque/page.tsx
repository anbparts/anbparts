'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function today() {
  return dateInputValue(new Date());
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function calculatePecaPreview(precoML: string, valorFrete: string, valorTaxas: string) {
  const preco = Number(precoML) || 0;
  const frete = Number(valorFrete) || 0;
  const taxas = Number(valorTaxas) || 0;

  return {
    precoML: preco,
    valorFrete: frete,
    valorTaxas: taxas,
    valorLiq: roundMoney(preco - frete - taxas),
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const pageSizeOptions = [10, 20, 50, 100, 250];
const PREJUIZO_OPTIONS = [
  'Extravio no Envio',
  'Defeito',
  'SKU Cancelado',
  'Peça Restrita - Sem Revenda',
  'Extravio no Estoque',
];

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const },
  td: { padding: '10px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  sel: { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32, cursor: 'pointer' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' },
};

function PrejuizoReasonModal({ open, peca, saving, onClose, onConfirm }: any) {
  const [motivo, setMotivo] = useState(PREJUIZO_OPTIONS[0]);

  useEffect(() => {
    if (open) setMotivo(PREJUIZO_OPTIONS[0]);
  }, [open]);

  if (!open || !peca) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Marcar prejuízo</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{peca.idPeca} - {peca.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 12 }}>Selecione o motivo do prejuízo para remover a peça do estoque e registrar no relatório.</div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Motivo *</label>
          <select style={{ ...cs.fi, cursor: 'pointer' }} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {PREJUIZO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={() => onConfirm(motivo)} disabled={saving} style={{ ...cs.btn, background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }}>{saving ? 'Salvando...' : 'Confirmar prejuízo'}</button>
        </div>
      </div>
    </div>
  );
}

function PecaModal({ open, onClose, onSave, onCancelSale, onMarkPrejuizo, peca, motos }: any) {
  const empty = {
    motoId: '',
    descricao: '',
    precoML: '',
    valorLiq: '',
    valorFrete: '',
    valorTaxas: '',
    blingPedidoNum: '',
    disponivel: 'true',
    dataVenda: '',
    cadastro: today(),
  };

  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showPrejuizoModal, setShowPrejuizoModal] = useState(false);
  const preview = calculatePecaPreview(form.precoML, form.valorFrete, form.valorTaxas);

  useEffect(() => {
    if (peca) {
      setForm({
        motoId: String(peca.motoId),
        descricao: peca.descricao || '',
        precoML: String(Number(peca.precoML || 0)),
        valorLiq: String(Number(peca.valorLiq || 0)),
        valorFrete: String(Number(peca.valorFrete || 0)),
        valorTaxas: String(Number(peca.valorTaxas || 0)),
        blingPedidoNum: String(peca.blingPedidoNum || ''),
        disponivel: peca.disponivel ? 'true' : 'false',
        dataVenda: peca.dataVenda?.split('T')[0] || '',
        cadastro: peca.cadastro?.split('T')[0] || today(),
      });
    } else {
      setForm(empty);
    }
    setErr('');
    setShowPrejuizoModal(false);
  }, [peca, open]);

  if (!open) return null;

  async function save() {
    if (!form.descricao || !form.motoId) {
      setErr('Moto e descricao sao obrigatorios');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        motoId: Number(form.motoId),
        descricao: form.descricao,
        precoML: preview.precoML,
        valorLiq: preview.valorLiq,
        valorFrete: preview.valorFrete,
        valorTaxas: preview.valorTaxas,
        blingPedidoNum: form.blingPedidoNum.trim() || null,
        disponivel: form.disponivel === 'true',
        dataVenda: form.dataVenda || null,
        cadastro: form.cadastro,
      });
    } catch (e: any) {
      setErr(e.message || 'Erro ao salvar');
    }
    setSaving(false);
  }

  const renderField = (label: string, field: string, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>{label}</label>
      <input
        style={cs.fi}
        type={type}
        placeholder={placeholder}
        value={(form as any)[field]}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
      />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>{peca ? 'Editar peca' : 'Nova peca'}</div>
            {peca?.idPeca && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>ID da peca: {peca.idPeca}</div>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Moto *</label>
            <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.motoId} onChange={(e) => setForm({ ...form, motoId: e.target.value })}>
              <option value="">Selecione...</option>
              {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo}</option>)}
            </select>
          </div>
          {renderField('Data de cadastro', 'cadastro', 'date')}
          {renderField('Descricao da peca *', 'descricao', 'text', 'Ex: Tampa lateral direita')}
          {renderField('Pedido Bling', 'blingPedidoNum', 'text', 'Ex: 449')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderField('Preco ML (R$)', 'precoML', 'number', '0,00')}
            {renderField('Frete (R$)', 'valorFrete', 'number', '0,00')}
            {renderField('Taxas (R$)', 'valorTaxas', 'number', '0,00')}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sage)' }}>Valor liquido (R$)</label>
              <input
                style={{ ...cs.fi, background: '#f0fdf4', borderColor: '#86efac', color: 'var(--sage)', fontWeight: 600 }}
                type="text"
                readOnly
                value={fmt(preview.valorLiq)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Status</label>
              <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.disponivel} onChange={(e) => setForm({ ...form, disponivel: e.target.value })}>
                <option value="true">Em estoque</option>
                <option value="false">Vendido</option>
              </select>
            </div>
            {renderField('Data de venda', 'dataVenda', 'date')}
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>! {err}</div>}
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div>
            {peca && !peca.disponivel && (
              <button
                onClick={async () => {
                  if (!confirm(`Cancelar a venda da peca ${peca.idPeca}?`)) return;
                  setSaving(true);
                  try {
                    await onCancelSale(peca);
                  } catch (e: any) {
                    setErr(e.message || 'Erro ao cancelar venda');
                  }
                  setSaving(false);
                }}
                disabled={saving}
                style={{ ...cs.btn, background: '#fff1f2', color: 'var(--red)', borderColor: '#fecdd3' }}
              >
                Cancelar venda
              </button>
            )}
            {peca && peca.disponivel && (
              <button
                onClick={() => setShowPrejuizoModal(true)}
                disabled={saving}
                style={{ ...cs.btn, background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' }}
              >
                Prejuízo
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }}>{saving ? 'Salvando...' : 'Salvar peca'}</button>
          </div>
        </div>
      </div>
      <PrejuizoReasonModal
        open={showPrejuizoModal}
        peca={peca}
        saving={saving}
        onClose={() => setShowPrejuizoModal(false)}
        onConfirm={async (motivo: string) => {
          setSaving(true);
          try {
            await onMarkPrejuizo({
              id: peca.id,
              motivo,
              motoId: Number(form.motoId),
              descricao: form.descricao,
              cadastro: form.cadastro,
              precoML: preview.precoML,
              valorFrete: preview.valorFrete,
              valorTaxas: preview.valorTaxas,
              valorLiq: preview.valorLiq,
            });
          } catch (e: any) {
            setErr(e.message || 'Erro ao registrar prejuízo');
            setSaving(false);
            return;
          }
          setSaving(false);
          setShowPrejuizoModal(false);
        }}
      />
    </div>
  );
}

function VendaModal({ open, peca, onClose, onConfirm }: any) {
  const [dataVenda, setDataVenda] = useState(today());
  const [pedidoNum, setPedidoNum] = useState('');
  const [precoML, setPrecoML] = useState('');
  const [frete, setFrete] = useState('');
  const [taxaValor, setTaxaValor] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!peca) return;
    setDataVenda(today());
    setPedidoNum('');
    setPrecoML(String(Number(peca.precoML || 0)));
    setFrete(String(Number(peca.valorFrete || 0)));
    setTaxaValor(String(Number(peca.valorTaxas || 0)));
    setErr('');
  }, [peca, open]);

  if (!open || !peca) return null;

  const valorLiq = (Number(precoML) || 0) - (Number(frete) || 0) - (Number(taxaValor) || 0);

  async function confirm() {
    if (!pedidoNum.trim()) {
      setErr('Numero do pedido Bling e obrigatorio');
      return;
    }

    setSaving(true);
    try {
      await onConfirm({
        dataVenda,
        pedidoNum: pedidoNum.trim(),
        precoML: Number(precoML) || 0,
        frete: Number(frete) || 0,
        taxaValor: Number(taxaValor) || 0,
      });
    } catch (e: any) {
      setErr(e.message || 'Erro ao registrar venda');
    }
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Registrar venda</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>{peca.idPeca} - {peca.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Data da venda *</label>
            <input style={cs.fi} type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Numero do pedido Bling *</label>
            <input style={cs.fi} type="text" placeholder="Ex: 449" value={pedidoNum} onChange={(e) => setPedidoNum(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>Esse numero sera usado para vincular futuros cancelamentos ao pedido correto.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Preco de venda (R$)</label>
              <input style={cs.fi} type="number" step="0.01" value={precoML} onChange={(e) => setPrecoML(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Frete (R$)</label>
              <input style={cs.fi} type="number" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Taxa (R$)</label>
              <input style={cs.fi} type="number" step="0.01" value={taxaValor} onChange={(e) => setTaxaValor(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sage)' }}>Valor liquido (R$)</label>
              <input style={{ ...cs.fi, background: '#f0fdf4', borderColor: '#86efac', color: 'var(--sage)', fontWeight: 600 }} type="text" readOnly value={fmt(valorLiq)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>Voce pode ajustar preco, frete e taxa antes de confirmar a baixa.</div>
          {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 10 }}>! {err}</div>}
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={confirm} disabled={saving} style={{ ...cs.btn, background: 'var(--sage)', color: 'var(--white)' }}>{saving ? 'Salvando...' : 'Confirmar venda'}</button>
        </div>
      </div>
    </div>
  );
}

export default function EstoquePage() {
  const [data, setData] = useState<any>({ total: 0, totalDisp: 0, totalVend: 0, data: [] });
  const [motos, setMotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editPeca, setEditPeca] = useState<any>(null);
  const [vendaModal, setVendaModal] = useState(false);
  const [vendaPeca, setVendaPeca] = useState<any>(null);
  const [filters, setFilters] = useState({ motoId: '', disponivel: '', search: '', dataVendaFrom: '', dataVendaTo: '', page: 1, perPage: 20 });

  const load = useCallback(async () => {
    setLoading(true);
    const params: any = { page: filters.page, per: filters.perPage };
    if (filters.motoId) params.motoId = filters.motoId;
    if (filters.disponivel !== '') params.disponivel = filters.disponivel;
    if (filters.search) params.search = filters.search;
    if (filters.dataVendaFrom) params.dataVendaFrom = filters.dataVendaFrom;
    if (filters.dataVendaTo) params.dataVendaTo = filters.dataVendaTo;

    const [d, m] = await Promise.all([api.pecas.list(params), api.motos.list()]);
    setData(d);
    setMotos(m);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSavePeca(formData: any) {
    if (editPeca) await api.pecas.update(editPeca.id, formData);
    else await api.pecas.create(formData);
    setModal(false);
    setEditPeca(null);
    load();
  }

  async function handleVenda(formData: any) {
    await api.pecas.vender(vendaPeca.id, formData);
    setVendaModal(false);
    setVendaPeca(null);
    load();
  }

  async function handleCancelSale(peca: any) {
    await api.pecas.cancelarVenda(peca.id);
    setModal(false);
    setEditPeca(null);
    load();
  }

  async function handleMarkPrejuizo(payload: any) {
    await api.pecas.marcarPrejuizo(payload.id, payload);
    setModal(false);
    setEditPeca(null);
    load();
  }

  function applyDatePreset(kind: 'today' | '7days' | '30days' | 'month') {
    const now = new Date();
    const to = dateInputValue(now);

    if (kind === 'today') {
      setFilters({ ...filters, dataVendaFrom: to, dataVendaTo: to, page: 1 });
      return;
    }

    if (kind === '7days') {
      setFilters({ ...filters, dataVendaFrom: dateInputValue(addDays(now, -6)), dataVendaTo: to, page: 1 });
      return;
    }

    if (kind === '30days') {
      setFilters({ ...filters, dataVendaFrom: dateInputValue(addDays(now, -29)), dataVendaTo: to, page: 1 });
      return;
    }

    setFilters({ ...filters, dataVendaFrom: dateInputValue(startOfMonth(now)), dataVendaTo: to, page: 1 });
  }

  function clearFilters() {
    setFilters({ ...filters, motoId: '', disponivel: '', search: '', dataVendaFrom: '', dataVendaTo: '', page: 1 });
  }

  const hasActiveFilters = Boolean(filters.motoId || filters.disponivel !== '' || filters.search || filters.dataVendaFrom || filters.dataVendaTo);
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / filters.perPage));
  const hasPrevPage = filters.page > 1;
  const hasNextPage = filters.page < totalPages;

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Estoque</div>
          <div style={cs.sub}>Controle de pecas e disponibilidade</div>
        </div>
      </div>
      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Total', v: data.total, c: 'var(--ink)' },
            { l: 'Em estoque', v: data.totalDisp, c: 'var(--sage)' },
            { l: 'Vendidas', v: data.totalVend, c: 'var(--amber)' },
          ].map((card) => (
            <div key={card.l} style={cs.sCard}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>{card.l}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 500, color: card.c }}>{card.v}</div>
            </div>
          ))}
        </div>

        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>Pecas</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={cs.sel} value={filters.motoId} onChange={(e) => setFilters({ ...filters, motoId: e.target.value, page: 1 })}>
                <option value="">Todas motos</option>
                {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo}</option>)}
              </select>
              <select style={cs.sel} value={filters.disponivel} onChange={(e) => setFilters({ ...filters, disponivel: e.target.value, page: 1 })}>
                <option value="">Todos status</option>
                <option value="true">Em estoque</option>
                <option value="false">Vendido</option>
              </select>
              <input style={{ ...cs.sel, paddingLeft: 11 }} placeholder="ID, descricao ou pedido..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 32 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Venda de</span>
                <input
                  type="date"
                  value={filters.dataVendaFrom}
                  max={filters.dataVendaTo || undefined}
                  onChange={(e) => setFilters({ ...filters, dataVendaFrom: e.target.value, page: 1 })}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Geist, sans-serif', color: 'var(--ink)', minWidth: 128 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 32 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>ate</span>
                <input
                  type="date"
                  value={filters.dataVendaTo}
                  min={filters.dataVendaFrom || undefined}
                  onChange={(e) => setFilters({ ...filters, dataVendaTo: e.target.value, page: 1 })}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Geist, sans-serif', color: 'var(--ink)', minWidth: 128 }}
                />
              </div>
              <select style={cs.sel} value={String(filters.perPage)} onChange={(e) => setFilters({ ...filters, perPage: Number(e.target.value), page: 1 })}>
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size} por pagina</option>)}
              </select>
              <button style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', padding: '6px 14px', fontSize: 13 }} onClick={() => { setEditPeca(null); setModal(true); }}>+ Nova peca</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10, background: '#fcfcfd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Periodo rapido</span>
              <button onClick={() => applyDatePreset('today')} style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>Hoje</button>
              <button onClick={() => applyDatePreset('7days')} style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>7 dias</button>
              <button onClick={() => applyDatePreset('30days')} style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>30 dias</button>
              <button onClick={() => applyDatePreset('month')} style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>Este mes</button>
            </div>
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: hasActiveFilters ? 'var(--ink-soft)' : 'var(--ink-muted)', opacity: hasActiveFilters ? 1 : 0.6 }}
            >
              Limpar filtros
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['ID Moto', 'ID Peca', 'Moto', 'Descricao', 'Cadastro', 'Preco ML', 'Vl. Liq.', 'Frete', 'Taxas', 'Data Venda', 'Pedido Bling', 'Status', ''].map((header) => (
                    <th key={header} style={cs.th}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                ) : data.data.length === 0 ? (
                  <tr><td colSpan={13} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Nenhuma peca encontrada</td></tr>
                ) : data.data.map((p: any) => (
                  <tr key={p.id}>
                    <td style={cs.td}><span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>#{p.motoId}</span></td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--blue)' }}>{p.idPeca}</td>
                    <td style={{ ...cs.td, color: 'var(--ink-muted)', fontSize: 12 }}>{p.moto?.marca} {p.moto?.modelo}</td>
                    <td style={{ ...cs.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descricao}>{p.descricao}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)' }}>{p.cadastro?.split('T')[0] || '-'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{fmt(Number(p.precoML))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{fmt(Number(p.valorLiq))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{fmt(Number(p.valorFrete))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{fmt(Number(p.valorTaxas))}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)' }}>{p.dataVenda?.split('T')[0] || '-'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: p.blingPedidoNum ? 'var(--blue)' : 'var(--ink-muted)' }}>{p.blingPedidoNum || '-'}</td>
                    <td style={cs.td}>
                      {p.disponivel
                        ? <span style={{ background: 'var(--sage-light)', color: 'var(--sage)', border: '1px solid var(--sage-mid)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>Estoque</span>
                        : <span style={{ background: 'var(--gray-100)', color: 'var(--ink-muted)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>Vendido</span>}
                    </td>
                    <td style={cs.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditPeca(p); setModal(true); }} style={{ ...cs.btn, padding: '4px 8px', fontSize: 11, background: 'transparent', borderColor: 'transparent', color: 'var(--ink-muted)' }} title="Editar">Edit</button>
                        {p.disponivel && <button onClick={() => { setVendaPeca(p); setVendaModal(true); }} style={{ ...cs.btn, padding: '4px 9px', fontSize: 11, background: 'var(--amber-light)', color: 'var(--amber)', borderColor: 'var(--amber-mid)' }}>Vender</button>}
                        <button onClick={async () => { if (!confirm(`Excluir peca ${p.idPeca}?`)) return; await api.pecas.delete(p.id); load(); }} style={{ ...cs.btn, padding: '4px 8px', fontSize: 11, background: 'transparent', borderColor: 'transparent', color: '#fca5a5' }} title="Excluir">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>
            <span>Pagina {filters.page} de {totalPages} · {data.total} total · {filters.perPage} por pagina</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={!hasPrevPage} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>Anterior</button>
              <button disabled={!hasNextPage} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>Proxima</button>
            </div>
          </div>
        </div>
      </div>

      <PecaModal open={modal} onClose={() => { setModal(false); setEditPeca(null); }} onSave={handleSavePeca} onCancelSale={handleCancelSale} onMarkPrejuizo={handleMarkPrejuizo} peca={editPeca} motos={motos} />
      <VendaModal open={vendaModal} peca={vendaPeca} onClose={() => setVendaModal(false)} onConfirm={handleVenda} />
    </>
  );
}
