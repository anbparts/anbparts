'use client';
import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

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
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--gray-500)',
    display: 'block',
    marginBottom: 4,
  },
  btnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: 'var(--red)',
    fontFamily: 'Inter, sans-serif',
  },
  btnGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid var(--border)',
    background: 'var(--white)',
    color: 'var(--gray-700)',
    fontFamily: 'Inter, sans-serif',
  },
};

type Resumo = {
  totalConsultados?: number;
  totalDivergencias?: number;
  totalSemDivergencia?: number;
  porTipo?: Record<string, number>;
  porMoto?: Record<string, number>;
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

type Execucao = {
  id: number;
  origem: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  totalSkus: number;
  totalDivergencias: number;
  totalSemDivergencia: number;
  emailDestinatario?: string | null;
  emailEnviado: boolean;
  emailErro?: string | null;
  erro?: string | null;
  resumo?: Resumo | null;
  divergencias?: Divergencia[] | null;
};

type Config = {
  auditoriaAtiva: boolean;
  auditoriaHorario: string;
  auditoriaEmailDestinatario: string;
  auditoriaResendFrom: string;
  auditoriaTamanhoLote: number;
  auditoriaPausaMs: number;
  resendApiKeyConfigured: boolean;
  auditoriaUltimaExecucaoChave?: string | null;
  auditoriaUltimaExecucaoEm?: string | null;
  executandoAgora?: boolean;
  ultimaExecucao?: Execucao | null;
};

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function statusLabel(status?: string) {
  if (status === 'sucesso') return 'Sucesso';
  if (status === 'sucesso_parcial') return 'Sucesso parcial';
  if (status === 'erro') return 'Erro';
  if (status === 'executando') return 'Executando';
  return status || 'Nao informado';
}

function statusColor(status?: string) {
  if (status === 'sucesso') return 'var(--green)';
  if (status === 'sucesso_parcial') return 'var(--amber)';
  if (status === 'erro') return 'var(--red)';
  if (status === 'executando') return 'var(--blue-500)';
  return 'var(--gray-500)';
}

function getBorderColor(tipo: string) {
  if (tipo === 'nao_encontrado_bling') return 'var(--amber)';
  if (tipo === 'nao_encontrado_anb') return 'var(--blue-500)';
  if (tipo === 'peca_em_prejuizo') return '#b91c1c';
  if (tipo === 'status_ml_nao_ativo') return 'var(--red)';
  if (tipo === 'status_ml_publicado_sem_estoque') return 'var(--red)';
  if (tipo === 'estoque_bling_acima_maximo') return 'var(--red)';
  return 'var(--red)';
}

export default function AuditoriaAutomaticaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [deletingExecutionId, setDeletingExecutionId] = useState<number | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [execucaoSelecionada, setExecucaoSelecionada] = useState<Execucao | null>(null);

  const [auditoriaAtiva, setAuditoriaAtiva] = useState(false);
  const [auditoriaHorario, setAuditoriaHorario] = useState('03:00');
  const [auditoriaEmailDestinatario, setAuditoriaEmailDestinatario] = useState('');
  const [auditoriaResendFrom, setAuditoriaResendFrom] = useState('alertas@mail.anbparts.com.br');
  const [auditoriaTamanhoLote, setAuditoriaTamanhoLote] = useState('100');
  const [auditoriaPausaMs, setAuditoriaPausaMs] = useState('400');
  const [auditoriaResendApiKey, setAuditoriaResendApiKey] = useState('');

  async function loadConfig() {
    const data = await fetch(`${API}/bling/auditoria-automatica/config`).then((r) => r.json());
    setConfig(data);
    setAuditoriaAtiva(!!data.auditoriaAtiva);
    setAuditoriaHorario(data.auditoriaHorario || '03:00');
    setAuditoriaEmailDestinatario(data.auditoriaEmailDestinatario || '');
    setAuditoriaResendFrom(data.auditoriaResendFrom || 'alertas@mail.anbparts.com.br');
    setAuditoriaTamanhoLote(String(data.auditoriaTamanhoLote || 100));
    setAuditoriaPausaMs(String(data.auditoriaPausaMs || 400));
  }

  async function loadExecucoes(selectId?: number) {
    const data = await fetch(`${API}/bling/auditoria-automatica/execucoes?limit=20`).then((r) => r.json());
    const rows = Array.isArray(data.execucoes) ? data.execucoes : [];
    setExecucoes(rows);

    const preferredId = selectId || execucaoSelecionada?.id || rows[0]?.id;
    const targetId = rows.some((item: Execucao) => item.id === preferredId) ? preferredId : rows[0]?.id;
    if (targetId) {
      await loadExecucaoDetalhe(targetId);
    } else {
      setExecucaoSelecionada(null);
    }
  }

  async function loadExecucaoDetalhe(id: number) {
    const data = await fetch(`${API}/bling/auditoria-automatica/execucoes/${id}`).then((r) => r.json());
    if (data.execucao) setExecucaoSelecionada(data.execucao);
  }

  async function loadAll() {
    setLoading(true);
    try {
      await loadConfig();
      await loadExecucoes();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll().catch(() => setLoading(false));
  }, []);

  const resumoAtual = useMemo(() => (execucaoSelecionada?.resumo || config?.ultimaExecucao?.resumo || null), [config, execucaoSelecionada]);
  const divergenciasAtuais = useMemo(() => Array.isArray(execucaoSelecionada?.divergencias) ? execucaoSelecionada?.divergencias : [], [execucaoSelecionada]);

  async function salvarConfiguracao() {
    setSaving(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditoriaAtiva,
          auditoriaHorario,
          auditoriaEmailDestinatario,
          auditoriaResendFrom,
          auditoriaTamanhoLote: Number(auditoriaTamanhoLote) || 100,
          auditoriaPausaMs: Number(auditoriaPausaMs) || 0,
          auditoriaResendApiKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Erro ao salvar a configuracao');
        return;
      }

      setAuditoriaResendApiKey('');
      await loadConfig();
      alert('Configuracao salva.');
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    }
    setSaving(false);
  }

  async function executarAgora() {
    setExecutando(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Erro ao executar auditoria');
        return;
      }

      if (data.execucao) {
        setExecucaoSelecionada(data.execucao);
      }
      await loadConfig();
      await loadExecucoes(data.execucao?.id);
    } catch (e: any) {
      alert(`Erro ao executar: ${e.message}`);
    }
    setExecutando(false);
  }

  async function excluirExecucao(id: number) {
    const execucao = execucoes.find((item) => item.id === id) || execucaoSelecionada;
    const statusAtual = execucao?.status === 'executando' && !config?.executandoAgora
      ? 'Essa execucao parece ter ficado presa por interrupcao ou deploy.'
      : null;

    const confirmed = window.confirm([
      `Excluir a execucao #${id}?`,
      statusAtual,
      'Essa acao remove o log da tela e nao pode ser desfeita.',
    ].filter(Boolean).join('\n\n'));

    if (!confirmed) return;

    setDeletingExecutionId(id);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/execucoes/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({ error: 'Erro ao excluir a execucao' }));
      if (!response.ok) {
        alert(data.error || 'Erro ao excluir a execucao');
        return;
      }

      await loadConfig();
      await loadExecucoes(execucaoSelecionada?.id === id ? undefined : execucaoSelecionada?.id);
    } catch (e: any) {
      alert(`Erro ao excluir: ${e.message}`);
    } finally {
      setDeletingExecutionId(null);
    }
  }

  async function limparHistorico() {
    const confirmed = window.confirm('Limpar todo o historico de execucoes da auditoria automatica?');
    if (!confirmed) return;

    setClearingHistory(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/execucoes`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({ error: 'Erro ao limpar o historico' }));
      if (!response.ok) {
        alert(data.error || 'Erro ao limpar o historico');
        return;
      }

      setExecucaoSelecionada(null);
      await loadConfig();
      await loadExecucoes();
    } catch (e: any) {
      alert(`Erro ao limpar historico: ${e.message}`);
    } finally {
      setClearingHistory(false);
    }
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Auditoria Automatica</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Auditoria Automatica</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Monitora divergencias de estoque, anuncios e sincroniza localizacao em segundo plano</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }} onClick={salvarConfiguracao} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configuracao'}
          </button>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: executando ? 0.6 : 1 }} onClick={executarAgora} disabled={executando || !!config?.executandoAgora}>
            {executando || config?.executandoAgora ? 'Executando...' : 'Executar agora'}
          </button>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Configuracao da rotina</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>
            A rotina usa todas as pecas cadastradas no ANB, agrupa por SKU-base e reaproveita as mesmas regras de divergencia da tela de Produtos Bling. O envio por email usa a API do Resend com o assunto fixo <strong>ALERTA ANB Parts - Divergencia de Produtos / Anuncios - Verifique</strong>.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Rotina ativa</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={auditoriaAtiva ? '1' : '0'} onChange={(e) => setAuditoriaAtiva(e.target.value === '1')}>
                <option value="1">Ativa</option>
                <option value="0">Pausada</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Horario da execucao</label>
              <input style={{ ...s.input, width: '100%' }} type="time" value={auditoriaHorario} onChange={(e) => setAuditoriaHorario(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Email destinatario</label>
              <input style={{ ...s.input, width: '100%' }} value={auditoriaEmailDestinatario} onChange={(e) => setAuditoriaEmailDestinatario(e.target.value)} placeholder="voce@anbparts.com.br" />
            </div>
            <div>
              <label style={s.label}>Email remetente</label>
              <input style={{ ...s.input, width: '100%' }} value={auditoriaResendFrom} onChange={(e) => setAuditoriaResendFrom(e.target.value)} placeholder="alertas@mail.anbparts.com.br" />
            </div>
            <div>
              <label style={s.label}>API Key do Resend</label>
              <input style={{ ...s.input, width: '100%' }} type="password" value={auditoriaResendApiKey} onChange={(e) => setAuditoriaResendApiKey(e.target.value)} placeholder={config?.resendApiKeyConfigured ? 'Ja configurada. Preencha so para trocar.' : 'Cole aqui a API Key'} />
            </div>
            <div>
              <label style={s.label}>Tamanho do lote</label>
              <input style={{ ...s.input, width: '100%' }} type="number" min="10" max="500" value={auditoriaTamanhoLote} onChange={(e) => setAuditoriaTamanhoLote(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Pausa entre lotes (ms)</label>
              <input style={{ ...s.input, width: '100%' }} type="number" min="0" max="15000" value={auditoriaPausaMs} onChange={(e) => setAuditoriaPausaMs(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={{ ...s.btn, background: 'var(--green)', color: '#fff' }} onClick={salvarConfiguracao} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar configuracao'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
              Deixe a API Key em branco para manter a atual. O email so e disparado quando houver divergencias.
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Status', value: auditoriaAtiva ? 'Ativa' : 'Pausada', color: auditoriaAtiva ? 'var(--green)' : 'var(--amber)' },
            { label: 'Horario', value: auditoriaHorario || '-', color: 'var(--gray-700)' },
            { label: 'Ultima execucao', value: fmtDateTime(config?.ultimaExecucao?.startedAt || config?.auditoriaUltimaExecucaoEm || null), color: 'var(--gray-700)' },
            { label: 'Ultimas divergencias', value: config?.ultimaExecucao?.totalDivergencias ?? 0, color: (config?.ultimaExecucao?.totalDivergencias || 0) > 0 ? 'var(--red)' : 'var(--green)' },
            { label: 'Email Resend', value: config?.resendApiKeyConfigured ? 'Configurado' : 'Nao configurado', color: config?.resendApiKeyConfigured ? 'var(--green)' : 'var(--amber)' },
            { label: 'Execucao agora', value: config?.executandoAgora ? 'Rodando' : 'Livre', color: config?.executandoAgora ? 'var(--blue-500)' : 'var(--gray-700)' },
          ].map((item) => (
            <div key={item.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>

        {resumoAtual && (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 12 }}>Resumo da execucao selecionada</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Consultados', value: resumoAtual.totalConsultados ?? 0, color: 'var(--gray-700)' },
                { label: 'Divergencias', value: resumoAtual.totalDivergencias ?? 0, color: 'var(--red)' },
                { label: 'Sem divergencia', value: resumoAtual.totalSemDivergencia ?? 0, color: 'var(--green)' },
              ].map((item) => (
                <div key={item.label} style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={s.label}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(resumoAtual.porTipo || {}).map(([tipo, total]) => (
                <span key={tipo} style={{ fontSize: 12, borderRadius: 999, padding: '5px 10px', background: 'var(--gray-100)', color: 'var(--gray-700)' }}>
                  {tipo}: {total}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Historico de execucoes</div>
              {execucoes.length > 0 && (
                <button style={{ ...s.btnGhost, opacity: clearingHistory ? 0.7 : 1 }} onClick={limparHistorico} disabled={clearingHistory || !!config?.executandoAgora}>
                  {clearingHistory ? 'Limpando...' : 'Limpar historico'}
                </button>
              )}
            </div>
            {execucoes.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Nenhuma execucao registrada ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {execucoes.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: execucaoSelecionada?.id === item.id ? 'var(--blue-50)' : 'var(--white)',
                      border: `1px solid ${execucaoSelecionada?.id === item.id ? 'var(--blue-200)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => loadExecucaoDetalhe(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          loadExecucaoDetalhe(item.id);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <strong style={{ color: 'var(--gray-800)', fontSize: 13 }}>#{item.id} - {item.origem === 'auto' ? 'Automatica' : 'Manual'}</strong>
                        <span style={{ fontSize: 12, color: statusColor(item.status), fontWeight: 700 }}>{statusLabel(item.status)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 6 }}>{fmtDateTime(item.startedAt)}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--gray-700)' }}>{item.totalSkus} SKU(s)</span>
                        <span style={{ fontSize: 12, color: (item.totalDivergencias || 0) > 0 ? 'var(--red)' : 'var(--green)' }}>{item.totalDivergencias} divergencia(s)</span>
                        {item.emailEnviado && <span style={{ fontSize: 12, color: 'var(--green)' }}>email enviado</span>}
                        {item.emailErro && <span style={{ fontSize: 12, color: 'var(--amber)' }}>email com erro</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        style={{ ...s.btnDanger, padding: '6px 10px', fontSize: 11, opacity: deletingExecutionId === item.id ? 0.7 : 1 }}
                        onClick={() => excluirExecucao(item.id)}
                        disabled={deletingExecutionId === item.id || (item.status === 'executando' && !!config?.executandoAgora)}
                      >
                        {deletingExecutionId === item.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            {execucaoSelecionada ? (
              <>
                <div style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-800)' }}>Execucao #{execucaoSelecionada.id}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                        {execucaoSelecionada.origem === 'auto' ? 'Rotina automatica' : 'Execucao manual'} - {fmtDateTime(execucaoSelecionada.startedAt)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: statusColor(execucaoSelecionada.status) }}>{statusLabel(execucaoSelecionada.status)}</div>
                      <button
                        type="button"
                        style={{ ...s.btnDanger, opacity: deletingExecutionId === execucaoSelecionada.id ? 0.7 : 1 }}
                        onClick={() => excluirExecucao(execucaoSelecionada.id)}
                        disabled={deletingExecutionId === execucaoSelecionada.id || (execucaoSelecionada.status === 'executando' && !!config?.executandoAgora)}
                      >
                        {deletingExecutionId === execucaoSelecionada.id ? 'Excluindo...' : 'Excluir execucao'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={s.label}>Consultados</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-700)' }}>{execucaoSelecionada.totalSkus}</div>
                    </div>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={s.label}>Divergencias</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{execucaoSelecionada.totalDivergencias}</div>
                    </div>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={s.label}>Sem divergencia</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{execucaoSelecionada.totalSemDivergencia}</div>
                    </div>
                    <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={s.label}>Email</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: execucaoSelecionada.emailEnviado ? 'var(--green)' : 'var(--gray-700)' }}>
                        {execucaoSelecionada.emailEnviado ? 'Enviado' : 'Nao enviado'}
                      </div>
                    </div>
                  </div>

                  {execucaoSelecionada.emailErro && (
                    <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '12px 14px', color: 'var(--amber)', fontSize: 13, marginBottom: 10 }}>
                      Erro no envio do email: {execucaoSelecionada.emailErro}
                    </div>
                  )}
                  {execucaoSelecionada.erro && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}>
                      Erro da execucao: {execucaoSelecionada.erro}
                    </div>
                  )}
                </div>

                {divergenciasAtuais.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>
                      Produtos divergentes - {divergenciasAtuais.length}
                    </div>
                    {divergenciasAtuais.map((item) => {
                      const borderColor = getBorderColor(item.tipo);
                      return (
                        <div key={`${execucaoSelecionada.id}-${item.tipo}-${item.sku}`} style={{ ...s.card, borderLeft: `3px solid ${borderColor}` }}>
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
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '18px 20px', color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>
                    Nenhuma divergencia armazenada nesta execucao.
                  </div>
                )}
              </>
            ) : (
              <div style={{ ...s.card, color: 'var(--gray-400)', fontSize: 13 }}>
                Selecione uma execucao para ver o detalhe.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
