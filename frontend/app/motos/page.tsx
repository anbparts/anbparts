'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR');
}

function fmtDateTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('pt-BR');
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const MOTO_ANEXO_FIELDS = [
  { key: 'nfeLeilao', label: 'NF-e Leilao' },
  { key: 'atpve', label: 'ATPV-e' },
  { key: 'baixaDetran', label: 'Baixa Detran' },
  { key: 'nfeEntrada', label: 'NF-e Entrada' },
  { key: 'fotoDianteira', label: 'Foto Dianteira' },
  { key: 'fotoTraseira', label: 'Foto Traseira' },
  { key: 'fotoLateralDireita', label: 'Foto Lateral Dir.' },
  { key: 'fotoLateralEsquerda', label: 'Foto Lateral Esq.' },
  { key: 'fotoPainel', label: 'Foto Painel' },
  { key: 'fotoChassi', label: 'Foto Chassi' },
  { key: 'fotoNumeroMotor', label: 'Num. do Motor' },
] as const;

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const, cursor: 'pointer' },
  td: { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  input: { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32 },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
};

function Modal({ open, title, onClose, onSave, moto }: any) {
  const empty = { marca: '', modelo: '', ano: '', cor: '', placa: '', chassi: '', renavam: '', dataCompra: '', precoCompra: '', origemCompra: '', observacoes: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (moto) {
      setForm({
        marca: moto.marca || '',
        modelo: moto.modelo || '',
        ano: moto.ano || '',
        cor: moto.cor || '',
        placa: moto.placa || '',
        chassi: moto.chassi || '',
        renavam: moto.renavam || '',
        dataCompra: moto.dataCompra?.split('T')[0] || '',
        precoCompra: moto.precoCompra || '',
        origemCompra: moto.origemCompra || '',
        observacoes: moto.observacoes || '',
      });
    } else {
      setForm(empty);
    }
    setErr('');
  }, [moto, open]);

  if (!open) return null;

  async function save() {
    if (!form.marca || !form.modelo) {
      setErr('Marca e modelo sao obrigatorios');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        ano: form.ano ? Number(form.ano) : null,
        precoCompra: Number(form.precoCompra) || 0,
      });
    } catch (e: any) {
      setErr(e.message);
    }
    setSaving(false);
  }

  const row = (label: string, field: string, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={cs.fl}>{label}</label>
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
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>X</button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Identificacao</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {row('Marca *', 'marca', 'text', 'Ex: YAMAHA')}
            {row('Modelo *', 'modelo', 'text', 'Ex: CROSSER')}
            {row('Ano', 'ano', 'number', '2024')}
            {row('Cor', 'cor', 'text', 'Ex: Preto')}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '16px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Documentacao</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {row('Placa', 'placa', 'text', 'ABC-1234')}
            {row('Chassi', 'chassi', 'text')}
          </div>
          {row('Renavam', 'renavam', 'text')}
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '16px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Compra</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {row('Data de compra', 'dataCompra', 'date')}
            {row('Preco de compra (R$) *', 'precoCompra', 'number', '0,00')}
          </div>
          {row('Origem da compra', 'origemCompra', 'text', 'Ex: Leilao, Particular...')}
          <div style={{ marginBottom: 14 }}>
            <label style={cs.fl}>Observacoes</label>
            <textarea
              style={{ ...cs.fi, resize: 'vertical', minHeight: 64 }}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>! {err}</div>}
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }}>{saving ? 'Salvando...' : 'Salvar moto'}</button>
        </div>
      </div>
    </div>
  );
}

