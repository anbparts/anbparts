'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type Modo = 'desligado' | 'estoque' | 'status' | 'completo';
type Verificar = { anbBling: boolean; ml: Modo; nuvemshop: Modo; shopee: Modo; magalu: Modo };
type Periodo = { tipo: 'dias' | 'mes_atual' | 'mes_anterior'; dias: number };
type Conferencia = { id: string; nome: string; ativo: boolean; horarios: string[]; periodo: Periodo; verificar: Verificar; enviarEmail: boolean };
type AgendConfig = {
  madrugada: { verificar: Verificar; enviarEmail: boolean };
  conferencias: Conferencia[];
};
type LinhaRelatorio = {
  id: string; tipo: 'madrugada' | 'conferencia' | 'linkml'; nome: string; ativo: boolean; horarios: string[]; proxima: string | null; escopo: string; periodo: string | null;
  verifica: string[]; email: string; detalhe: string | null; ultima: { id?: number; origem?: string; status?: string; startedAt?: string; totalSkus?: number; totalDivergencias?: number } | null;
};

const s: any = {
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  pill: { fontSize: 11.5, padding: '3px 10px', borderRadius: 999, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' },
};

const fmtDataHora = (v?: string | null) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR');
};
const origemTxt = (o?: string) => (o === 'auto' ? 'automática' : o === 'rapida_auto' ? 'agendada' : o === 'manual' || o === 'rapida_manual' || o === 'mes_manual' ? 'manual' : o || '');
const statusCor = (st?: string) => (st === 'sucesso' ? 'var(--green)' : st === 'erro' ? 'var(--red)' : st === 'executando' ? 'var(--blue-500)' : 'var(--amber)');

function VerificarEditor({ valor, onChange, enviarEmail, onEmail, isPhone }: { valor: Verificar; onChange: (v: Verificar) => void; enviarEmail: boolean; onEmail: (b: boolean) => void; isPhone: boolean }) {
  // cada canal tem o seu modo: nao verificar / so estoque / so status / completo (Shopee e Magalu: so estoque)
  const canal = (nome: string, chave: 'ml' | 'nuvemshop' | 'shopee' | 'magalu', dica: string, soEstoque = false) => (
    <div>
      <label style={s.label}>{nome}</label>
      <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={valor[chave]} onChange={(e) => onChange({ ...valor, [chave]: e.target.value as Modo })}>
        <option value="desligado">Não verificar</option>
        <option value="estoque">Só estoque do anúncio</option>
        {soEstoque ? null : <option value="status">Só status do anúncio</option>}
        {soEstoque ? null : <option value="completo">Completo (estoque + status)</option>}
      </select>
      <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 4 }}>{dica}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--gray-700)', cursor: 'pointer' }}>
        <input type="checkbox" checked={valor.anbBling} onChange={(e) => onChange({ ...valor, anbBling: e.target.checked })} style={{ marginTop: 2 }} />
        <span>Estoque ANB × Bling<span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray-400)' }}>Divergência de quantidade, SKU não encontrado e peça em prejuízo.</span></span>
      </label>
      {canal('Mercado Livre', 'ml', 'Estoque = anúncio ativo sem estoque. Status = tem estoque mas o anúncio não está ativo.')}
      {canal('Nuvemshop', 'nuvemshop', 'Estoque = ativo sem estoque / com peça em prejuízo. Status = sem anúncio ou anúncio inativo com estoque.')}
      {canal('Shopee', 'shopee', 'Somente anúncios ativos: com estoque lá sem ter aqui (e o inverso). Status de bloqueado/excluído não é analisado.', true)}
      {canal('Magalu', 'magalu', 'Somente anúncios ativos: com estoque lá sem ter aqui (e o inverso). Status de bloqueado/excluído não é analisado.', true)}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--gray-700)', cursor: 'pointer' }}>
        <input type="checkbox" checked={enviarEmail} onChange={(e) => onEmail(e.target.checked)} style={{ marginTop: 2 }} />
        <span>Enviar e-mail quando houver divergência<span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray-400)' }}>Sempre envia, mesmo que a divergência seja repetida.</span></span>
      </label>
    </div>
  );
}

