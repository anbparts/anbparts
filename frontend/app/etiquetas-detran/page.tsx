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
  'Pendente Ativação': { bg: '#fff7ed', color: '#c2410c' },
  'Pré-Cadastro': { bg: '#eff6ff', color: '#2563eb' },
  '-': { bg: '#f1f5f9', color: '#94a3b8' },
};

const ATIVACAO_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'descricao', label: 'Descricao' },
  { key: 'tipoPeca', label: 'Tipo de Peca' },
  { key: 'etiqueta', label: 'Nº Peca Avulsa' },
  { key: 'renavam', label: 'Renavam' },
  { key: 'placa', label: 'Placa' },
  { key: 'chassi', label: 'Chassi' },
  { key: 'notaFiscalEntrada', label: 'NF Entrada' },
];

const TIPO_ETQ_COLORS: Record<string, { bg: string; color: string }> = {
  Cartela: { bg: '#eff6ff', color: '#1d4ed8' },
  Avulsa: { bg: '#faf5ff', color: '#7c3aed' },
};

const DETRAN_TIPOS = [
  'Balança', 'Banco', 'Bengala direita', 'Bengala esquerda', 'Bloco do motor',
  'Cabeçote', 'Carburador', 'Carenagem direita', 'Carenagem esquerda',
  'Carenagem frontal', 'Carenagem traseira', 'Estribo', 'Farol',
  'Guidão / semi-guidão', 'Lanterna', 'Mesa', 'Módulo de injeção/CDI',
  'Motor de arranque', 'Painel', 'Para-lama dianteiro', 'Para-lama traseiro',
  'Pedaleira direita', 'Pedaleira esquerda', 'Retrovisor direito',
  'Retrovisor esquerdo', 'Roda dianteira', 'Roda traseira', 'Tanque',
  'Cardã', 'Cavalete lateral', 'Corpo de injeção', 'Diferencial',
  'Escapamento', 'Radiador',
];

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
  const [modalAtivacao, setModalAtivacao] = useState(false);
  const [ativacoes, setAtivacoes] = useState<any[]>([]);
  const [loadingAtivacoes, setLoadingAtivacoes] = useState(false);
  const [modalResumo, setModalResumo] = useState(false);
  const [resumoLoading, setResumoLoading] = useState(false);
  const [resumo, setResumo] = useState<{ totais: any; itens: any[] } | null>(null);
  const [modalAtivar, setModalAtivar] = useState<any | null>(null);
  const [confirmandoAtivacao, setConfirmandoAtivacao] = useState<string | null>(null);
  const [pendenciasDevOpen, setPendenciasDevOpen] = useState(false);
  const [pendenciasDev, setPendenciasDev] = useState<any[]>([]);
  const [loadingPendenciasDev, setLoadingPendenciasDev] = useState(false);
  const [novasEtiquetasDev, setNovasEtiquetasDev] = useState<Record<number, string>>({});
  const [salvandoPendenciaDev, setSalvandoPendenciaDev] = useState<number | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'sku', dir: 'asc' });
  const [editTipoPeca, setEditTipoPeca] = useState<{ pecaId: number; isPreCadastro: boolean; currentTipo: string; etiqueta: string; sku: string } | null>(null);
  const [editTipoSelecionado, setEditTipoSelecionado] = useState('');
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const [pendenciasSort, setPendenciasSort] = useState<SortState>({ key: 'dataVenda', dir: 'desc' });
  const [isPhone, setIsPhone] = useState(false);
  const [modalValidacao, setModalValidacao] = useState(false);
  const [validacaoLoading, setValidacaoLoading] = useState(false);
  const [validacaoResult, setValidacaoResult] = useState<any>(null);
  const [validacaoFiltro, setValidacaoFiltro] = useState('todos');
  const [validacaoTexto, setValidacaoTexto] = useState('');
  const [modalValidacaoBaixa, setModalValidacaoBaixa] = useState(false);
  const [validacaoBaixaLoading, setValidacaoBaixaLoading] = useState(false);
  const [validacaoBaixaResult, setValidacaoBaixaResult] = useState<any>(null);
  const [validacaoBaixaFiltro, setValidacaoBaixaFiltro] = useState('todos');
  const [validacaoBaixaTexto, setValidacaoBaixaTexto] = useState('');
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

  async function salvarTipoPeca() {
    if (!editTipoPeca || !editTipoSelecionado) return;
    setSalvandoTipo(true);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/${editTipoPeca.pecaId}/tipo-peca`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipoPeca: editTipoSelecionado, isPreCadastro: editTipoPeca.isPreCadastro }),
      });
      if (!resp.ok) throw new Error('Erro ao salvar');
      setLinhas((prev) => prev.map((l) =>
        l.pecaId === editTipoPeca.pecaId && l.etiqueta === editTipoPeca.etiqueta
          ? { ...l, tipoPeca: editTipoSelecionado }
          : l
      ));
      setEditTipoPeca(null);
    } catch (e: any) { alert(e.message || 'Erro ao salvar'); }
    setSalvandoTipo(false);
  }

  async function rodarValidacaoDetran(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setValidacaoLoading(true);
    setValidacaoResult(null);
    setValidacaoFiltro('todos');
    setValidacaoTexto('');
    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
      const linhasDetran = rows.map((row: any) => {
        const keys = Object.keys(row);
        const find = (pat: RegExp) => { const k = keys.find(k => pat.test(norm(k))); return k ? String(row[k] || '').trim() : ''; };
        const saldoStr = find(/saldo/);
        return {
          etiqueta: find(/etiqueta/),
          descricao: find(/descri/),
          saldo: saldoStr !== '' ? (Number(saldoStr) || 0) : 1,
          modelo: find(/modelo/),
          placa: find(/placa/),
          chassis: find(/chassis|chassi/),
          dtEntrada: find(/entrada/),
        };
      }).filter((r: any) => r.etiqueta);

      if (!linhasDetran.length) throw new Error('Nenhuma etiqueta encontrada. Verifique se o arquivo é o export correto do DETRAN.');

      const resp = await fetch(`${API}/etiquetas-detran/validar`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhasDetran }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro na validação');
      setValidacaoResult(data);
    } catch (err: any) {
      alert(err.message || 'Erro ao processar arquivo');
    }
    setValidacaoLoading(false);
  }

  async function rodarValidacaoDetranBaixa(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setValidacaoBaixaLoading(true);
    setValidacaoBaixaResult(null);
    setValidacaoBaixaFiltro('todos');
    setValidacaoBaixaTexto('');
    try {
      const XLSX = await import('xlsx');
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
      const linhasBaixa = rows.map((row: any) => {
        const keys = Object.keys(row);
        const find = (pat: RegExp) => { const k = keys.find(k => pat.test(norm(k))); return k ? row[k] : undefined; };
        const quantidadeRaw = find(/quantidade/);
        const dataRaw = find(/^data$|data /);
        return {
          etiqueta: String(find(/etiqueta/) || '').trim(),
          documentoComprador: String(find(/documento/) || '').trim(),
          nomeComprador: String(find(/nome|razao/) || '').trim(),
          pecaDescricao: String(find(/peca/) || '').trim(),
          quantidade: quantidadeRaw !== '' ? (Number(quantidadeRaw) || 0) : undefined,
          data: dataRaw instanceof Date ? dataRaw.toLocaleDateString('pt-BR') : String(dataRaw || '').trim(),
          realizadoPor: String(find(/realizado/) || '').trim(),
          pecaFusao: String(find(/fusao|fusão/) || '').trim(),
        };
      }).filter((r: any) => r.etiqueta);

      if (!linhasBaixa.length) throw new Error('Nenhuma etiqueta encontrada. Verifique se o arquivo é o export correto de baixas do DETRAN.');

      const resp = await fetch(`${API}/etiquetas-detran/validar-baixa`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhasBaixa }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro na validação');
      setValidacaoBaixaResult(data);
    } catch (err: any) {
      alert(err.message || 'Erro ao processar arquivo');
    }
    setValidacaoBaixaLoading(false);
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
      // Remove só a etiqueta confirmada (uma peça "Par" tem 2 etiquetas, cada uma baixa sozinha).
      setPendencias((prev) => prev.filter((p) => !(p.pecaId === linha.pecaId && p.etiqueta === linha.etiqueta)));
      await buscar();
    } catch {}
    setConfirmando(null);
  }

  async function abrirPendenciasAtivacao() {
    if (!canProcessarBaixa) {
      alert('Seu usuario nao tem permissao para processar etiquetas Detran.');
      return;
    }
    setModalAtivacao(true);
    setLoadingAtivacoes(true);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/pendencias-ativacao`, { credentials: 'include' });
      const data = await resp.json();
      setAtivacoes(data.linhas || []);
    } catch {
      setAtivacoes([]);
    }
    setLoadingAtivacoes(false);
  }

  function abrirModalAtivar(linha: any) {
    if (!canProcessarBaixa) {
      alert('Seu usuario nao tem permissao para processar etiquetas Detran.');
      return;
    }
    setModalAtivar(linha);
    setComprovanteDataUrl(null);
    setComprovanteNome('');
  }

  async function confirmarAtivacao() {
    if (!modalAtivar || !canProcessarBaixa) return;
    const linha = modalAtivar;
    const key = `${linha.pecaId}|${linha.etiqueta}`;
    setConfirmandoAtivacao(key);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/${linha.pecaId}/confirmar-ativacao`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etiqueta: linha.etiqueta,
          comprovanteNome:    comprovanteNome    || null,
          comprovanteArquivo: comprovanteDataUrl || null,
        }),
      });
      if (!resp.ok) throw new Error('Erro ao confirmar ativacao');
      setModalAtivar(null);
      // Remove só a etiqueta confirmada (uma peça pode ter mais de uma etiqueta avulsa).
      setAtivacoes((prev) => prev.filter((p) => !(p.pecaId === linha.pecaId && p.etiqueta === linha.etiqueta)));
      await buscar();
    } catch {}
    setConfirmandoAtivacao(null);
  }

  // Abre o comprovante (registro da avulsa ou baixa) em nova aba; avisa se nao houver anexo.
  async function abrirComprovante(linha: any, tipo: 'ativacao' | 'baixa') {
    if (linha.isPreCadastro) {
      alert('Nenhum comprovante anexado (etiqueta ainda em pré-cadastro).');
      return;
    }
    try {
      const url = `${API}/etiquetas-detran/comprovante?pecaId=${encodeURIComponent(linha.pecaId)}&etiqueta=${encodeURIComponent(linha.etiqueta)}&tipo=${tipo}`;
      const resp = await fetch(url, { credentials: 'include' });
      if (resp.status === 404) {
        alert('Nenhum comprovante anexado para esta etiqueta.');
        return;
      }
      if (!resp.ok) throw new Error('Erro ao buscar comprovante');
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e: any) {
      alert(e?.message || 'Erro ao abrir comprovante.');
    }
  }

  async function abrirPendenciasDev() {
    setPendenciasDevOpen(true);
    setLoadingPendenciasDev(true);
    setNovasEtiquetasDev({});
    try {
      const resp = await fetch(`${API}/devolucoes/pendentes-etiqueta`, { credentials: 'include' });
      const data = await resp.json();
      setPendenciasDev(data.pecas || []);
    } catch { setPendenciasDev([]); }
    setLoadingPendenciasDev(false);
  }

  async function abrirVerificarPendencias() {
    setModalResumo(true);
    setResumoLoading(true);
    setResumo(null);
    try {
      const resp = await fetch(`${API}/etiquetas-detran/pendencias-resumo`, { credentials: 'include' });
      const data = await resp.json();
      setResumo({ totais: data.totais || {}, itens: data.itens || [] });
    } catch { setResumo({ totais: {}, itens: [] }); }
    setResumoLoading(false);
  }

  function irParaFluxoPendencia(tipo: string) {
    setModalResumo(false);
    if (tipo === 'baixa') abrirPendencias();
    else if (tipo === 'ativacao') abrirPendenciasAtivacao();
    else if (tipo === 'devolucao') abrirPendenciasDev();
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Etiquetas Detran</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
              {loading ? 'Carregando...' : `${linhas.length} etiqueta(s) encontrada(s)`}
            </div>
          </div>
          {canProcessarBaixa && (
          <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={abrirVerificarPendencias}>
            ✓ Verificar Pendências
          </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexDirection: isPhone ? 'column' : 'row', width: isPhone ? '100%' : undefined }}>
          {canProcessarBaixa && (
          <button style={{ ...s.btn, background: '#7c3aed', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={abrirPendencias}>
            Pendencias Baixa
          </button>
          )}
          {canProcessarBaixa && (
          <button style={{ ...s.btn, background: '#c2410c', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={abrirPendenciasAtivacao}>
            Pendencias Etiqueta Avulsa
          </button>
          )}
          {canProcessarDevolucao && (
          <button style={{ ...s.btn, background: '#2563eb', color: '#fff', width: isPhone ? '100%' : undefined }} onClick={abrirPendenciasDev}>
            Pendências Devolução
          </button>
          )}
          <label style={{ ...s.btn, background: '#059669', color: '#fff', width: isPhone ? '100%' : undefined, cursor: validacaoLoading ? 'wait' : 'pointer', opacity: validacaoLoading ? 0.7 : 1 }}>
            {validacaoLoading ? 'Processando...' : 'Validação Detran - Ativa'}
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} disabled={validacaoLoading} onChange={(e) => { setModalValidacao(true); rodarValidacaoDetran(e); }} />
          </label>
          <label style={{ ...s.btn, background: '#dc2626', color: '#fff', width: isPhone ? '100%' : undefined, cursor: validacaoBaixaLoading ? 'wait' : 'pointer', opacity: validacaoBaixaLoading ? 0.7 : 1 }}>
            {validacaoBaixaLoading ? 'Processando...' : 'Validação Detran - Baixada'}
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} disabled={validacaoBaixaLoading} onChange={(e) => { setModalValidacaoBaixa(true); rodarValidacaoDetranBaixa(e); }} />
          </label>
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
                <option value="pre-cadastro">Pré-Cadastro</option>
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
                        {linha.status === 'Baixada' ? (
                          <button type="button" onClick={() => abrirComprovante(linha, 'baixa')}
                            title="Abrir comprovante de baixa"
                            style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: stColors.bg, color: stColors.color, border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                            {linha.status}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: stColors.bg, color: stColors.color }}>
                            {linha.status || '-'}
                          </span>
                        )}
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
                        {linha.tipoEtiqueta === 'Avulsa' ? (
                          <button type="button" onClick={() => abrirComprovante(linha, 'ativacao')}
                            title="Abrir comprovante de registro da etiqueta avulsa"
                            style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color, border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                            {linha.tipoEtiqueta}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color }}>{linha.tipoEtiqueta}</span>
                        )}
                      </div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Peça</div>
                        {linha.tipoEtiqueta === 'Avulsa' ? (
                          <button type="button" onClick={() => { setEditTipoPeca({ pecaId: linha.pecaId, isPreCadastro: !!linha.isPreCadastro, currentTipo: linha.tipoPeca || '', etiqueta: linha.etiqueta, sku: linha.sku }); setEditTipoSelecionado(DETRAN_TIPOS.includes(linha.tipoPeca) ? linha.tipoPeca : ''); }}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5, color: '#7c3aed', textDecoration: 'underline', textAlign: 'left', fontFamily: 'inherit' }}>
                            {linha.tipoPeca || 'Definir tipo ✏️'}
                          </button>
                        ) : (
                          <div style={{ fontSize: 11.5, color: 'var(--gray-700)' }}>{linha.tipoPeca || '-'}</div>
                        )}
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
                        {linha.tipoEtiqueta === 'Avulsa' ? (
                          <button type="button" onClick={() => abrirComprovante(linha, 'ativacao')}
                            title="Abrir comprovante de registro da etiqueta avulsa"
                            style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color, border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                            {linha.tipoEtiqueta}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: etqColors.bg, color: etqColors.color }}>
                            {linha.tipoEtiqueta}
                          </span>
                        )}
                      </td>
                      <td style={s.td}>
                        {linha.tipoEtiqueta === 'Avulsa' ? (
                          <button type="button" onClick={() => { setEditTipoPeca({ pecaId: linha.pecaId, isPreCadastro: !!linha.isPreCadastro, currentTipo: linha.tipoPeca || '', etiqueta: linha.etiqueta, sku: linha.sku }); setEditTipoSelecionado(DETRAN_TIPOS.includes(linha.tipoPeca) ? linha.tipoPeca : ''); }}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: '#7c3aed', textDecoration: 'underline', textAlign: 'left', fontFamily: 'inherit' }}>
                            {linha.tipoPeca || 'Definir tipo ✏️'}
                          </button>
                        ) : (linha.tipoPeca || '-')}
                      </td>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{linha.etiqueta}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                          {linha.status === 'Baixada' ? (
                            <button type="button" onClick={() => abrirComprovante(linha, 'baixa')}
                              title="Abrir comprovante de baixa"
                              style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color, border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                              {linha.status}
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: stColors.bg, color: stColors.color }}>
                              {linha.status || '-'}
                            </span>
                          )}
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

      {/* Modal editar Tipo de Peça (avulsa) */}
      {editTipoPeca && (
        <div onClick={() => setEditTipoPeca(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Editar Tipo de Peça</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                <span style={{ fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>{editTipoPeca.sku}</span>
                {' · '}{editTipoPeca.etiqueta}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 6 }}>Tipo de Peça</label>
              <select
                style={{ ...s.select, width: '100%', boxSizing: 'border-box' as const }}
                value={editTipoSelecionado}
                onChange={e => setEditTipoSelecionado(e.target.value)}
              >
                <option value="">Selecione...</option>
                {DETRAN_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditTipoPeca(null)}
                style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={salvarTipoPeca} disabled={!editTipoSelecionado || salvandoTipo}
                style={{ ...s.btn, background: '#7c3aed', color: '#fff', fontSize: 13, opacity: (!editTipoSelecionado || salvandoTipo) ? 0.6 : 1 }}>
                {salvandoTipo ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div>Nenhuma pendência de baixa encontrada</div>
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
      {/* Modal Verificar Pendências (resumo das 3) */}
      {modalResumo && (() => {
        const TIPOS: Record<string, { label: string; bg: string; c: string }> = {
          baixa:     { label: 'Baixa',     bg: '#f3e8ff', c: '#7c3aed' },
          ativacao:  { label: 'Ativação',  bg: '#ffedd5', c: '#c2410c' },
          devolucao: { label: 'Devolução', bg: '#dbeafe', c: '#2563eb' },
        };
        const ordem: Record<string, number> = { baixa: 0, ativacao: 1, devolucao: 2 };
        const itens = [...(resumo?.itens || [])].sort((a, b) => (ordem[a.tipo] - ordem[b.tipo]) || String(a.sku).localeCompare(String(b.sku), 'pt-BR', { numeric: true }));
        const t = resumo?.totais || {};
        const card = (label: string, valor: number, cor: { bg: string; c: string }, tipo?: string) => (
          <div onClick={tipo ? () => irParaFluxoPendencia(tipo) : undefined}
            style={{ background: cor.bg, borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 120, cursor: tipo ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: cor.c, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: cor.c, marginTop: 2 }}>{valor || 0}</div>
          </div>
        );
        return (
          <div onClick={() => setModalResumo(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 320, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 12, width: isPhone ? '100%' : 'min(900px, calc(100vw - 48px))', maxHeight: isPhone ? '100dvh' : '88vh', minHeight: isPhone ? '100dvh' : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(2,6,23,0.28)', border: '1px solid var(--border)' }}>
              <div style={{ padding: isPhone ? '14px' : '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-800)' }}>Verificar Pendências</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                    {resumoLoading ? 'Verificando baixa, ativação e devolução...' : `${t.total || 0} pendência(s) no total · clique em "Ver" para abrir o fluxo`}
                  </div>
                </div>
                <button onClick={() => setModalResumo(false)} style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-600)', border: '1px solid var(--border)' }}>Fechar</button>
              </div>

              <div style={{ overflow: 'auto', flex: 1, background: 'var(--white)', padding: isPhone ? 12 : 18 }}>
                {resumoLoading ? (
                  <div style={{ textAlign: 'center', padding: 50, color: 'var(--gray-400)' }}>Carregando...</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                      {card('Baixa', t.baixa, TIPOS.baixa, t.baixa ? 'baixa' : undefined)}
                      {card('Ativação', t.ativacao, TIPOS.ativacao, t.ativacao ? 'ativacao' : undefined)}
                      {card('Devolução', t.devolucao, TIPOS.devolucao, t.devolucao ? 'devolucao' : undefined)}
                      {card('Total', t.total, { bg: 'var(--gray-100)', c: 'var(--gray-700)' })}
                    </div>
                    {itens.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: 'var(--green)', fontWeight: 700 }}>✓ Nenhuma pendência. Tudo em dia!</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          <th style={{ ...s.th, textAlign: 'left' }}>SKU</th>
                          <th style={{ ...s.th, textAlign: 'left' }}>Descrição</th>
                          <th style={{ ...s.th, textAlign: 'left' }}>Etiqueta</th>
                          <th style={s.th}>Tipo</th>
                          <th style={s.th}>Ação</th>
                        </tr></thead>
                        <tbody>
                          {itens.map((it, i) => {
                            const cor = TIPOS[it.tipo] || TIPOS.baixa;
                            return (
                              <tr key={`${it.tipo}-${it.pecaId}-${it.etiqueta}-${i}`} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                                <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{it.sku}</td>
                                <td style={{ ...s.td, fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.descricao}>{it.descricao}</td>
                                <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{it.etiqueta}</td>
                                <td style={{ ...s.td, textAlign: 'center' }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: cor.bg, color: cor.c }}>{cor.label}</span>
                                </td>
                                <td style={{ ...s.td, textAlign: 'center' }}>
                                  <button onClick={() => irParaFluxoPendencia(it.tipo)}
                                    style={{ ...s.btn, fontSize: 11, padding: '4px 12px', background: 'var(--white)', border: '1px solid var(--border)', color: cor.c }}>Ver →</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {/* Modal Pendências Etiqueta Avulsa (Ativação) */}
      {modalAtivacao && (
        <div onClick={() => setModalAtivacao(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 320, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 12, width: isPhone ? '100%' : 'min(1320px, calc(100vw - 48px))', maxHeight: isPhone ? '100dvh' : '88vh', minHeight: isPhone ? '100dvh' : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: isPhone ? 'none' : '0 24px 70px rgba(2, 6, 23, 0.28)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ padding: isPhone ? '14px' : '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12, background: 'var(--white)', flexDirection: isPhone ? 'column' : 'row' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-800)' }}>Pendencias de Ativação — Etiqueta Avulsa</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                  {loadingAtivacoes ? 'Carregando...' : `${ativacoes.length} etiqueta(s) avulsa(s) pendente(s) de ativação (cadastro nos últimos 30 dias)`}
                </div>
              </div>
              <button onClick={() => setModalAtivacao(false)}
                style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-600)', border: '1px solid var(--border)', width: isPhone ? '100%' : undefined }}>
                Fechar
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1, background: 'var(--white)' }}>
              {loadingAtivacoes ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Carregando etiquetas avulsas...</div>
              ) : ativacoes.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div>Nenhuma etiqueta avulsa pendente de ativação</div>
                </div>
              ) : isPhone ? (
                <div style={{ padding: 12, display: 'grid', gap: 10, background: '#f8fafc' }}>
                  {ativacoes.map((linha) => {
                    const key = `${linha.pecaId}|${linha.etiqueta}`;
                    return (
                      <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)', padding: 12, display: 'grid', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 700, color: '#c2410c' }}>{linha.sku}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', marginTop: 3, lineHeight: 1.25 }}>{linha.descricao || '-'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 2 }}>{linha.motoLabel || '-'}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[['Tipo de Peça', linha.tipoPeca], ['Nº Peça Avulsa', linha.etiqueta], ['Placa', linha.placa], ['Chassi', linha.chassi], ['Renavam', linha.renavam], ['NF Entrada', linha.notaFiscalEntrada]].map(([lbl, val]) => (
                            <div key={String(lbl)} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                              <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>{lbl}</div>
                              <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{val || '-'}</div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => abrirModalAtivar(linha)} disabled={confirmandoAtivacao === key}
                          style={{ ...s.btn, background: '#c2410c', color: '#fff', padding: '9px 12px', fontSize: 12, opacity: confirmandoAtivacao === key ? 0.6 : 1, width: '100%' }}>
                          {confirmandoAtivacao === key ? 'Salvando...' : 'Confirmar Ativação'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {ATIVACAO_COLUMNS.map((c) => <th key={c.key} style={s.th}>{c.label}</th>)}
                      <th style={s.th}>Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativacoes.map((linha, i) => {
                      const key = `${linha.pecaId}|${linha.etiqueta}`;
                      return (
                        <tr key={key} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{linha.sku}</td>
                          <td style={{ ...s.td, fontSize: 12, lineHeight: 1.25, maxWidth: 240 }}>{linha.descricao || '-'}</td>
                          <td style={{ ...s.td, fontSize: 12 }}>{linha.tipoPeca || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>{linha.etiqueta}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.renavam || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.placa || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.chassi || '-'}</td>
                          <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{linha.notaFiscalEntrada || '-'}</td>
                          <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                            <button onClick={() => abrirModalAtivar(linha)} disabled={confirmandoAtivacao === key}
                              style={{ ...s.btn, background: '#c2410c', color: '#fff', padding: '5px 12px', fontSize: 12, opacity: confirmandoAtivacao === key ? 0.6 : 1 }}>
                              {confirmandoAtivacao === key ? 'Salvando...' : 'Confirmar Ativação'}
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
      {/* Modal de Confirmação de Ativação */}
      {modalAtivar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 500, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 24, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: isPhone ? 0 : 14, width: '100%', maxWidth: isPhone ? undefined : 480, minHeight: isPhone ? '100dvh' : undefined, boxShadow: isPhone ? 'none' : '0 16px 40px rgba(0,0,0,.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: isPhone ? '16px 14px' : '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Confirmar Ativação de Etiqueta Avulsa</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>{modalAtivar.sku} — {modalAtivar.etiqueta}</div>
            </div>
            <div style={{ padding: isPhone ? 14 : '18px 22px', flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
                Confirma que esta etiqueta avulsa foi ativada (entrada) no DETRAN? Você pode anexar o comprovante (opcional).
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--gray-50)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 8 }}>COMPROVANTE (opcional)</div>
                {comprovanteDataUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>✓ {comprovanteNome}</span>
                    <button onClick={() => { setComprovanteDataUrl(null); setComprovanteNome(''); }}
                      style={{ ...s.btn, fontSize: 11, padding: '4px 10px', color: 'var(--red-light)', borderColor: 'var(--red-light)' }}>Remover</button>
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
              <button onClick={() => setModalAtivar(null)} style={{ ...s.btn, color: 'var(--ink-soft)', width: isPhone ? '100%' : undefined }}>Cancelar</button>
              <button onClick={confirmarAtivacao} disabled={!!confirmandoAtivacao}
                style={{ ...s.btn, background: '#c2410c', color: '#fff', opacity: confirmandoAtivacao ? 0.7 : 1, width: isPhone ? '100%' : undefined }}>
                {confirmandoAtivacao ? 'Salvando...' : 'Confirmar Ativação'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Validação DETRAN */}
      {modalValidacao && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(2,6,23,0.3)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Validação DETRAN</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  {validacaoLoading ? 'Processando arquivo e consultando sistema...' : validacaoResult ? `${validacaoResult.resumo.totalDetran} etiquetas no DETRAN · ${validacaoResult.resumo.totalAnb} no ANB` : 'Selecione um arquivo Excel exportado do DETRAN'}
                </div>
              </div>
              <button onClick={() => setModalValidacao(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            {validacaoLoading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 60 }}>
                <div style={{ fontSize: 32 }}>⏳</div>
                <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>Processando e cruzando dados...</div>
              </div>
            )}

            {!validacaoLoading && validacaoResult && (() => {
              const { resumo, linhas: todasLinhas } = validacaoResult;
              const SIT_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
                ok:         { label: 'OK',          bg: '#dcfce7', color: '#16a34a' },
                so_detran:  { label: 'Só DETRAN',   bg: '#ffedd5', color: '#ea580c' },
                so_anb:     { label: 'Só ANB',      bg: '#dbeafe', color: '#2563eb' },
                divergencia:{ label: 'Divergência', bg: '#fee2e2', color: '#dc2626' },
              };
              const filtradas = todasLinhas.filter((l: any) => {
                if (validacaoFiltro !== 'todos' && l.situacao !== validacaoFiltro) return false;
                if (validacaoTexto) {
                  const txt = validacaoTexto.toLowerCase();
                  return (l.etiqueta || '').toLowerCase().includes(txt)
                    || (l.anbSku || '').toLowerCase().includes(txt)
                    || (l.anbDescricao || '').toLowerCase().includes(txt)
                    || (l.detranModelo || '').toLowerCase().includes(txt)
                    || (l.detranPlaca || '').toLowerCase().includes(txt)
                    || (l.motoPrefixo || '').toLowerCase().includes(txt)
                    || (l.tipoPeca || '').toLowerCase().includes(txt)
                    || String(l.motoAnbId || '').includes(txt);
                }
                return true;
              });

              return (
                <>
                  {/* Resumo */}
                  <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Total DETRAN', value: resumo.totalDetran, bg: '#f8fafc', color: '#334155' },
                      { label: 'Total ANB', value: resumo.totalAnb, bg: '#f8fafc', color: '#334155' },
                      { label: 'OK', value: resumo.ok, bg: '#dcfce7', color: '#16a34a' },
                      { label: 'Só DETRAN', value: resumo.soDetran, bg: '#ffedd5', color: '#ea580c' },
                      { label: 'Só ANB', value: resumo.soAnb, bg: '#dbeafe', color: '#2563eb' },
                      { label: 'Divergências', value: resumo.divergencias, bg: '#fee2e2', color: '#dc2626' },
                    ].map(card => (
                      <div key={card.label} style={{ background: card.bg, borderRadius: 8, padding: '8px 14px', minWidth: 90, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                        <div style={{ fontSize: 11, color: card.color, opacity: 0.8, marginTop: 1 }}>{card.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Filtros */}
                  <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { key: 'todos', label: 'Todos' },
                      { key: 'divergencia', label: 'Divergências' },
                      { key: 'so_detran', label: 'Só DETRAN' },
                      { key: 'so_anb', label: 'Só ANB' },
                      { key: 'ok', label: 'OK' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setValidacaoFiltro(f.key)} style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: validacaoFiltro === f.key ? 'var(--ink)' : 'var(--gray-100)', color: validacaoFiltro === f.key ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)' }}>
                        {f.label}
                      </button>
                    ))}
                    <input value={validacaoTexto} onChange={e => setValidacaoTexto(e.target.value)} placeholder="Buscar etiqueta, SKU, modelo, placa..." style={{ ...s.input, flex: 1, minWidth: 200 }} />
                    <span style={{ fontSize: 12, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{filtradas.length} linha(s)</span>
                  </div>
                  {/* Tabela */}
                  <div style={{ overflow: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Etiqueta DETRAN', 'Situação', 'Moto ANB', 'SKU ANB', 'Descrição ANB', 'Tipo de Peça', 'Status ANB', 'Placa DETRAN'].map(col => (
                            <th key={col} style={s.th}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtradas.length === 0 ? (
                          <tr><td colSpan={8} style={{ ...s.td, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Nenhum resultado</td></tr>
                        ) : filtradas.map((l: any, i: number) => {
                          const sit = SIT_CONFIG[l.situacao] || SIT_CONFIG.ok;
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                              <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{l.etiqueta}</td>
                              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: sit.bg, color: sit.color, whiteSpace: 'nowrap' }}>
                                  {sit.label}
                                </span>
                                {l.detalhe && <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>{l.detalhe}</div>}
                              </td>
                              <td style={{ ...s.td, fontSize: 12 }}>
                                {l.motoAnbId ? (
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--gray-700)' }}>#{l.motoAnbId}</div>
                                    {l.motoPrefixo && <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>{l.motoPrefixo}</div>}
                                  </div>
                                ) : '-'}
                              </td>
                              <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{l.anbSku || '-'}</td>
                              <td style={{ ...s.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={l.anbDescricao || ''}>{l.anbDescricao || '-'}</td>
                              <td style={{ ...s.td, fontSize: 12 }}>{l.tipoPeca || '-'}</td>
                              <td style={s.td}>
                                {l.anbStatus ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', ...((STATUS_COLORS as any)[l.anbStatus] || STATUS_COLORS['-']) }}>{l.anbStatus}</span> : '-'}
                              </td>
                              <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{l.detranPlaca || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            {!validacaoLoading && !validacaoResult && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 60 }}>
                <div style={{ fontSize: 32 }}>📊</div>
                <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>Selecione o arquivo Excel exportado do DETRAN para iniciar a validação</div>
                <label style={{ ...s.btn, background: '#059669', color: '#fff', cursor: 'pointer', marginTop: 8 }}>
                  Selecionar arquivo
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={rodarValidacaoDetran} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Validação DETRAN - Baixada */}
      {modalValidacaoBaixa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 1200, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(2,6,23,0.3)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Validação DETRAN — Baixada</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  {validacaoBaixaLoading ? 'Processando arquivo e consultando sistema...' : validacaoBaixaResult ? `${validacaoBaixaResult.resumo.totalPlanilha} baixas na planilha · ${validacaoBaixaResult.resumo.totalAnb} baixadas no ANB` : 'Selecione a planilha de baixas confirmadas no DETRAN'}
                </div>
              </div>
              <button onClick={() => setModalValidacaoBaixa(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            {validacaoBaixaLoading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 60 }}>
                <div style={{ fontSize: 32 }}>⏳</div>
                <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>Processando e cruzando dados...</div>
              </div>
            )}

            {!validacaoBaixaLoading && validacaoBaixaResult && (() => {
              const { resumo, linhas: todasLinhas } = validacaoBaixaResult;
              const SIT_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
                ok:          { label: 'OK',           bg: '#dcfce7', color: '#16a34a' },
                so_planilha: { label: 'Só Planilha',  bg: '#fee2e2', color: '#dc2626' },
                so_anb:      { label: 'Só ANB',       bg: '#dbeafe', color: '#2563eb' },
              };
              const filtradas = todasLinhas.filter((l: any) => {
                if (validacaoBaixaFiltro !== 'todos' && l.situacao !== validacaoBaixaFiltro) return false;
                if (validacaoBaixaTexto) {
                  const txt = validacaoBaixaTexto.toLowerCase();
                  return (l.etiqueta || '').toLowerCase().includes(txt)
                    || (l.anbSku || '').toLowerCase().includes(txt)
                    || (l.anbDescricao || '').toLowerCase().includes(txt)
                    || (l.tipoPeca || '').toLowerCase().includes(txt)
                    || (l.motoPrefixo || '').toLowerCase().includes(txt)
                    || (l.planilhaNomeComprador || '').toLowerCase().includes(txt)
                    || String(l.motoAnbId || '').includes(txt);
                }
                return true;
              });

              return (
                <>
                  {/* Resumo */}
                  <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Total Planilha', value: resumo.totalPlanilha, bg: '#f8fafc', color: '#334155' },
                      { label: 'Total Baixadas ANB', value: resumo.totalAnb, bg: '#f8fafc', color: '#334155' },
                      { label: 'OK', value: resumo.ok, bg: '#dcfce7', color: '#16a34a' },
                      { label: 'Só Planilha', value: resumo.soPlanilha, bg: '#fee2e2', color: '#dc2626' },
                      { label: 'Só ANB', value: resumo.soAnb, bg: '#dbeafe', color: '#2563eb' },
                    ].map(card => (
                      <div key={card.label} style={{ background: card.bg, borderRadius: 8, padding: '8px 14px', minWidth: 90, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                        <div style={{ fontSize: 11, color: card.color, opacity: 0.8, marginTop: 1 }}>{card.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Filtros */}
                  <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { key: 'todos', label: 'Todos' },
                      { key: 'so_planilha', label: 'Só Planilha' },
                      { key: 'so_anb', label: 'Só ANB' },
                      { key: 'ok', label: 'OK' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setValidacaoBaixaFiltro(f.key)} style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: validacaoBaixaFiltro === f.key ? 'var(--ink)' : 'var(--gray-100)', color: validacaoBaixaFiltro === f.key ? '#fff' : 'var(--gray-600)', border: '1px solid var(--border)' }}>
                        {f.label}
                      </button>
                    ))}
                    <input value={validacaoBaixaTexto} onChange={e => setValidacaoBaixaTexto(e.target.value)} placeholder="Buscar etiqueta, SKU, comprador..." style={{ ...s.input, flex: 1, minWidth: 200 }} />
                    <span style={{ fontSize: 12, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{filtradas.length} linha(s)</span>
                  </div>
                  {/* Tabela */}
                  <div style={{ overflow: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Etiqueta DETRAN', 'Situação', 'Moto ANB', 'SKU ANB', 'Descrição ANB', 'Tipo de Peça', 'Baixada ANB em', 'Comprador', 'Data Baixa (planilha)', 'Peça Fusão'].map(col => (
                            <th key={col} style={s.th}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtradas.length === 0 ? (
                          <tr><td colSpan={10} style={{ ...s.td, textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>Nenhum resultado</td></tr>
                        ) : filtradas.map((l: any, i: number) => {
                          const sit = SIT_CONFIG[l.situacao] || SIT_CONFIG.ok;
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)' }}>
                              <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{l.etiqueta}</td>
                              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: sit.bg, color: sit.color, whiteSpace: 'nowrap' }}>
                                  {sit.label}
                                </span>
                              </td>
                              <td style={{ ...s.td, fontSize: 12 }}>
                                {l.motoAnbId ? (
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--gray-700)' }}>#{l.motoAnbId}</div>
                                    {l.motoPrefixo && <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>{l.motoPrefixo}</div>}
                                  </div>
                                ) : '-'}
                              </td>
                              <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{l.anbSku || '-'}</td>
                              <td style={{ ...s.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={l.anbDescricao || ''}>{l.anbDescricao || '-'}</td>
                              <td style={{ ...s.td, fontSize: 12 }}>{l.tipoPeca || '-'}</td>
                              <td style={{ ...s.td, fontSize: 12, whiteSpace: 'nowrap' }}>{l.anbBaixadaEm ? new Date(l.anbBaixadaEm).toLocaleDateString('pt-BR') : '-'}</td>
                              <td style={{ ...s.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={l.planilhaNomeComprador || ''}>{l.planilhaNomeComprador || '-'}</td>
                              <td style={{ ...s.td, fontSize: 12, whiteSpace: 'nowrap' }}>{l.planilhaData || '-'}</td>
                              <td style={{ ...s.td, fontSize: 12 }}>{l.planilhaPecaFusao || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            {!validacaoBaixaLoading && !validacaoBaixaResult && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 60 }}>
                <div style={{ fontSize: 32 }}>📊</div>
                <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>Selecione a planilha de baixas confirmadas no DETRAN para iniciar a validação</div>
                <label style={{ ...s.btn, background: '#dc2626', color: '#fff', cursor: 'pointer', marginTop: 8 }}>
                  Selecionar arquivo
                  <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={rodarValidacaoDetranBaixa} />
                </label>
              </div>
            )}
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
              ) : (
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
                  {pendenciasDev.map((p: any) => {
                    const ult = p.devolucoes?.[0];
                    const isSaving = salvandoPendenciaDev === p.id;
                    const canSave = !isSaving && !!String(novasEtiquetasDev[p.id] || '').trim();
                    return (
                      <div key={p.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>

                        {/* ── Linha 1: SKU + Descrição ── */}
                        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 700, color: '#2563eb', flexShrink: 0, marginTop: 1 }}>{p.idPeca}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', lineHeight: 1.4 }}>{p.descricao}</span>
                        </div>

                        {/* ── Linha 2: Moto | Renavam | Placa ── */}
                        <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : '2fr 1.2fr 1fr', gap: 12, borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Moto</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>{p.moto?.marca} {p.moto?.modelo}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Renavam</div>
                            <div style={{ fontSize: 12, fontFamily: 'Geist Mono, monospace', color: 'var(--gray-700)' }}>{p.moto?.renavam || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Placa</div>
                            <div style={{ fontSize: 12, fontFamily: 'Geist Mono, monospace', color: 'var(--gray-700)' }}>{p.moto?.placa || '—'}</div>
                          </div>
                        </div>

                        {/* ── Linha 3: Etiqueta Anterior | Pedido | Data Devolução ── */}
                        <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : '2fr 1.2fr 1fr', gap: 12, borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Etiqueta Anterior</div>
                            {ult?.etiquetasDetran
                              ? <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, padding: '2px 7px', borderRadius: 6, display: 'inline-block', ...(ult.etiquetaBaixada ? { background: '#fef2f2', color: '#dc2626' } : { background: '#fef3c7', color: '#92400e' }) }}>{ult.etiquetasDetran}</span>
                              : <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>—</span>}
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Pedido</div>
                            <div style={{ fontSize: 12, fontFamily: 'Geist Mono, monospace', color: 'var(--gray-700)' }}>{ult?.pedidoBlingNum || '—'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Data Devolução</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-700)' }}>{ult?.dataDevolucao ? new Date(ult.dataDevolucao).toLocaleDateString('pt-BR') : '—'}</div>
                          </div>
                        </div>

                        {/* ── Linha 4: Nova etiqueta + botão ── */}
                        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                          <input
                            style={{ ...s.input, flex: 1, textTransform: 'uppercase', letterSpacing: '.05em' }}
                            placeholder="Nova etiqueta Detran"
                            value={novasEtiquetasDev[p.id] || ''}
                            onChange={(e) => setNovasEtiquetasDev((prev) => ({ ...prev, [p.id]: e.target.value.toUpperCase() }))}
                            disabled={isSaving}
                          />
                          <button
                            type="button"
                            onClick={() => salvarNovaEtiquetaDevolucao(p)}
                            disabled={!canSave}
                            style={{ ...s.btn, background: '#16a34a', color: '#fff', padding: '8px 20px', flexShrink: 0, opacity: canSave ? 1 : 0.5 }}
                          >
                            {isSaving ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
