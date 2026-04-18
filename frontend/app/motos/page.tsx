'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/api-base';
const API = API_BASE;

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

function dataUrlToFile(dataUrl: string, fileName: string) {
  const [meta = '', content = ''] = dataUrl.split(',');
  const mimeMatch = meta.match(/^data:([^;]+)(;base64)?$/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';

  if (meta.includes(';base64')) {
    const binary = atob(content || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], fileName, { type: mimeType });
  }

  return new File([decodeURIComponent(content || '')], fileName, { type: mimeType });
}

async function downloadDataUrl(dataUrl: string, fileName: string) {
  const file = dataUrlToFile(dataUrl, fileName);
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || isAppleMobile;

  // Em mobile, tenta Web Share API primeiro
  if (isMobile) {
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { title?: string; files?: File[] }) => Promise<void>;
    };
    if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
      try {
        if (nav.canShare({ files: [file] })) {
          await nav.share({ title: fileName, files: [file] });
          return;
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
      }
    }
    // fallback mobile: abre em nova aba
    const objectUrl = URL.createObjectURL(file);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return;
  }

  // Desktop: sempre usa link direto
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

const MOTO_ANEXO_FIELDS = [
  { key: 'nfeLeilao', label: 'NF-e Leilao' },
  { key: 'atpve', label: 'ATPV-e' },
  { key: 'baixaDetran', label: 'Baixa Detran' },
  { key: 'nfeEntrada', label: 'NF-e Entrada' },
  { key: 'certBaixa', label: 'Certificado de Baixa' },
  { key: 'recibo', label: 'Recibo' },
  { key: 'editalLeilao', label: 'Edital do Leilao' },
  { key: 'laudoDescaracterizacao', label: 'Laudo de Descaracterizacao' },
  { key: 'fotoDianteira', label: 'Foto Dianteira' },
  { key: 'fotoTraseira', label: 'Foto Traseira' },
  { key: 'fotoLateralDireita', label: 'Foto Lateral Dir.' },
  { key: 'fotoLateralEsquerda', label: 'Foto Lateral Esq.' },
  { key: 'fotoPainel', label: 'Foto Painel' },
  { key: 'fotoChassi', label: 'Foto Chassi' },
  { key: 'fotoNumeroMotor', label: 'Num. do Motor' },
] as const;

const MAX_MOTO_ANEXO_FILE_SIZE_BYTES = 18 * 1024 * 1024;

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

type MotosViewportMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