const MAX_CONFERENCIAS = 8;
const ESCOPOS: Array<{ value: string; label: string; detail: string }> = [
  { value: 'full', label: 'Full', detail: 'Consulta toda a base cadastrada no ANB.' },
  { value: 'com_estoque', label: 'Somente com estoque', detail: 'Varre apenas materiais ainda disponíveis.' },
  { value: 'com_estoque_mais_vendidos_ano', label: 'Com estoque + vendidos no ano', detail: 'Inclui estoque atual e peças sem estoque que venderam no ano corrente.' },
];

type Rascunho = { ativa: boolean; horario: string; escopo: string; lote: string; pausa: string; intervalo: string };

function EditorMadrugada({ r, setR, verificar, onVerificar, email, onEmail, onSalvar, onCancelar, salvando, isPhone }: {
  r: Rascunho; setR: (r: Rascunho) => void; verificar: Verificar; onVerificar: (v: Verificar) => void; email: boolean; onEmail: (b: boolean) => void;
  onSalvar: () => void; onCancelar: () => void; salvando: boolean; isPhone: boolean;
}) {
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 6 }}>
        <div><label style={s.label}>Rotina</label>
          <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={r.ativa ? '1' : '0'} onChange={(e) => setR({ ...r, ativa: e.target.value === '1' })}><option value="1">Ativa</option><option value="0">Pausada</option></select></div>
        <div><label style={s.label}>Horário da execução</label><input style={{ ...s.input, width: '100%' }} type="time" value={r.horario} onChange={(e) => setR({ ...r, horario: e.target.value })} /></div>
        <div><label style={s.label}>Escopo da auditoria</label>
          <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={r.escopo} onChange={(e) => setR({ ...r, escopo: e.target.value })}>{ESCOPOS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div>
        <div><label style={s.label}>Tamanho do lote</label><input style={{ ...s.input, width: '100%' }} type="number" min="10" max="500" value={r.lote} onChange={(e) => setR({ ...r, lote: e.target.value })} /></div>
        <div><label style={s.label}>Pausa entre lotes (ms)</label><input style={{ ...s.input, width: '100%' }} type="number" min="0" max="15000" value={r.pausa} onChange={(e) => setR({ ...r, pausa: e.target.value })} /></div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>{ESCOPOS.find((x) => x.value === r.escopo)?.detail}</div>
      <VerificarEditor valor={verificar} onChange={onVerificar} enviarEmail={email} onEmail={onEmail} isPhone={isPhone} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' }} onClick={onCancelar} disabled={salvando}>Cancelar</button>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: salvando ? 0.6 : 1 }} onClick={onSalvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>
  );
}

