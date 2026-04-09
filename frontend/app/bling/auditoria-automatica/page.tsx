'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif', textDecoration: 'none' },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
  btnDanger: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #fecaca', background: '#fef2f2', color: 'var(--red)', fontFamily: 'Inter, sans-serif' },
  btnGhost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', fontFamily: 'Inter, sans-serif', textDecoration: 'none' },
};

type AuditoriaEscopo = 'full' | 'com_estoque' | 'com_estoque_mais_vendidos_ano';
type ProgressoExecucao = {
  totalParaProcessar?: number;
  totalProcessados?: number;
  fase?: string;
  atualizadoEm?: string;
};
type Resumo = {
  totalConsultados?: number;
  totalDivergencias?: number;
  totalSemDivergencia?: number;
  porTipo?: Record<string, number>;
  progresso?: ProgressoExecucao | null;
};
type Divergencia = {
  sku: string; tipo: string; titulo: string; detalhe: string; estoqueAnb: number; estoqueBling: number; qtdTotalAnb: number; qtdVendidasAnb: number;
  qtdPrejuizoAnb?: number; idsPecaPrejuizo?: string[]; motivosPrejuizo?: string[]; descricaoAnb: string | null; descricaoBling: string | null; moto: string | null;
  statusMercadoLivre?: string | null; statusMercadoLivreAtivo?: boolean | null;
};
type Execucao = {
  id: number; origem: string; status: string; startedAt: string; finishedAt?: string | null; totalSkus: number; totalDivergencias: number; totalSemDivergencia: number;
  emailDestinatario?: string | null; emailEnviado: boolean; emailErro?: string | null; erro?: string | null; resumo?: Resumo | null; divergencias?: Divergencia[] | null;
};
type Config = {
  auditoriaAtiva: boolean; auditoriaHorario: string; auditoriaEscopo: AuditoriaEscopo; auditoriaTamanhoLote: number; auditoriaPausaMs: number;
  resendApiKeyConfigured: boolean; auditoriaEmailConfigurado?: boolean; detranEmailConfigurado?: boolean; configuracoesGeraisRemetente?: string;
  configuracoesGeraisAuditoriaDestinatario?: string; configuracoesGeraisAuditoriaTitulo?: string; auditoriaUltimaExecucaoChave?: string | null;
  auditoriaUltimaExecucaoEm?: string | null; executandoAgora?: boolean; ultimaExecucao?: Execucao | null;
};

const ESCOPOS: Array<{ value: AuditoriaEscopo; label: string; detail: string }> = [
  { value: 'full', label: 'Full', detail: 'Consulta toda a base cadastrada no ANB.' },
  { value: 'com_estoque', label: 'Somente com estoque', detail: 'Varre apenas materiais ainda disponiveis.' },
  { value: 'com_estoque_mais_vendidos_ano', label: 'Com estoque + vendidos no ano', detail: 'Inclui estoque atual e pecas sem estoque que venderam no ano corrente.' },
];

const fmtDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
};
const statusLabel = (status?: string) => status === 'sucesso' ? 'Sucesso' : status === 'sucesso_parcial' ? 'Sucesso parcial' : status === 'erro' ? 'Erro' : status === 'executando' ? 'Executando' : status || 'Nao informado';
const statusColor = (status?: string) => status === 'sucesso' ? 'var(--green)' : status === 'sucesso_parcial' ? 'var(--amber)' : status === 'erro' ? 'var(--red)' : status === 'executando' ? 'var(--blue-500)' : 'var(--gray-500)';
const borderColor = (tipo: string) => tipo === 'nao_encontrado_bling' ? 'var(--amber)' : tipo === 'nao_encontrado_anb' ? 'var(--blue-500)' : tipo === 'peca_em_prejuizo' ? '#b91c1c' : 'var(--red)';
const tipoLabel = (tipo: string) => String(tipo || '').replaceAll('_', ' ').replace(/\bml\b/gi, 'ML');
const escopoLabel = (value?: AuditoriaEscopo | string | null) => ESCOPOS.find((item) => item.value === value)?.label || 'Full';
const infoValue = (value?: string | null) => String(value || '').trim() || 'Nao configurado';
const clampProgress = (value: number, total: number) => Math.max(0, Math.min(total || 0, value || 0));