function Modal({ open, title, onClose, onSave, moto, viewportMode = 'desktop' }: any) {
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

  const modalIsPhone = viewportMode === 'phone';
  const modalIsTabletLandscape = viewportMode === 'tablet-landscape';
  const modalColumns = modalIsPhone ? '1fr' : '1fr 1fr';
  const modalShellPadding = modalIsPhone ? 0 : modalIsTabletLandscape ? 16 : 24;
  const modalHeaderPadding = modalIsPhone ? '16px 14px 14px' : '22px 24px 16px';
  const modalBodyPadding = modalIsPhone ? '16px 14px 18px' : modalIsTabletLandscape ? '20px 22px' : '22px 24px';
  const modalFooterPadding = modalIsPhone ? '14px' : '16px 24px 22px';

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: modalIsPhone ? 'stretch' : 'center', justifyContent: 'center', padding: modalShellPadding, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: modalIsPhone ? 0 : 16, width: '100%', maxWidth: modalIsTabletLandscape ? 900 : 540, maxHeight: modalIsPhone ? '100dvh' : modalIsTabletLandscape ? 'calc(100dvh - 32px)' : '92vh', minHeight: modalIsPhone ? '100dvh' : undefined, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: modalHeaderPadding, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: modalIsPhone ? 17 : 18, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>X</button>
        </div>
        <div style={{ padding: modalBodyPadding }}>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Identificacao</div>
          <div style={{ display: 'grid', gridTemplateColumns: modalColumns, gap: 12 }}>
            {row('Marca *', 'marca', 'text', 'Ex: YAMAHA')}
            {row('Modelo *', 'modelo', 'text', 'Ex: CROSSER')}
            {row('Ano', 'ano', 'number', '2024')}
            {row('Cor', 'cor', 'text', 'Ex: Preto')}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '16px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Documentacao</div>
          <div style={{ display: 'grid', gridTemplateColumns: modalColumns, gap: 12 }}>
            {row('Placa', 'placa', 'text', 'ABC-1234')}
            {row('Chassi', 'chassi', 'text')}
          </div>
          {row('Renavam', 'renavam', 'text')}
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '16px 0 12px', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Compra</div>
          <div style={{ display: 'grid', gridTemplateColumns: modalColumns, gap: 12 }}>
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
        <div style={{ padding: modalFooterPadding, display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', flexDirection: modalIsPhone ? 'column-reverse' : 'row' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}>{saving ? 'Salvando...' : 'Salvar moto'}</button>
        </div>
      </div>
    </div>
  );
}

function DetranModal({ open, moto, loading, data, updatingId, onToggleStatus, onClose, viewportMode = 'desktop' }: any) {
  if (!open) return null;

  const total = Array.isArray(data?.itens) ? data.itens.length : 0;
  const ativas = Array.isArray(data?.itens) ? data.itens.filter((item: any) => item.detranStatus !== 'baixada').length : 0;
  const baixadas = total - ativas;
  const modalIsPhone = viewportMode === 'phone';
  const modalIsTabletPortrait = viewportMode === 'tablet-portrait';
  const modalIsTabletLandscape = viewportMode === 'tablet-landscape';
  const useCardList = modalIsPhone || modalIsTabletPortrait;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 220, display: 'flex', alignItems: modalIsPhone ? 'stretch' : 'center', justifyContent: 'center', padding: modalIsPhone ? 0 : modalIsTabletLandscape ? 16 : 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: modalIsPhone ? 0 : 16, width: '100%', maxWidth: modalIsTabletLandscape ? 980 : 820, maxHeight: modalIsPhone ? '100dvh' : '90vh', minHeight: modalIsPhone ? '100dvh' : undefined, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,.12)' }}>
        <div style={{ padding: modalIsPhone ? '16px 14px 14px' : '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: modalIsPhone ? 18 : 20, fontWeight: 600 }}>Etiquetas DETRAN</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
              {moto ? `ID ${moto.id} - ${moto.marca} ${moto.modelo}` : 'Moto selecionada'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', flexShrink: 0 }}>X</button>
        </div>
        <div style={{ padding: modalIsPhone ? 14 : 24, overflowY: 'auto', maxHeight: modalIsPhone ? 'calc(100dvh - 76px)' : 'calc(90vh - 78px)' }}>
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
          ) : useCardList ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {data.itens.map((item: any) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: modalIsPhone ? 14 : 16, background: 'var(--white)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--blue-600)' }}>{item.idPeca}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>{item.descricao}</div>
                    </div>
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
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: modalIsPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Etiqueta</div>
                      <div style={{ marginTop: 3, fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--ink)' }}>{item.detranEtiqueta}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Baixa</div>
                      <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--ink)' }}>{item.detranBaixadaAt ? fmtDateTime(item.detranBaixadaAt) : '--'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleStatus(item, item.detranBaixada ? 'ativa' : 'baixada')}
                    disabled={updatingId === item.id}
                    style={{
                      ...cs.btn,
                      width: '100%',
                      justifyContent: 'center',
                      marginTop: 12,
                      padding: '8px 12px',
                      fontSize: 12,
                      border: `1px solid ${item.detranBaixada ? '#86efac' : '#fca5a5'}`,
                      background: item.detranBaixada ? '#ecfdf3' : '#fef2f2',
                      color: item.detranBaixada ? 'var(--green)' : 'var(--red)',
                      opacity: updatingId === item.id ? 0.7 : 1,
                    }}
                  >
                    {updatingId === item.id ? 'Salvando...' : item.detranBaixada ? 'Reativar' : 'Confirmar baixa'}
                  </button>
                </div>
              ))}
            </div>
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

