'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const s: any = {
  topbar: {
    height: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  },
  card: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 18px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid transparent',
    fontFamily: 'Inter, sans-serif',
  },
  input: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '8px 11px',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    color: 'var(--gray-800)',
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--gray-500)',
    display: 'block',
    marginBottom: 4,
  },
};

type InventarioResumo = {
  id: number;
  status: string;
  statusLabel: string;
  startedAt: string;
  finishedAt?: string | null;
  totalCaixas: number;
  totalPendentes: number;
  totalConfirmados: number;
  totalDiferencas: number;
  caixasPendentes: number;
  podeFinalizarInventario: boolean;
};

type CaixaResumo = {
  id: number;
  caixa: string;
  status: string;
  statusLabel: string;
  finishedAt?: string | null;
  totalItens: number;
  pendentes: number;
  confirmados: number;
  diferencas: number;
};

type ItemInventario = {
  id: number;
  caixa: string;
  skuBase: string;
  motoId: number | null;
  idPecaReferencia: string;
  descricao: string;
  quantidadeEstoque: number;
  status: string;
  tipoDiferenca?: string | null;
  tipoDiferencaLabel?: string | null;
  decidedAt?: string | null;
};

type CaixaDetalhe = {
  caixa: {
    id: number;
    caixa: string;
    status: string;
    statusLabel: string;
    finishedAt?: string | null;
    totalItens: number;
    pendentes: number;
    diferencas: number;
    confirmados: number;
  };
  itensPendentes: ItemInventario[];
  diferencasRegistradas: ItemInventario[];
};

type InventarioLog = {
  id: number;
  status: string;
  statusLabel: string;
  startedAt: string;
  finishedAt?: string | null;
  totalCaixas: number;
  caixasFinalizadas: number;
  totalDiferencas: number;
  diferencas: ItemInventario[];
};

function inputDateString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    dataInicio: inputDateString(start),
    dataFim: inputDateString(end),
  };
}

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function pickPreferredCaixa(caixas: CaixaResumo[], preferredCaixa?: string | null) {
  if (preferredCaixa && caixas.some((caixa) => caixa.caixa === preferredCaixa)) {
    return preferredCaixa;
  }

  return caixas.find((caixa) => caixa.status === 'pendente')?.caixa || caixas[0]?.caixa || '';
}