function DetranModal({ open, moto, loading, data, updatingId, onToggleStatus, onClose }: any) {
  if (!open) return null;

  const total = Array.isArray(data?.itens) ? data.itens.length : 0;
  const ativas = Array.isArray(data?.itens) ? data.itens.filter((item: any) => item.detranStatus !== 'baixada').length : 0;
  const baixadas = total - ativas;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,.12)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600 }}>Etiquetas DETRAN</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
              {moto ? `ID ${moto.id} - ${moto.marca} ${moto.modelo}` : 'Moto selecionada'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', maxHeight: 'calc(90vh - 78px)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ background: '#ecfdf3', color: 'var(--green)', border: '1px solid #86efac', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Ativas: {ativas}
            </span>
            <span style={{ background: '#fef2f2', color: 'var(--red)', border: '1px solid #fca5a5', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Baixadas: {baixadas}
            </span>
            <span style={{ background: 'var(--gray-50)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Total: {total}
            </span>
          </div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Carregando etiquetas...</div>
          ) : !data?.itens?.length ? (
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Nenhuma etiqueta DETRAN encontrada para essa moto.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['ID Peca', 'Descricao', 'Numero da etiqueta', 'Status', 'Acao'].map((head) => (
                      <th key={head} style={cs.th}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{item.idPeca}</td>
                      <td style={cs.td}>{item.descricao}</td>
                      <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--blue-600)' }}>{item.detranEtiqueta}</td>
                      <td style={cs.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{
                            display: 'inline-flex',
                            alignSelf: 'flex-start',
                            padding: '4px 10px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            border: `1px solid ${item.detranBaixada ? '#fca5a5' : '#86efac'}`,
                            background: item.detranBaixada ? '#fef2f2' : '#ecfdf3',
                            color: item.detranBaixada ? 'var(--red)' : 'var(--green)',
                          }}>
                            {item.detranStatusLabel}
                          </span>
                          {item.detranBaixadaAt && (
                            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                              Baixada em {fmtDateTime(item.detranBaixadaAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={cs.td}>
                        <button
                          onClick={() => onToggleStatus(item, item.detranBaixada ? 'ativa' : 'baixada')}
                          disabled={updatingId === item.id}
                          style={{
                            ...cs.btn,
                            padding: '6px 10px',
                            fontSize: 11,
                            border: `1px solid ${item.detranBaixada ? '#86efac' : '#fca5a5'}`,
                            background: item.detranBaixada ? '#ecfdf3' : '#fef2f2',
                            color: item.detranBaixada ? 'var(--green)' : 'var(--red)',
                            opacity: updatingId === item.id ? 0.7 : 1,
                          }}
                        >
                          {updatingId === item.id ? 'Salvando...' : item.detranBaixada ? 'Reativar' : 'Confirmar baixa'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnexosMotoModal({ open, moto, loading, data, saving, onClose, onSave }: any) {
  const [form, setForm] = useState<Record<string, { name: string; dataUrl: string } | null>>({});

  useEffect(() => {
    if (!open) return;
    setForm(data?.anexos || {});
  }, [open, data]);

  async function handleFileChange(key: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setForm((current) => ({ ...current, [key]: { name: file.name, dataUrl } }));
  }

  function clearFile(key: string) {
    setForm((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  if (!open) return null;

  const total = Object.keys(form || {}).length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 980, maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,.12)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600 }}>Anexos da moto</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
              {moto ? `ID ${moto.id} - ${moto.marca} ${moto.modelo}` : 'Moto selecionada'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', maxHeight: 'calc(92vh - 140px)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ background: 'var(--gray-50)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Arquivos anexados: {total}
            </span>
          </div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Carregando anexos...</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Documento', 'Arquivo atual', 'Upload', 'Acoes'].map((head) => (
                      <th key={head} style={cs.th}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOTO_ANEXO_FIELDS.map((field) => {
                    const attachment = form?.[field.key] || null;
                    return (
                      <tr key={field.key}>
                        <td style={{ ...cs.td, fontWeight: 600 }}>{field.label}</td>
                        <td style={cs.td}>
                          {attachment ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ fontSize: 12, color: 'var(--ink)' }}>{attachment.name}</span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>Nenhum arquivo</span>
                          )}
                        </td>
                        <td style={cs.td}>
                          <input type="file" accept=".pdf,image/*" onChange={(event) => handleFileChange(field.key, event)} />
                        </td>
                        <td style={cs.td}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => attachment && downloadDataUrl(attachment.dataUrl, attachment.name)}
                              disabled={!attachment}
                              style={{ ...cs.btn, padding: '6px 10px', fontSize: 11, border: '1px solid var(--border)', background: 'var(--white)', color: attachment ? 'var(--blue-500)' : 'var(--ink-muted)', cursor: attachment ? 'pointer' : 'not-allowed', opacity: attachment ? 1 : 0.7 }}
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => clearFile(field.key)}
                              disabled={!attachment}
                              style={{ ...cs.btn, padding: '6px 10px', fontSize: 11, border: '1px solid #fecaca', background: '#fef2f2', color: attachment ? 'var(--red)' : 'var(--ink-muted)', cursor: attachment ? 'pointer' : 'not-allowed', opacity: attachment ? 1 : 0.7 }}
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Fechar</button>
          <button onClick={() => onSave(form)} disabled={saving || loading} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', opacity: saving ? 0.8 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar anexos'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MotosPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [detranModalOpen, setDetranModalOpen] = useState(false);
  const [detranMoto, setDetranMoto] = useState<any>(null);
  const [detranData, setDetranData] = useState<any>(null);
  const [detranLoading, setDetranLoading] = useState(false);
  const [detranUpdatingId, setDetranUpdatingId] = useState<number | null>(null);
  const [anexosModalOpen, setAnexosModalOpen] = useState(false);
  const [anexosMoto, setAnexosMoto] = useState<any>(null);
  const [anexosData, setAnexosData] = useState<any>(null);
  const [anexosLoading, setAnexosLoading] = useState(false);
  const [anexosSaving, setAnexosSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api.motos.list();
    setMotos(data);
    setFiltered(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const q = search.toLowerCase().trim();
    setFiltered(
      q
        ? motos.filter((m) => {
            const haystack = [
              m.marca,
              m.modelo,
              m.placa,
              m.chassi,
              m.renavam,
              String(m.id),
            ].join(' ').toLowerCase();
            return haystack.includes(q);
          })
        : motos,
    );
  }, [search, motos]);

  async function handleSave(data: any) {
    if (editing) await api.motos.update(editing.id, data);
    else await api.motos.create(data);
    setModal(false);
    setEditing(null);
    load();
  }

  async function openDetranModal(moto: any) {
    if (!moto?.temDetran) return;

    setDetranMoto(moto);
    setDetranModalOpen(true);
    setDetranLoading(true);
    try {
      const data = await api.motos.detranEtiquetas(moto.id);
      setDetranData(data);
    } catch {
      setDetranData({ itens: [] });
    }
    setDetranLoading(false);
  }

  function closeDetranModal() {
    setDetranModalOpen(false);
    setDetranMoto(null);
    setDetranData(null);
    setDetranLoading(false);
    setDetranUpdatingId(null);
  }

  async function handleDetranStatusToggle(item: any, status: 'ativa' | 'baixada') {
    setDetranUpdatingId(item.id);
    try {
      const response = await api.motos.setDetranEtiquetaStatus(item.id, status);
      setDetranData((current: any) => {
        if (!current?.itens?.length) return current;
        return {
          ...current,
          itens: current.itens.map((row: any) => (
            row.id === item.id
              ? { ...row, ...response.item }
              : row
          )),
        };
      });
      await load();
    } catch (error: any) {
      alert(error.message || 'Erro ao atualizar status da etiqueta DETRAN');
    } finally {
      setDetranUpdatingId(null);
    }
  }

  async function openAnexosModal(moto: any) {
    setAnexosMoto(moto);
    setAnexosModalOpen(true);
    setAnexosLoading(true);
    try {
      const data = await api.motos.anexos(moto.id);
      setAnexosData(data);
    } catch {
      setAnexosData({ anexos: {}, total: 0 });
    } finally {
      setAnexosLoading(false);
    }
  }

  function closeAnexosModal() {
    setAnexosModalOpen(false);
    setAnexosMoto(null);
    setAnexosData(null);
    setAnexosLoading(false);
    setAnexosSaving(false);
  }

  async function handleSaveAnexos(anexos: Record<string, { name: string; dataUrl: string } | null>) {
    if (!anexosMoto) return;
    setAnexosSaving(true);
    try {
      const response = await api.motos.updateAnexos(anexosMoto.id, anexos);
      setAnexosData(response);
      await load();
      closeAnexosModal();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar anexos da moto');
      setAnexosSaving(false);
    }
  }

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Motos</div>
          <div style={cs.sub}>Cadastro e gestao de motos</div>
        </div>
      </div>
      <div style={{ padding: 28 }}>
        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>
              Motos cadastradas <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', fontWeight: 400 }}>- {filtered.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={cs.input} placeholder="Buscar por ID, marca, modelo, placa, chassi ou renavam..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <button style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)' }} onClick={() => { setEditing(null); setModal(true); }}>+ Nova moto</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['ID', 'Marca', 'Modelo', 'Ano', 'Placa', 'Chassi', 'Renavam', 'Data compra', 'Itens', 'Anexos', 'Detran', ''].map((h) => (
                    <th key={h} style={cs.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Nenhuma moto encontrada</td>
                  </tr>
                ) : filtered.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cs.td}><span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>#{m.id}</span></td>
                    <td style={{ ...cs.td, color: 'var(--ink-muted)', fontSize: 12 }}>{m.marca}</td>
                    <td style={cs.td}><strong>{m.modelo}</strong></td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{m.ano || '--'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{m.placa || '--'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{m.chassi || '--'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{m.renavam || '--'}</td>
                    <td style={{ ...cs.td, fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>{fmtDate(m.dataCompra)}</td>
                    <td style={cs.td}>
                      <span style={{ background: 'var(--gray-100)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>
                        {m.qtdRelacionadas || 0} itens
                      </span>
                    </td>
                    <td style={cs.td}>
                      <button
                        onClick={() => openAnexosModal(m)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          border: `1px solid ${m.temAnexos ? '#93c5fd' : 'var(--border)'}`,
                          background: m.temAnexos ? '#eff6ff' : 'var(--white)',
                          color: m.temAnexos ? '#2563eb' : 'var(--ink-muted)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                        title={m.temAnexos ? `Gerenciar anexos (${m.anexosCount || 0})` : 'Anexar documentos da moto'}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M8 7.5V6a4 4 0 1 1 8 0v9a6 6 0 1 1-12 0V7a2 2 0 1 1 4 0v8a2 2 0 1 0 4 0V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {(m.anexosCount || 0) > 0 ? (
                          <span style={{ position: 'absolute', right: -4, top: -4, minWidth: 16, height: 16, borderRadius: 999, background: '#16a34a', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                            {m.anexosCount}
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td style={cs.td}>
                      <button
                        onClick={() => openDetranModal(m)}
                        disabled={!m.temDetran}
                        style={{
                          ...cs.btn,
                          padding: '5px 10px',
                          fontSize: 11,
                          borderColor: !m.temDetran ? 'var(--border)' : (m.detranAtivas || 0) > 0 ? '#86efac' : '#fca5a5',
                          background: !m.temDetran ? 'var(--gray-50)' : (m.detranAtivas || 0) > 0 ? '#ecfdf3' : '#fef2f2',
                          color: !m.temDetran ? 'var(--ink-muted)' : (m.detranAtivas || 0) > 0 ? 'var(--green)' : 'var(--red)',
                          cursor: m.temDetran ? 'pointer' : 'not-allowed',
                          opacity: m.temDetran ? 1 : 0.7,
                        }}
                        title={m.temDetran ? 'Ver etiquetas DETRAN' : 'Nenhuma etiqueta DETRAN'}
                      >
                        DT {m.detranAtivas || 0}/{m.detranCount || 0}
                      </button>
                    </td>
                    <td style={cs.td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditing(m); setModal(true); }} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'transparent', color: 'var(--ink-muted)', borderColor: 'transparent' }} title="Editar">EDIT</button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Excluir ${m.marca} ${m.modelo}?`)) return;
                            await api.motos.delete(m.id);
                            load();
                          }}
                          style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'transparent', color: 'var(--red-light)', borderColor: 'transparent' }}
                          title="Excluir"
                        >
                          DEL
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Modal open={modal} title={editing ? 'Editar moto' : 'Nova moto'} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} moto={editing} />
      <AnexosMotoModal open={anexosModalOpen} moto={anexosMoto} loading={anexosLoading} data={anexosData} saving={anexosSaving} onSave={handleSaveAnexos} onClose={closeAnexosModal} />
      <DetranModal open={detranModalOpen} moto={detranMoto} loading={detranLoading} data={detranData} updatingId={detranUpdatingId} onToggleStatus={handleDetranStatusToggle} onClose={closeDetranModal} />
    </>
  );
}
