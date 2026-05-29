'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { compressFotoCapaFile } from '@/lib/image-compression';
import { useAuth } from '@/lib/auth';
import { canProcessAction } from '@/lib/permissions';

const API = API_BASE;

type SortDir = 'asc' | 'desc';
type SortState = { key: string; dir: SortDir };

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 16 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', fontFamily: 'inherit' },
  select: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, outline: 'none', color: 'var(--gray-800)', fontFamily: 'inherit', cursor: 'pointer' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' as const, border: '1px solid transparent', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  th: { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '9px 12px', fontSize: 13, color: 'var(--gray-700)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Ativa: { bg: '#ecfdf3', color: '#16a34a' },
  Baixada: { bg: '#fef2f2', color: '#dc2626' },
  '-': { bg: '#f1f5f9', color: '#94a3b8' },
};

const TIPO_ETQ_COLORS: Record<string, { bg: string; color: string }> = {
  Cartela: { bg: '#eff6ff', color: '#1d4ed8' },
  Avulsa: { bg: '#faf5ff', color: '#7c3aed' },
};

const MAIN_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'descricao', label: 'Descricao SKU' },
  { key: 'tipoEtiqueta', label: 'Tipo Etiqueta' },
  { key: 'tipoPeca', label: 'Tipo de Peca' },
  { key: 'etiqueta', label: 'Etiqueta Detran' },
  { key: 'status', label: 'Status' },
];

const PENDENCIAS_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'descricao', label: 'Descricao' },
  { key: 'etiqueta', label: 'Etiqueta Detran' },
  { key: 'status', label: 'Status' },
  { key: 'blingPedidoNum', label: 'Pedido Bling' },
  { key: 'nfNumero', label: 'NF' },
  { key: 'clienteNome', label: 'Cliente' },
  { key: 'clienteDoc', label: 'CPF/CNPJ' },
  { key: 'dataVenda', label: 'Data Venda' },
];

function onlyDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function formatCpfCnpj(value: unknown) {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  return String(value || '').trim() || '-';
}

function formatDate(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function getSortValue(row: any, key: string) {
  if (key === 'dataVenda') {
    const time = row?.dataVenda ? new Date(row.dataVenda).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  if (key === 'clienteDoc') {
    return onlyDigits(row?.clienteDoc);
  }

  const text = String(row?.[key] ?? '').trim();
  const numeric = Number(text.replace(',', '.'));
  return text && Number.isFinite(numeric) && /^\d+([.,]\d+)?$/.test(text) ? numeric : text.toLowerCase();
}

function sortRows(rows: any[], sort: SortState) {
  return [...rows].sort((left, right) => {
    const leftValue = getSortValue(left, sort.key);
    const rightValue = getSortValue(right, sort.key);
    const direction = sort.dir === 'asc' ? 1 : -1;

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction;
    }

    return String(leftValue).localeCompare(String(rightValue), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    }) * direction;
  });
}

function sortIndicator(sort: SortState, key: string) {
  if (sort.key !== key) return '';
  return sort.dir === 'asc' ? '^' : 'v';
}

function getBaseSkuFromIdPeca(idPeca: unknown) {
  return String(idPeca || '').trim().toUpperCase().replace(/-\d+$/, '');
}

function SortableTh({ column, sort, onSort }: { column: { key: string; label: string }; sort: SortState; onSort: (key: string) => void }) {
  return (
    <th style={s.th}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
          textTransform: 'inherit',
          letterSpacing: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>{column.label}</span>
        <span style={{ minWidth: 10, fontSize: 10 }}>{sortIndicator(sort, column.key)}</span>
      </button>
    </th>
  );
}