function EditorLinkMl({ r, setR, onSalvar, onCancelar, onExecutar, executando, salvando, isPhone }: {
  r: Rascunho; setR: (r: Rascunho) => void; onSalvar: () => void; onCancelar: () => void; onExecutar: () => void; executando: boolean; salvando: boolean; isPhone: boolean;
}) {
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>Usa o item ID do Mercado Livre salvo nas peças com estoque e atualiza o permalink em horário separado, sem misturar com a auditoria completa.</div>
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div><label style={s.label}>Rotina</label>
          <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={r.ativa ? '1' : '0'} onChange={(e) => setR({ ...r, ativa: e.target.value === '1' })}><option value="1">Ativa</option><option value="0">Pausada</option></select></div>
        <div><label style={s.label}>Intervalo (dias)</label><input style={{ ...s.input, width: '100%' }} type="number" min="1" max="365" value={r.intervalo} onChange={(e) => setR({ ...r, intervalo: e.target.value })} /></div>
        <div><label style={s.label}>Horário da execução</label><input style={{ ...s.input, width: '100%' }} type="time" value={r.horario} onChange={(e) => setR({ ...r, horario: e.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 14 }}>
        <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', opacity: executando ? 0.6 : 1 }} onClick={onExecutar} disabled={executando}>{executando ? 'Atualizando links...' : 'Atualizar links ML agora'}</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' }} onClick={onCancelar} disabled={salvando}>Cancelar</button>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: salvando ? 0.6 : 1 }} onClick={onSalvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
const novoId = () => 'c' + Date.now().toString(36);

function EditorConferencia({ conf, onChange, onSalvar, onCancelar, salvando, isPhone }: { conf: Conferencia; onChange: (c: Conferencia) => void; onSalvar: () => void; onCancelar: () => void; salvando: boolean; isPhone: boolean }) {
  const setHorario = (idx: number, v: string) => onChange({ ...conf, horarios: conf.horarios.map((h, k) => (k === idx ? v : h)) });
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div><label style={s.label}>Nome</label><input style={{ ...s.input, width: '100%' }} value={conf.nome} maxLength={60} onChange={(e) => onChange({ ...conf, nome: e.target.value })} /></div>
        <div>
          <label style={s.label}>Rotina</label>
          <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={conf.ativo ? '1' : '0'} onChange={(e) => onChange({ ...conf, ativo: e.target.value === '1' })}><option value="1">Ativa</option><option value="0">Pausada</option></select>
        </div>
        <div>
          <label style={s.label}>Período dos SKUs vendidos</label>
          <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={conf.periodo.tipo} onChange={(e) => onChange({ ...conf, periodo: { ...conf.periodo, tipo: e.target.value as Periodo['tipo'] } })}>
            <option value="dias">Últimos N dias</option><option value="mes_atual">Mês atual</option><option value="mes_anterior">Mês anterior</option>
          </select>
        </div>
        {conf.periodo.tipo === 'dias' ? (
          <div><label style={s.label}>Quantidade de dias (hoje menos N)</label>
            <input style={{ ...s.input, width: '100%' }} type="number" min="1" max="365" value={conf.periodo.dias} onChange={(e) => onChange({ ...conf, periodo: { ...conf.periodo, dias: Math.max(1, Math.min(365, Number(e.target.value) || 1)) } })} /></div>
        ) : null}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={s.label}>Horários de execução (até 8)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {conf.horarios.map((h, idx) => (
            <span key={idx} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input style={{ ...s.input, width: 112 }} type="time" value={h} onChange={(e) => setHorario(idx, e.target.value)} />
              <button type="button" title="Remover horário" onClick={() => onChange({ ...conf, horarios: conf.horarios.filter((_, k) => k !== idx) })} style={{ ...s.btn, padding: '6px 10px', background: 'var(--white)', color: 'var(--gray-500)', border: '1px solid var(--border)' }}>×</button>
            </span>
          ))}
          {conf.horarios.length < 8 ? <button type="button" onClick={() => onChange({ ...conf, horarios: [...conf.horarios, '12:00'] })} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}>+ Horário</button> : null}
        </div>
      </div>
      <VerificarEditor valor={conf.verificar} onChange={(v) => onChange({ ...conf, verificar: v })} enviarEmail={conf.enviarEmail} onEmail={(b) => onChange({ ...conf, enviarEmail: b })} isPhone={isPhone} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' }} onClick={onCancelar} disabled={salvando}>Cancelar</button>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: salvando ? 0.6 : 1 }} onClick={onSalvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>
  );
}