export default function AuditoriaAutomaticaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [deletingExecutionId, setDeletingExecutionId] = useState<number | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [execucaoSelecionada, setExecucaoSelecionada] = useState<Execucao | null>(null);
  const [auditoriaAtiva, setAuditoriaAtiva] = useState(false);
  const [auditoriaHorario, setAuditoriaHorario] = useState('03:00');
  const [auditoriaEscopo, setAuditoriaEscopo] = useState<AuditoriaEscopo>('full');
  const [auditoriaTamanhoLote, setAuditoriaTamanhoLote] = useState('100');
  const [auditoriaPausaMs, setAuditoriaPausaMs] = useState('400');

  async function loadConfig() {
    const response = await fetch(`${API}/bling/auditoria-automatica/config`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar configuracao');
    setConfig(data);
    setAuditoriaAtiva(!!data.auditoriaAtiva);
    setAuditoriaHorario(data.auditoriaHorario || '03:00');
    setAuditoriaEscopo((data.auditoriaEscopo || 'full') as AuditoriaEscopo);
    setAuditoriaTamanhoLote(String(data.auditoriaTamanhoLote || 100));
    setAuditoriaPausaMs(String(data.auditoriaPausaMs || 400));
  }

  async function loadExecucaoDetalhe(id: number) {
    const response = await fetch(`${API}/bling/auditoria-automatica/execucoes/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar execucao');
    if (data.execucao) setExecucaoSelecionada(data.execucao);
  }

  async function loadExecucoes(selectId?: number) {
    const response = await fetch(`${API}/bling/auditoria-automatica/execucoes?limit=20`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar execucoes');
    const rows = Array.isArray(data.execucoes) ? data.execucoes : [];
    setExecucoes(rows);
    const runningId = rows.find((item: Execucao) => item.status === 'executando')?.id;
    const preferredId = selectId || runningId || execucaoSelecionada?.id || rows[0]?.id;
    const targetId = rows.some((item: Execucao) => item.id === preferredId) ? preferredId : rows[0]?.id;
    if (targetId) await loadExecucaoDetalhe(targetId);
    else setExecucaoSelecionada(null);
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

  useEffect(() => { loadAll().catch((error) => { setLoading(false); alert(error.message || 'Erro ao carregar a auditoria automatica'); }); }, []);
  useEffect(() => {
    const executandoAgora = !!config?.executandoAgora || execucaoSelecionada?.status === 'executando';
    if (!executandoAgora) return;

    const intervalId = window.setInterval(() => {
      Promise.all([
        loadConfig(),
        loadExecucoes(config?.executandoAgora ? undefined : execucaoSelecionada?.id),
      ]).catch(() => {});
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [config?.executandoAgora, execucaoSelecionada?.id, execucaoSelecionada?.status]);
  useEffect(() => { setFiltroTipo(null); }, [execucaoSelecionada?.id]);

  const resumoAtual = useMemo(() => execucaoSelecionada?.resumo || config?.ultimaExecucao?.resumo || null, [config, execucaoSelecionada]);
  const progressoAtual = resumoAtual?.progresso || null;
  const totalParaProcessarAtual = Math.max(
    Number(progressoAtual?.totalParaProcessar || 0),
    Number(execucaoSelecionada?.totalSkus || 0),
    Number(resumoAtual?.totalConsultados || 0),
  );
  const totalProcessadosAtual = clampProgress(
    Number(
      progressoAtual?.totalProcessados
      ?? (execucaoSelecionada?.status === 'executando'
        ? 0
        : resumoAtual?.totalConsultados || execucaoSelecionada?.totalSkus || 0),
    ),
    totalParaProcessarAtual || Number(execucaoSelecionada?.totalSkus || 0) || Number(resumoAtual?.totalConsultados || 0),
  );
  const divergenciasAtuais = useMemo(() => Array.isArray(execucaoSelecionada?.divergencias) ? execucaoSelecionada.divergencias : [], [execucaoSelecionada]);
  const divergenciasFiltradas = useMemo(() => filtroTipo ? divergenciasAtuais.filter((item) => item.tipo === filtroTipo) : divergenciasAtuais, [divergenciasAtuais, filtroTipo]);
  const canDeleteLogs = !config?.executandoAgora;

  async function salvarConfiguracao() {
    setSaving(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditoriaAtiva, auditoriaHorario, auditoriaEscopo, auditoriaTamanhoLote: Number(auditoriaTamanhoLote) || 100, auditoriaPausaMs: Number(auditoriaPausaMs) || 0 }),
      });
      const data = await response.json();
      if (!response.ok) return alert(data.error || 'Erro ao salvar a configuracao');
      await loadConfig();
      alert('Configuracao salva.');
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function executarAgora() {
    setExecutando(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/executar`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await response.json();
      if (!response.ok) return alert(data.error || 'Erro ao executar auditoria');
      if (data.execucao) setExecucaoSelecionada(data.execucao);
      await loadConfig();
      await loadExecucoes(data.execucao?.id);
    } catch (e: any) {
      alert(`Erro ao executar: ${e.message}`);
    } finally {
      setExecutando(false);
    }
  }

  async function excluirExecucao(id: number) {
    const execucao = execucoes.find((item) => item.id === id) || execucaoSelecionada;
    const extra = execucao?.status === 'executando' && !config?.executandoAgora ? 'Essa execucao parece ter ficado presa por interrupcao ou deploy.' : null;
    if (!window.confirm([`Excluir a execucao #${id}?`, extra, 'Essa acao remove o log da tela e nao pode ser desfeita.'].filter(Boolean).join('\n\n'))) return;
    setDeletingExecutionId(id);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/execucoes/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({ error: 'Erro ao excluir a execucao' }));
      if (!response.ok) return alert(data.error || 'Erro ao excluir a execucao');
      await loadConfig();
      await loadExecucoes(execucaoSelecionada?.id === id ? undefined : execucaoSelecionada?.id);
    } catch (e: any) {
      alert(`Erro ao excluir: ${e.message}`);
    } finally {
      setDeletingExecutionId(null);
    }
  }

  async function limparHistorico() {
    if (!window.confirm('Limpar todo o historico de execucoes da auditoria automatica?')) return;
    setClearingHistory(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/execucoes`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({ error: 'Erro ao limpar o historico' }));
      if (!response.ok) return alert(data.error || 'Erro ao limpar o historico');
      setExecucaoSelecionada(null);
      await loadConfig();
      await loadExecucoes();
    } catch (e: any) {
      alert(`Erro ao limpar historico: ${e.message}`);
    } finally {
      setClearingHistory(false);
    }
  }

  if (loading) return <><div style={s.topbar}><div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Auditoria Automatica</div></div><div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div></>;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Auditoria Automatica</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Monitora divergencias de estoque, anuncios e sincroniza localizacao em segundo plano</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }} onClick={salvarConfiguracao} disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuracao'}</button>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: executando ? 0.6 : 1 }} onClick={executarAgora} disabled={executando || !!config?.executandoAgora}>{executando || config?.executandoAgora ? 'Executando...' : 'Executar agora'}</button>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Configuracao da rotina</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Defina quando a auditoria vai rodar, como a base sera filtrada e com qual cadencia os lotes serao enviados para o Bling.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div><label style={s.label}>Rotina ativa</label><select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={auditoriaAtiva ? '1' : '0'} onChange={(e) => setAuditoriaAtiva(e.target.value === '1')}><option value="1">Ativa</option><option value="0">Pausada</option></select></div>
            <div><label style={s.label}>Horario da execucao</label><input style={{ ...s.input, width: '100%' }} type="time" value={auditoriaHorario} onChange={(e) => setAuditoriaHorario(e.target.value)} /></div>
            <div><label style={s.label}>Escopo da auditoria</label><select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={auditoriaEscopo} onChange={(e) => setAuditoriaEscopo(e.target.value as AuditoriaEscopo)}>{ESCOPOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label style={s.label}>Tamanho do lote</label><input style={{ ...s.input, width: '100%' }} type="number" min="10" max="500" value={auditoriaTamanhoLote} onChange={(e) => setAuditoriaTamanhoLote(e.target.value)} /></div>
            <div><label style={s.label}>Pausa entre lotes (ms)</label><input style={{ ...s.input, width: '100%' }} type="number" min="0" max="15000" value={auditoriaPausaMs} onChange={(e) => setAuditoriaPausaMs(e.target.value)} /></div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #dbe3ef', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Configuracoes de email da auditoria</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>API Key do Resend, remetente, destinatario e titulo agora ficam centralizados em Config. Gerais para reaproveitar o envio de email em outros fluxos do sistema.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--gray-700)' }}><strong>Remetente:</strong> {infoValue(config?.configuracoesGeraisRemetente)}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-700)' }}><strong>Destinatario:</strong> {infoValue(config?.configuracoesGeraisAuditoriaDestinatario)}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-700)' }}><strong>Titulo:</strong> {infoValue(config?.configuracoesGeraisAuditoriaTitulo)}</div>
                </div>
              </div>
              <Link href="/configuracoes-gerais" style={{ ...s.btnGhost, whiteSpace: 'nowrap' }}>Abrir Config. Gerais</Link>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{ESCOPOS.map((item) => <div key={item.value} style={{ padding: '7px 10px', borderRadius: 999, border: `1px solid ${auditoriaEscopo === item.value ? '#93c5fd' : 'var(--border)'}`, background: auditoriaEscopo === item.value ? '#eff6ff' : 'var(--gray-50)', color: auditoriaEscopo === item.value ? 'var(--blue-500)' : 'var(--gray-700)', fontSize: 12, fontWeight: 600 }}>{item.label}</div>)}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{ESCOPOS.find((item) => item.value === auditoriaEscopo)?.detail}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Status', value: auditoriaAtiva ? 'Ativa' : 'Pausada', color: auditoriaAtiva ? 'var(--green)' : 'var(--amber)' },
            { label: 'Horario', value: auditoriaHorario || '-', color: 'var(--gray-700)' },
            { label: 'Escopo', value: escopoLabel(config?.auditoriaEscopo), color: 'var(--gray-700)' },
            { label: 'Ultima execucao', value: fmtDateTime(config?.ultimaExecucao?.startedAt || config?.auditoriaUltimaExecucaoEm || null), color: 'var(--gray-700)' },
            { label: 'Ultimas divergencias', value: config?.ultimaExecucao?.totalDivergencias ?? 0, color: (config?.ultimaExecucao?.totalDivergencias || 0) > 0 ? 'var(--red)' : 'var(--green)' },
            { label: 'Email auditoria', value: config?.auditoriaEmailConfigurado ? 'Configurado' : 'Revisar Config. Gerais', color: config?.auditoriaEmailConfigurado ? 'var(--green)' : 'var(--amber)' },
            { label: 'Execucao agora', value: config?.executandoAgora ? 'Rodando' : 'Livre', color: config?.executandoAgora ? 'var(--blue-500)' : 'var(--gray-700)' },
          ].map((item) => <div key={item.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}><div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div><div style={{ fontSize: item.label === 'Escopo' ? 16 : 20, fontWeight: 700, color: item.color }}>{item.value}</div></div>)}
        </div>

        {resumoAtual && (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 12 }}>Resumo da execucao selecionada</div>
            {progressoAtual && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--blue-500)', fontWeight: 700 }}>
                  {progressoAtual.fase || 'Em execucao'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                  Atualizado em {fmtDateTime(progressoAtual.atualizadoEm || null)}
                </span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Total p/ Processar', value: totalParaProcessarAtual || Number(resumoAtual.totalConsultados || 0), color: 'var(--gray-700)' },
                { label: 'Processados', value: totalProcessadosAtual, color: 'var(--blue-500)' },
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
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setFiltroTipo((current) => (current === tipo ? null : tipo))}
                  style={{
                    fontSize: 12,
                    borderRadius: 999,
                    padding: '5px 10px',
                    background: filtroTipo === tipo ? 'var(--blue-500)' : 'var(--gray-100)',
                    color: filtroTipo === tipo ? '#fff' : 'var(--gray-700)',
                    border: `1px solid ${filtroTipo === tipo ? 'var(--blue-500)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {tipoLabel(tipo)}: {total}
                </button>
              ))}
              {filtroTipo && (
                <button
                  type="button"
                  onClick={() => setFiltroTipo(null)}
                  style={{ fontSize: 12, borderRadius: 999, padding: '5px 10px', background: '#fef2f2', color: 'var(--red)', border: '1px solid #fecaca', cursor: 'pointer' }}
                >
                  Limpar filtro
                </button>
              )}
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
                  <div key={item.id} style={{ background: execucaoSelecionada?.id === item.id ? 'var(--blue-50)' : 'var(--white)', border: `1px solid ${execucaoSelecionada?.id === item.id ? 'var(--blue-200)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div role="button" tabIndex={0} onClick={() => loadExecucaoDetalhe(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); loadExecucaoDetalhe(item.id); } }} style={{ cursor: 'pointer' }}>
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
                      {canDeleteLogs ? (
                        <button type="button" style={{ ...s.btnDanger, padding: '6px 10px', fontSize: 11, opacity: deletingExecutionId === item.id ? 0.7 : 1 }} onClick={() => excluirExecucao(item.id)} disabled={deletingExecutionId === item.id}>
                          {deletingExecutionId === item.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600 }}>Exclusao indisponivel durante execucao</span>
                      )}
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
                      <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{execucaoSelecionada.origem === 'auto' ? 'Rotina automatica' : 'Execucao manual'} - {fmtDateTime(execucaoSelecionada.startedAt)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: statusColor(execucaoSelecionada.status) }}>{statusLabel(execucaoSelecionada.status)}</div>
                      {canDeleteLogs ? (
                        <button type="button" style={{ ...s.btnDanger, opacity: deletingExecutionId === execucaoSelecionada.id ? 0.7 : 1 }} onClick={() => excluirExecucao(execucaoSelecionada.id)} disabled={deletingExecutionId === execucaoSelecionada.id}>
                          {deletingExecutionId === execucaoSelecionada.id ? 'Excluindo...' : 'Excluir execucao'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 600 }}>Execucao em andamento nao pode ser removida</span>
                      )}
                    </div>
                  </div>
                  {progressoAtual && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: 'var(--blue-500)', fontWeight: 700 }}>
                        {progressoAtual.fase || 'Em execucao'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                        Atualizado em {fmtDateTime(progressoAtual.atualizadoEm || null)}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                    {[
                      { label: 'Total p/ Processar', value: totalParaProcessarAtual || execucaoSelecionada.totalSkus, color: 'var(--gray-700)' },
                      { label: 'Processados', value: totalProcessadosAtual, color: 'var(--blue-500)' },
                      { label: 'Divergencias', value: execucaoSelecionada.totalDivergencias, color: 'var(--red)' },
                      { label: 'Sem divergencia', value: execucaoSelecionada.totalSemDivergencia, color: 'var(--green)' },
                      { label: 'Email', value: execucaoSelecionada.emailEnviado ? 'Enviado' : 'Nao enviado', color: execucaoSelecionada.emailEnviado ? 'var(--green)' : 'var(--gray-700)' },
                    ].map((item) => (
                      <div key={item.label} style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={s.label}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  {execucaoSelecionada.emailErro && <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '12px 14px', color: 'var(--amber)', fontSize: 13, marginBottom: 10 }}>Erro no envio do email: {execucaoSelecionada.emailErro}</div>}
                  {execucaoSelecionada.erro && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px', color: 'var(--red)', fontSize: 13 }}>Erro da execucao: {execucaoSelecionada.erro}</div>}
                </div>

                {divergenciasAtuais.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)' }}>Produtos divergentes - {divergenciasFiltradas.length}</div>
                      {filtroTipo && <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Filtro ativo: <strong style={{ color: 'var(--blue-500)' }}>{tipoLabel(filtroTipo)}</strong></div>}
                    </div>
                    {divergenciasFiltradas.map((item) => (
                      <div key={`${execucaoSelecionada.id}-${item.tipo}-${item.sku}`} style={{ ...s.card, borderLeft: `3px solid ${borderColor(item.tipo)}` }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--gray-100)', color: 'var(--gray-500)', padding: '2px 8px', borderRadius: 5 }}>{item.sku}</span>
                          <span style={{ fontSize: 12, background: '#fef2f2', color: borderColor(item.tipo), padding: '2px 8px', borderRadius: 5 }}>{item.titulo}</span>
                          {item.statusMercadoLivre && <span style={{ fontSize: 12, background: item.statusMercadoLivreAtivo ? '#ecfdf3' : '#fef2f2', color: item.statusMercadoLivreAtivo ? 'var(--green)' : 'var(--red)', padding: '2px 8px', borderRadius: 5 }}>ML: {item.statusMercadoLivre}</span>}
                          {item.moto && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{item.moto}</span>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6 }}>{item.descricaoAnb || item.descricaoBling || 'Sem descricao'}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>{item.detalhe}</div>
                        {item.tipo === 'peca_em_prejuizo' && (
                          <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 14 }}>
                            IDs em prejuizo: {(item.idsPecaPrejuizo || []).join(', ') || 'Nao informado'}
                            {item.motivosPrejuizo && item.motivosPrejuizo.length > 0 && ` - Motivos: ${item.motivosPrejuizo.join(', ')}`}
                          </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                          {[
                            { label: 'Estoque ANB', value: item.estoqueAnb, color: 'var(--gray-700)' },
                            { label: 'Estoque Bling', value: item.estoqueBling, color: 'var(--gray-700)' },
                            { label: 'Total no ANB', value: item.qtdTotalAnb, color: 'var(--gray-700)' },
                            { label: 'Vendidas no ANB', value: item.qtdVendidasAnb, color: 'var(--gray-700)' },
                            { label: 'Em prejuizo no ANB', value: item.qtdPrejuizoAnb || 0, color: item.qtdPrejuizoAnb ? '#b91c1c' : 'var(--gray-700)' },
                            { label: 'Status ML', value: item.statusMercadoLivre || 'Nao identificado', color: item.statusMercadoLivreAtivo === false ? 'var(--red)' : 'var(--gray-700)' },
                          ].map((metric) => (
                            <div key={`${item.sku}-${metric.label}`} style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                              <div style={s.label}>{metric.label}</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: metric.color }}>{metric.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {filtroTipo && divergenciasFiltradas.length === 0 && <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '18px 20px', color: 'var(--blue-500)', fontSize: 14, fontWeight: 600 }}>Nenhuma divergencia desse tipo foi encontrada nesta execucao.</div>}
                  </div>
                ) : execucaoSelecionada.status === 'executando' ? (
                  <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '18px 20px', color: 'var(--blue-500)', fontSize: 14, fontWeight: 600 }}>
                    Execucao em andamento. As divergencias vao aparecer aqui assim que forem encontradas.
                  </div>
                ) : (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '18px 20px', color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>Nenhuma divergencia armazenada nesta execucao.</div>
                )}
              </>
            ) : (
              <div style={{ ...s.card, color: 'var(--gray-400)', fontSize: 13 }}>Selecione uma execucao para ver o detalhe.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