export default function EtiquetasDetranPage() {
  const { user } = useAuth();
  const [linhas, setLinhas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({ sku: '', descricao: '', tipoEtiqueta: '', tipoPeca: '', etiqueta: '', status: '', qtdeEtiquetasSku: '' });
  const [modalPendencias, setModalPendencias] = useState(false);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loadingPendencias, setLoadingPendencias] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [modalBaixa, setModalBaixa] = useState<any | null>(null);
  const [comprovanteDataUrl, setComprovanteDataUrl] = useState<string | null>(null);
  const [comprovanteNome, setComprovanteNome] = useState<string>('');
  const [pendenciasDevOpen, setPendenciasDevOpen] = useState(false);
  const [pendenciasDev, setPendenciasDev] = useState<any[]>([]);
  const [loadingPendenciasDev, setLoadingPendenciasDev] = useState(false);
  const [novasEtiquetasDev, setNovasEtiquetasDev] = useState<Record<number, string>>({});
  const [salvandoPendenciaDev, setSalvandoPendenciaDev] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'sku', dir: 'asc' });
  const [pendenciasSort, setPendenciasSort] = useState<SortState>({ key: 'dataVenda', dir: 'desc' });
  const [isPhone, setIsPhone] = useState(false);
  const canProcessarBaixa = canProcessAction(user, 'etiquetas_detran', 'processar_baixa');
  const canProcessarDevolucao = canProcessAction(user, 'etiquetas_detran', 'processar_devolucao');
  const linhasOrdenadas = useMemo(() => sortRows(linhas, sort), [linhas, sort]);
  const pendenciasOrdenadas = useMemo(() => sortRows(pendencias, pendenciasSort), [pendencias, pendenciasSort]);

  useEffect(() => { buscar(); }, []);
  useEffect(() => {
    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(phoneMedia.matches);
    sync();
    phoneMedia.addEventListener('change', sync);
    return () => phoneMedia.removeEventListener('change', sync);
  }, []);

  function toggleSort(key: string) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }));
  }

  function togglePendenciasSort(key: string) {
    setPendenciasSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }));
  }

  async function buscar() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.sku) params.set('sku', filtros.sku);
      if (filtros.descricao) params.set('descricao', filtros.descricao);
      if (filtros.tipoEtiqueta) params.set('tipoEtiqueta', filtros.tipoEtiqueta);
      if (filtros.tipoPeca) params.set('tipoPeca', filtros.tipoPeca);
      if (filtros.etiqueta) params.set('etiqueta', filtros.etiqueta);
      if (filtros.status) params.set('status', filtros.status);
      if (filtros.qtdeEtiquetasSku) params.set('qtdeEtiquetasSku', filtros.qtdeEtiquetasSku);
      const resp = await fetch(`${API}/etiquetas-detran?${params}`, { credentials: 'include' });
      const data = await resp.json();
      setLinhas(data.linhas || []);
    } catch {
      setLinhas([]);
    }
    setLoading(false);
  }

  async function abrirPendencias() {
    if (!canProcessarBaixa) {
      alert('Seu usuario nao tem permissao para processar baixa de etiquetas.');
      return;
    }
    setModalPendencias(true);
    setLoadingPendencias(true);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/pendencias-baixa`, { credentials: 'include' });
      const data = await resp.json();
      setPendencias(data.linhas || []);
    } catch {
      setPendencias([]);
    }
    setLoadingPendencias(false);
  }

  function abrirModalBaixa(linha: any) {
    if (!canProcessarBaixa) {
      alert('Seu usuario nao tem permissao para processar baixa de etiquetas.');
      return;
    }
    setModalBaixa(linha);
    setComprovanteDataUrl(null);
    setComprovanteNome('');
  }

  async function handleComprovanteChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type.startsWith('image/')) {
      // Imagem — comprime com as mesmas regras do sistema
      const image = await compressFotoCapaFile(file);
      setComprovanteDataUrl(image.dataUrl);
      setComprovanteNome(file.name);
    } else {
      // PDF — lê direto sem compressão
      const reader = new FileReader();
      reader.onload = () => {
        setComprovanteDataUrl(reader.result as string);
        setComprovanteNome(file.name);
      };
      reader.readAsDataURL(file);
    }
  }

  async function confirmarBaixaComComprovante() {
    if (!modalBaixa || !canProcessarBaixa) return;
    const linha = modalBaixa;
    const key = `${linha.pecaId}|${linha.etiqueta}`;
    setConfirmando(key);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/${linha.pecaId}/confirmar-baixa`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etiqueta: linha.etiqueta,
          comprovanteNome:    comprovanteNome    || null,
          comprovanteArquivo: comprovanteDataUrl || null,
        }),
      });
      if (!resp.ok) throw new Error('Erro ao confirmar baixa');
      setModalBaixa(null);
      setPendencias((prev) => prev.filter((p) => p.pecaId !== linha.pecaId));
      await buscar();
    } catch {}
    setConfirmando(null);
  }

  async function salvarNovaEtiquetaDevolucao(peca: any) {
    if (!canProcessarDevolucao) {
      alert('Seu usuario nao tem permissao para processar devolucao de etiquetas.');
      return;
    }

    const novaEtiqueta = String(novasEtiquetasDev[peca.id] || '').trim().toUpperCase();
    if (!novaEtiqueta) {
      alert('Informe a nova etiqueta Detran.');
      return;
    }

    setSalvandoPendenciaDev(peca.id);
    try {
      const resp = await fetch(`${API}/devolucoes/pendentes-etiqueta/${peca.id}/nova-etiqueta`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detranEtiqueta: novaEtiqueta }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || 'Erro ao salvar nova etiqueta');
      }

      let avisoBling = '';
      try {
        const blingResp = await fetch(`${API}/cadastro/sync-bling-peca`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: getBaseSkuFromIdPeca(peca.idPeca),
            detranEtiqueta: novaEtiqueta,
            concatDetranEtiquetasVariacoes: true,
          }),
        });
        const blingData = await blingResp.json().catch(() => ({}));
        if (!blingResp.ok || blingData?.ok === false) {
          avisoBling = blingData?.error || 'Falha ao sincronizar etiqueta no Bling.';
        }
      } catch (e: any) {
        avisoBling = e?.message || 'Falha ao sincronizar etiqueta no Bling.';
      }

      setPendenciasDev((prev) => prev.filter((item) => item.id !== peca.id));
      setNovasEtiquetasDev((prev) => {
        const next = { ...prev };
        delete next[peca.id];
        return next;
      });
      await buscar();

      if (avisoBling) {
        alert(`Etiqueta salva no ANB, mas o Bling nao sincronizou: ${avisoBling}`);
      }
    } catch (e: any) {
      alert(e?.message || 'Erro ao salvar nova etiqueta');
    }
    setSalvandoPendenciaDev(null);
  }

  return (
    <>
      <div style={{ ...s.topbar, height: isPhone ? 'auto' : 'var(--topbar-h)', minHeight: 'var(--topbar-h)', padding: isPhone ? '12px 14px' : '0 28px', alignItems: isPhone ? 'stretch' : 'center', flexDirection: isPhone ? 'column' : 'row' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Etiquetas Detran</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${linhas.length} etiqueta(s) encontrada(s)`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexDirection: isPhone ? 'column' : 'row', width: isPhone ? '100%' : undefined }}>
          {canProcessarBaixa && (
          <button style={{ ...s.btn, background: '#7c3aed', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={abrirPendencias}>
            Pendencias Baixa
          </button>
          )}
          {canProcessarDevolucao && (
          <button style={{ ...s.btn, background: '#2563eb', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={async () => {
            setPendenciasDevOpen(true);
            setLoadingPendenciasDev(true);
            setNovasEtiquetasDev({});
            try {
              const resp = await fetch(`${API}/devolucoes/pendentes-etiqueta`, { credentials: 'include' });
              const data = await resp.json();
              setPendenciasDev(data.pecas || []);
            } catch { setPendenciasDev([]); }
            setLoadingPendenciasDev(false);
          }}>
            Pendências Devolução
          </button>
          )}
        </div>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...s.card, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(170px, 1fr)) 118px', gap: 12, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>SKU</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: HD03_0110"
                value={filtros.sku} onChange={e => setFiltros(f => ({ ...f, sku: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Descricao SKU</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: Cabecote"
                value={filtros.descricao} onChange={e => setFiltros(f => ({ ...f, descricao: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Tipo Etiqueta</div>
              <select style={{ ...s.select, width: '100%' }} value={filtros.tipoEtiqueta}
                onChange={e => setFiltros(f => ({ ...f, tipoEtiqueta: e.target.value }))}>
                <option value="">Todos</option>
                <option value="Cartela">Cartela</option>
                <option value="Avulsa">Avulsa</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Tipo de Peca</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: Balanca"
                value={filtros.tipoPeca} onChange={e => setFiltros(f => ({ ...f, tipoPeca: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Etiqueta Detran</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} placeholder="ex: SP22102017..."
                value={filtros.etiqueta} onChange={e => setFiltros(f => ({ ...f, etiqueta: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && buscar()} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Status</div>
              <select style={{ ...s.select, width: '100%' }} value={filtros.status}
                onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}>
                <option value="">Todos</option>
                <option value="Ativa">Ativa</option>
                <option value="Baixada">Baixada</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>Qtde Etiquetas SKU</div>
              <select style={{ ...s.select, width: '100%' }} value={filtros.qtdeEtiquetasSku}
                onChange={e => setFiltros(f => ({ ...f, qtdeEtiquetasSku: e.target.value }))}>
                <option value="">Todos</option>
                <option value="unica">Etiqueta Única</option>
                <option value="multiplas">Múltiplas Etiquetas</option>
              </select>
            </div>
            <button style={{ ...s.btn, height: isPhone ? 40 : 32, background: 'var(--ink)', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={buscar} disabled={loading}>
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>

        <div style={{ ...s.card, padding: 0 }}>
          {isPhone ? (
            <div style={{ padding: 12, display: 'grid', gap: 10, background: '#f8fafc' }}>
              {loading && <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>Carregando...</div>}
              {!loading && linhasOrdenadas.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>Nenhuma etiqueta encontrada</div>}
              {!loading && linhasOrdenadas.map((linha) => {
                const etqColors = TIPO_ETQ_COLORS[linha.tipoEtiqueta] || { bg: '#f1f5f9', color: '#64748b' };
                const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['-'];
                return (
                  <div key={`${linha.fromHistorico ? 'h' : 'p'}-${linha.pecaId}-${linha.etiqueta}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: linha.fromHistorico ? '#fffbeb' : 'var(--white)', display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{linha.sku}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', marginTop: 3, lineHeight: 1.25 }}>{linha.descricao || '-'}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: stColors.bg, color: stColors.color }}>
                          {linha.status || '-'}
                        </span>
                        {linha.fromHistorico && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: '#fef3c7', color: '#92400e' }}>
                            Devolução
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Tipo</div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color }}>{linha.tipoEtiqueta}</span>
                      </div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Peça</div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray-700)' }}>{linha.tipoPeca || '-'}</div>
                      </div>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Etiqueta Detran</div>
                      <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--gray-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linha.etiqueta}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {MAIN_COLUMNS.map((column) => (
                    <SortableTh key={column.key} column={column} sort={sort} onSort={toggleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>Carregando...</td></tr>
                )}
                {!loading && linhasOrdenadas.length === 0 && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--gray-400)', padding: 40 }}>Nenhuma etiqueta encontrada</td></tr>
                )}
                {linhasOrdenadas.map((linha, i) => {
                  const etqColors = TIPO_ETQ_COLORS[linha.tipoEtiqueta] || { bg: '#f1f5f9', color: '#64748b' };
                  const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['-'];
                  return (
                    <tr key={`${linha.fromHistorico ? 'h' : 'p'}-${linha.pecaId}-${linha.etiqueta}`} style={{ background: linha.fromHistorico ? '#fffbeb' : (i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)') }}>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>{linha.sku}</td>
                      <td style={{ ...s.td, maxWidth: 320 }}>{linha.descricao || '-'}</td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color }}>
                          {linha.tipoEtiqueta}
                        </span>
                      </td>
                      <td style={s.td}>{linha.tipoPeca || '-'}</td>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.etiqueta}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                            {linha.status || '-'}
                          </span>
                          {linha.fromHistorico && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: '#fef3c7', color: '#92400e' }}>
                              Devolução
                            </span>
                          )}
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
      </div>

      {modalPendencias && (
        <div onClick={() => setModalPendencias(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 320, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 12, width: isPhone ? '100%' : 'min(1380px, calc(100vw - 48px))', maxHeight: isPhone ? '100dvh' : '88vh', minHeight: isPhone ? '100dvh' : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: isPhone ? 'none' : '0 24px 70px rgba(2, 6, 23, 0.28)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ padding: isPhone ? '14px' : '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12, background: 'var(--white)', flexDirection: isPhone ? 'column' : 'row' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-800)' }}>Pendencias de Baixa</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                    {loadingPendencias ? 'Buscando dados no Bling...' : `${pendencias.length} etiqueta(s) pendente(s) de baixa`}
                  </div>
                </div>
              </div>
              <button onClick={() => setModalPendencias(false)}
                style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-600)', border: '1px solid var(--border)', width: isPhone ? '100%' : undefined }}>
                Fechar
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1, background: 'var(--white)' }}>
              {loadingPendencias ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
                  Buscando NF e dados do cliente no Bling...
                </div>
              ) : pendenciasOrdenadas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
                  Nenhuma pendencia de baixa encontrada
                </div>
              ) : isPhone ? (
                <div style={{ padding: 12, display: 'grid', gap: 10, background: '#f8fafc' }}>
                  {pendenciasOrdenadas.map((linha) => {
                    const key = `${linha.pecaId}|${linha.etiqueta}`;
                    const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['-'];
                    return (
                      <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)', padding: 12, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{linha.sku}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', marginTop: 3, lineHeight: 1.25 }}>{linha.descricao || '-'}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: stColors.bg, color: stColors.color, flexShrink: 0 }}>
                            {linha.status || '-'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Etiqueta</div>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{linha.etiqueta}</div>
                          </div>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Venda</div>
                            <div style={{ fontSize: 11.5 }}>{formatDate(linha.dataVenda)}</div>
                          </div>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Pedido</div>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{linha.blingPedidoNum || '-'}</div>
                          </div>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>NF</div>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{linha.nfNumero || '-'}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray-600)', lineHeight: 1.45 }}>
                          <div>{linha.clienteNome || '-'}</div>
                          <div style={{ fontFamily: 'Geist Mono, monospace' }}>{formatCpfCnpj(linha.clienteDoc)}</div>
                        </div>
                        <button
                          onClick={() => abrirModalBaixa(linha)}
                          disabled={confirmando === key}
                          style={{ ...s.btn, background: '#16a34a', color: '#fff', padding: '9px 12px', fontSize: 12, opacity: confirmando === key ? 0.6 : 1, width: '100%' }}>
                          {confirmando === key ? 'Salvando...' : 'Confirmar Baixa'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table style={{ width: '100%', minWidth: 1280, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      {PENDENCIAS_COLUMNS.map((column) => (
                        <SortableTh key={column.key} column={column} sort={pendenciasSort} onSort={togglePendenciasSort} />
                      ))}
                      <th style={s.th}>Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendenciasOrdenadas.map((linha, i) => {
                      const key = `${linha.pecaId}|${linha.etiqueta}`;
                      const stColors = STATUS_COLORS[linha.status] || STATUS_COLORS['-'];
                      return (
                        <tr key={key} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                          <td style={{ ...s.td, width: 96, fontFamily: 'Geist Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{linha.sku}</td>
                          <td style={{ ...s.td, width: 230, fontSize: 12, lineHeight: 1.25 }}>{linha.descricao || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.etiqueta}</td>
                          <td style={s.td}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                              {linha.status || '-'}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.blingPedidoNum || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.nfNumero || '-'}</td>
                          <td style={{ ...s.td, width: 220, fontSize: 12, lineHeight: 1.25 }}>{linha.clienteNome || '-'}</td>
                          <td style={{ ...s.td, width: 150, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{formatCpfCnpj(linha.clienteDoc)}</td>
                          <td style={{ ...s.td, fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(linha.dataVenda)}</td>
                          <td style={{ ...s.td, width: 142, whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => abrirModalBaixa(linha)}
                              disabled={confirmando === key}
                              style={{ ...s.btn, background: '#16a34a', color: '#fff', padding: '5px 12px', fontSize: 12, opacity: confirmando === key ? 0.6 : 1 }}>
                              {confirmando === key ? 'Salvando...' : 'Confirmar Baixa'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Baixa */}
      {modalBaixa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 500, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : 480, minHeight: isPhone ? '100dvh' : undefined, boxShadow: isPhone ? 'none' : '0 16px 40px rgba(0,0,0,.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: isPhone ? '16px 14px' : '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Confirmar Baixa Detran</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>{modalBaixa.sku} — {modalBaixa.etiqueta}</div>
            </div>
            <div style={{ padding: isPhone ? 14 : '18px 22px', flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
                Confirma a baixa desta etiqueta? Você pode anexar o comprovante (opcional).
              </div>

              {/* Upload comprovante */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--gray-50)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 8 }}>COMPROVANTE (opcional)</div>
                {comprovanteDataUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      ✓ {comprovanteNome}
                    </span>
                    <button onClick={() => { setComprovanteDataUrl(null); setComprovanteNome(''); }}
                      style={{ ...s.btn, fontSize: 11, padding: '4px 10px', color: 'var(--red-light)', borderColor: 'var(--red-light)' }}>
                      Remover
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', padding: '6px 12px', border: '1px dashed var(--border)', borderRadius: 8 }}>
                    📎 Anexar comprovante
                    <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleComprovanteChange} />
                  </label>
                )}
              </div>
            </div>
            <div style={{ padding: isPhone ? '12px 14px calc(12px + env(safe-area-inset-bottom))' : '14px 22px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', flexDirection: isPhone ? 'column-reverse' : 'row' }}>
              <button onClick={() => setModalBaixa(null)} style={{ ...s.btn, color: 'var(--ink-soft)', width: isPhone ? '100%' : undefined }}>Cancelar</button>
              <button
                onClick={confirmarBaixaComComprovante}
                disabled={!!confirmando}
                style={{ ...s.btn, background: '#16a34a', color: '#fff', opacity: confirmando ? 0.7 : 1, width: isPhone ? '100%' : undefined }}>
                {confirmando ? 'Salvando...' : 'Confirmar Baixa'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Pendências Devolução */}
      {pendenciasDevOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 500, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : 980, maxHeight: isPhone ? '100dvh' : '85vh', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', boxShadow: isPhone ? 'none' : '0 16px 40px rgba(0,0,0,.15)', overflow: 'hidden' }}>
            <div style={{ padding: isPhone ? '14px' : '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Pendências Devolução — Etiqueta Detran</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                  {loadingPendenciasDev ? 'Carregando...' : `${pendenciasDev.length} SKU(s) aguardando nova etiqueta`}
                </div>
              </div>
              <button onClick={() => setPendenciasDevOpen(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1 }}>
              {loadingPendenciasDev ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>Buscando...</div>
              ) : pendenciasDev.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div>Nenhuma pendência de etiqueta por devolução</div>
                </div>
              ) : isPhone ? (
                <div style={{ padding: 12, display: 'grid', gap: 10, background: '#f8fafc' }}>
                  {pendenciasDev.map((p: any) => {
                    const ult = p.devolucoes?.[0];
                    return (
                      <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)', padding: 12, display: 'grid', gap: 10 }}>
                        <div>
                          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{p.idPeca}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', marginTop: 3, lineHeight: 1.25 }}>{p.descricao}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 4 }}>{p.moto?.marca} {p.moto?.modelo}</div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            {p.moto?.renavam && <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--gray-600)' }}>RENAVAM: {p.moto.renavam}</span>}
                            {p.moto?.placa && <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--gray-600)' }}>PLACA: {p.moto.placa}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Etiqueta anterior</div>
                            {ult?.etiquetasDetran
                              ? <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, padding: '2px 5px', borderRadius: 5, ...(ult.etiquetaBaixada ? { background: '#fef2f2', color: '#dc2626' } : { background: '#fef3c7', color: '#92400e' }) }}>{ult.etiquetasDetran}</span>
                              : <div style={{ fontSize: 11.5 }}>—</div>}
                          </div>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Devolução</div>
                            <div style={{ fontSize: 11.5 }}>{ult?.dataDevolucao ? new Date(ult.dataDevolucao).toLocaleDateString('pt-BR') : '—'}</div>
                          </div>
                          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, gridColumn: 'span 2' }}>
                            <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Pedido</div>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{ult?.pedidoBlingNum || '—'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                          <input
                            style={{ ...s.input, width: '100%', boxSizing: 'border-box', textTransform: 'uppercase' }}
                            placeholder="Nova etiqueta Detran"
                            value={novasEtiquetasDev[p.id] || ''}
                            onChange={(e) => setNovasEtiquetasDev((prev) => ({ ...prev, [p.id]: e.target.value.toUpperCase() }))}
                            disabled={salvandoPendenciaDev === p.id}
                          />
                          <button
                            type="button"
                            onClick={() => salvarNovaEtiquetaDevolucao(p)}
                            disabled={salvandoPendenciaDev === p.id || !String(novasEtiquetasDev[p.id] || '').trim()}
                            style={{ ...s.btn, width: '100%', background: '#16a34a', color: '#fff', opacity: salvandoPendenciaDev === p.id || !String(novasEtiquetasDev[p.id] || '').trim() ? 0.65 : 1 }}
                          >
                            {salvandoPendenciaDev === p.id ? 'Salvando...' : 'Salvar nova etiqueta'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      {['SKU', 'Descrição', 'Moto', 'Renavam', 'Placa', 'Etiqueta Anterior', 'Pedido', 'Data Devolução', 'Nova Etiqueta', 'Acao'].map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendenciasDev.map((p: any) => {
                      const ult = p.devolucoes?.[0];
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'Geist Mono, monospace', fontWeight: 600, color: '#2563eb' }}>{p.idPeca}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{p.moto?.marca} {p.moto?.modelo}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{p.moto?.renavam || '—'}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{p.moto?.placa || '—'}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11 }}>
                            {ult?.etiquetasDetran
                              ? <span style={{ padding: '2px 6px', borderRadius: 6, ...(ult.etiquetaBaixada ? { background: '#fef2f2', color: '#dc2626' } : { background: '#fef3c7', color: '#92400e' }) }}>{ult.etiquetasDetran}</span>
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11 }}>{ult?.pedidoBlingNum || '—'}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{ult?.dataDevolucao ? new Date(ult.dataDevolucao).toLocaleDateString('pt-BR') : '—'}</td>
                          <td style={{ padding: '8px 12px', minWidth: 150 }}>
                            <input
                              style={{ ...s.input, width: '100%', boxSizing: 'border-box', textTransform: 'uppercase' }}
                              placeholder="Nova etiqueta"
                              value={novasEtiquetasDev[p.id] || ''}
                              onChange={(e) => setNovasEtiquetasDev((prev) => ({ ...prev, [p.id]: e.target.value.toUpperCase() }))}
                              disabled={salvandoPendenciaDev === p.id}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => salvarNovaEtiquetaDevolucao(p)}
                              disabled={salvandoPendenciaDev === p.id || !String(novasEtiquetasDev[p.id] || '').trim()}
                              style={{ ...s.btn, padding: '6px 12px', background: '#16a34a', color: '#fff', opacity: salvandoPendenciaDev === p.id || !String(novasEtiquetasDev[p.id] || '').trim() ? 0.65 : 1 }}
                            >
                              {salvandoPendenciaDev === p.id ? 'Salvando...' : 'Salvar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
