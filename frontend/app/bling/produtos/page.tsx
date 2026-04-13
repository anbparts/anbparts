'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
};

type Defaults = {
  fretePadrao: number;
  taxaPadraoPct: number;
};

type Item = {
  id: number;
  sku: string;
  nome: string;
  localizacao?: string | null;
  preco: number;
  qtdEstoque: number;
  motoId: number | null;
  moto: string | null;
  jaExiste: boolean;
  semPrefixo: boolean;
  _motoId?: string;
  _preco?: string;
  _frete?: string;
  _taxaPct?: string;
  _taxaVal?: string;
  _valorLiq?: string;
  _qtd?: string;
  _importando?: boolean;
  _importado?: boolean;
  _ignorado?: boolean;
  _erro?: string;
};

type Divergencia = {
  sku: string;
  tipo: string;
  titulo: string;
  detalhe: string;
  estoqueAnb: number;
  estoqueBling: number;
  qtdTotalAnb: number;
  qtdVendidasAnb: number;
  qtdPrejuizoAnb?: number;
  idsPecaPrejuizo?: string[];
  motivosPrejuizo?: string[];
  descricaoAnb: string | null;
  descricaoBling: string | null;
  moto: string | null;
  statusMercadoLivre?: string | null;
  statusMercadoLivreAtivo?: boolean | null;
};

type Comparacao = {
  ok?: boolean;
  error?: string;
  totalConsultados: number;
  totalDivergencias: number;
  totalSemDivergencia: number;
  divergencias: Divergencia[];
  warnings?: string[];
};

type ConfiguracaoConsultaManual = {
  consultaManualTamanhoLote?: number;
  consultaManualPausaMs?: number;
};

type TraceComparacaoResponse = {
  ok?: boolean;
  error?: string;
  comparacao?: Comparacao;
  warnings?: string[];
};

type CsvLinha = {
  id?: string;
  codigo: string;
  descricao: string;
  situacao: string;
  estoque: number;
  preco: number;
};

type CsvArquivoCarregado = {
  nome: string;
  totalLinhas: number;
};

type CsvEscopoAnb = 'full' | 'com_estoque' | 'sem_estoque';
type CsvEscopoArquivo = 'full' | 'estoque_maior_zero' | 'estoque_igual_zero';

type CsvDivergencia = {
  sku: string;
  tipo: string;
  titulo: string;
  detalhe: string;
  estoqueAnb: number;
  estoqueArquivo: number;
  qtdTotalAnb: number;
  qtdVendidasAnb: number;
  descricaoAnb: string | null;
  descricaoArquivo: string | null;
  moto: string | null;
  situacaoArquivo: string | null;
  precoArquivo: number | null;
};

type CsvComparacao = {
  totalConsultados: number;
  totalDivergencias: number;
  totalSemDivergencia: number;
  totalAnbFiltrados: number;
  totalArquivoFiltrados: number;
  divergencias: CsvDivergencia[];
};

function calcLiq(preco: number, frete: number, taxaPct: number) {
  const taxaVal = parseFloat((preco * taxaPct / 100).toFixed(2));
  const valorLiq = parseFloat((preco - frete - taxaVal).toFixed(2));
  return { taxaVal, valorLiq };
}

function fmtMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}%`;
}

function inputDateString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  return {
    dataInicio: inputDateString(start),
    dataFim: inputDateString(end),
  };
}

async function readApiPayload(response: Response) {
  const rawText = await response.text();

  if (!rawText) {
    return { data: null, rawText: '' };
  }

  try {
    return {
      data: JSON.parse(rawText),
      rawText,
    };
  } catch {
    return {
      data: null,
      rawText,
    };
  }
}

async function ensureApiJson<T = any>(response: Response, fallbackMessage: string): Promise<T> {
  const { data, rawText } = await readApiPayload(response);

  if (!response.ok) {
    const apiError = data && typeof data === 'object' ? (data as any).error : null;
    const rawError = String(rawText || '').trim();
    const detail = apiError || rawError || response.statusText || fallbackMessage;
    throw new Error(detail);
  }

  if (!data || typeof data !== 'object') {
    throw new Error(fallbackMessage);
  }

  return data as T;
}

function normalizeHeader(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getCsvField(row: Record<string, any>, target: string) {
  const entries = Object.entries(row || {});
  const match = entries.find(([key]) => normalizeHeader(key) === target);
  return match ? match[1] : '';
}

function toCsvNumber(value: any) {
  const text = String(value ?? '').trim();
  if (!text) return 0;

  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BlingProdutosPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [dataInicio, setDataInicio] = useState(() => defaultDateRange().dataInicio);
  const [dataFim, setDataFim] = useState(() => defaultDateRange().dataFim);
  const [motoFallback, setMotoFallback] = useState('');
  const [defaults, setDefaults] = useState<Defaults>({ fretePadrao: 29.9, taxaPadraoPct: 17 });
  const [listaComparacao, setListaComparacao] = useState('');
  const [motoComparacaoId, setMotoComparacaoId] = useState('');
  const [comparando, setComparando] = useState(false);
  const [comparacao, setComparacao] = useState<Comparacao | null>(null);
  const [consultaManualTamanhoLote, setConsultaManualTamanhoLote] = useState('100');
  const [consultaManualPausaMs, setConsultaManualPausaMs] = useState('400');
  const [salvandoConsultaManual, setSalvandoConsultaManual] = useState(false);
  const [csvArquivos, setCsvArquivos] = useState<CsvArquivoCarregado[]>([]);
  const [csvLinhas, setCsvLinhas] = useState<CsvLinha[]>([]);
  const [csvEscopoAnb, setCsvEscopoAnb] = useState<CsvEscopoAnb>('full');
  const [csvEscopoArquivo, setCsvEscopoArquivo] = useState<CsvEscopoArquivo>('full');
  const [csvCarregando, setCsvCarregando] = useState(false);
  const [csvComparando, setCsvComparando] = useState(false);
  const [csvComparacao, setCsvComparacao] = useState<CsvComparacao | null>(null);

  async function carregarCsv(files: File[]) {
    setCsvCarregando(true);
    setCsvComparacao(null);
    try {
      const XLSX = await import('xlsx');
      const arquivos = Array.from(files || []);
      const todosArquivos: CsvArquivoCarregado[] = [];
      const linhasPorChave = new Map<string, CsvLinha>();

      if (!arquivos.length) {
        setCsvCarregando(false);
        return;
      }

      for (const file of arquivos) {
        const csvText = await file.text();
        const workbook = XLSX.read(csvText, {
          type: 'string',
          FS: ';',
          raw: true,
          cellText: false,
          cellNF: false,
        });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) continue;

        const sheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: true });
        const linhas = rawRows
          .map((row) => {
            const id = String(getCsvField(row, 'id') || '').trim();
            const codigo = String(getCsvField(row, 'codigo') || '').trim().replace(/\s+/g, '');
            return {
              id,
              codigo,
              descricao: String(getCsvField(row, 'descricao') || '').trim(),
              situacao: String(getCsvField(row, 'situacao') || '').trim(),
              estoque: toCsvNumber(getCsvField(row, 'estoque')),
              preco: toCsvNumber(getCsvField(row, 'preco')),
            };
          })
          .filter((item) => item.codigo);

        todosArquivos.push({
          nome: file.name,
          totalLinhas: linhas.length,
        });

        for (const linha of linhas) {
          const key = linha.id || linha.codigo;
          linhasPorChave.set(key, linha);
        }
      }

      setCsvLinhas((prev) => {
        const merged = new Map<string, CsvLinha>();
        for (const linha of prev) {
          const key = linha.id || linha.codigo;
          merged.set(key, linha);
        }
        linhasPorChave.forEach((linha, key) => {
          merged.set(key, linha);
        });
        return Array.from(merged.values());
      });
      setCsvArquivos((prev) => {
        const merged = new Map<string, CsvArquivoCarregado>();
        for (const item of prev) merged.set(item.nome, item);
        todosArquivos.forEach((item) => {
          merged.set(item.nome, item);
        });
        return Array.from(merged.values());
      });
    } catch (e: any) {
      alert(`Erro ao ler CSV: ${e.message}`);
    }
    setCsvCarregando(false);
  }

  function limparCsvCarregado() {
    setCsvArquivos([]);
    setCsvLinhas([]);
    setCsvComparacao(null);
  }

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/bling/config`).then((r) => r.json()).then((d) => setConnected(d.hasTokens)).catch(() => setConnected(false));
    fetch(`${API}/bling/config-produtos`)
      .then((r) => r.json())
      .then((d) => setDefaults({
        fretePadrao: Number(d.fretePadrao ?? 29.9),
        taxaPadraoPct: Number(d.taxaPadraoPct ?? 17),
      }))
      .catch(() => {});
    fetch(`${API}/bling/auditoria-automatica/config`)
      .then((r) => r.json())
      .then((d: ConfiguracaoConsultaManual) => {
        setConsultaManualTamanhoLote(String(d.consultaManualTamanhoLote ?? 100));
        setConsultaManualPausaMs(String(d.consultaManualPausaMs ?? 400));
      })
      .catch(() => {});
  }, []);

  async function salvarConfiguracaoConsultaManual() {
    setSalvandoConsultaManual(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultaManualTamanhoLote: Number(consultaManualTamanhoLote) || 100,
          consultaManualPausaMs: Number(consultaManualPausaMs) || 0,
        }),
      });
      const data = await ensureApiJson<any>(response, 'Erro ao salvar a configuracao da consulta manual');
      if (!data.ok) {
        alert(data.error || 'Erro ao salvar a configuracao da consulta manual');
        return;
      }
      alert('Configuracao da consulta manual salva.');
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setSalvandoConsultaManual(false);
  }

  function initItem(item: Item, currentDefaults: Defaults): Item {
    const preco = item.preco || 0;
    const frete = currentDefaults.fretePadrao;
    const taxaPct = currentDefaults.taxaPadraoPct;
    const { taxaVal, valorLiq } = calcLiq(preco, frete, taxaPct);

    return {
      ...item,
      _motoId: item.motoId ? String(item.motoId) : '',
      _preco: String(preco),
      _frete: String(frete),
      _taxaPct: String(taxaPct),
      _taxaVal: String(taxaVal),
      _valorLiq: String(valorLiq),
      _qtd: String(item.qtdEstoque || 1),
      _importado: item.jaExiste,
    };
  }

  async function buscar() {
    setBuscando(true);
    setBuscou(false);
    setItens([]);
    try {
      const response = await fetch(`${API}/bling/sync/produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataInicio, dataFim, motoIdFallback: motoFallback || null }),
      });
      const data = await ensureApiJson<any>(response, 'Erro ao buscar produtos no Bling');
      if (!data.ok) {
        alert(data.error || 'Erro ao buscar');
        return;
      }
      setItens(data.itens.map((item: Item) => initItem(item, defaults)));
      setBuscou(true);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setBuscando(false);
  }

  async function compararProdutos() {
    if (!listaComparacao.trim() && !motoComparacaoId) {
      alert('Informe uma lista de IDs de peca / SKU ou selecione uma moto para comparar');
      return;
    }

    setComparando(true);
    setComparacao(null);
    try {
      const response = await fetch(`${API}/bling/comparar-produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          texto: listaComparacao,
          motoId: motoComparacaoId ? Number(motoComparacaoId) : null,
        }),
      });
      const data = await ensureApiJson<Comparacao>(response, 'Erro ao comparar produtos no Bling');
      if (!data.ok) {
        alert(data.error || 'Erro ao comparar produtos');
        return;
      }

      setComparacao(data);
      const warnings = Array.isArray(data.warnings) && data.warnings.length ? data.warnings : [];
      if (warnings.length) {
        alert(warnings.join('\n'));
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setComparando(false);
  }

  async function compararCsv() {
    if (!csvLinhas.length) {
      alert('Selecione um CSV valido do Bling antes de comparar');
      return;
    }

    setCsvComparando(true);
    setCsvComparacao(null);
    try {
      const response = await fetch(`${API}/bling/comparar-produtos-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          linhas: csvLinhas,
          escopoAnb: csvEscopoAnb,
          escopoArquivo: csvEscopoArquivo,
        }),
      });
      const data = await ensureApiJson<any>(response, 'Erro ao comparar CSV');
      if (!data.ok) {
        alert(data.error || 'Erro ao comparar CSV');
        return;
      }

      setCsvComparacao(data);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setCsvComparando(false);
  }

  function updateItem(idx: number, field: string, value: any) {
    setItens((prev) => prev.map((item, index) => (index === idx ? { ...item, [field]: value } : item)));
  }

  function updateFinanceiro(idx: number, field: string, value: string) {
    setItens((prev) => prev.map((item, index) => {
      if (index !== idx) return item;
      const updated = { ...item, [field]: value };
      const preco = Number(updated._preco) || 0;
      const frete = Number(updated._frete) || 0;
      const taxaPct = Number(updated._taxaPct) || 0;
      const { taxaVal, valorLiq } = calcLiq(preco, frete, taxaPct);
      return { ...updated, _taxaVal: String(taxaVal), _valorLiq: String(valorLiq) };
    }));
  }

  async function importarItem(idx: number) {
    const item = itens[idx];
    if (!item._motoId) {
      updateItem(idx, '_erro', 'Selecione a moto');
      return;
    }

    updateItem(idx, '_importando', true);
    try {
      const response = await fetch(`${API}/bling/importar-produto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          sku: item.sku,
          nome: item.nome,
          localizacao: item.localizacao,
          preco: Number(item._preco) || item.preco,
          frete: Number(item._frete) || defaults.fretePadrao,
          taxaPct: Number(item._taxaPct) || defaults.taxaPadraoPct,
          motoId: item._motoId,
          qtd: Number(item._qtd) || 1,
        }),
      });
      const data = await response.json();
      if (data.ok) updateItem(idx, '_importado', true);
      else updateItem(idx, '_erro', data.error || 'Erro');
    } catch (e: any) {
      updateItem(idx, '_erro', e.message);
    }
    updateItem(idx, '_importando', false);
  }

  async function importarTodos() {
    const pendentes = itens
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item._importado && !item._ignorado && item._motoId);
    for (const { index } of pendentes) {
      // eslint-disable-next-line no-await-in-loop
      await importarItem(index);
    }
  }

  const novos = itens.filter((item) => !item.jaExiste && !item._ignorado);
  const existentes = itens.filter((item) => item.jaExiste);
  const importados = itens.filter((item) => item._importado && !item.jaExiste);
  const pendentes = novos.filter((item) => item._motoId && !item._importado);

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Produtos Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Revise e confirme a importacao de novos produtos</div>
        </div>
        {buscou && pendentes.length > 0 && (
          <button onClick={importarTodos} style={{ ...s.btn, background: 'var(--green)', color: '#fff' }}>
            Importar todos com moto ({pendentes.length})
          </button>
        )}
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>Buscar produtos ativos no Bling</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Data inclusao - inicio</label>
              <input style={{ ...s.input, width: '100%' }} type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Data inclusao - fim</label>
              <input style={{ ...s.input, width: '100%' }} type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Moto padrao (sem prefixo)</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={motoFallback} onChange={(e) => setMotoFallback(e.target.value)}>
                <option value="">Ignorar sem prefixo</option>
                {motos.map((moto: any) => (
                  <option key={moto.id} value={moto.id}>ID {moto.id} - {moto.marca} {moto.modelo}</option>
                ))}
              </select>
            </div>
          </div>
          <button style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: (buscando || !connected) ? 0.6 : 1 }} onClick={buscar} disabled={buscando || !connected}>
            {buscando ? 'Buscando...' : 'Buscar produtos'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 12 }}>
            Frete padrao: {fmtMoney(defaults.fretePadrao)} · Taxa padrao: {fmtPercent(defaults.taxaPadraoPct)}
          </span>
        </div>

        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Comparar lista de IDs de peca / SKUs</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>
            Cole uma lista com PN, HD01_xxx, BM01_xxx ou outros IDs, ou selecione uma moto cadastrada para consultar todos os SKUs-base dela. O sistema agrupa sufixos como <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>-2</span> no SKU base e mostra somente os produtos divergentes entre ANB e Bling.
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #dbe3ef', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Configuracao da consulta manual</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Essa consulta usa o mesmo motor central da auditoria, mas com lote e pausa proprios para volumes maiores.</div>
              </div>
              <button
                style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)', opacity: salvandoConsultaManual ? 0.7 : 1 }}
                onClick={salvarConfiguracaoConsultaManual}
                disabled={salvandoConsultaManual}
              >
                {salvandoConsultaManual ? 'Salvando...' : 'Salvar config manual'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={s.label}>Tamanho do lote manual</label>
                <input style={{ ...s.input, width: '100%' }} type="number" min="10" max="500" value={consultaManualTamanhoLote} onChange={(e) => setConsultaManualTamanhoLote(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Pausa manual entre lotes (ms)</label>
                <input style={{ ...s.input, width: '100%' }} type="number" min="0" max="15000" value={consultaManualPausaMs} onChange={(e) => setConsultaManualPausaMs(e.target.value)} />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>Moto cadastrada para comparar tudo</label>
            <select
              style={{ ...s.input, width: '100%', cursor: 'pointer' }}
              value={motoComparacaoId}
              onChange={(e) => setMotoComparacaoId(e.target.value)}
            >
              <option value="">Selecionar moto opcionalmente</option>
              {motos.map((moto: any) => (
                <option key={moto.id} value={moto.id}>ID {moto.id} - {moto.marca} {moto.modelo}</option>
              ))}
            </select>
          </div>
          <textarea
            style={{ ...s.input, width: '100%', minHeight: 120, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 }}
            placeholder={`Exemplo:\nPN0001\nHD01_0122\nBM01_0050`}
            value={listaComparacao}
            onChange={(e) => setListaComparacao(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <button
              style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: (comparando || !connected) ? 0.6 : 1 }}
              onClick={compararProdutos}
              disabled={comparando || !connected}
            >
              {comparando ? 'Comparando...' : 'Comparar lista / moto'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
              Use essa revisao para encontrar divergencias de estoque entre a base do ANB e o saldo atual do Bling, incluindo alertas de anuncio do Mercado Livre fora do status ativo.
            </span>
          </div>
        </div>

        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Comparar CSV exportado do Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>
            Envie o CSV exportado do Bling nesse layout de produtos e compare o saldo dele com a base do ANB sem alterar o fluxo atual de consulta online. O sistema agrupa sufixos como <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>-2</span>, <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>-3</span> e compara pelo SKU-base.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>CSV exportado do Bling</label>
              <input
                style={{ ...s.input, width: '100%', padding: '6px 10px' }}
                type="file"
                accept=".csv,text/csv"
                multiple
                onChange={(e) => {
                  if (!e.target.files?.length) return;
                  const arquivos = Array.from(e.target.files);
                  carregarCsv(arquivos);
                  e.target.value = '';
                }}
              />
            </div>
            <div>
              <label style={s.label}>Escopo ANB</label>
              <select
                style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                value={csvEscopoAnb}
                onChange={(e) => setCsvEscopoAnb(e.target.value as CsvEscopoAnb)}
              >
                <option value="full">Full</option>
                <option value="com_estoque">Itens com estoque</option>
                <option value="sem_estoque">Itens sem estoque</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Escopo CSV / Bling</label>
              <select
                style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                value={csvEscopoArquivo}
                onChange={(e) => setCsvEscopoArquivo(e.target.value as CsvEscopoArquivo)}
              >
                <option value="full">Full</option>
                <option value="estoque_maior_zero">Estoque maior que zero</option>
                <option value="estoque_igual_zero">Estoque igual a zero</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: (csvComparando || csvCarregando || !csvLinhas.length) ? 0.6 : 1 }}
              onClick={compararCsv}
              disabled={csvComparando || csvCarregando || !csvLinhas.length}
            >
              {csvComparando ? 'Comparando CSV...' : 'Comparar CSV'}
            </button>
            <button
              style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-500)', border: '1px solid var(--border)' }}
              type="button"
              onClick={limparCsvCarregado}
              disabled={csvCarregando || csvComparando || (!csvArquivos.length && !csvLinhas.length)}
            >
              Limpar arquivos
            </button>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
              {csvArquivos.length
                ? `${csvArquivos.length} arquivo(s) carregado(s) - ${csvLinhas.length} linha(s) valida(s) unificadas`
                : 'Nenhum CSV carregado ainda'}
            </span>
          </div>

          {csvArquivos.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {csvArquivos.map((arquivo) => (
                <span
                  key={arquivo.nome}
                  style={{
                    fontSize: 12,
                    background: 'var(--gray-100)',
                    color: 'var(--gray-500)',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {arquivo.nome} - {arquivo.totalLinhas} linha(s)
                </span>
              ))}
            </div>
          )}
        </div>

        {comparacao && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Consultados', value: comparacao.totalConsultados, color: 'var(--gray-700)' },
                { label: 'Divergentes', value: comparacao.totalDivergencias, color: 'var(--red)' },
                { label: 'Sem divergencia', value: comparacao.totalSemDivergencia, color: 'var(--green)' },
              ].map((item) => (
                <div key={item.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {comparacao.divergencias.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>
                  Produtos divergentes - {comparacao.divergencias.length}
                </div>
                {comparacao.divergencias.map((item) => {
                  const borderColor = item.tipo === 'nao_encontrado_bling'
                    ? 'var(--amber)'
                    : item.tipo === 'nao_encontrado_anb'
                      ? 'var(--blue-500)'
                      : item.tipo === 'peca_em_prejuizo'
                        ? '#b91c1c'
                      : item.tipo === 'status_ml_nao_ativo'
                        ? 'var(--red)'
                      : 'var(--red)';

                  return (
                    <div key={`${item.tipo}-${item.sku}`} style={{ ...s.card, borderLeft: `3px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>
                          {item.sku}
                        </span>
                        <span style={{ fontSize: 12, background: '#fef2f2', color: borderColor, padding: '2px 8px', borderRadius: 5 }}>
                          {item.titulo}
                        </span>
                        {item.statusMercadoLivre && (
                          <span style={{ fontSize: 12, background: item.statusMercadoLivreAtivo ? '#ecfdf3' : '#fef2f2', color: item.statusMercadoLivreAtivo ? 'var(--green)' : 'var(--red)', padding: '2px 8px', borderRadius: 5 }}>
                            ML: {item.statusMercadoLivre}
                          </span>
                        )}
                        {item.moto && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{item.moto}</span>}
                      </div>

                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6 }}>
                        {item.descricaoAnb || item.descricaoBling || 'Sem descricao'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>
                        {item.detalhe}
                      </div>
                      {item.tipo === 'peca_em_prejuizo' && (
                        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 14 }}>
                          IDs em prejuizo: {(item.idsPecaPrejuizo || []).join(', ') || 'Nao informado'}
                          {item.motivosPrejuizo && item.motivosPrejuizo.length > 0 && ` - Motivos: ${item.motivosPrejuizo.join(', ')}`}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Estoque ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.estoqueAnb}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Estoque Bling</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.estoqueBling}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Total no ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.qtdTotalAnb}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Vendidas no ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.qtdVendidasAnb}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Em prejuizo no ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: item.qtdPrejuizoAnb ? '#b91c1c' : 'var(--gray-700)' }}>{item.qtdPrejuizoAnb || 0}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Status ML</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: item.statusMercadoLivreAtivo === false ? 'var(--red)' : 'var(--gray-700)' }}>
                            {item.statusMercadoLivre || 'Nao identificado'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '18px 20px', color: 'var(--green)', fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
                Nenhuma divergencia encontrada nessa lista.
              </div>
            )}
          </>
        )}

        {csvComparacao && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Consultados', value: csvComparacao.totalConsultados, color: 'var(--gray-700)' },
                { label: 'ANB filtrados', value: csvComparacao.totalAnbFiltrados, color: 'var(--blue-500)' },
                { label: 'CSV filtrados', value: csvComparacao.totalArquivoFiltrados, color: 'var(--amber)' },
                { label: 'Divergentes', value: csvComparacao.totalDivergencias, color: 'var(--red)' },
                { label: 'Sem divergencia', value: csvComparacao.totalSemDivergencia, color: 'var(--green)' },
              ].map((item) => (
                <div key={`csv-${item.label}`} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>

            {csvComparacao.divergencias.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>
                  Divergencias no CSV - {csvComparacao.divergencias.length}
                </div>
                {csvComparacao.divergencias.map((item) => {
                  const borderColor = item.tipo === 'nao_encontrado_csv'
                    ? 'var(--amber)'
                    : item.tipo === 'nao_encontrado_anb'
                      ? 'var(--blue-500)'
                      : 'var(--red)';

                  return (
                    <div key={`csv-${item.tipo}-${item.sku}`} style={{ ...s.card, borderLeft: `3px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>
                          {item.sku}
                        </span>
                        <span style={{ fontSize: 12, background: '#fef2f2', color: borderColor, padding: '2px 8px', borderRadius: 5 }}>
                          {item.titulo}
                        </span>
                        {item.moto && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{item.moto}</span>}
                      </div>

                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6 }}>
                        {item.descricaoAnb || item.descricaoArquivo || 'Sem descricao'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>
                        {item.detalhe}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Estoque ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.estoqueAnb}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Estoque CSV</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.estoqueArquivo}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Total no ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.qtdTotalAnb}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Vendidas no ANB</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{item.qtdVendidasAnb}</div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Situacao CSV</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-700)' }}>
                            {item.situacaoArquivo || 'Nao informado'}
                          </div>
                        </div>
                        <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={s.label}>Preco CSV</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-700)' }}>
                            {item.precoArquivo !== null ? fmtMoney(item.precoArquivo) : 'Nao informado'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '18px 20px', color: 'var(--green)', fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
                Nenhuma divergencia encontrada no comparativo por CSV.
              </div>
            )}
          </>
        )}

        {buscou && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total', value: itens.length, color: 'var(--gray-700)' },
              { label: 'Novos', value: novos.length, color: 'var(--blue-500)' },
              { label: 'Ja existiam', value: existentes.length, color: 'var(--gray-400)' },
              { label: 'Importados', value: importados.length, color: 'var(--green)' },
              { label: 'Pendentes', value: pendentes.length, color: 'var(--amber)' },
            ].map((item) => (
              <div key={item.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}

        {novos.length > 0 && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--blue-500)', marginBottom: 12 }}>Novos produtos - {novos.length}</div>
            {novos.map((item) => {
              const realIdx = itens.indexOf(item);

              if (item._importado) {
                return (
                  <div key={item.id} style={{ ...s.card, borderLeft: '3px solid var(--green)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-400)', marginRight: 8 }}>{item.sku}</span>
                      <span style={{ fontSize: 13 }}>{item.nome}</span>
                      {Number(item._qtd) > 1 && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--blue-500)' }}>{item._qtd}x</span>}
                    </div>
                    <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600 }}>Importado</span>
                  </div>
                );
              }

              return (
                <div key={item.id} style={{ ...s.card, borderLeft: `3px solid ${item.semPrefixo ? 'var(--amber)' : 'var(--blue-200)'}` }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>{item.sku || 'sem SKU'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', flex: 1 }}>{item.nome}</span>
                    {item.qtdEstoque > 0 && <span style={{ fontSize: 12, background: 'var(--blue-100)', color: 'var(--blue-500)', padding: '2px 8px', borderRadius: 5 }}>{item.qtdEstoque} em estoque</span>}
                    {item.semPrefixo && <span style={{ fontSize: 11, background: 'var(--amber-light)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 5 }}>sem prefixo</span>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={s.label}>Qtd a importar</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" min="1" value={item._qtd || '1'} onChange={(e) => updateItem(realIdx, '_qtd', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Preco ML (R$)</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" step="0.01" value={item._preco || ''} onChange={(e) => updateFinanceiro(realIdx, '_preco', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Frete (R$)</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" step="0.01" value={item._frete || ''} onChange={(e) => updateFinanceiro(realIdx, '_frete', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (%)</label>
                      <input style={{ ...s.input, width: '100%' }} type="number" step="0.01" value={item._taxaPct || ''} onChange={(e) => updateFinanceiro(realIdx, '_taxaPct', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.label}>Taxa ML (R$)</label>
                      <input style={{ ...s.input, width: '100%', background: 'var(--gray-50)', color: 'var(--gray-500)' }} readOnly value={item._taxaVal || ''} />
                    </div>
                    <div>
                      <label style={{ ...s.label, color: 'var(--green)', fontWeight: 600 }}>Valor liquido</label>
                      <input style={{ ...s.input, width: '100%', background: '#f0fdf4', borderColor: '#86efac', fontWeight: 600, color: 'var(--green)' }} readOnly value={item._valorLiq || ''} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select style={{ ...s.input, minWidth: 220, cursor: 'pointer' }} value={item._motoId || ''} onChange={(e) => updateItem(realIdx, '_motoId', e.target.value)}>
                      <option value="">Selecione a moto...</option>
                      {motos.map((moto: any) => (
                        <option key={moto.id} value={moto.id}>ID {moto.id} - {moto.marca} {moto.modelo}</option>
                      ))}
                    </select>
                    <button onClick={() => importarItem(realIdx)} disabled={item._importando || !item._motoId} style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: (item._importando || !item._motoId) ? 0.5 : 1 }}>
                      {item._importando ? 'Importando...' : `Importar${Number(item._qtd) > 1 ? ` (${item._qtd}x)` : ''}`}
                    </button>
                    <button onClick={() => updateItem(realIdx, '_ignorado', true)} style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-500)', border: '1px solid var(--border)' }}>Ignorar</button>
                    {item._erro && <span style={{ fontSize: 12, color: 'var(--red)' }}>{item._erro}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {existentes.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-400)', marginBottom: 8 }}>Ja existem no ANB - {existentes.length}</div>
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {existentes.slice(0, 15).map((item) => <span key={item.id}>{item.sku || `BL${item.id}`}</span>)}
              {existentes.length > 15 && <span>+{existentes.length - 15} mais</span>}
            </div>
          </div>
        )}

        {buscou && novos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)', fontSize: 14 }}>Nenhum produto novo encontrado no periodo.</div>
        )}
      </div>
    </>
  );
}
