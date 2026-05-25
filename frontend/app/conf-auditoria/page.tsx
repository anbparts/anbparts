'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif', textDecoration: 'none' },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
  btnGhost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-700)', fontFamily: 'Inter, sans-serif', textDecoration: 'none' },
};

type AuditoriaEscopo = 'full' | 'com_estoque' | 'com_estoque_mais_vendidos_ano';
type AuditoriaViewportMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';
type Config = {
  auditoriaAtiva: boolean; auditoriaHorario: string; auditoriaEscopo: AuditoriaEscopo; auditoriaTamanhoLote: number; auditoriaPausaMs: number;
  auditoriaLinkMlAtiva: boolean; auditoriaLinkMlHorario: string; auditoriaLinkMlIntervaloDias: number;
  auditoriaLinkMlUltimaExecucaoChave?: string | null; auditoriaLinkMlUltimaExecucaoEm?: string | null; auditoriaLinkMlExecutandoAgora?: boolean;
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

export default function ConfAuditoriaPage() {
  const [viewportMode, setViewportMode] = useState<AuditoriaViewportMode>('desktop');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executandoLinkMl, setExecutandoLinkMl] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [auditoriaAtiva, setAuditoriaAtiva] = useState(false);
  const [auditoriaHorario, setAuditoriaHorario] = useState('03:00');
  const [auditoriaEscopo, setAuditoriaEscopo] = useState<AuditoriaEscopo>('full');
  const [auditoriaTamanhoLote, setAuditoriaTamanhoLote] = useState('100');
  const [auditoriaPausaMs, setAuditoriaPausaMs] = useState('400');
  const [auditoriaLinkMlAtiva, setAuditoriaLinkMlAtiva] = useState(false);
  const [auditoriaLinkMlHorario, setAuditoriaLinkMlHorario] = useState('05:00');
  const [auditoriaLinkMlIntervaloDias, setAuditoriaLinkMlIntervaloDias] = useState('1');

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
    setAuditoriaLinkMlAtiva(!!data.auditoriaLinkMlAtiva);
    setAuditoriaLinkMlHorario(data.auditoriaLinkMlHorario || '05:00');
    setAuditoriaLinkMlIntervaloDias(String(data.auditoriaLinkMlIntervaloDias || 1));
  }

  async function salvarConfiguracao() {
    setSaving(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditoriaAtiva,
          auditoriaHorario,
          auditoriaEscopo,
          auditoriaTamanhoLote: Number(auditoriaTamanhoLote) || 100,
          auditoriaPausaMs: Number(auditoriaPausaMs) || 0,
          auditoriaLinkMlAtiva,
          auditoriaLinkMlHorario,
          auditoriaLinkMlIntervaloDias: Number(auditoriaLinkMlIntervaloDias) || 1,
        }),
      });
      const data = await response.json();
      if (!response.ok) return alert(data.error || 'Erro ao salvar a configuracao');
      await loadConfig();
      alert('Configuracoes salvas.');
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function executarLinkMlAgora() {
    setExecutandoLinkMl(true);
    try {
      const response = await fetch(`${API}/bling/auditoria-automatica/link-ml/executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) return alert(data.error || 'Erro ao executar a rotina de Link ML');
      await loadConfig();
      alert(`Rotina de Link ML concluida. ${data.totalAtualizadas || 0} peca(s) atualizada(s).`);
    } catch (e: any) {
      alert(`Erro ao executar rotina de Link ML: ${e.message}`);
    } finally {
      setExecutandoLinkMl(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadConfig()
      .catch((error) => { alert(error.message || 'Erro ao carregar configuracao'); })
      .finally(() => { setLoading(false); });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');
    const syncViewportMode = () => {
      if (phoneMedia.matches) { setViewportMode('phone'); return; }
      if (tabletPortraitMedia.matches) { setViewportMode('tablet-portrait'); return; }
      if (tabletLandscapeMedia.matches) { setViewportMode('tablet-landscape'); return; }
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

  const isPhone = viewportMode === 'phone';
  const isTabletPortrait = viewportMode === 'tablet-portrait';
  const isTabletLandscape = viewportMode === 'tablet-landscape';
  const pagePadding = isPhone ? 14 : isTabletPortrait || isTabletLandscape ? 18 : 28;
  const topbarPadding = isPhone ? '12px 14px' : isTabletPortrait || isTabletLandscape ? '14px 18px' : '0 28px';
  const configGridColumns = isPhone ? '1fr' : isTabletPortrait ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(180px, 1fr))';

  if (loading) return (
    <>
      <div style={{ ...s.topbar, padding: topbarPadding, height: 'auto', minHeight: 64, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Auditoria Automatica</div>
      </div>
      <div style={{ padding: pagePadding, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
    </>
  );

  return (
    <>
      <div style={{ ...s.topbar, padding: topbarPadding, height: 'auto', minHeight: 64, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Auditoria Automatica</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Configuracoes da rotina de auditoria e da rotina de atualizacao de links ML</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: isPhone ? '100%' : undefined }}>
          <Link href="/bling/auditoria-automatica" style={{ ...s.btnGhost }}>Ver Auditoria</Link>
          <button style={{ ...s.btn, background: 'var(--gray-100)', color: 'var(--gray-700)', border: '1px solid var(--border)' }} onClick={salvarConfiguracao} disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuracoes'}</button>
        </div>
      </div>

      <div style={{ padding: pagePadding }}>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Configuracao da Rotina de Validacao / Detran / Localizacao</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Defina quando a rotina principal vai rodar, como a base sera filtrada e com qual cadencia os lotes serao enviados para o Bling. O link do ML nao e mais atualizado aqui.</div>
          <div style={{ display: 'grid', gridTemplateColumns: configGridColumns, gap: 12, marginBottom: 16 }}>
            <div><label style={s.label}>Rotina ativa</label><select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={auditoriaAtiva ? '1' : '0'} onChange={(e) => setAuditoriaAtiva(e.target.value === '1')}><option value="1">Ativa</option><option value="0">Pausada</option></select></div>
            <div><label style={s.label}>Horario da execucao</label><input style={{ ...s.input, width: '100%' }} type="time" value={auditoriaHorario} onChange={(e) => setAuditoriaHorario(e.target.value)} /></div>
            <div><label style={s.label}>Escopo da auditoria</label><select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={auditoriaEscopo} onChange={(e) => setAuditoriaEscopo(e.target.value as AuditoriaEscopo)}>{ESCOPOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label style={s.label}>Tamanho do lote</label><input style={{ ...s.input, width: '100%' }} type="number" min="10" max="500" value={auditoriaTamanhoLote} onChange={(e) => setAuditoriaTamanhoLote(e.target.value)} /></div>
            <div><label style={s.label}>Pausa entre lotes (ms)</label><input style={{ ...s.input, width: '100%' }} type="number" min="0" max="15000" value={auditoriaPausaMs} onChange={(e) => setAuditoriaPausaMs(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{ESCOPOS.map((item) => <div key={item.value} style={{ padding: '7px 10px', borderRadius: 999, border: `1px solid ${auditoriaEscopo === item.value ? '#93c5fd' : 'var(--border)'}`, background: auditoriaEscopo === item.value ? '#eff6ff' : 'var(--gray-50)', color: auditoriaEscopo === item.value ? 'var(--blue-500)' : 'var(--gray-700)', fontSize: 12, fontWeight: 600 }}>{item.label}</div>)}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{ESCOPOS.find((item) => item.value === auditoriaEscopo)?.detail}</div>
        </div>

        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6 }}>Configuracao da Rotina de Link ML</div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Essa rotina usa o item ID do Mercado Livre salvo nas pecas com estoque e atualiza o permalink em horario separado, sem misturar com a full.</div>
            </div>
            <button
              style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: executandoLinkMl ? 0.6 : 1 }}
              onClick={executarLinkMlAgora}
              disabled={executandoLinkMl || !!config?.auditoriaLinkMlExecutandoAgora}
            >
              {executandoLinkMl || config?.auditoriaLinkMlExecutandoAgora ? 'Atualizando links...' : 'Atualizar links ML agora'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: configGridColumns, gap: 12, marginBottom: 16 }}>
            <div><label style={s.label}>Rotina ativa</label><select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={auditoriaLinkMlAtiva ? '1' : '0'} onChange={(e) => setAuditoriaLinkMlAtiva(e.target.value === '1')}><option value="1">Ativa</option><option value="0">Pausada</option></select></div>
            <div><label style={s.label}>Intervalo (dias)</label><input style={{ ...s.input, width: '100%' }} type="number" min="1" max="365" value={auditoriaLinkMlIntervaloDias} onChange={(e) => setAuditoriaLinkMlIntervaloDias(e.target.value)} /></div>
            <div><label style={s.label}>Horario da execucao</label><input style={{ ...s.input, width: '100%' }} type="time" value={auditoriaLinkMlHorario} onChange={(e) => setAuditoriaLinkMlHorario(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--gray-700)' }}><strong>Status:</strong> <span style={{ color: auditoriaLinkMlAtiva ? 'var(--green)' : 'var(--amber)' }}>{auditoriaLinkMlAtiva ? 'Ativa' : 'Pausada'}</span></div>
            <div style={{ fontSize: 12, color: 'var(--gray-700)' }}><strong>Ultima execucao:</strong> {fmtDateTime(config?.auditoriaLinkMlUltimaExecucaoEm || null)}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-700)' }}><strong>Executando agora:</strong> <span style={{ color: config?.auditoriaLinkMlExecutandoAgora ? 'var(--blue-500)' : 'var(--gray-700)' }}>{config?.auditoriaLinkMlExecutandoAgora ? 'Sim' : 'Nao'}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}
