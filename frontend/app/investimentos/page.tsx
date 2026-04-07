'use client';

import { useEffect, useState } from 'react';
import { ChartPanel, DonutChart, HeatmapChart, HorizontalBarChart, ViewModeSwitch, type ViewMode } from '@/components/finance/Charts';
import { api } from '@/lib/api';
const SOCIOS = ['Bruno', 'Nelson', 'Alex'];
const SOCIO_COLORS: Record<string, string> = {
  Bruno: '#2563eb',
  Nelson: '#16a34a',
  Alex: '#f59e0b',
};
const TIPOS_APORTE = ['Moto', 'Insumos', 'Infra-Estrutura', 'Obra', 'Operacional'] as const;
const TIPO_PADRAO = 'Aporte geral';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function normalizeTipo(value: any) {
  const normalized = String(value || '').trim();
  return normalized || TIPO_PADRAO;
}

function resolveAporteLabel(motoItem: any, tipo: any, motosMap: Map<number, string>) {
  const raw = String(motoItem || '').trim();
  const fallback = normalizeTipo(tipo);

  if (!raw) return fallback;

  const directId = raw.match(/^\d+$/);
  if (directId) {
    const id = Number(directId[0]);
    return motosMap.get(id) || `ID ${id}`;
  }

  const prefixedId = raw.match(/^#?\s*(\d+)$/i) || raw.match(/^id\s*(\d+)$/i);
  if (prefixedId) {
    const id = Number(prefixedId[1]);
    return motosMap.get(id) || `ID ${id}`;
  }

  return raw;
}

function monthKey(dateValue: string) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key: string) {
  const [ano, mes] = key.split('-');
  const date = new Date(Number(ano), Number(mes) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function periodLabelFromKey(key: string, includeYear = false) {
  const [ano, mes] = key.split('-');
  const date = new Date(Number(ano), Number(mes) - 1, 1);
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return includeYear ? `${month}/${String(ano).slice(-2)}` : month;
}

export default function InvestimentosPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [motos, setMotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroSocio, setFiltroSocio] = useState('');
  const [filtroAno, setFiltroAno] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modo, setModo] = useState<ViewMode>('grafico');
  const [form, setForm] = useState({ data: today(), socio: 'Bruno', tipo: 'Moto', moto: '', valor: '' });

  const inputStyle: any = {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    color: 'var(--ink)',
    width: '100%',
  };

  function load() {
    setLoading(true);
    Promise.all([
      api.financeiro.investimentos.list(),
      api.motos.list().catch(() => []),
    ])
      .then(([investimentos, motosResponse]) => {
        setRows(investimentos);
        setMotos(motosResponse);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  const motosMap = new Map<number, string>(
    motos.map((moto) => [Number(moto.id), `ID ${moto.id} - ${moto.marca} ${moto.modelo}`]),
  );

  const anos = Array.from(new Set(
    rows.map((item) => new Date(item.data).getFullYear()).filter((ano) => Number.isFinite(ano)),
  )).sort((a, b) => b - a);

  const filtradas = rows.filter((item) => {
    const ano = new Date(item.data).getFullYear();
    return (!filtroSocio || item.socio === filtroSocio)
      && (!filtroAno || ano === Number(filtroAno));
  });

  const totalGeral = rows.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalFiltro = filtradas.reduce((sum, item) => sum + Number(item.valor || 0), 0);

  const porSocioMap = new Map<string, number>();
  rows.forEach((item) => {
    const socio = item.socio || 'Outros';
    porSocioMap.set(socio, (porSocioMap.get(socio) || 0) + Number(item.valor || 0));
  });

  const sociosChart = Array.from(porSocioMap.entries())
    .map(([label, value]) => ({
      label,
      value,
      color: SOCIO_COLORS[label],
      note: `${(totalGeral ? (value / totalGeral) * 100 : 0).toFixed(1).replace('.', ',')}%`,
    }))
    .sort((a, b) => b.value - a.value);

  const tiposFiltroMap = filtradas.reduce<Map<string, { value: number; count: number }>>((map, item) => {
    const label = normalizeTipo(item.tipo);
    const current = map.get(label) || { value: 0, count: 0 };
    current.value += Number(item.valor || 0);
    current.count += 1;
    map.set(label, current);
    return map;
  }, new Map());

  const rankingTipos = Array.from(tiposFiltroMap.entries())
    .map(([label, info]) => ({
      label,
      value: info.value,
      note: `${info.count} aporte${info.count === 1 ? '' : 's'}`,
      share: `${(((info.value || 0) / (totalFiltro || 1)) * 100).toFixed(1).replace('.', ',')}% do filtro`,
    }))
    .sort((a, b) => b.value - a.value);

  const periodos = filtroAno
    ? Array.from({ length: 12 }, (_, index) => ({
        key: `${filtroAno}-${String(index + 1).padStart(2, '0')}`,
        label: MESES[index],
      }))
    : Array.from(new Set(filtradas.map((item) => monthKey(item.data))))
        .sort((a, b) => a.localeCompare(b))
        .slice(-12)
        .map((key) => ({
          key,
          label: periodLabelFromKey(key, true),
        }));

  const porSocioPeriodoMap = new Map<string, {
    total: number;
    count: number;
    cells: Map<string, { value: number; count: number }>;
  }>();

  filtradas.forEach((item) => {
    const tipo = item.socio || 'Outros';
    const periodo = monthKey(item.data);
    const valor = Number(item.valor || 0);
    const current = porSocioPeriodoMap.get(tipo) || {
      total: 0,
      count: 0,
      cells: new Map<string, { value: number; count: number }>(),
    };
    current.total += valor;
    current.count += 1;
    const cell = current.cells.get(periodo) || { value: 0, count: 0 };
    cell.value += valor;
    cell.count += 1;
    current.cells.set(periodo, cell);
    porSocioPeriodoMap.set(tipo, current);
  });

  const painelMensalTipos = Array.from(porSocioPeriodoMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([tipo, info]) => ({
      label: tipo,
      note: `${info.count} aporte${info.count === 1 ? '' : 's'} · ${fmt(info.total)}`,
      cells: periodos.map((periodo) => {
        const cell = info.cells.get(periodo.key) || { value: 0, count: 0 };
        return {
          label: periodo.label,
          value: cell.value,
          displayValue: cell.value > 0 ? fmt(cell.value) : '--',
          note: cell.count > 0 ? `${cell.count} ap.` : '',
        };
      }),
    }));

  async function salvar() {
    if (!form.valor) return;
    setSaving(true);
    await api.financeiro.investimentos.create({
      data: form.data,
      socio: form.socio,
      tipo: form.tipo,
      moto: form.moto || null,
      valor: Number(form.valor),
    });
    setForm({ data: today(), socio: 'Bruno', tipo: 'Moto', moto: '', valor: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function limparBase() {
    if (!confirm('Limpar toda a base de investimentos? Essa acao remove os registros atuais para permitir uma reimportacao organizada.')) return;
    setSaving(true);
    try {
      await api.financeiro.investimentos.clear();
      await load();
      alert('Base de investimentos limpa.');
    } catch (error: any) {
      alert(error.message || 'Erro ao limpar a base de investimentos');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Excluir investimento?')) return;
    await api.financeiro.investimentos.delete(id);
    load();
  }

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Investimentos</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Aportes por socio</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ViewModeSwitch value={modo} onChange={setModo} />
          <button
            onClick={limparBase}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: '#fff7ed', color: 'var(--amber)', border: '1px solid #fdba74', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            disabled={saving}
          >
            Limpar base
          </button>
          <button
            onClick={() => setShowForm((value) => !value)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: 'var(--blue-500)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            {showForm ? 'Fechar' : '+ Novo investimento'}
          </button>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Total geral</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue-500)', letterSpacing: '-0.4px' }}>{fmt(totalGeral)}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Total no filtro</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.4px' }}>{fmt(totalFiltro)}</div>
          </div>
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>Maior investidor</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.4px' }}>{sociosChart[0]?.label || '--'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 6 }}>{sociosChart[0] ? fmt(sociosChart[0].value) : 'Sem dados'}</div>
          </div>
        </div>

        {showForm && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--blue-200)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Novo investimento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Data</div>
                <input style={inputStyle} type="date" value={form.data} onChange={(e) => setForm((value) => ({ ...value, data: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Socio</div>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.socio} onChange={(e) => setForm((value) => ({ ...value, socio: e.target.value }))}>
                  {SOCIOS.map((socio) => <option key={socio}>{socio}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Tipo do aporte</div>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.tipo} onChange={(e) => setForm((value) => ({ ...value, tipo: e.target.value }))}>
                  {TIPOS_APORTE.map((tipo) => <option key={tipo}>{tipo}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Moto / Item (opcional)</div>
                <input style={inputStyle} placeholder="Ex: 3, pallet, guincho..." value={form.moto} onChange={(e) => setForm((value) => ({ ...value, moto: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 5 }}>Valor (R$) *</div>
                <input style={inputStyle} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={(e) => setForm((value) => ({ ...value, valor: e.target.value }))} />
              </div>
              <button
                onClick={salvar}
                disabled={saving || !form.valor}
                style={{ padding: '8px 18px', background: 'var(--blue-500)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Visualizacao <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 400 }}>- {filtradas.length} registros</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
                <option value="">Todos os anos</option>
                {anos.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
              </select>
              <select style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)}>
                <option value="">Todos os socios</option>
                {SOCIOS.map((socio) => <option key={socio}>{socio}</option>)}
              </select>
            </div>
          </div>
        </div>

        {modo === 'grafico' ? (
          loading ? (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, color: 'var(--ink-muted)' }}>Carregando visualizacao...</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 18 }}>
                <ChartPanel title="Participacao dos socios" subtitle="Quanto cada socio representa no capital investido." accent="#2563eb">
                  <DonutChart items={sociosChart} totalLabel="Investido" totalDisplay={fmt(totalGeral)} valueFormatter={fmt} emptyText="Sem investimentos para distribuir." />
                </ChartPanel>
                <ChartPanel title="Tipos de aportes" subtitle="Quantidade, valor e peso de cada tipo padronizado dentro do filtro atual." accent="#16a34a">
                  <HorizontalBarChart items={rankingTipos} valueFormatter={fmt} emptyText="Sem aportes para comparar." />
                </ChartPanel>
              </div>
              <ChartPanel title="Painel mensal dos aportes" subtitle="Matriz compacta com os valores por periodo, agrupada por socio dentro do filtro atual." accent="#f59e0b">
                <HeatmapChart rows={painelMensalTipos} rowHeaderLabel="Socio" valueFormatter={fmt} emptyText="Sem periodos para exibir." />
              </ChartPanel>
            </div>
          )
        ) : (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      {['Data', 'Socio', 'Tipo', 'Moto / Item', 'Valor', ''].map((header) => (
                        <th key={header} style={{ padding: '9px 16px', textAlign: header === 'Valor' ? 'right' : 'left', fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 500 }}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '9px 16px', fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--ink-muted)' }}>{new Date(item.data).toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '9px 16px' }}>
                          <span style={{ fontWeight: 600, color: SOCIO_COLORS[item.socio] || 'var(--ink)' }}>{item.socio}</span>
                        </td>
                        <td style={{ padding: '9px 16px', color: 'var(--ink)', fontWeight: 600 }}>{normalizeTipo(item.tipo)}</td>
                        <td style={{ padding: '9px 16px', color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{resolveAporteLabel(item.moto, item.tipo, motosMap)}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'Geist Mono, monospace', fontSize: 13, color: 'var(--blue-500)', fontWeight: 600 }}>{fmt(Number(item.valor || 0))}</td>
                        <td style={{ padding: '9px 10px', width: 40 }}>
                          <button onClick={() => excluir(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }} title="Excluir">
                            x
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!filtradas.length && (
                      <tr><td colSpan={6} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Nenhum investimento registrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
