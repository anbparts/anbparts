'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/api-base';

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

function formatCompactDate(value: string | null | undefined) {
  if (!value) return '-';
  const [datePart] = String(value).split('T');
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return datePart || '-';
  return `${day}/${month}/${year.slice(-2)}`;
}

function normalizeFilterText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function displayCaixaLabel(value: unknown) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || 'Sem Localizacao';
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function hasDetranEtiqueta(value: any) {
  return Boolean(String(value || '').trim());
}

function hasMercadoLivreLink(value: any) {
  return Boolean(String(value || '').trim());
}

function isPrejuizoPeca(peca: any) {
  return Boolean(peca?.emPrejuizo);
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

function moneyInputValue(value: number) {
  return String(roundMoney(value));
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

type EstoqueViewportMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';
type EstoqueTableHeader = {
  label: string;
  sort: string | null;
  width: number | string;
  kind?: 'select';
};
type CaixaFilterOption = {
  caixa: string;
  totalPecas: number;
};

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
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (open) {
      setMotivo(PREJUIZO_OPTIONS[0]);
      setObservacao('');
      if (peca) peca.__prejuizoObservacao = '';
    }
  }, [open, peca]);

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
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', display: 'block', marginTop: 14 }}>Observacao</label>
          <textarea
            style={{ ...cs.fi, minHeight: 92, resize: 'vertical' as const }}
            value={observacao}
            onChange={(e) => {
              setObservacao(e.target.value);
              if (peca) peca.__prejuizoObservacao = e.target.value;
            }}
            placeholder="Detalhe o motivo do prejuizo, se necessario"
          />
        </div>
        <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
          <button onClick={() => onConfirm(motivo)} disabled={saving} style={{ ...cs.btn, background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }}>{saving ? 'Salvando...' : 'Confirmar prejuízo'}</button>
        </div>
      </div>
    </div>
  );
}

function ActionIconButton({ onClick, disabled = false, title = 'Acoes da peca' }: { onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--white)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--ink-muted)' : 'var(--ink-soft)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
      </svg>
    </button>
  );
}

function StatusLinkButton({ disponivel, link }: { disponivel: boolean; link: string | null | undefined }) {
  const enabled = hasMercadoLivreLink(link);

  const sharedStyle: any = {
    padding: '2px 8px',
    borderRadius: 99,
    fontSize: 11,
    fontFamily: 'Geist Mono, monospace',
    border: '1px solid',
    background: disponivel ? 'var(--sage-light)' : 'var(--gray-100)',
    color: disponivel ? 'var(--sage)' : 'var(--ink-muted)',
    borderColor: disponivel ? 'var(--sage-mid)' : 'var(--border)',
  };

  if (!enabled) {
    return (
      <span
        title="Link do anuncio Mercado Livre ainda nao sincronizado"
        style={sharedStyle}
      >
        {disponivel ? 'Estoque' : 'Vendido'}
      </span>
    );
  }

  return (
    <button
      onClick={() => window.open(String(link), '_blank', 'noopener,noreferrer')}
      title="Abrir anuncio no Mercado Livre"
      style={{
        ...sharedStyle,
        cursor: 'pointer',
      }}
    >
      {disponivel ? 'Estoque' : 'Vendido'}
    </button>
  );
}

function PrejuizoBadge() {
  return (
    <span
      title="Peca em prejuizo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 11,
        fontFamily: 'Geist Mono, monospace',
        border: '1px solid #fca5a5',
        background: '#fef2f2',
        color: '#b91c1c',
      }}
    >
      Prejuizo
    </span>
  );
}

function DetranBadge({ ativo }: { ativo: boolean }) {
  if (ativo) {
    return (
      <span
        title="Com etiqueta DETRAN"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 999,
          background: '#ecfdf3',
          border: '1px solid #86efac',
          color: '#16a34a',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 3h9l3 3v11l-6-3-6 3V3Z" />
        </svg>
      </span>
    );
  }

  return (
    <span
      title="Sem etiqueta DETRAN"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 999,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#dc2626',
        fontFamily: 'Geist Mono, monospace',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      X
    </span>
  );
}