function DiferencaModal({
  open,
  item,
  loading,
  onClose,
  onSelect,
}: {
  open: boolean;
  item: ItemInventario | null;
  loading: boolean;
  onClose: () => void;
  onSelect: (tipo: 'nao_localizado' | 'diferenca_estoque') => void;
}) {
  if (!open || !item) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 12px 32px rgba(0,0,0,.10)' }}>
        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Registrar diferenca</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{item.skuBase} - {item.descricao}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer' }}>X</button>
        </div>
        <div style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>
            Escolha o tipo da divergencia encontrada para esse SKU durante a conferencia da caixa.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              onClick={() => onSelect('nao_localizado')}
              disabled={loading}
              style={{ ...s.btn, justifyContent: 'center', background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' }}
            >
              Nao Localizado
            </button>
            <button
              onClick={() => onSelect('diferenca_estoque')}
              disabled={loading}
              style={{ ...s.btn, justifyContent: 'center', background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' }}
            >
              Diferenca de Estoque
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InventarioPage() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [finalizandoCaixa, setFinalizandoCaixa] = useState(false);
  const [finalizandoInventario, setFinalizandoInventario] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [inventario, setInventario] = useState<InventarioResumo | null>(null);
  const [caixas, setCaixas] = useState<CaixaResumo[]>([]);
  const [selectedCaixa, setSelectedCaixa] = useState('');
  const [caixaDetalhe, setCaixaDetalhe] = useState<CaixaDetalhe | null>(null);
  const [logs, setLogs] = useState<InventarioLog[]>([]);
  const [logSelecionado, setLogSelecionado] = useState<InventarioLog | null>(null);
  const [filtroDataInicio, setFiltroDataInicio] = useState(() => defaultDateRange().dataInicio);
  const [filtroDataFim, setFiltroDataFim] = useState(() => defaultDateRange().dataFim);
  const [diferencaItem, setDiferencaItem] = useState<ItemInventario | null>(null);

  function applyInventarioState(payload: any, preferredCaixa?: string | null) {
    const nextInventario = payload?.inventario || null;
    const nextCaixas = Array.isArray(payload?.caixas) ? payload.caixas : [];

    setInventario(nextInventario);
    setCaixas(nextCaixas);

    const nextSelectedCaixa = nextInventario ? pickPreferredCaixa(nextCaixas, preferredCaixa) : '';
    setSelectedCaixa(nextSelectedCaixa);
    if (!nextSelectedCaixa) {
      setCaixaDetalhe(null);
    }
  }

  async function loadAtual(preferredCaixa?: string | null) {
    const data = await api.inventario.atual();
    applyInventarioState(data, preferredCaixa);
  }

  async function loadCaixa(caixa: string, inventarioId: number) {
    const data = await api.inventario.caixa(caixa, inventarioId);
    setCaixaDetalhe({
      caixa: data.caixa,
      itensPendentes: Array.isArray(data.itensPendentes) ? data.itensPendentes : [],
      diferencasRegistradas: Array.isArray(data.diferencasRegistradas) ? data.diferencasRegistradas : [],
    });
  }

  async function loadLogs(selectId?: number) {
    const data = await api.inventario.logs({
      dataInicio: filtroDataInicio,
      dataFim: filtroDataFim,
      limit: 50,
    });

    const rows = Array.isArray(data.logs) ? data.logs : [];
    setLogs(rows);

    const targetId = selectId || logSelecionado?.id || rows[0]?.id;
    if (targetId) {
      const detalhe = await api.inventario.log(targetId);
      setLogSelecionado(detalhe.log || null);
    } else {
      setLogSelecionado(null);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([
        loadAtual(selectedCaixa || null),
        loadLogs(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll().catch((e: any) => {
      alert(e.message || 'Erro ao carregar inventario');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!inventario?.id || !selectedCaixa) {
      setCaixaDetalhe(null);
      return;
    }

    loadCaixa(selectedCaixa, inventario.id).catch((e: any) => {
      alert(e.message || 'Erro ao carregar a caixa');
    });
  }, [inventario?.id, selectedCaixa]);

  async function handleNovoInventario() {
    setCreating(true);
    try {
      const data = await api.inventario.novo();
      applyInventarioState(data);
    } catch (e: any) {
      alert(e.message || 'Erro ao iniciar inventario');
    }
    setCreating(false);
  }

  async function handleConfirmarItem(itemId: number) {
    setBusyItemId(itemId);
    try {
      await api.inventario.confirmarItem(itemId);
      if (inventario?.id && selectedCaixa) {
        await Promise.all([
          loadAtual(selectedCaixa),
          loadCaixa(selectedCaixa, inventario.id),
        ]);
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao confirmar item');
    }
    setBusyItemId(null);
  }

  async function handleRegistrarDiferenca(tipo: 'nao_localizado' | 'diferenca_estoque') {
    if (!diferencaItem) return;

    setBusyItemId(diferencaItem.id);
    try {
      await api.inventario.registrarDiferenca(diferencaItem.id, tipo);
      setDiferencaItem(null);
      if (inventario?.id && selectedCaixa) {
        await Promise.all([
          loadAtual(selectedCaixa),
          loadCaixa(selectedCaixa, inventario.id),
        ]);
      }
    } catch (e: any) {
      alert(e.message || 'Erro ao registrar diferenca');
    }
    setBusyItemId(null);
  }

  async function handleFinalizarCaixa() {
    if (!inventario?.id || !selectedCaixa) return;

    setFinalizandoCaixa(true);
    try {
      const data = await api.inventario.finalizarCaixa(selectedCaixa, inventario.id);
      const proximaCaixa = pickPreferredCaixa(Array.isArray(data.caixas) ? data.caixas : [], null);
      applyInventarioState(data, proximaCaixa);
    } catch (e: any) {
      alert(e.message || 'Erro ao finalizar caixa');
    }
    setFinalizandoCaixa(false);
  }

  async function handleFinalizarInventario() {
    if (!inventario?.id) return;

    setFinalizandoInventario(true);
    try {
      await api.inventario.finalizar(inventario.id);
      await loadAtual();
      await loadLogs();
      alert('Inventario finalizado com sucesso.');
    } catch (e: any) {
      alert(e.message || 'Erro ao finalizar inventario');
    }
    setFinalizandoInventario(false);
  }

  async function handleConsultarLogs() {
    setReloading(true);
    try {
      await loadLogs();
    } catch (e: any) {
      alert(e.message || 'Erro ao consultar logs');
    }
    setReloading(false);
  }

  if (loading) {
    return (
      <div style={{ padding: 28 }}>
        <div style={s.card}>Carregando inventario...</div>
      </div>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Inventario</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            Confira caixa por caixa e registre somente as diferencas encontradas
          </div>
        </div>
        {!inventario && (
          <button
            onClick={handleNovoInventario}
            disabled={creating}
            style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: creating ? 0.7 : 1 }}
          >
            {creating ? 'Criando...' : 'Novo Inventario'}
          </button>
        )}
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6 }}>Conferencia de estoque por caixa</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                O inventario usa a localizacao sincronizada do Bling para separar as pecas por caixa e registrar somente as divergencias.
              </div>
            </div>
            {!inventario && (
              <button
                onClick={handleNovoInventario}
                disabled={creating}
                style={{ ...s.btn, background: 'var(--ink)', color: '#fff', opacity: creating ? 0.7 : 1 }}
              >
                {creating ? 'Criando...' : 'Novo Inventario'}
              </button>
            )}
            {inventario?.podeFinalizarInventario && (
              <button
                onClick={handleFinalizarInventario}
                disabled={finalizandoInventario}
                style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: finalizandoInventario ? 0.7 : 1 }}
              >
                {finalizandoInventario ? 'Finalizando...' : 'Finalizar Inventario'}
              </button>
            )}
          </div>
        </div>

        {inventario ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Status</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', marginTop: 6 }}>{inventario.statusLabel}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Iniciado em</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{fmtDateTime(inventario.startedAt)}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Caixas</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{inventario.totalCaixas}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>SKUs pendentes</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: inventario.totalPendentes > 0 ? '#c2410c' : 'var(--green)', marginTop: 6 }}>{inventario.totalPendentes}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Confirmados</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{inventario.totalConfirmados}</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Diferencas</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: inventario.totalDiferencas > 0 ? 'var(--red)' : 'var(--green)', marginTop: 6 }}>{inventario.totalDiferencas}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 12 }}>
              <div style={s.card}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 12 }}>Caixas para conferencia</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {caixas.map((caixa) => {
                    const active = caixa.caixa === selectedCaixa;
                    return (
                      <button
                        key={caixa.id}
                        onClick={() => setSelectedCaixa(caixa.caixa)}
                        style={{
                          textAlign: 'left',
                          border: active ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                          background: active ? '#eff6ff' : 'var(--white)',
                          borderRadius: 10,
                          padding: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>{caixa.caixa}</div>
                          <div style={{ fontSize: 11, color: caixa.status === 'pendente' ? '#c2410c' : 'var(--green)', fontWeight: 700 }}>{caixa.statusLabel}</div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'grid', gap: 4 }}>
                          <div>Total de SKUs: {caixa.totalItens}</div>
                          <div>Pendentes: {caixa.pendentes}</div>
                          <div>Diferencas: {caixa.diferencas}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={s.card}>
                {!caixaDetalhe ? (
                  <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                    Selecione uma caixa para conferir os produtos do inventario em andamento.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Caixa {caixaDetalhe.caixa.caixa}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                          {caixaDetalhe.caixa.pendentes} SKU(s) pendente(s) de conferencia nesta caixa.
                        </div>
                      </div>
                      <button
                        onClick={handleFinalizarCaixa}
                        disabled={finalizandoCaixa || caixaDetalhe.caixa.pendentes > 0 || caixaDetalhe.caixa.status !== 'pendente'}
                        style={{
                          ...s.btn,
                          background: '#111827',
                          color: '#fff',
                          opacity: finalizandoCaixa || caixaDetalhe.caixa.pendentes > 0 || caixaDetalhe.caixa.status !== 'pendente' ? 0.6 : 1,
                        }}
                      >
                        {finalizandoCaixa ? 'Finalizando...' : 'Finalizar Caixa'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      {caixaDetalhe.itensPendentes.length === 0 ? (
                        <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--gray-500)', fontSize: 13 }}>
                          Todos os SKUs dessa caixa ja foram tratados. Se estiver tudo conferido, finalize a caixa.
                        </div>
                      ) : (
                        caixaDetalhe.itensPendentes.map((item) => {
                          const busy = busyItemId === item.id;
                          return (
                            <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>ID Moto</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.motoId ?? '-'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>SKU do de/para</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.skuBase}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>ID da Peca</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.idPecaReferencia}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Quantidade</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginTop: 6 }}>{item.quantidadeEstoque}</div>
                                </div>
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>{item.descricao}</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => handleConfirmarItem(item.id)}
                                  disabled={busy}
                                  style={{ ...s.btn, background: 'var(--green)', color: '#fff', opacity: busy ? 0.7 : 1 }}
                                >
                                  {busy ? 'Salvando...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => setDiferencaItem(item)}
                                  disabled={busy}
                                  style={{ ...s.btn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', opacity: busy ? 0.7 : 1 }}
                                >
                                  Diferenca
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {caixaDetalhe.diferencasRegistradas.length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 10 }}>Diferencas registradas nesta caixa</div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {caixaDetalhe.diferencasRegistradas.map((item) => (
                            <div key={item.id} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>{item.skuBase} - {item.idPecaReferencia}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{item.tipoDiferencaLabel || item.tipoDiferenca}</div>
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>{item.descricao}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Nenhum inventario em andamento</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              Clique em <strong>Novo Inventario</strong> para gerar a fila de caixas com base nas pecas disponiveis e localizadas no sistema.
            </div>
          </div>
        )}

        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Logs de inventarios finalizados</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                Consulte somente as diferencas registradas nos inventarios concluidos por periodo.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={s.label}>Data inicio</label>
                <input style={s.input} type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Data fim</label>
                <input style={s.input} type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} />
              </div>
              <button
                onClick={handleConsultarLogs}
                disabled={reloading}
                style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: reloading ? 0.7 : 1 }}
              >
                {reloading ? 'Consultando...' : 'Consultar logs'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 12 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              {logs.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--gray-500)', fontSize: 13 }}>
                  Nenhum inventario finalizado encontrado nesse periodo.
                </div>
              ) : (
                logs.map((log) => {
                  const active = logSelecionado?.id === log.id;
                  return (
                    <button
                      key={log.id}
                      onClick={async () => {
                        const detalhe = await api.inventario.log(log.id);
                        setLogSelecionado(detalhe.log || null);
                      }}
                      style={{
                        textAlign: 'left',
                        border: active ? '1px solid var(--blue-500)' : '1px solid var(--border)',
                        background: active ? '#eff6ff' : 'var(--white)',
                        borderRadius: 10,
                        padding: 14,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>
                        Inventario #{log.id}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', display: 'grid', gap: 4 }}>
                        <div>Finalizado: {fmtDateTime(log.finishedAt)}</div>
                        <div>Caixas: {log.caixasFinalizadas}/{log.totalCaixas}</div>
                        <div>Diferencas: {log.totalDiferencas}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, minHeight: 180 }}>
              {!logSelecionado ? (
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                  Selecione um inventario finalizado para consultar as divergencias registradas.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Inventario #{logSelecionado.id}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                        Finalizado em {fmtDateTime(logSelecionado.finishedAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      <div>Status: <strong>{logSelecionado.statusLabel}</strong></div>
                      <div>Diferencas: <strong>{logSelecionado.totalDiferencas}</strong></div>
                    </div>
                  </div>

                  {logSelecionado.diferencas.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                      Esse inventario foi finalizado sem divergencias registradas.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {logSelecionado.diferencas.map((item) => (
                        <div key={item.id} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>
                              Caixa {item.caixa} - {item.skuBase}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                              {item.tipoDiferencaLabel || item.tipoDiferenca}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 4 }}>
                            {item.idPecaReferencia} - {item.descricao}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                            ID Moto: {item.motoId ?? '-'} · Estoque registrado: {item.quantidadeEstoque} · Marcado em {fmtDateTime(item.decidedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <DiferencaModal
        open={!!diferencaItem}
        item={diferencaItem}
        loading={busyItemId === diferencaItem?.id}
        onClose={() => setDiferencaItem(null)}
        onSelect={handleRegistrarDiferenca}
      />
    </>
  );
}