function AnexosMotoModal({ open, moto, loading, data, saving, onClose, onSave, viewportMode = 'desktop' }: any) {
  const [form, setForm] = useState<Record<string, { name: string; dataUrl: string } | null>>({});
  const [changedKeys, setChangedKeys] = useState<string[]>([]);
  const [removedKeys, setRemovedKeys] = useState<string[]>([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setChangedKeys([]);
    setRemovedKeys([]);
    setLocalError('');
    setForm(data?.anexos || {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (changedKeys.length || removedKeys.length) return;
    setForm(data?.anexos || {});
  }, [open, data, changedKeys.length, removedKeys.length]);

  async function handleFileChange(key: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MOTO_ANEXO_FILE_SIZE_BYTES) {
      setLocalError('Arquivo muito grande para envio pelo navegador. Use um arquivo de ate 18 MB.');
      event.target.value = '';
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setLocalError('');
    setForm((current) => ({ ...current, [key]: { name: file.name, dataUrl } }));
    setChangedKeys((current) => Array.from(new Set([...current, key])));
    setRemovedKeys((current) => current.filter((item) => item !== key));
    event.target.value = '';
  }

  function clearFile(key: string) {
    const hadExistingFile = Boolean(form?.[key]);
    setForm((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setChangedKeys((current) => current.filter((item) => item !== key));
    if (hadExistingFile) {
      setRemovedKeys((current) => Array.from(new Set([...current, key])));
    }
  }

  if (!open) return null;

  const total = Object.keys(form || {}).length;
  const modalIsPhone = viewportMode === 'phone';
  const modalIsTabletPortrait = viewportMode === 'tablet-portrait';
  const modalIsTabletLandscape = viewportMode === 'tablet-landscape';
  const useCardList = modalIsPhone || modalIsTabletPortrait;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 230, display: 'flex', alignItems: modalIsPhone ? 'stretch' : 'center', justifyContent: 'center', padding: modalIsPhone ? 0 : modalIsTabletLandscape ? 16 : 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: modalIsPhone ? 0 : 16, width: '100%', maxWidth: modalIsTabletLandscape ? 1100 : 980, maxHeight: modalIsPhone ? '100dvh' : '92vh', minHeight: modalIsPhone ? '100dvh' : undefined, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,.12)' }}>
        <div style={{ padding: modalIsPhone ? '16px 14px 14px' : '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: modalIsPhone ? 18 : 20, fontWeight: 600 }}>Anexos da moto</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
              {moto ? `ID ${moto.id} - ${moto.marca} ${moto.modelo}` : 'Moto selecionada'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', flexShrink: 0 }}>X</button>
        </div>
        <div style={{ padding: modalIsPhone ? 14 : 24, overflowY: 'auto', maxHeight: modalIsPhone ? 'calc(100dvh - 140px)' : 'calc(92vh - 140px)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ background: 'var(--gray-50)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              Arquivos anexados: {total}
            </span>
          </div>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Carregando anexos...</div>
          ) : useCardList ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {MOTO_ANEXO_FIELDS.map((field) => {
                const attachment = form?.[field.key] || null;
                return (
                  <div key={field.key} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: modalIsPhone ? 14 : 16, background: 'var(--white)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>{field.label}</div>
                    <div style={{ fontSize: 12, color: attachment ? 'var(--ink)' : 'var(--ink-muted)', marginBottom: 10 }}>
                      {attachment ? attachment.name : 'Nenhum arquivo'}
                    </div>
                    <input type="file" accept=".pdf,application/pdf,image/*,.heic,.heif" onChange={(event) => handleFileChange(field.key, event)} style={{ width: '100%', marginBottom: 10 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: modalIsPhone ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => attachment && downloadDataUrl(attachment.dataUrl, attachment.name)}
                        disabled={!attachment}
                        style={{ ...cs.btn, width: '100%', justifyContent: 'center', padding: '8px 10px', fontSize: 12, border: '1px solid var(--border)', background: 'var(--white)', color: attachment ? 'var(--blue-500)' : 'var(--ink-muted)', cursor: attachment ? 'pointer' : 'not-allowed', opacity: attachment ? 1 : 0.7 }}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => clearFile(field.key)}
                        disabled={!attachment}
                        style={{ ...cs.btn, width: '100%', justifyContent: 'center', padding: '8px 10px', fontSize: 12, border: '1px solid #fecaca', background: '#fef2f2', color: attachment ? 'var(--red)' : 'var(--ink-muted)', cursor: attachment ? 'pointer' : 'not-allowed', opacity: attachment ? 1 : 0.7 }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
                          <input type="file" accept=".pdf,application/pdf,image/*,.heic,.heif" onChange={(event) => handleFileChange(field.key, event)} />
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
        {localError ? (
          <div style={{ padding: modalIsPhone ? '0 14px 14px' : '0 24px 14px', fontSize: 12, color: 'var(--red)' }}>
            ! {localError}
          </div>
        ) : null}
        <div style={{ padding: modalIsPhone ? '14px' : '16px 24px 22px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', flexDirection: modalIsPhone ? 'column-reverse' : 'row' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}>Fechar</button>
          <button onClick={() => onSave(form, changedKeys, removedKeys)} disabled={saving || loading || Boolean(localError)} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', opacity: saving ? 0.8 : 1, width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}>
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
  const [viewportMode, setViewportMode] = useState<MotosViewportMode>('desktop');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [textoModeloModal, setTextoModeloModal] = useState<any>(null); // moto selecionada
  const [textoModelo, setTextoModelo] = useState('');
  const [etiquetaSkuLabel, setEtiquetaSkuLabel] = useState('');
  const [savingTexto, setSavingTexto] = useState(false);
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
    if (typeof window === 'undefined') return undefined;

    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');

    const syncViewportMode = () => {
      if (phoneMedia.matches) {
        setViewportMode('phone');
        return;
      }
      if (tabletPortraitMedia.matches) {
        setViewportMode('tablet-portrait');
        return;
      }
      if (tabletLandscapeMedia.matches) {
        setViewportMode('tablet-landscape');
        return;
      }
      setViewportMode('desktop');
    };

    syncViewportMode();
    phoneMedia.addEventListener('change', syncViewportMode);
    tabletPortraitMedia.addEventListener('change', syncViewportMode);
    tabletLandscapeMedia.addEventListener('change', syncViewportMode);

    return () => {
      phoneMedia.removeEventListener('change', syncViewportMode);
      tabletPortraitMedia.removeEventListener('change', syncViewportMode);
      tabletLandscapeMedia.removeEventListener('change', syncViewportMode);
    };
  }, []);

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

  async function handleDeleteMoto(moto: any) {
    if (!confirm(`Excluir ${moto.marca} ${moto.modelo}?`)) return;
    await api.motos.delete(moto.id);
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

  async function handleSaveAnexos(anexos: Record<string, { name: string; dataUrl: string } | null>, changed: string[] = [], removed: string[] = []) {
    if (!anexosMoto) return;
    setAnexosSaving(true);
    try {
      const anexosAlterados = Object.fromEntries(
        changed
          .filter((key) => anexos[key])
          .map((key) => [key, anexos[key]])
      );
      const response = await api.motos.updateAnexos(anexosMoto.id, anexosAlterados, removed);
      setAnexosData(response);
      await load();
      closeAnexosModal();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar anexos da moto');
      setAnexosSaving(false);
    }
  }

  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const useCardList = isPhone || isTabletPortrait;
  const pagePadding = isPhone ? 14 : isTabletPortrait || isTabletLandscape ? 18 : 28;
  const compactTable = isTabletLandscape;
  const controlStack = isPhone || isTabletPortrait;
  const tablePadding = compactTable ? '9px 8px' : '11px 14px';
  const tableHeaderPadding = compactTable ? '9px 8px' : '10px 14px';
  const desktopHeaders = ['ID', 'Marca', 'Modelo', 'Ano', 'Placa', 'Chassi', 'Renavam', 'Data compra', 'Itens', 'Anexos', 'Detran', ''];
  const tabletHeaders = ['ID', 'Marca', 'Modelo', 'Ano', 'Placa', 'Compra', 'Itens', 'Anexos', 'Detran', ''];
  const activeHeaders = compactTable ? tabletHeaders : desktopHeaders;

  function renderAnexosButton(m: any) {
    return (
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
          flexShrink: 0,
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
    );
  }

  function renderDetranButton(m: any, fullWidth = false) {
    return (
      <button
        onClick={() => openDetranModal(m)}
        disabled={!m.temDetran}
        style={{
          ...cs.btn,
          padding: fullWidth ? '8px 12px' : '5px 10px',
          fontSize: fullWidth ? 12 : 11,
          width: fullWidth ? '100%' : undefined,
          justifyContent: 'center',
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
    );
  }

  function renderActionButtons(m: any, stacked = false) {
    return (
      <div style={{ display: 'flex', gap: 8, flexDirection: stacked ? 'column' : 'row', width: stacked ? '100%' : undefined }}>
        <button
          onClick={() => { setEditing(m); setModal(true); }}
          style={{ ...cs.btn, padding: stacked ? '8px 12px' : '5px 10px', fontSize: stacked ? 12 : 12, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border)', width: stacked ? '100%' : undefined, justifyContent: 'center' }}
          title="Editar"
        >
          Editar
        </button>
        <button
          onClick={() => handleDeleteMoto(m)}
          style={{ ...cs.btn, padding: stacked ? '8px 12px' : '5px 10px', fontSize: 12, background: '#fff1f2', color: 'var(--red-light)', borderColor: '#fecdd3', width: stacked ? '100%' : undefined, justifyContent: 'center' }}
          title="Excluir"
        >
          Excluir
        </button>
        <button
          onClick={() => openTextoModeloModal(m)}
          style={{ ...cs.btn, padding: stacked ? '8px 12px' : '5px 10px', fontSize: 12, background: '#eff6ff', color: '#3b82f6', borderColor: '#bfdbfe', width: stacked ? '100%' : undefined, justifyContent: 'center' }}
          title="Texto modelo para cadastro de peças"
        >
          📝 Texto Modelo
        </button>
      </div>
    );
  }

  async function openTextoModeloModal(m: any) {
    setTextoModeloModal(m);
    try {
      const resp = await fetch(`${API}/cadastro/motos/${m.id}/descricao-modelo`, { credentials: 'include' });
      const data = await resp.json();
      setTextoModelo(data.descricaoModelo || '');
      setEtiquetaSkuLabel(data.etiquetaSkuLabel || '');
    } catch { setTextoModelo(''); setEtiquetaSkuLabel(''); }
  }

  async function salvarTextoModelo() {
    if (!textoModeloModal) return;
    setSavingTexto(true);
    try {
      await fetch(`${API}/cadastro/motos/${textoModeloModal.id}/descricao-modelo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ descricaoModelo: textoModelo, etiquetaSkuLabel }),
      });
      alert('Texto modelo salvo!');
      setTextoModeloModal(null);
    } catch { alert('Erro ao salvar'); }
    setSavingTexto(false);
  }

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Motos</div>
          <div style={cs.sub}>Cadastro e gestao de motos</div>
        </div>
      </div>
      <div style={{ padding: pagePadding }}>
        <div style={cs.card}>
          <div style={{ display: 'flex', alignItems: controlStack ? 'stretch' : 'center', flexDirection: controlStack ? 'column' : 'row', justifyContent: 'space-between', padding: isPhone ? '14px' : '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600 }}>
              Motos cadastradas <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist, sans-serif', fontWeight: 400 }}>- {filtered.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, width: controlStack ? '100%' : undefined, flexDirection: controlStack ? 'column' : 'row' }}>
              <input style={{ ...cs.input, width: controlStack ? '100%' : compactTable ? 320 : 420 }} placeholder="Buscar por ID, marca, modelo, placa, chassi ou renavam..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <button style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', width: controlStack ? '100%' : undefined, justifyContent: 'center' }} onClick={() => { setEditing(null); setModal(true); }}>+ Nova moto</button>
            </div>
          </div>
          {useCardList ? (
            <div style={{ padding: isPhone ? 12 : 14, display: 'grid', gap: 12 }}>
              {loading ? (
                <div style={{ ...cs.card, padding: 18, textAlign: 'center', color: 'var(--ink-muted)' }}>Carregando...</div>
              ) : filtered.length === 0 ? (
                <div style={{ ...cs.card, padding: 18, textAlign: 'center', color: 'var(--ink-muted)' }}>Nenhuma moto encontrada</div>
              ) : filtered.map((m) => (
                <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: isPhone ? 14 : 16, background: 'var(--white)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12.5, color: 'var(--ink-muted)' }}>#{m.id}</span>
                        <span style={{ background: 'var(--gray-100)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>
                          {m.qtdRelacionadas || 0} itens
                        </span>
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: isPhone ? 18 : 19, fontWeight: 600, marginTop: 6 }}>{m.marca} {m.modelo}</div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--ink-muted)' }}>
                        {m.placa || 'Sem placa'} {m.ano ? `· ${m.ano}` : ''}
                      </div>
                    </div>
                    {renderAnexosButton(m)}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                    {[
                      { label: 'Placa', value: m.placa || '--' },
                      { label: 'Chassi', value: m.chassi || '--' },
                      { label: 'Renavam', value: m.renavam || '--' },
                      { label: 'Compra', value: fmtDate(m.dataCompra) },
                      { label: 'Anexos', value: `${m.anexosCount || 0} arquivo(s)` },
                      { label: 'Ano', value: m.ano || '--' },
                    ].map((item) => (
                      <div key={item.label}>
                        <div style={{ fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', textTransform: 'uppercase' }}>{item.label}</div>
                        <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--ink)', wordBreak: 'break-word' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 8 }}>
                    {renderDetranButton(m, true)}
                    {renderActionButtons(m, true)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compactTable ? 12 : 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {activeHeaders.map((h) => (
                      <th key={h} style={{ ...cs.th, padding: tableHeaderPadding, cursor: 'default' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={activeHeaders.length} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={activeHeaders.length} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Nenhuma moto encontrada</td>
                    </tr>
                  ) : filtered.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...cs.td, padding: tablePadding }}><span style={{ fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12, color: 'var(--ink-muted)' }}>#{m.id}</span></td>
                      <td style={{ ...cs.td, padding: tablePadding, color: 'var(--ink-muted)', fontSize: compactTable ? 11.5 : 12 }}>{m.marca}</td>
                      <td style={{ ...cs.td, padding: tablePadding }}><strong>{m.modelo}</strong></td>
                      <td style={{ ...cs.td, padding: tablePadding, fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12 }}>{m.ano || '--'}</td>
                      <td style={{ ...cs.td, padding: tablePadding, fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12.5 }}>{m.placa || '--'}</td>
                      {compactTable ? (
                        <>
                          <td style={{ ...cs.td, padding: tablePadding, fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12.5 }}>{fmtDate(m.dataCompra)}</td>
                          <td style={{ ...cs.td, padding: tablePadding }}>
                            <span style={{ background: 'var(--gray-100)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>
                              {m.qtdRelacionadas || 0}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...cs.td, padding: tablePadding, fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12.5 }}>{m.chassi || '--'}</td>
                          <td style={{ ...cs.td, padding: tablePadding, fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12.5 }}>{m.renavam || '--'}</td>
                          <td style={{ ...cs.td, padding: tablePadding, fontFamily: 'Geist Mono, monospace', fontSize: compactTable ? 11.5 : 12.5 }}>{fmtDate(m.dataCompra)}</td>
                          <td style={{ ...cs.td, padding: tablePadding }}>
                            <span style={{ background: 'var(--gray-100)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>
                              {m.qtdRelacionadas || 0} itens
                            </span>
                          </td>
                        </>
                      )}
                      <td style={{ ...cs.td, padding: tablePadding }}>{renderAnexosButton(m)}</td>
                      <td style={{ ...cs.td, padding: tablePadding }}>{renderDetranButton(m)}</td>
                      <td style={{ ...cs.td, padding: tablePadding }}>{renderActionButtons(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Modal open={modal} title={editing ? 'Editar moto' : 'Nova moto'} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} moto={editing} viewportMode={viewportMode} />
      <AnexosMotoModal open={anexosModalOpen} moto={anexosMoto} loading={anexosLoading} data={anexosData} saving={anexosSaving} onSave={handleSaveAnexos} onClose={closeAnexosModal} viewportMode={viewportMode} />
      <DetranModal open={detranModalOpen} moto={detranMoto} loading={detranLoading} data={detranData} updatingId={detranUpdatingId} onToggleStatus={handleDetranStatusToggle} onClose={closeDetranModal} viewportMode={viewportMode} />

      {/* Modal Texto Modelo */}
      {textoModeloModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : isTabletLandscape ? 16 : 24, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isTabletLandscape ? 820 : 660, maxHeight: isPhone ? '100dvh' : '92vh', minHeight: isPhone ? '100dvh' : undefined, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: isPhone ? '16px 14px 12px' : '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: isPhone ? 17 : 16, fontWeight: 600, color: 'var(--gray-800)' }}>📝 Texto Modelo</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{textoModeloModal.marca} {textoModeloModal.modelo} {textoModeloModal.ano}</div>
              </div>
              <button onClick={() => setTextoModeloModal(null)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
            </div>

            {/* Subtítulo */}
            {!isPhone && (
              <div style={{ padding: '10px 24px 0', fontSize: 12, color: 'var(--gray-500)' }}>
                Este texto será usado como base na descrição das peças desta moto. O usuário poderá editar por peça no momento do cadastro.
              </div>
            )}

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              {/* Campo abreviação SKU */}
              <div style={{ padding: isPhone ? '12px 14px 0' : '14px 24px 0', flexShrink: 0 }}>
                <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: isPhone ? '12px' : '14px 16px' }}>
                  <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 10 }}>
                    Abreviação para Etiqueta SKU
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 1fr', gap: isPhone ? 8 : 10, marginBottom: 10 }}>
                    {isPhone ? (
                      /* No phone: marca e modelo lado a lado, label abaixo */
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Marca</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                              {textoModeloModal.marca}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Modelo</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {textoModeloModal.modelo}
                            </div>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Label na Etiqueta SKU</div>
                          <input
                            style={{ width: '100%', fontSize: 13, fontWeight: 600, background: 'var(--white)', border: '1px solid var(--blue-500)', borderRadius: 6, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' as const, textTransform: 'uppercase' as const }}
                            value={etiquetaSkuLabel}
                            onChange={(e) => setEtiquetaSkuLabel(e.target.value.toUpperCase())}
                            placeholder="Ex: HD ULTRA"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Marca</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                            {textoModeloModal.marca}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Modelo</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                            {textoModeloModal.modelo}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Label na Etiqueta SKU</div>
                          <input
                            style={{ width: '100%', fontSize: 13, fontWeight: 600, background: 'var(--white)', border: '1px solid var(--blue-500)', borderRadius: 6, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' as const, textTransform: 'uppercase' as const }}
                            value={etiquetaSkuLabel}
                            onChange={(e) => setEtiquetaSkuLabel(e.target.value.toUpperCase())}
                            placeholder="Ex: HD ULTRA"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    Aparece no campo <strong>Moto:</strong> da etiqueta SKU. Se vazio, usa marca + modelo padrão.
                  </div>
                </div>
              </div>

              {/* Editor WYSIWYG */}
              <div style={{ padding: isPhone ? '12px 14px' : '14px 24px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: '#f8fafc', border: '1px solid var(--border)', borderBottom: 'none', borderRadius: '8px 8px 0 0', flexShrink: 0 }}>
                  {[
                    { label: 'B', cmd: 'bold', style: { fontWeight: 700 } },
                    { label: 'I', cmd: 'italic', style: { fontStyle: 'italic' } },
                    { label: 'U', cmd: 'underline', style: { textDecoration: 'underline' } },
                  ].map(({ label, cmd, style }) => (
                    <button key={cmd} type="button"
                      style={{ ...style, border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 4, padding: '4px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'serif' }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        document.execCommand(cmd, false);
                        const el = document.getElementById('textoModelo-wysiwyg');
                        if (el) setTextoModelo(el.innerHTML);
                      }}
                    >{label}</button>
                  ))}
                  {!isPhone && <span style={{ fontSize: 11, color: 'var(--gray-400)', alignSelf: 'center', marginLeft: 4 }}>Selecione o texto e clique para formatar</span>}
                </div>
                <div
                  id="textoModelo-wysiwyg"
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    flex: 1,
                    minHeight: isPhone ? 200 : 180,
                    border: '1px solid var(--border)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '10px 12px',
                    fontSize: 13,
                    fontFamily: 'Inter, sans-serif',
                    outline: 'none',
                    overflowY: 'auto',
                    color: 'var(--gray-800)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                  dangerouslySetInnerHTML={{ __html: textoModelo }}
                  onInput={(e) => setTextoModelo((e.target as HTMLDivElement).innerHTML)}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: isPhone ? '14px' : '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', flexDirection: isPhone ? 'column-reverse' : 'row', flexShrink: 0 }}>
              <button onClick={() => setTextoModeloModal(null)} style={{ ...cs.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>Cancelar</button>
              <button onClick={salvarTextoModelo} disabled={savingTexto} style={{ ...cs.btn, background: 'var(--ink)', color: '#fff', opacity: savingTexto ? 0.7 : 1, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}>
                {savingTexto ? 'Salvando...' : 'Salvar texto modelo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