function CaixaMultiSelectFilter({
  open,
  loading,
  options,
  selected,
  search,
  isPhone,
  isTabletPortrait,
  isTabletLandscape,
  onToggleOpen,
  onSearchChange,
  onToggleCaixa,
  onClear,
  onSelectVisible,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  options: CaixaFilterOption[];
  selected: string[];
  search: string;
  isPhone: boolean;
  isTabletPortrait: boolean;
  isTabletLandscape: boolean;
  onToggleOpen: () => void;
  onSearchChange: (value: string) => void;
  onToggleCaixa: (caixa: string) => void;
  onClear: () => void;
  onSelectVisible: (caixas: string[]) => void;
  onClose: () => void;
}) {
  const searchNormalized = normalizeFilterText(search);
  const visibleOptions = options.filter((option) => (
    !searchNormalized || normalizeFilterText(option.caixa).includes(searchNormalized)
  ));
  const buttonLabel = selected.length === 0
    ? 'Todas caixas'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} caixas`;
  const optionColumns = isPhone ? '1fr' : isTabletLandscape ? 'repeat(2, minmax(0, 1fr))' : '1fr';

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        onClick={onToggleOpen}
        style={{
          ...cs.sel,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 11px',
          background: open ? '#f8fafc' : 'var(--gray-50)',
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{buttonLabel}</span>
        <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: selected.length ? 'var(--blue-500)' : 'var(--ink-muted)', flexShrink: 0 }}>
          {selected.length ? `${selected.length} sel.` : 'Caixa'}
        </span>
      </button>

      {open ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)', padding: isPhone ? 12 : 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>Filtrar por caixa</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 4 }}>
                {selected.length ? `${selected.length} caixa(s) selecionada(s)` : 'Selecione uma ou varias caixas'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: isPhone || isTabletPortrait ? '100%' : undefined }}>
              <button
                type="button"
                onClick={() => onSelectVisible(visibleOptions.map((option) => option.caixa))}
                disabled={loading || visibleOptions.length === 0}
                style={{
                  ...cs.btn,
                  padding: '6px 12px',
                  fontSize: 12,
                  background: 'var(--white)',
                  color: 'var(--ink-soft)',
                  borderColor: 'var(--border)',
                  justifyContent: 'center',
                  width: isPhone ? '100%' : undefined,
                }}
              >
                Selecionar visiveis
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={!selected.length}
                style={{
                  ...cs.btn,
                  padding: '6px 12px',
                  fontSize: 12,
                  background: 'var(--white)',
                  color: selected.length ? 'var(--ink-soft)' : 'var(--ink-muted)',
                  borderColor: 'var(--border)',
                  justifyContent: 'center',
                  width: isPhone ? '100%' : undefined,
                  opacity: selected.length ? 1 : 0.65,
                }}
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  ...cs.btn,
                  padding: '6px 12px',
                  fontSize: 12,
                  background: 'var(--blue-500)',
                  color: '#fff',
                  borderColor: 'var(--blue-500)',
                  justifyContent: 'center',
                  width: isPhone ? '100%' : undefined,
                }}
              >
                OK
              </button>
            </div>
          </div>

          <input
            style={{ ...cs.fi, marginTop: 0 }}
            placeholder="Buscar caixa..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />

          <div style={{ maxHeight: isPhone ? 220 : isTabletPortrait ? 260 : 280, overflow: 'auto', display: 'grid', gridTemplateColumns: optionColumns, gap: 8 }}>
            {loading ? (
              <div style={{ padding: 14, color: 'var(--ink-muted)', fontSize: 12.5 }}>Carregando caixas...</div>
            ) : visibleOptions.length === 0 ? (
              <div style={{ padding: 14, color: 'var(--ink-muted)', fontSize: 12.5 }}>Nenhuma caixa encontrada.</div>
            ) : (
              visibleOptions.map((option) => {
                const checked = selected.includes(option.caixa);

                return (
                  <label
                    key={option.caixa}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: 12,
                      borderRadius: 10,
                      border: checked ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                      background: checked ? '#eff6ff' : 'var(--white)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCaixa(option.caixa)}
                      style={{ width: 14, height: 14, marginTop: 2, cursor: 'pointer' }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{option.caixa}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                        {option.totalPecas} peca(s) em estoque
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetranEtiquetaModal({ open, peca, onClose }: any) {
  if (!open || !peca) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 235, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 380, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Etiqueta DETRAN</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{peca.idPeca} - {peca.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>
            Numero da etiqueta
          </div>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--blue-500)' }}>
            {peca.detranEtiqueta}
          </div>
        </div>
        <div style={{ padding: '0 22px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function PecaDetalheModal({ open, peca, onClose, onSaved }: any) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (peca) setForm({
      largura: peca.largura != null ? String(peca.largura) : '',
      altura: peca.altura != null ? String(peca.altura) : '',
      profundidade: peca.profundidade != null ? String(peca.profundidade) : '',
      pesoLiquido: peca.pesoLiquido != null ? String(peca.pesoLiquido) : '',
      localizacao: peca.localizacao || '',
      detranEtiqueta: peca.detranEtiqueta || '',
    });
    setEditando(false);
  }, [peca]);

  if (!open || !peca) return null;

  async function salvarDimensoes() {
    setSaving(true);
    try {
      const API = API_BASE;
      // Atualiza no ANB
      await fetch(`${API}/pecas/${peca.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          largura: form.largura ? Number(form.largura) : null,
          altura: form.altura ? Number(form.altura) : null,
          profundidade: form.profundidade ? Number(form.profundidade) : null,
          pesoLiquido: form.pesoLiquido ? Number(form.pesoLiquido) : null,
          pesoBruto: form.pesoLiquido ? Number(form.pesoLiquido) : null,
          localizacao: form.localizacao || null,
          detranEtiqueta: form.detranEtiqueta || null,
        }),
      });
      // Atualiza no Bling via pré-cadastro (busca pelo SKU base)
      const baseSku = peca.idPeca.replace(/-\d+$/, '');
      const cadastroResp = await fetch(`${API}/cadastro?search=${encodeURIComponent(baseSku)}&per=1`, { credentials: 'include' });
      const cadastroData = await cadastroResp.json();
      const cadastro = cadastroData?.data?.[0];
      if (cadastro?.blingProdutoId) {
        await fetch(`${API}/cadastro/${cadastro.id}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            largura: form.largura ? Number(form.largura) : null,
            altura: form.altura ? Number(form.altura) : null,
            profundidade: form.profundidade ? Number(form.profundidade) : null,
            peso: form.pesoLiquido ? Number(form.pesoLiquido) : null,
            localizacao: form.localizacao || null,
            detranEtiqueta: form.detranEtiqueta || null,
          }),
        });
      }
      setEditando(false);
      onSaved?.();
      onClose();
    } catch (e: any) { alert('Erro ao salvar: ' + e.message); }
    setSaving(false);
  }

  function Field({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
    const display = value != null && value !== '' ? String(value) : '—';
    return (
      <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: display === '—' ? 'var(--gray-300)' : 'var(--gray-800)', fontFamily: mono ? 'Geist Mono, monospace' : 'inherit' }}>{display}</div>
      </div>
    );
  }

  const inp: any = { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 235, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Detalhes da Peça</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{peca.idPeca} — {peca.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>

        {!editando ? (
          <>
            <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Peso Líquido (kg)" value={peca.pesoLiquido != null ? Number(peca.pesoLiquido) : null} />
              <Field label="Peso Bruto (kg)"   value={peca.pesoBruto   != null ? Number(peca.pesoBruto)   : null} />
              <Field label="Largura (cm)"      value={peca.largura      != null ? Number(peca.largura)      : null} />
              <Field label="Altura (cm)"       value={peca.altura       != null ? Number(peca.altura)       : null} />
              <Field label="Profundidade (cm)" value={peca.profundidade != null ? Number(peca.profundidade) : null} />
              <Field label="Localização"       value={peca.localizacao} />
              <div style={{ gridColumn: '1 / -1' }}><Field label="Número de Peça" value={peca.numeroPeca} mono /></div>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Etiqueta Detran" value={peca.detranEtiqueta} mono /></div>
            </div>
            <div style={{ padding: '0 22px 20px', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setEditando(true)} style={{ ...cs.btn, background: 'var(--gray-800)', color: '#fff' }}>✏️ Editar</button>
              <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { key: 'pesoLiquido', label: 'Peso (kg)' },
                { key: 'largura', label: 'Largura (cm)' },
                { key: 'altura', label: 'Altura (cm)' },
                { key: 'profundidade', label: 'Profundidade (cm)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>{label}</div>
                  <input style={inp} type="number" step="0.01" min="0" value={form[key]} onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Localização</div>
                <input style={inp} value={form.localizacao} onChange={(e) => setForm((p: any) => ({ ...p, localizacao: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 4 }}>Etiqueta Detran</div>
                <input style={inp} value={form.detranEtiqueta} onChange={(e) => setForm((p: any) => ({ ...p, detranEtiqueta: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 10px' }}>
                💡 Ao salvar, os dados serão atualizados no ANB e enviados ao Bling automaticamente.
              </div>
            </div>
            <div style={{ padding: '0 22px 20px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button onClick={() => setEditando(false)} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar</button>
              <button onClick={salvarDimensoes} disabled={saving} style={{ ...cs.btn, background: 'var(--gray-800)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Salvando...' : '💾 Salvar e Sincronizar Bling'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PecaActionsModal({ open, peca, onClose, onEdit, onSell, onDelete }: any) {
  if (!open || !peca) return null;
  const bloqueadaPrejuizo = isPrejuizoPeca(peca);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 360, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Acoes da peca</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{peca.idPeca} - {peca.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'grid', gap: 10 }}>
          {bloqueadaPrejuizo ? (
            <div style={{ padding: 14, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, lineHeight: 1.6 }}>
              Essa peca esta marcada como <strong>Prejuizo</strong> e fica bloqueada para edicao e venda pela tela de estoque.
            </div>
          ) : (
            <>
              <button onClick={onEdit} style={{ ...cs.btn, width: '100%', justifyContent: 'center', background: 'var(--white)', color: 'var(--ink)', borderColor: 'var(--border-strong)' }}>
                Editar
              </button>
              {peca.disponivel ? (
                <button onClick={onSell} style={{ ...cs.btn, width: '100%', justifyContent: 'center', background: 'var(--amber-light)', color: 'var(--amber)', borderColor: 'var(--amber-mid)' }}>
                  Vender
                </button>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', textAlign: 'center' }}>
                  Esta peca ja esta vendida.
                </div>
              )}
              <button onClick={onDelete} style={{ ...cs.btn, width: '100%', justifyContent: 'center', background: '#fff1f2', color: 'var(--red)', borderColor: '#fecdd3' }}>
                Deletar
              </button>
            </>
          )}
        </div>
        <div style={{ padding: '0 22px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'transparent', color: 'var(--ink-soft)', borderColor: 'transparent' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function PecaModal({ open, onClose, onSave, onCancelSale, onMarkPrejuizo, peca, motos, viewportMode = 'desktop' }: any) {
  const empty = {
    idPeca: '',
    motoId: '',
    descricao: '',
    localizacao: '',
    detranEtiqueta: '',
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
  const [suggestion, setSuggestion] = useState<any>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [, setIdPecaTouched] = useState(false);
  const [, setFreteTouched] = useState(false);
  const [taxasTouched, setTaxasTouched] = useState(false);
  const preview = calculatePecaPreview(form.precoML, form.valorFrete, form.valorTaxas);

  useEffect(() => {
    if (peca) {
      setForm({
        idPeca: peca.idPeca || '',
        motoId: String(peca.motoId),
        descricao: peca.descricao || '',
        localizacao: String(peca.localizacao || ''),
        detranEtiqueta: String(peca.detranEtiqueta || ''),
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
    setSuggestion(null);
    setLoadingSuggestion(false);
    setIdPecaTouched(false);
    setFreteTouched(false);
    setTaxasTouched(false);
  }, [peca, open]);

  useEffect(() => {
    if (!open || peca || !form.motoId) return;

    let cancelled = false;
    setLoadingSuggestion(true);

    api.pecas.sugerirId(Number(form.motoId))
      .then((info) => {
        if (cancelled) return;

        setSuggestion(info);
        setForm((prev: any) => {
          const next = { ...prev };

          if (!String(prev.idPeca || '').trim()) {
            next.idPeca = info?.sugestao || prev.idPeca;
          }

          if (!String(prev.valorFrete || '').trim()) {
            next.valorFrete = moneyInputValue(Number(info?.fretePadrao || 0));
          }

          if (!String(prev.valorTaxas || '').trim()) {
            const precoAtual = Number(prev.precoML) || 0;
            next.valorTaxas = moneyInputValue(precoAtual * (Number(info?.taxaPadraoPct || 0) / 100));
          }

          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setSuggestion(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestion(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, peca, form.motoId]);

  if (!open) return null;

  async function save() {
    if (!form.descricao || !form.motoId || !String(form.idPeca || '').trim()) {
      setErr('Moto, ID da peca e descricao sao obrigatorios');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        idPeca: String(form.idPeca || '').trim(),
        motoId: Number(form.motoId),
        descricao: form.descricao,
        precoML: preview.precoML,
        valorLiq: preview.valorLiq,
        valorFrete: preview.valorFrete,
        valorTaxas: preview.valorTaxas,
        blingPedidoNum: form.blingPedidoNum.trim() || null,
        localizacao: form.localizacao || null,
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

  function handleMotoChange(value: string) {
    if (peca) {
      setForm({ ...form, motoId: value });
      return;
    }

    setIdPecaTouched(false);
    setFreteTouched(false);
    setTaxasTouched(false);
    setForm((prev: any) => ({
      ...prev,
      motoId: value,
      idPeca: '',
      valorFrete: '',
      valorTaxas: '',
    }));
  }

  function handleIdPecaChange(value: string) {
    setIdPecaTouched(true);
    setForm({ ...form, idPeca: value.toUpperCase() });
  }

  function handlePrecoMlChange(value: string) {
    setForm((prev: any) => {
      const next = { ...prev, precoML: value };
      if (!peca && !taxasTouched && suggestion?.taxaPadraoPct !== undefined) {
        next.valorTaxas = moneyInputValue((Number(value) || 0) * (Number(suggestion?.taxaPadraoPct || 0) / 100));
      }
      return next;
    });
  }

  function handleFreteChange(value: string) {
    setFreteTouched(true);
    setForm({ ...form, valorFrete: value });
  }

  function handleTaxasChange(value: string) {
    setTaxasTouched(true);
    setForm({ ...form, valorTaxas: value });
  }

  const modalIsPhone = viewportMode === 'phone';
  const modalIsTabletLandscape = viewportMode === 'tablet-landscape';
  const dualFieldColumns = modalIsPhone ? '1fr' : '1fr 1fr';
  const modalContentPadding = modalIsPhone ? '16px 14px 18px' : '22px 24px';
  const modalHeaderPadding = modalIsPhone ? '16px 14px 14px' : '22px 24px 16px';
  const modalFooterPadding = modalIsPhone ? '14px' : '16px 24px 22px';
  const modalShellPadding = modalIsPhone ? 0 : modalIsTabletLandscape ? 16 : 24;
  const modalTopColumns = modalIsPhone ? '1fr' : modalIsTabletLandscape ? 'minmax(0, 1.6fr) minmax(220px, 0.8fr)' : '1fr';
  const modalMainColumns = modalIsTabletLandscape ? 'minmax(0, 1.2fr) minmax(0, 0.95fr)' : '1fr';
  const modalActionColumns = modalIsPhone ? '1fr' : modalIsTabletLandscape ? 'minmax(0, 1fr) 170px 170px' : dualFieldColumns;
  const modalFinancialColumns = modalIsPhone ? '1fr' : '1fr 1fr';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 200, display: 'flex', alignItems: modalIsPhone ? 'stretch' : 'center', justifyContent: 'center', padding: modalShellPadding, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: modalIsPhone ? 0 : 16, width: '100%', maxWidth: modalIsTabletLandscape ? 1040 : 540, maxHeight: modalIsPhone ? '100dvh' : modalIsTabletLandscape ? 'calc(100dvh - 32px)' : '92vh', minHeight: modalIsPhone ? '100dvh' : undefined, overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: modalHeaderPadding, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: modalIsPhone ? 17 : 18, fontWeight: 600 }}>{peca ? 'Editar peca' : 'Nova peca'}</div>
            {peca?.idPeca && <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>ID da peca: {peca.idPeca}</div>}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', flexShrink: 0 }}>X</button>
        </div>
        <div style={{ padding: modalContentPadding }}>
          <div style={{ display: 'grid', gridTemplateColumns: modalTopColumns, gap: 12, alignItems: 'start' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Moto *</label>
              <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.motoId} onChange={(e) => handleMotoChange(e.target.value)}>
                <option value="">Selecione...</option>
                {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} - {m.marca} {m.modelo}</option>)}
              </select>
            </div>
            {renderField('Data de cadastro', 'cadastro', 'date')}
          </div>
          {!peca && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>ID da peca *</label>
              <input
                style={cs.fi}
                type="text"
                placeholder="Ex: BM01_0123"
                value={form.idPeca}
                onChange={(e) => handleIdPecaChange(e.target.value)}
              />
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                {loadingSuggestion
                  ? 'Buscando sugestao automatica...'
                  : suggestion?.sugestao
                    ? `Sugestao automatica: ${suggestion.sugestao}${suggestion?.prefixo ? ` - Prefixo ${suggestion.prefixo}` : ''}`
                  : 'Voce pode informar qualquer ID de peca manualmente.'}
              </div>
            </div>
          )}
          {peca && (
            <div style={{ display: 'grid', gridTemplateColumns: dualFieldColumns, gap: 12 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Localizacao no Bling</label>
                <input
                  style={{ ...cs.fi, background: 'var(--gray-50)', color: 'var(--ink-muted)' }}
                  type="text"
                  readOnly
                  value={form.localizacao || ''}
                  placeholder="Sem localizacao sincronizada"
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>DETRAN</label>
                <input
                  style={{ ...cs.fi, background: 'var(--gray-50)', color: 'var(--ink-muted)' }}
                  type="text"
                  readOnly
                  value={form.detranEtiqueta || ''}
                  placeholder="Sem etiqueta sincronizada"
                />
              </div>
            </div>
          )}
          {modalIsTabletLandscape ? (
            <div style={{ display: 'grid', gridTemplateColumns: modalMainColumns, gap: 16, alignItems: 'start' }}>
              <div>
                {renderField('Descricao da peca *', 'descricao', 'text', 'Ex: Tampa lateral direita')}
                <div style={{ display: 'grid', gridTemplateColumns: modalActionColumns, gap: 12, alignItems: 'start' }}>
                  {renderField('Pedido Bling', 'blingPedidoNum', 'text', 'Ex: 449')}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Status</label>
                    <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.disponivel} onChange={(e) => setForm({ ...form, disponivel: e.target.value })}>
                      <option value="true">Em estoque</option>
                      <option value="false">Vendido</option>
                    </select>
                  </div>
                  {renderField('Data de venda', 'dataVenda', 'date')}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '14px 14px 2px', background: '#fcfcfd' }}>
                <div style={{ fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 10 }}>Financeiro</div>
                <div style={{ display: 'grid', gridTemplateColumns: modalFinancialColumns, gap: 12 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Preco ML (R$)</label>
                    <input
                      style={cs.fi}
                      type="number"
                      placeholder="0,00"
                      value={form.precoML}
                      onChange={(e) => handlePrecoMlChange(e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Frete (R$)</label>
                    <input
                      style={cs.fi}
                      type="number"
                      placeholder="0,00"
                      value={form.valorFrete}
                      onChange={(e) => handleFreteChange(e.target.value)}
                    />
                    {!peca && suggestion?.fretePadrao !== undefined && (
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                        Frete padrao atual: {fmt(Number(suggestion.fretePadrao || 0))}
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Taxas (R$)</label>
                    <input
                      style={cs.fi}
                      type="number"
                      placeholder="0,00"
                      value={form.valorTaxas}
                      onChange={(e) => handleTaxasChange(e.target.value)}
                    />
                    {!peca && suggestion?.taxaPadraoPct !== undefined && (
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                        Taxa padrao atual: {Number(suggestion.taxaPadraoPct || 0)}%
                      </div>
                    )}
                  </div>
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
              </div>
            </div>
          ) : (
            <>
              {renderField('Descricao da peca *', 'descricao', 'text', 'Ex: Tampa lateral direita')}
              {renderField('Pedido Bling', 'blingPedidoNum', 'text', 'Ex: 449')}
              <div style={{ display: 'grid', gridTemplateColumns: dualFieldColumns, gap: 12 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Preco ML (R$)</label>
                  <input
                    style={cs.fi}
                    type="number"
                    placeholder="0,00"
                    value={form.precoML}
                    onChange={(e) => handlePrecoMlChange(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Frete (R$)</label>
                  <input
                    style={cs.fi}
                    type="number"
                    placeholder="0,00"
                    value={form.valorFrete}
                    onChange={(e) => handleFreteChange(e.target.value)}
                  />
                  {!peca && suggestion?.fretePadrao !== undefined && (
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                      Frete padrao atual: {fmt(Number(suggestion.fretePadrao || 0))}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Taxas (R$)</label>
                  <input
                    style={cs.fi}
                    type="number"
                    placeholder="0,00"
                    value={form.valorTaxas}
                    onChange={(e) => handleTaxasChange(e.target.value)}
                  />
                  {!peca && suggestion?.taxaPadraoPct !== undefined && (
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                      Taxa padrao atual: {Number(suggestion.taxaPadraoPct || 0)}%
                    </div>
                  )}
                </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: dualFieldColumns, gap: 12 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>Status</label>
                  <select style={{ ...cs.fi, cursor: 'pointer' }} value={form.disponivel} onChange={(e) => setForm({ ...form, disponivel: e.target.value })}>
                    <option value="true">Em estoque</option>
                    <option value="false">Vendido</option>
                  </select>
                </div>
                {renderField('Data de venda', 'dataVenda', 'date')}
              </div>
            </>
          )}
          {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>! {err}</div>}
        </div>
        <div style={{ padding: modalFooterPadding, display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--border)', flexWrap: 'wrap', flexDirection: modalIsPhone ? 'column' : 'row' }}>
          <div style={{ width: modalIsPhone ? '100%' : undefined }}>
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
                style={{ ...cs.btn, background: '#fff1f2', color: 'var(--red)', borderColor: '#fecdd3', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}
              >
                Cancelar venda
              </button>
            )}
            {peca && peca.disponivel && (
              <button
                onClick={() => setShowPrejuizoModal(true)}
                disabled={saving}
                style={{ ...cs.btn, background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}
              >
                Prejuízo
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, width: modalIsPhone ? '100%' : undefined, flexDirection: modalIsPhone ? 'column-reverse' : 'row' }}>
          <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', width: modalIsPhone ? '100%' : undefined, justifyContent: 'center' }}>{saving ? 'Salvando...' : 'Salvar peca'}</button>
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
              observacao: String(peca.__prejuizoObservacao || '').trim(),
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
  const [exportando, setExportando] = useState(false);
  const [motos, setMotos] = useState<any[]>([]);
  const [prefixosMoto, setPrefixosMoto] = useState<Array<{ prefixo: string; motoId: number }>>([]);
  const [caixaOptions, setCaixaOptions] = useState<CaixaFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewportMode, setViewportMode] = useState<EstoqueViewportMode>('desktop');
  const [modal, setModal] = useState(false);
  const [editPeca, setEditPeca] = useState<any>(null);
  const [vendaModal, setVendaModal] = useState(false);
  const [vendaPeca, setVendaPeca] = useState<any>(null);
  const [actionPeca, setActionPeca] = useState<any>(null);
  const [detranPeca, setDetranPeca] = useState<any>(null);
  const [detalhePeca, setDetalhePeca] = useState<any>(null);
  const [selectedPecaIds, setSelectedPecaIds] = useState<number[]>([]);
  const [caixaFilterOpen, setCaixaFilterOpen] = useState(false);
  const [caixaFilterSearch, setCaixaFilterSearch] = useState('');
  const [filters, setFilters] = useState({
    motoId: '',
    marca: '',
    disponivel: '',
    mercadoLivreLink: '',
    localizacao: '',
    caixas: [] as string[],
    detranEtiqueta: '',
    dimensoes: '',
    search: '',
    numeroPeca: '',
    dataVendaFrom: '',
    dataVendaTo: '',
    page: 1,
    perPage: 20,
    orderBy: 'cadastro',
    orderDir: 'desc' as 'asc' | 'desc',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params: any = {
      page: filters.page,
      per: filters.perPage,
      orderBy: filters.orderBy,
      orderDir: filters.orderDir,
    };
    if (filters.motoId) params.motoId = filters.motoId;
    if (filters.marca) params.marca = filters.marca;
    if (filters.disponivel !== '') params.disponivel = filters.disponivel;
    if (filters.mercadoLivreLink !== '') params.mercadoLivreLink = filters.mercadoLivreLink;
    if (filters.localizacao !== '') params.localizacao = filters.localizacao;
    if (filters.caixas.length) params.caixas = filters.caixas;
    if (filters.detranEtiqueta !== '') params.detranEtiqueta = filters.detranEtiqueta;
    if (filters.dimensoes !== '') params.dimensoes = filters.dimensoes;
    if (filters.search) params.search = filters.search;
    if (filters.numeroPeca) params.numeroPeca = filters.numeroPeca;
    if (filters.dataVendaFrom) params.dataVendaFrom = filters.dataVendaFrom;
    if (filters.dataVendaTo) params.dataVendaTo = filters.dataVendaTo;

    const [d, m, caixasData] = await Promise.all([api.pecas.list(params), api.motos.list(), api.pecas.caixas()]);
    setData(d);
    setMotos(m);
    // Carregar prefixos SKU apenas uma vez se ainda não carregados
    if (!prefixosMoto.length) {
      try {
        const prefRes = await fetch('/api/bling/prefixos', { credentials: 'include' });
        const prefData = await prefRes.json();
        if (Array.isArray(prefData)) setPrefixosMoto(prefData.map((p: any) => ({ prefixo: String(p.prefixo || ''), motoId: Number(p.motoId) })));
      } catch { /* ignora */ }
    }
    setCaixaOptions(Array.isArray(caixasData?.data) ? caixasData.data : []);
    setLoading(false);
  }, [filters]);

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
    const visibleIds = new Set((data.data || []).filter((p: any) => !isPrejuizoPeca(p)).map((p: any) => p.id));
    setSelectedPecaIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [data.data]);

  useEffect(() => {
    const available = new Set(caixaOptions.map((option) => option.caixa));
    setFilters((current) => {
      const nextCaixas = current.caixas.filter((caixa) => available.has(caixa));
      if (nextCaixas.length === current.caixas.length) return current;
      return { ...current, caixas: nextCaixas, page: 1 };
    });
  }, [caixaOptions]);

  async function handleSavePeca(formData: any) {
    if (editPeca && isPrejuizoPeca(editPeca)) {
      alert('Essa peca esta em prejuizo e nao pode ser editada pela tela de estoque.');
      return;
    }
    if (editPeca) await api.pecas.update(editPeca.id, formData);
    else await api.pecas.create(formData);
    setModal(false);
    setEditPeca(null);
    load();
  }

  async function handleVenda(formData: any) {
    if (vendaPeca && isPrejuizoPeca(vendaPeca)) {
      alert('Essa peca esta em prejuizo e nao pode ser vendida pela tela de estoque.');
      return;
    }
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

  async function handleDeletePeca(peca: any) {
    if (isPrejuizoPeca(peca)) {
      alert('Pecas em prejuizo ficam bloqueadas para acoes na tela de estoque.');
      return;
    }
    if (!confirm(`Excluir peca ${peca.idPeca}?`)) return;
    await api.pecas.delete(peca.id);
    setActionPeca(null);
    setSelectedPecaIds((current) => current.filter((id) => id !== peca.id));
    load();
  }

  async function handleDeleteSelecionadas() {
    if (!selectedPecaIds.length) return;
    if (!confirm(`Excluir ${selectedPecaIds.length} peca(s) selecionada(s)?`)) return;
    await Promise.all(selectedPecaIds.map((id) => api.pecas.delete(id)));
    setSelectedPecaIds([]);
    load();
  }

  function toggleSelectedPeca(id: number) {
    setSelectedPecaIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function toggleSelectAllVisible() {
    const visibleIds = (data.data || []).map((p: any) => p.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id: number) => selectedPecaIds.includes(id));
    setSelectedPecaIds(allSelected ? [] : visibleIds);
  }

  function toggleSort(column: string) {
    setFilters((current) => ({
      ...current,
      page: 1,
      orderBy: column,
      orderDir: current.orderBy === column && current.orderDir === 'desc' ? 'asc' : 'desc',
    }));
  }

  function sortIndicator(column: string) {
    if (filters.orderBy !== column) return ' ';
    return filters.orderDir === 'desc' ? '↓' : '↑';
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
    setCaixaFilterSearch('');
    setCaixaFilterOpen(false);
    setFilters({ ...filters, motoId: '', marca: '', disponivel: '', mercadoLivreLink: '', localizacao: '', caixas: [], detranEtiqueta: '', dimensoes: '', search: '', numeroPeca: '', dataVendaFrom: '', dataVendaTo: '', page: 1 });
  }

  const hasActiveFilters = Boolean(filters.motoId || filters.marca || filters.disponivel !== '' || filters.mercadoLivreLink !== '' || filters.localizacao !== '' || filters.caixas.length || filters.detranEtiqueta !== '' || filters.dimensoes !== '' || filters.search || filters.numeroPeca || filters.dataVendaFrom || filters.dataVendaTo);
  async function exportarExcel() {
    setExportando(true);
    try {
      // Busca todos os registros com os mesmos filtros, sem paginação
      const params: any = {
        page: 1,
        per: 99999,
        orderBy: filters.orderBy,
        orderDir: filters.orderDir,
      };
      if (filters.motoId) params.motoId = filters.motoId;
      if (filters.marca) params.marca = filters.marca;
      if (filters.disponivel !== '') params.disponivel = filters.disponivel;
      if (filters.mercadoLivreLink !== '') params.mercadoLivreLink = filters.mercadoLivreLink;
      if (filters.localizacao !== '') params.localizacao = filters.localizacao;
      if (filters.caixas.length) params.caixas = filters.caixas;
      if (filters.detranEtiqueta !== '') params.detranEtiqueta = filters.detranEtiqueta;
      if (filters.dimensoes !== '') params.dimensoes = filters.dimensoes;
      if (filters.search) params.search = filters.search;
      if (filters.numeroPeca) params.numeroPeca = filters.numeroPeca;
      if (filters.dataVendaFrom) params.dataVendaFrom = filters.dataVendaFrom;
      if (filters.dataVendaTo) params.dataVendaTo = filters.dataVendaTo;

      const result = await api.pecas.list(params);
      const pecas = result?.data || [];

      const XLSX = await import('xlsx');
      const rows = pecas.map((p: any) => ({
        'ID Peca': p.idPeca,
        'Descricao': p.descricao,
        'Moto': p.moto ? `${p.moto.marca} ${p.moto.modelo}` : '',
        'Status': p.emPrejuizo ? 'Prejuizo' : p.disponivel ? 'Em estoque' : 'Vendida',
        'Localizacao': p.localizacao || '',
        'Numero de Peca': p.numeroPeca || '',
        'Preco ML': Number(p.precoML) || 0,
        'Valor Liquido': Number(p.valorLiq) || 0,
        'Frete': Number(p.valorFrete) || 0,
        'Taxas': Number(p.valorTaxas) || 0,
        'Peso Liquido (kg)': p.pesoLiquido != null ? Number(p.pesoLiquido) : '',
        'Peso Bruto (kg)': p.pesoBruto != null ? Number(p.pesoBruto) : '',
        'Largura (cm)': p.largura != null ? Number(p.largura) : '',
        'Altura (cm)': p.altura != null ? Number(p.altura) : '',
        'Profundidade (cm)': p.profundidade != null ? Number(p.profundidade) : '',
        'Etiqueta Detran': p.detranEtiqueta || '',
        'Link ML': p.mercadoLivreLink || '',
        'Data Cadastro': p.cadastro ? new Date(p.cadastro).toLocaleDateString('pt-BR') : '',
        'Data Venda': p.dataVenda ? new Date(p.dataVenda).toLocaleDateString('pt-BR') : '',
        'Pedido Bling': p.blingPedidoNum || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
      const now = new Date();
      const fileName = `estoque_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e: any) {
      alert(`Erro ao exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / filters.perPage));
  const hasPrevPage = filters.page > 1;
  const hasNextPage = filters.page < totalPages;
  const visiblePecaIds = (data.data || []).filter((p: any) => !isPrejuizoPeca(p)).map((p: any) => p.id);
  const allVisibleSelected = visiblePecaIds.length > 0 && visiblePecaIds.every((id: number) => selectedPecaIds.includes(id));
  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const useCardList = isPhone || isTabletPortrait;
  const pagePadding = isPhone ? 14 : isTabletPortrait || isTabletLandscape ? 18 : 28;
  const filterGridColumns = isPhone
    ? '1fr'
    : isTabletPortrait
    ? 'repeat(2, minmax(0, 1fr))'
    : isTabletLandscape
    ? 'repeat(4, minmax(0, 1fr))'
    : 'repeat(6, minmax(0, 1fr))';
  const caixaFilterGridColumn = isPhone ? 'span 1' : 'span 2';
  const summaryGridColumns = isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
  const denseTablePadding = isTabletLandscape ? '9px 8px' : '10px 10px';
  const denseTableHeaderPadding = isTabletLandscape ? '9px 8px' : '10px 10px';
  const tableMinWidth = isTabletLandscape ? 1240 : undefined;
  const summaryCards = [
    { l: 'Total', v: data.total, c: 'var(--ink)' },
    { l: 'Em estoque', v: data.totalDisp, c: 'var(--sage)' },
    { l: 'Vendidas', v: data.totalVend, c: 'var(--amber)' },
  ];
  const marcaOptions = Array.from(new Set(
    motos
      .map((m: any) => String(m?.marca || '').trim())
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  const displayedPecas = filters.caixas.length
    ? (data.data || [])
        .map((peca: any, index: number) => ({ peca, index }))
        .sort((a: any, b: any) => {
          const caixaA = displayCaixaLabel(a.peca?.localizacao);
          const caixaB = displayCaixaLabel(b.peca?.localizacao);
          const compareCaixa = caixaA.localeCompare(caixaB, 'pt-BR', { numeric: true, sensitivity: 'base' });
          if (compareCaixa !== 0) return compareCaixa;
          return a.index - b.index;
        })
        .map((entry: any) => entry.peca)
    : (data.data || []);

  function toggleCaixaFilter(caixa: string) {
    setFilters((current) => ({
      ...current,
      page: 1,
      caixas: current.caixas.includes(caixa)
        ? current.caixas.filter((item) => item !== caixa)
        : [...current.caixas, caixa],
    }));
  }

  function selectVisibleCaixas(caixas: string[]) {
    if (!caixas.length) return;
    setFilters((current) => ({
      ...current,
      page: 1,
      caixas: Array.from(new Set([...current.caixas, ...caixas])),
    }));
  }
  const tableHeaders: EstoqueTableHeader[] = [
    { label: '', sort: null, kind: 'select', width: 38 },
    { label: 'ID', sort: 'motoId', width: 52 },
    { label: 'ID Peca', sort: 'idPeca', width: 88 },
    { label: 'Moto', sort: 'moto', width: isTabletLandscape ? 124 : 138 },
    { label: 'Descricao', sort: 'descricao', width: isTabletLandscape ? '18%' : '21%' },
    { label: isTabletLandscape ? 'Cad.' : 'Cadastro', sort: 'cadastro', width: isTabletLandscape ? 68 : 72 },
    { label: 'Preco ML', sort: 'precoML', width: 90 },
    { label: 'Vl. Liq.', sort: 'valorLiq', width: 86 },
    { label: 'Frete', sort: 'valorFrete', width: 78 },
    { label: 'Taxas', sort: 'valorTaxas', width: 78 },
    { label: 'Venda', sort: 'dataVenda', width: 70 },
    { label: 'Pedido', sort: 'blingPedidoNum', width: 72 },
    { label: 'Detran', sort: null, width: 58 },
    { label: 'Status', sort: 'disponivel', width: 94 },
    { label: '', sort: null, width: 42 },
  ];

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Estoque</div>
          <div style={cs.sub}>Controle de pecas e disponibilidade</div>
        </div>
      </div>
      <div style={{ padding: pagePadding }}>
        <div style={{ display: 'grid', gridTemplateColumns: summaryGridColumns, gap: isPhone ? 12 : 14, marginBottom: 20 }}>
          {summaryCards.map((card) => (
            <div key={card.l} style={{ ...cs.sCard, padding: isPhone ? '14px 14px' : '18px 20px' }}>
              <div style={{ fontSize: isPhone ? 10.5 : 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>{card.l}</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: isPhone ? 22 : 26, fontWeight: 500, color: card.c }}>{card.v}</div>
            </div>
          ))}
        </div>

        <div style={cs.card}>
          <div style={{ padding: isPhone ? '14px' : '14px 18px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 12 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: isPhone ? 14 : 15, fontWeight: 600 }}>Pecas</div>

            <div style={{ display: 'grid', gridTemplateColumns: filterGridColumns, gap: 8 }}>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.motoId} onChange={(e) => setFilters({ ...filters, motoId: e.target.value, page: 1 })}>
                <option value="">Todas motos</option>
                {motos.map((m: any) => {
                  const pref = prefixosMoto.find((p) => Number(p.motoId) === Number(m.id));
                  return <option key={m.id} value={m.id}>{pref ? `${pref.prefixo} - ` : ''}ID {m.id} - {m.marca} {m.modelo}</option>;
                })}
              </select>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.marca} onChange={(e) => setFilters({ ...filters, marca: e.target.value, page: 1 })}>
                <option value="">Marca da moto</option>
                {marcaOptions.map((marca) => <option key={marca} value={marca}>{marca}</option>)}
              </select>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.disponivel} onChange={(e) => setFilters({ ...filters, disponivel: e.target.value, page: 1 })}>
                <option value="">Todos status</option>
                <option value="true">Em estoque</option>
                <option value="false">Vendido</option>
              </select>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.mercadoLivreLink} onChange={(e) => setFilters({ ...filters, mercadoLivreLink: e.target.value, page: 1 })}>
                <option value="">Link ML</option>
                <option value="com">Com Link ML</option>
                <option value="sem">Sem Link ML</option>
              </select>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.localizacao} onChange={(e) => setFilters({ ...filters, localizacao: e.target.value, page: 1 })}>
                <option value="">Localizacao</option>
                <option value="com">Com preenchimento</option>
                <option value="sem">Sem preenchimento</option>
              </select>
              <div style={{ gridColumn: caixaFilterGridColumn }}>
                <CaixaMultiSelectFilter
                  open={caixaFilterOpen}
                  loading={loading && caixaOptions.length === 0}
                  options={caixaOptions}
                  selected={filters.caixas}
                  search={caixaFilterSearch}
                  isPhone={isPhone}
                  isTabletPortrait={isTabletPortrait}
                  isTabletLandscape={isTabletLandscape}
                  onToggleOpen={() => setCaixaFilterOpen((current) => !current)}
                  onSearchChange={setCaixaFilterSearch}
                  onToggleCaixa={toggleCaixaFilter}
                  onClear={() => setFilters((current) => ({ ...current, page: 1, caixas: [] }))}
                  onSelectVisible={selectVisibleCaixas}
                  onClose={() => setCaixaFilterOpen(false)}
                />
              </div>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.detranEtiqueta} onChange={(e) => setFilters({ ...filters, detranEtiqueta: e.target.value, page: 1 })}>
                <option value="">Etiqueta Detran</option>
                <option value="com">Com etiqueta</option>
                <option value="sem">Sem etiqueta</option>
              </select>
              <select style={{ ...cs.sel, width: '100%' }} value={filters.dimensoes} onChange={(e) => setFilters({ ...filters, dimensoes: e.target.value, page: 1 })}>
                <option value="">Dimensoes</option>
                <option value="com">Com dimensoes</option>
                <option value="sem">Sem dimensoes</option>
              </select>
              <input
                style={{ ...cs.sel, width: '100%', paddingLeft: 11, gridColumn: isPhone ? 'span 1' : 'span 2' }}
                placeholder="ID, descricao ou pedido..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              />
              <input
                style={{ ...cs.sel, width: '100%', paddingLeft: 11 }}
                placeholder="Numero da peca..."
                value={filters.numeroPeca}
                onChange={(e) => setFilters({ ...filters, numeroPeca: e.target.value, page: 1 })}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 32 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Venda de</span>
                <input
                  type="date"
                  value={filters.dataVendaFrom}
                  max={filters.dataVendaTo || undefined}
                  onChange={(e) => setFilters({ ...filters, dataVendaFrom: e.target.value, page: 1 })}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Geist, sans-serif', color: 'var(--ink)', minWidth: 0, width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 32 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>ate</span>
                <input
                  type="date"
                  value={filters.dataVendaTo}
                  min={filters.dataVendaFrom || undefined}
                  onChange={(e) => setFilters({ ...filters, dataVendaTo: e.target.value, page: 1 })}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'Geist, sans-serif', color: 'var(--ink)', minWidth: 0, width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ ...cs.sel, width: isPhone ? '100%' : undefined }} value={String(filters.perPage)} onChange={(e) => setFilters({ ...filters, perPage: Number(e.target.value), page: 1 })}>
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size} por pagina</option>)}
              </select>
              <button
                disabled={!selectedPecaIds.length}
                onClick={handleDeleteSelecionadas}
                style={{
                  ...cs.btn,
                  background: selectedPecaIds.length ? '#fff1f2' : 'var(--gray-50)',
                  color: selectedPecaIds.length ? 'var(--red)' : 'var(--ink-muted)',
                  borderColor: selectedPecaIds.length ? '#fecdd3' : 'var(--border)',
                  padding: '6px 14px',
                  fontSize: 13,
                  opacity: selectedPecaIds.length ? 1 : 0.7,
                  width: isPhone ? '100%' : undefined,
                }}
              >
                Deletar em massa{selectedPecaIds.length ? ` (${selectedPecaIds.length})` : ''}
              </button>
              <button
                style={{ ...cs.btn, background: 'var(--white)', border: '1px solid var(--border)', color: exportando ? 'var(--ink-muted)' : 'var(--ink)', padding: '6px 14px', fontSize: 13, width: isPhone ? '100%' : undefined, opacity: exportando ? 0.6 : 1 }}
                onClick={exportarExcel}
                disabled={exportando}
              >
                {exportando ? 'Exportando...' : '↓ Exportar Excel'}
              </button>
              <button style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', padding: '6px 14px', fontSize: 13, width: isPhone ? '100%' : undefined }} onClick={() => { setEditPeca(null); setModal(true); }}>+ Nova peca</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPhone ? '10px 14px' : '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10, background: '#fcfcfd' }}>
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
              style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: hasActiveFilters ? 'var(--ink-soft)' : 'var(--ink-muted)', opacity: hasActiveFilters ? 1 : 0.6, width: isPhone ? '100%' : undefined, justifyContent: 'center' }}
            >
              Limpar filtros
            </button>
          </div>

          {useCardList ? (
            <div style={{ padding: isPhone ? 12 : 14, display: 'grid', gap: 12 }}>
              {loading ? (
                <div style={{ ...cs.sCard, textAlign: 'center', color: 'var(--ink-muted)' }}>Carregando...</div>
              ) : displayedPecas.length === 0 ? (
                <div style={{ ...cs.sCard, textAlign: 'center', color: 'var(--ink-muted)' }}>Nenhuma peca encontrada</div>
              ) : displayedPecas.map((p: any, index: number) => {
                const motoLabel = [p.moto?.marca, p.moto?.modelo].filter(Boolean).join(' ');
                const bloqueadaPrejuizo = isPrejuizoPeca(p);
                const caixaAtual = displayCaixaLabel(p.localizacao);
                const caixaAnterior = index > 0 ? displayCaixaLabel(displayedPecas[index - 1]?.localizacao) : null;
                const showCaixaSeparator = filters.caixas.length > 0 && caixaAtual !== caixaAnterior;

                return (
                  <Fragment key={p.id}>
                    {showCaixaSeparator ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 0' }}>
                        <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>
                          Caixa {caixaAtual}
                        </div>
                        <div style={{ height: 1, background: 'rgba(37,99,235,.24)', flex: 1 }} />
                      </div>
                    ) : null}
                    <div
                      style={{
                        border: bloqueadaPrejuizo ? '1px solid #fecaca' : '1px solid var(--border)',
                        borderRadius: 14,
                        padding: isPhone ? 14 : 16,
                        background: bloqueadaPrejuizo ? '#fff7f7' : 'var(--white)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            disabled={bloqueadaPrejuizo}
                            checked={selectedPecaIds.includes(p.id)}
                            onChange={() => toggleSelectedPeca(p.id)}
                            aria-label={`Selecionar peca ${p.idPeca}`}
                            style={{ width: 14, height: 14, cursor: bloqueadaPrejuizo ? 'not-allowed' : 'pointer', marginTop: 4 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <button onClick={() => setDetalhePeca(p)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Geist Mono, monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--blue-500)' }} title="Ver detalhes">{p.idPeca}</button>
                              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)' }}>ID #{p.motoId}</span>
                              {bloqueadaPrejuizo ? <PrejuizoBadge /> : null}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.35, marginTop: 4 }}>{motoLabel || '-'}</div>
                          </div>
                        </div>
                        <ActionIconButton
                          onClick={() => {
                            if (bloqueadaPrejuizo) return;
                            setActionPeca(p);
                          }}
                          disabled={bloqueadaPrejuizo}
                          title={bloqueadaPrejuizo ? 'Peca em prejuizo bloqueada para acoes' : 'Acoes da peca'}
                        />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.45, marginBottom: 12 }}>{p.descricao}</div>
                      {bloqueadaPrejuizo ? (
                        <div style={{ marginBottom: 12, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.55 }}>
                          Peca marcada como <strong>Prejuizo</strong>. Ela fica bloqueada para edicao e venda na tela de estoque.
                        </div>
                      ) : null}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        {bloqueadaPrejuizo ? (
                          <PrejuizoBadge />
                        ) : (
                          <StatusLinkButton disponivel={Boolean(p.disponivel)} link={p.mercadoLivreLink} />
                        )}
                        {hasDetranEtiqueta(p.detranEtiqueta) ? (
                          <button
                            onClick={() => setDetranPeca(p)}
                            title="Ver etiqueta DETRAN"
                            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                          >
                            <DetranBadge ativo />
                          </button>
                        ) : (
                          <DetranBadge ativo={false} />
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        {[
                          { label: 'Cadastro', value: formatCompactDate(p.cadastro) },
                          { label: 'Venda', value: formatCompactDate(p.dataVenda) },
                          { label: 'Pedido', value: p.blingPedidoNum || '-' },
                          { label: 'Localizacao', value: p.localizacao || '-' },
                          { label: 'Preco ML', value: fmt(Number(p.precoML)) },
                          { label: 'Vl. Liq.', value: fmt(Number(p.valorLiq)) },
                          { label: 'Frete', value: fmt(Number(p.valorFrete)) },
                          { label: 'Taxas', value: fmt(Number(p.valorTaxas)) },
                        ].map((item) => (
                          <div key={item.label}>
                            <div style={{ fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '0.4px', textTransform: 'uppercase' }}>{item.label}</div>
                            <div style={{ marginTop: 3, fontSize: 12.5, fontFamily: 'Geist Mono, monospace', color: 'var(--ink)' }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'collapse', fontSize: isTabletLandscape ? 12 : 13, tableLayout: 'fixed' as const }}>
                <colgroup>
                  {tableHeaders.map((header, index) => (
                    <col key={`${header.label || 'actions'}-${index}`} style={{ width: typeof header.width === 'number' ? `${header.width}px` : header.width }} />
                  ))}
                </colgroup>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {tableHeaders.map((header, index) => (
                      <th key={`${header.label || 'actions'}-${index}`} style={{ ...cs.th, padding: denseTableHeaderPadding }}>
                        {header.kind === 'select' ? (
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            aria-label="Selecionar todas as pecas visiveis"
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                          />
                        ) : header.sort ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(header.sort!)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              font: 'inherit',
                              color: filters.orderBy === header.sort ? 'var(--ink)' : 'var(--ink-muted)',
                              textTransform: 'inherit',
                              letterSpacing: 'inherit',
                            }}
                            title={`Ordenar por ${header.label}`}
                          >
                            <span>{header.label}</span>
                            <span style={{ fontSize: 11, minWidth: 10 }}>{sortIndicator(header.sort)}</span>
                          </button>
                        ) : (
                          header.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={15} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando...</td></tr>
                  ) : displayedPecas.length === 0 ? (
                    <tr><td colSpan={15} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', padding: '40px 20px', borderBottom: 'none' }}>Nenhuma peca encontrada</td></tr>
                  ) : displayedPecas.map((p: any, index: number) => {
                    const caixaAtual = displayCaixaLabel(p.localizacao);
                    const caixaAnterior = index > 0 ? displayCaixaLabel(displayedPecas[index - 1]?.localizacao) : null;
                    const showCaixaSeparator = filters.caixas.length > 0 && caixaAtual !== caixaAnterior;

                    return (
                      <Fragment key={p.id}>
                        {showCaixaSeparator ? (
                          <tr>
                            <td colSpan={15} style={{ padding: '10px 12px', borderBottom: '1px solid rgba(37,99,235,.16)', background: '#f8fbff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--blue-500)' }}>
                                  Caixa {caixaAtual}
                                </span>
                                <div style={{ height: 1, background: 'rgba(37,99,235,.24)', flex: 1 }} />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        <tr style={{ background: isPrejuizoPeca(p) ? '#fff7f7' : 'transparent' }}>
                          <td style={{ ...cs.td, padding: denseTablePadding }}>
                            <input
                              type="checkbox"
                              disabled={isPrejuizoPeca(p)}
                              checked={selectedPecaIds.includes(p.id)}
                              onChange={() => toggleSelectedPeca(p.id)}
                              aria-label={`Selecionar peca ${p.idPeca}`}
                              style={{ width: 14, height: 14, cursor: isPrejuizoPeca(p) ? 'not-allowed' : 'pointer' }}
                            />
                          </td>
                          <td style={{ ...cs.td, padding: denseTablePadding }}><span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-muted)' }}>#{p.motoId}</span></td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                            <button onClick={() => setDetalhePeca(p)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, fontWeight: 600, color: isPrejuizoPeca(p) ? '#b91c1c' : 'var(--blue-500)' }} title="Ver detalhes da peça">
                              {p.idPeca}
                            </button>
                          </td>
                          <td style={{ ...cs.td, padding: denseTablePadding, color: 'var(--ink-muted)', fontSize: 11.5, lineHeight: 1.35 }}>
                            <div style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                              {[p.moto?.marca, p.moto?.modelo].filter(Boolean).join(' ')}
                            </div>
                          </td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontSize: 12 }}>
                            <div title={p.descricao} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</div>
                            {isPrejuizoPeca(p) ? (
                              <div style={{ marginTop: 4 }}>
                                <PrejuizoBadge />
                              </div>
                            ) : null}
                          </td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{formatCompactDate(p.cadastro)}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmt(Number(p.precoML))}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{fmt(Number(p.valorLiq))}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{fmt(Number(p.valorFrete))}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{fmt(Number(p.valorTaxas))}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{formatCompactDate(p.dataVenda)}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, fontFamily: 'Geist Mono, monospace', fontSize: 11, color: p.blingPedidoNum ? 'var(--blue-500)' : 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{p.blingPedidoNum || '-'}</td>
                          <td style={{ ...cs.td, padding: denseTablePadding, textAlign: 'center' }}>
                            {hasDetranEtiqueta(p.detranEtiqueta) ? (
                              <button
                                onClick={() => setDetranPeca(p)}
                                title="Ver etiqueta DETRAN"
                                style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                              >
                                <DetranBadge ativo />
                              </button>
                            ) : (
                              <DetranBadge ativo={false} />
                            )}
                          </td>
                          <td style={{ ...cs.td, padding: denseTablePadding, textAlign: 'center' }}>
                            {isPrejuizoPeca(p) ? (
                              <PrejuizoBadge />
                            ) : (
                              <StatusLinkButton disponivel={Boolean(p.disponivel)} link={p.mercadoLivreLink} />
                            )}
                          </td>
                          <td style={{ ...cs.td, padding: denseTablePadding, textAlign: 'center' }}>
                            <ActionIconButton
                              onClick={() => {
                                if (isPrejuizoPeca(p)) return;
                                setActionPeca(p);
                              }}
                              disabled={isPrejuizoPeca(p)}
                              title={isPrejuizoPeca(p) ? 'Peca em prejuizo bloqueada para acoes' : 'Acoes da peca'}
                            />
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: isPhone ? 'stretch' : 'center', flexDirection: isPhone ? 'column' : 'row', justifyContent: 'space-between', padding: isPhone ? '12px 14px' : '12px 18px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', gap: 10 }}>
            <span style={{ lineHeight: 1.45 }}>Pagina {filters.page} de {totalPages} · {data.total} total · {filters.perPage} por pagina · Ordenado por {filters.orderBy} ({filters.orderDir})</span>
            <div style={{ display: 'flex', gap: 6, width: isPhone ? '100%' : undefined }}>
              <button disabled={!hasPrevPage} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)', flex: isPhone ? 1 : undefined, justifyContent: 'center' }}>Anterior</button>
              <button disabled={!hasNextPage} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} style={{ ...cs.btn, padding: '5px 10px', fontSize: 12, background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--ink-soft)', flex: isPhone ? 1 : undefined, justifyContent: 'center' }}>Proxima</button>
            </div>
          </div>
        </div>
      </div>

      <PecaModal open={modal} onClose={() => { setModal(false); setEditPeca(null); }} onSave={handleSavePeca} onCancelSale={handleCancelSale} onMarkPrejuizo={handleMarkPrejuizo} peca={editPeca} motos={motos} viewportMode={viewportMode} />
      <VendaModal open={vendaModal} peca={vendaPeca} onClose={() => setVendaModal(false)} onConfirm={handleVenda} />
      <DetranEtiquetaModal open={Boolean(detranPeca)} peca={detranPeca} onClose={() => setDetranPeca(null)} />
      <PecaDetalheModal open={Boolean(detalhePeca)} peca={detalhePeca} onClose={() => setDetalhePeca(null)} onSaved={() => { setDetalhePeca(null); load(); }} />
      <PecaActionsModal
        open={Boolean(actionPeca)}
        peca={actionPeca}
        onClose={() => setActionPeca(null)}
        onEdit={() => {
          if (isPrejuizoPeca(actionPeca)) return;
          setEditPeca(actionPeca);
          setActionPeca(null);
          setModal(true);
        }}
        onSell={() => {
          if (!actionPeca?.disponivel || isPrejuizoPeca(actionPeca)) return;
          setVendaPeca(actionPeca);
          setActionPeca(null);
          setVendaModal(true);
        }}
        onDelete={() => handleDeletePeca(actionPeca)}
      />
    </>
  );
}