export default function AgendamentosSection({ isPhone, onConfigChanged }: { isPhone: boolean; onConfigChanged?: () => void }) {
  const [config, setConfig] = useState<AgendConfig | null>(null);
  const [relatorio, setRelatorio] = useState<LinhaRelatorio[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [main, setMain] = useState<any>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [executandoLink, setExecutandoLink] = useState(false);

  async function carregar() {
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/agendamentos`, { credentials: 'include' });
      const d = await resp.json();
      if (!resp.ok || d?.ok === false) throw new Error(d?.error || 'Erro ao carregar os agendamentos');
      setConfig(d.config);
      setRelatorio(Array.isArray(d.relatorio) ? d.relatorio : []);
      setErro('');
    } catch (e: any) { setErro(e?.message || 'Erro ao carregar os agendamentos'); }
  }
  useEffect(() => { carregar(); }, []);

  async function carregarMain() {
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/config`, { credentials: 'include' });
      const d = await resp.json();
      if (resp.ok) setMain(d);
    } catch { /* painel segue com o que ja tem */ }
  }
  useEffect(() => { carregarMain(); }, []);

  function abrirFixo(tipo: 'madrugada' | 'linkml') {
    if (editando === tipo) { setEditando(null); return; }
    const m = main || {};
    setRascunho(tipo === 'madrugada'
      ? { ativa: !!m.auditoriaAtiva, horario: m.auditoriaHorario || '03:00', escopo: m.auditoriaEscopo || 'full', lote: String(m.auditoriaTamanhoLote || 100), pausa: String(m.auditoriaPausaMs ?? 400), intervalo: '1' }
      : { ativa: !!m.auditoriaLinkMlAtiva, horario: m.auditoriaLinkMlHorario || '05:00', escopo: 'full', lote: '100', pausa: '400', intervalo: String(m.auditoriaLinkMlIntervaloDias || 1) });
    setEditando(tipo);
  }

  async function postMain(body: any) {
    const resp = await fetch(`${API}/bling/auditoria-automatica/config`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(d?.error || `Erro ${resp.status}`);
  }

  async function salvarMadrugada() {
    if (!rascunho || !config) return;
    setSalvando(true);
    try {
      await postMain({ auditoriaAtiva: rascunho.ativa, auditoriaHorario: rascunho.horario, auditoriaEscopo: rascunho.escopo, auditoriaTamanhoLote: Number(rascunho.lote) || 100, auditoriaPausaMs: Number(rascunho.pausa) || 0 });
      const resp = await fetch(`${API}/bling/auditoria-automatica/agendamentos`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
      setConfig(d.config); setRelatorio(Array.isArray(d.relatorio) ? d.relatorio : []);
      await carregarMain(); onConfigChanged?.(); setEditando(null);
    } catch (e: any) { alert(`Erro ao salvar: ${e?.message || e}`); }
    setSalvando(false);
  }

  async function salvarLinkMl() {
    if (!rascunho) return;
    setSalvando(true);
    try {
      await postMain({ auditoriaLinkMlAtiva: rascunho.ativa, auditoriaLinkMlHorario: rascunho.horario, auditoriaLinkMlIntervaloDias: Number(rascunho.intervalo) || 1 });
      await carregar(); await carregarMain(); onConfigChanged?.(); setEditando(null);
    } catch (e: any) { alert(`Erro ao salvar: ${e?.message || e}`); }
    setSalvando(false);
  }

  async function executarLinkMl() {
    setExecutandoLink(true);
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/link-ml/executar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d?.error || `Erro ${resp.status}`);
      await carregar();
      alert(`Rotina de Link ML concluida. ${d.totalAtualizadas || 0} peca(s) atualizada(s).`);
    } catch (e: any) { alert(`Erro ao executar rotina de Link ML: ${e?.message || e}`); }
    setExecutandoLink(false);
  }

  // grava a configuracao inteira; devolve true se salvou
  async function gravar(nova: AgendConfig, avisar = false): Promise<boolean> {
    setSalvando(true);
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/agendamentos`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: nova }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
      setConfig(d.config);
      setRelatorio(Array.isArray(d.relatorio) ? d.relatorio : []);
      if (avisar) alert('Agendamentos salvos.');
      return true;
    } catch (e: any) { alert(`Erro ao salvar: ${e?.message || e}`); return false; }
    finally { setSalvando(false); }
  }

  async function alternarRotinaFixa(linha: LinhaRelatorio) {
    const body = linha.tipo === 'madrugada' ? { auditoriaAtiva: !linha.ativo } : { auditoriaLinkMlAtiva: !linha.ativo };
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/config`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d?.error || `Erro ${resp.status}`);
      await carregar();
      await carregarMain();
      onConfigChanged?.();
    } catch (e: any) { alert(`Erro: ${e?.message || e}`); }
  }

  async function executarConferencia(id: string) {
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/rapida/executar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d?.error || `Erro ${resp.status}`);
      alert('Conferência iniciada em segundo plano. Acompanhe na tela de Auditoria Automática.');
    } catch (e: any) { alert(`Erro ao executar: ${e?.message || e}`); }
  }

  function irPara(idElemento: string) {
    const el = typeof document !== 'undefined' ? document.getElementById(idElemento) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (erro) return <div style={{ ...s.card, color: 'var(--red)', fontSize: 13 }}>{erro}</div>;
  if (!config) return <div style={{ ...s.card, color: 'var(--gray-400)', fontSize: 13 }}>Carregando agendamentos...</div>;

  const confs = config.conferencias;
  const setConf = (id: string, nova: Conferencia) => setConfig({ ...config, conferencias: confs.map((c) => (c.id === id ? nova : c)) });
  const btnMini = { ...s.btn, padding: '5px 12px', fontSize: 12, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' };

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir a conferência "${nome}"? Ela deixa de rodar e o agendamento é apagado.`)) return;
    const ok = await gravar({ ...config!, conferencias: confs.filter((c) => c.id !== id) });
    if (ok) setEditando(null);
  }
  async function alternarConferencia(c: Conferencia) { await gravar({ ...config!, conferencias: confs.map((x) => (x.id === c.id ? { ...x, ativo: !x.ativo } : x)) }); }
  function nova() {
    const id = novoId();
    setConfig({ ...config!, conferencias: [...confs, { id, nome: 'Nova conferência', ativo: true, horarios: ['12:00'], periodo: { tipo: 'dias', dias: 3 }, verificar: { anbBling: true, ml: 'completo', nuvemshop: 'completo', shopee: 'estoque', magalu: 'estoque' }, enviarEmail: true }] });
    setEditando(id);
  }

  return (
    <>
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Relatório dos agendamentos</div>
          {confs.length < MAX_CONFERENCIAS ? <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={nova}>+ Nova conferência</button> : null}
        </div>
        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Como cada rotina está configurada hoje e como vai rodar na próxima vez (horário de São Paulo). Clique em Editar para mexer em tudo da rotina num lugar só; também dá para pausar, executar e excluir.</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {relatorio.map((linha) => {
            const confId = linha.tipo === 'conferencia' ? linha.id.replace(/^conf:/, '') : '';
            const conf = confId ? confs.find((c) => c.id === confId) : undefined;
            const aberto = !!conf && editando === conf.id;
            return (
              <div key={linha.id} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${linha.ativo ? 'var(--green)' : 'var(--amber)'}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13.5, color: 'var(--gray-800)' }}>{linha.nome}</strong>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: linha.ativo ? 'var(--green)' : 'var(--amber)' }}>{linha.ativo ? 'Ativa' : 'Pausada'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {conf ? <button style={btnMini} onClick={() => setEditando(aberto ? null : conf.id)}>{aberto ? 'Fechar' : 'Editar'}</button>
                      : <button style={btnMini} onClick={() => abrirFixo(linha.tipo as 'madrugada' | 'linkml')}>{editando === linha.tipo ? 'Fechar' : 'Editar'}</button>}
                    {conf ? <button style={btnMini} onClick={() => alternarConferencia(conf)} disabled={salvando}>{conf.ativo ? 'Pausar' : 'Ativar'}</button>
                      : <button style={btnMini} onClick={() => alternarRotinaFixa(linha)}>{linha.ativo ? 'Pausar' : 'Ativar'}</button>}
                    {conf ? <button style={btnMini} onClick={() => executarConferencia(conf.id)}>Executar agora</button> : null}
                    {conf ? <button style={{ ...btnMini, color: 'var(--red)' }} onClick={() => excluir(conf.id, conf.nome)} disabled={salvando}>Excluir</button> : null}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--gray-600)' }}>
                  <div><strong>Horários:</strong> {linha.horarios.length ? linha.horarios.join(' · ') : 'nenhum'}{linha.proxima ? ` — próxima: ${linha.proxima}` : ''}</div>
                  <div><strong>{linha.periodo ? 'Período' : 'Escopo'}:</strong> {linha.periodo || linha.escopo}{linha.periodo ? ` — ${linha.escopo}` : ''}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><strong>Verifica:</strong>{linha.verifica.map((v) => <span key={v} style={s.pill}>{v}</span>)}</div>
                  <div><strong>E-mail:</strong> {linha.email}</div>
                  {linha.detalhe ? <div><strong>Lotes:</strong> {linha.detalhe}</div> : null}
                  <div><strong>Última execução:</strong> {linha.ultima ? <>{fmtDataHora(linha.ultima.startedAt)}{linha.ultima.status ? <> — <span style={{ color: statusCor(linha.ultima.status), fontWeight: 600 }}>{linha.ultima.status}</span> ({origemTxt(linha.ultima.origem)}; {linha.ultima.totalSkus ?? 0} SKU(s), {linha.ultima.totalDivergencias ?? 0} divergência(s))</> : null}</> : 'nunca'}</div>
                </div>
                {editando === 'madrugada' && linha.tipo === 'madrugada' && rascunho ? <EditorMadrugada r={rascunho} setR={setRascunho} verificar={config.madrugada.verificar}
                  onVerificar={(v) => setConfig({ ...config, madrugada: { ...config.madrugada, verificar: v } })} email={config.madrugada.enviarEmail}
                  onEmail={(b) => setConfig({ ...config, madrugada: { ...config.madrugada, enviarEmail: b } })} salvando={salvando} isPhone={isPhone}
                  onSalvar={salvarMadrugada} onCancelar={async () => { setEditando(null); await carregar(); }} /> : null}
                {editando === 'linkml' && linha.tipo === 'linkml' && rascunho ? <EditorLinkMl r={rascunho} setR={setRascunho} salvando={salvando} isPhone={isPhone}
                  executando={executandoLink || !!main?.auditoriaLinkMlExecutandoAgora} onExecutar={executarLinkMl} onSalvar={salvarLinkMl} onCancelar={() => setEditando(null)} /> : null}
                {aberto && conf ? <EditorConferencia conf={conf} onChange={(c) => setConf(conf.id, c)} salvando={salvando} isPhone={isPhone}
                  onSalvar={async () => { if (await gravar(config)) setEditando(null); }} onCancelar={async () => { setEditando(null); await carregar(); }} /> : null}
              </div>
            );
          })}
          {/* conferencia recem-criada ainda nao salva (nao aparece no relatorio do servidor) */}
          {confs.filter((c) => !relatorio.some((l) => l.id === 'conf:' + c.id)).map((c) => (
            <div key={c.id} style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <strong style={{ fontSize: 13.5 }}>{c.nome}</strong> <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>(ainda não salva)</span>
              <EditorConferencia conf={c} onChange={(x) => setConf(c.id, x)} salvando={salvando} isPhone={isPhone}
                onSalvar={async () => { if (await gravar(config)) setEditando(null); }} onCancelar={async () => { setEditando(null); await carregar(); }} />
            </div>
          ))}
        </div>
      </div>

    </>
  );
}
