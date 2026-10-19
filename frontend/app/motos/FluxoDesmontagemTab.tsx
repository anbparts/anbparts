'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type Fase = 'compra' | 'recepcao' | 'documentacao' | 'desmonte';

const FASES: Record<Fase, { rotulo: string; cor: string; claro: string }> = {
  compra: { rotulo: 'COMPRA', cor: '#1d4ed8', claro: '#dbeafe' },
  recepcao: { rotulo: 'RECEPÇÃO', cor: '#0d9488', claro: '#ccfbf1' },
  documentacao: { rotulo: 'DOCUMENTAÇÃO', cor: '#7e3fa8', claro: '#ede4f5' },
  desmonte: { rotulo: 'DESMONTE', cor: '#ea7a0c', claro: '#ffedd5' },
};

const ETAPAS: Array<{ n: number; nome: string; fase: Fase; icone: string }> = [
  { n: 1, nome: 'Moto Adquirida', fase: 'compra', icone: 'moto' },
  { n: 2, nome: 'Recepção da Moto na ANB', fase: 'recepcao', icone: 'galpao' },
  { n: 3, nome: 'Recepção da Documentação do Leilão', fase: 'documentacao', icone: 'doc' },
  { n: 4, nome: 'Transferência para nome ANB', fase: 'documentacao', icone: 'troca' },
  { n: 5, nome: 'Descaracterização da Moto', fase: 'documentacao', icone: 'moto2' },
  { n: 6, nome: 'Baixa permanente', fase: 'documentacao', icone: 'docban' },
  { n: 7, nome: 'Cadastro Moto SISDEV', fase: 'documentacao', icone: 'db' },
  { n: 8, nome: 'Laudo Etiquetas', fase: 'documentacao', icone: 'tag' },
  { n: 9, nome: 'Início do processo de Desmonte e Cadastro', fase: 'desmonte', icone: 'chave' },
  { n: 10, nome: 'Finalização do processo de Desmonte e Cadastro', fase: 'desmonte', icone: 'engrenagem' },
];

const PENDENTE = '#7b7a8e';

function Icone({ tipo, cor, tamanho = 34 }: { tipo: string; cor: string; tamanho?: number }) {
  const props = { width: tamanho, height: tamanho, viewBox: '0 0 24 24', fill: 'none', stroke: cor, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const moto = (<><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="17" r="3" /><path d="M5.5 17 8 10h5l3 4 2.5 3M13 10l-1-3h-2" /></>);
  switch (tipo) {
    case 'moto': return <svg {...props}>{moto}</svg>;
    case 'moto2': return <svg {...props}>{moto}<path d="M20 2.5v3M18.5 4h3" /></svg>;
    case 'galpao': return <svg {...props}><path d="M3 21V9l9-6 9 6v12" /><path d="M8 21v-7h8v7" /></svg>;
    case 'doc': return <svg {...props}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
    case 'troca': return <svg {...props}><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg>;
    case 'docban': return <svg {...props}><path d="M6 3h9l4 4v5M6 3v18h6" /><circle cx="17" cy="17" r="4" /><path d="m14.2 19.8 5.6-5.6" /></svg>;
    case 'db': return <svg {...props}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
    case 'tag': return <svg {...props}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.2" /></svg>;
    case 'chave': return <svg {...props}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
  }
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtData(iso?: string | null) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}
function diasEntre(a: string, b: string) {
  const ms = (x: string) => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return Math.round((ms(b) - ms(a)) / 86400000);
}
function pluralDias(n: number) { return `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`; }

// Calcula, para uma moto, o estado de cada etapa e as duracoes (data da etapa - data da etapa confirmada anterior).
function analisarMoto(moto: any) {
  const etapas: Record<number, { data: string }> = moto.etapas || {};
  let anterior: string | null = null;
  let soma = 0;
  const linhas = ETAPAS.map((e) => {
    const data = etapas[e.n]?.data || null;
    let duracao: number | null = null;
    if (data) {
      duracao = anterior ? diasEntre(anterior, data) : 0;
      soma += Math.max(0, duracao);
      anterior = data;
    }
    return { ...e, data, duracao };
  });
  const concluidas = linhas.filter((l) => l.data).length;
  const atual = linhas.find((l) => !l.data)?.n || 0;
  const datas = linhas.map((l) => l.data).filter(Boolean) as string[];
  const primeira = datas.length ? datas.slice().sort()[0] : null;
  const ultima = datas.length ? datas.slice().sort()[datas.length - 1] : null;
  const fim = concluidas === ETAPAS.length ? ultima : hojeIso();
  return { linhas, concluidas, atual, soma, diasDesdeCompra: etapas[1]?.data && fim ? diasEntre(etapas[1].data, fim) : null, primeira, ultima };
}

export default function FluxoDesmontagemTab({ canEdit, isPhone }: { canEdit: boolean; isPhone: boolean }) {
  const [motos, setMotos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'andamento' | 'concluidas' | 'nao_iniciadas'>('todas');
  const [expandidos, setExpandidos] = useState<number[]>([]);
  const [editando, setEditando] = useState<{ motoId: number; etapa: number; data: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    try {
      const resp = await fetch(`${API}/motos/fluxo`, { credentials: 'include' });
      const d = await resp.json();
      if (d?.ok) setMotos(d.motos || []);
      else setErro(d?.error || 'Erro ao carregar o fluxo');
    } catch (e: any) { setErro(e?.message || 'Erro ao carregar o fluxo'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);

  async function salvarEtapa(motoId: number, etapa: number, data: string | null) {
    setSalvando(true);
    try {
      const resp = await fetch(`${API}/motos/${motoId}/fluxo/${etapa}`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
      setMotos((prev) => prev.map((m) => {
        if (m.id !== motoId) return m;
        const etapas = { ...(m.etapas || {}) };
        if (data) etapas[etapa] = { data, por: null }; else delete etapas[etapa];
        return { ...m, etapas };
      }));
      setEditando(null);
    } catch (e: any) { alert(e?.message || 'Erro ao salvar a etapa'); }
    setSalvando(false);
  }

  function abrirEdicao(motoId: number, etapa: number, dataAtual: string | null) {
    if (!canEdit) return;
    setEditando({ motoId, etapa, data: dataAtual || hojeIso() });
  }

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return motos
      .map((m) => ({ moto: m, a: analisarMoto(m) }))
      .filter(({ moto, a }) => {
        if (q && ![String(moto.id), moto.marca, moto.modelo, moto.ano, moto.placa].join(' ').toLowerCase().includes(q)) return false;
        if (filtro === 'concluidas') return a.concluidas === ETAPAS.length;
        if (filtro === 'nao_iniciadas') return a.concluidas === 0;
        if (filtro === 'andamento') return a.concluidas > 0 && a.concluidas < ETAPAS.length;
        return true;
      });
  }, [motos, busca, filtro]);

  const totais = useMemo(() => {
    const todos = motos.map(analisarMoto);
    return {
      total: todos.length,
      concluidas: todos.filter((a) => a.concluidas === ETAPAS.length).length,
      andamento: todos.filter((a) => a.concluidas > 0 && a.concluidas < ETAPAS.length).length,
      naoIniciadas: todos.filter((a) => a.concluidas === 0).length,
    };
  }, [motos]);

  function alternarExpandido(id: number) {
    setExpandidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setEditando(null);
  }

  const chip = (rotulo: string, ativo: boolean, onClick: () => void) => (
    <button key={rotulo} type="button" onClick={onClick}
      style={{ border: '1px solid ' + (ativo ? 'var(--ink)' : 'var(--border)'), background: ativo ? 'var(--ink)' : 'var(--white)', color: ativo ? 'var(--white)' : 'var(--ink-soft)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'Geist, sans-serif' }}>
      {rotulo}
    </button>
  );

  // ── Cartao de uma etapa (desktop) ──
  function CartaoEtapa({ motoId, l, atual }: { motoId: number; l: any; atual: boolean }) {
    const fase = FASES[l.fase as Fase];
    const concluida = !!l.data;
    const emAndamento = !concluida && atual;
    const estado = concluida ? 'CONCLUÍDO' : emAndamento ? 'EM ANDAMENTO' : 'NÃO CONFIRMADO';
    const fundoRodape = concluida ? fase.claro : emAndamento ? '#ffedd5' : '#f1f1f6';
    const corRodape = concluida ? fase.cor : emAndamento ? '#c2560a' : '#6b6a80';
    const ativo = editando?.motoId === motoId && editando?.etapa === l.n;
    return (
      <div style={{ background: 'var(--white)', border: `2px solid ${ativo ? fase.cor : fase.claro}`, borderTop: `7px solid ${fase.cor}`, borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: ativo ? '0 4px 14px rgba(15,23,42,.12)' : 'none' }}>
        <div style={{ padding: '14px 10px 10px', textAlign: 'center', minHeight: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Icone tipo={l.icone} cor={fase.cor} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25 }}>{l.nome}</div>
        </div>
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'grid', gap: 8, fontSize: 12 }}>
          <div>
            <div style={{ color: 'var(--ink-muted)', fontSize: 11 }}>Data</div>
            <div style={{ fontWeight: 700, color: concluida ? 'var(--ink)' : 'var(--ink-muted)', fontSize: 13.5 }}>{fmtData(l.data)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--ink-muted)', fontSize: 11 }}>Duração</div>
            <div style={{ fontWeight: 700, color: l.duracao != null && l.duracao < 0 ? '#dc2626' : concluida ? 'var(--ink)' : 'var(--ink-muted)', fontSize: 13.5 }}>{l.duracao != null ? pluralDias(l.duracao) : '—'}</div>
          </div>
        </div>
        <button type="button" disabled={!canEdit} onClick={() => abrirEdicao(motoId, l.n, l.data)}
          title={canEdit ? (concluida ? 'Alterar a data ou voltar para pendente' : 'Confirmar esta etapa') : 'Seu usuário não tem permissão para alterar o fluxo'}
          style={{ marginTop: 'auto', border: 'none', background: fundoRodape, color: corRodape, fontSize: 11, fontWeight: 800, letterSpacing: '.3px', padding: '9px 6px', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'Geist, sans-serif' }}>
          {estado}
        </button>
      </div>
    );
  }

  // ── Barra de edicao (confirmar / mudar data / voltar para pendente) ──
  function BarraEdicao({ motoId, a }: { motoId: number; a: any }) {
    if (!editando || editando.motoId !== motoId) return null;
    const etapa = ETAPAS.find((e) => e.n === editando.etapa)!;
    const fase = FASES[etapa.fase];
    const jaConfirmada = !!a.linhas.find((x: any) => x.n === etapa.n)?.data;
    return (
      <div style={{ margin: '14px 0 4px', padding: '12px 14px', borderRadius: 10, border: `1px solid ${fase.cor}`, background: fase.claro + '66', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--ink)', flex: '1 1 260px' }}>
          <strong>Etapa {etapa.n}</strong> · {etapa.nome}
          {etapa.n === 1 ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>A data da compra também é atualizada no cadastro da moto.</div> : null}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>
          Data
          <input type="date" value={editando.data} onChange={(e) => setEditando({ ...editando, data: e.target.value })}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'Geist, sans-serif', background: 'var(--white)' }} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={salvando || !editando.data} onClick={() => salvarEtapa(motoId, etapa.n, editando.data)}
            style={{ border: 'none', background: fase.cor, color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: salvando || !editando.data ? 0.6 : 1, fontFamily: 'Geist, sans-serif' }}>
            {salvando ? 'Salvando...' : jaConfirmada ? 'Salvar data' : 'Confirmar etapa'}
          </button>
          {jaConfirmada && (
            <button type="button" disabled={salvando} onClick={() => { if (confirm(`Voltar a etapa "${etapa.nome}" para pendente?`)) salvarEtapa(motoId, etapa.n, null); }}
              style={{ border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink-soft)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'Geist, sans-serif' }}>
              Voltar para pendente
            </button>
          )}
          <button type="button" onClick={() => setEditando(null)}
            style={{ border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink-soft)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'Geist, sans-serif' }}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Fluxo completo de uma moto ──
  function Fluxo({ moto, a }: { moto: any; a: any }) {
    const rodape = (
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '.4px' }}>LEGENDA</span>
          {(Object.keys(FASES) as Fase[]).map((k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: FASES[k].cor, display: 'inline-block' }} />
              {k === 'compra' ? 'Compra' : k === 'recepcao' ? 'Recepção' : k === 'documentacao' ? 'Documentação' : 'Desmonte'}
            </span>
          ))}
        </div>
        <div style={{ textAlign: isPhone ? 'left' : 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Duração informada das atividades</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1d4ed8' }}>{a.soma} dias somados</div>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>A soma das durações é apenas informativa e não representa o prazo total do processo.</div>
        </div>
      </div>
    );

    if (isPhone) {
      return (
        <div>
          {a.linhas.map((l: any, idx: number) => {
            const fase = FASES[l.fase as Fase];
            const concluida = !!l.data;
            const emAndamento = !concluida && a.atual === l.n;
            const novaFase = idx === 0 || a.linhas[idx - 1].fase !== l.fase;
            return (
              <div key={l.n}>
                {novaFase ? <div style={{ margin: idx ? '14px 0 8px' : '0 0 8px', background: fase.cor, color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, letterSpacing: '.4px' }}>{fase.rotulo}</div> : null}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: `1px solid ${fase.claro}`, borderLeft: `5px solid ${fase.cor}`, borderRadius: 10, marginBottom: 8, background: 'var(--white)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: concluida || emAndamento ? fase.cor : PENDENTE, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{concluida ? '✓' : l.n}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{l.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{fmtData(l.data)}{l.duracao != null ? ` · ${pluralDias(l.duracao)}` : ''}</div>
                  </div>
                  <button type="button" disabled={!canEdit} onClick={() => abrirEdicao(moto.id, l.n, l.data)}
                    style={{ border: 'none', borderRadius: 8, padding: '8px 10px', fontSize: 10.5, fontWeight: 800, background: concluida ? fase.claro : emAndamento ? '#ffedd5' : '#f1f1f6', color: concluida ? fase.cor : emAndamento ? '#c2560a' : '#6b6a80', cursor: canEdit ? 'pointer' : 'default' }}>
                    {concluida ? 'CONCLUÍDO' : emAndamento ? 'EM ANDAMENTO' : 'NÃO CONFIRMADO'}
                  </button>
                </div>
              </div>
            );
          })}
          {BarraEdicao({ motoId: moto.id, a })}
          {rodape}
        </div>
      );
    }

    return (
      <div>
        <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
          <div style={{ minWidth: 1180 }}>
            {/* Faixas das fases */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(112px, 1fr))', gap: 8, marginBottom: 14 }}>
              {([['compra', '1 / 2'], ['recepcao', '2 / 3'], ['documentacao', '3 / 9'], ['desmonte', '9 / 11']] as Array<[Fase, string]>).map(([k, col]) => (
                <div key={k} style={{ gridColumn: col, background: FASES[k].cor, color: '#fff', borderRadius: 8, padding: '9px 0', textAlign: 'center', fontSize: 13, fontWeight: 800, letterSpacing: '.3px' }}>{FASES[k].rotulo}</div>
              ))}
            </div>
            {/* Linha de circulos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(112px, 1fr))', gap: 8, marginBottom: 12 }}>
              {a.linhas.map((l: any, idx: number) => {
                const fase = FASES[l.fase as Fase];
                const concluida = !!l.data;
                const emAndamento = !concluida && a.atual === l.n;
                return (
                  <div key={l.n} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ flex: 1, height: 3, background: idx === 0 ? 'transparent' : fase.cor, opacity: idx === 0 ? 0 : 0.85 }} />
                    <div style={{ position: 'relative', width: 46, height: 46, borderRadius: '50%', background: concluida || emAndamento ? fase.cor : PENDENTE, color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(15,23,42,.18)' }}>
                      {l.n}
                      <span style={{ position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)', width: 20, height: 20, borderRadius: '50%', background: concluida ? '#16a34a' : '#fff', border: concluida ? '2px solid #fff' : `5px solid ${emAndamento ? fase.cor : PENDENTE}`, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{concluida ? '✓' : ''}</span>
                    </div>
                    <div style={{ flex: 1, height: 3, background: idx === a.linhas.length - 1 ? 'transparent' : fase.cor, opacity: idx === a.linhas.length - 1 ? 0 : 0.85 }} />
                  </div>
                );
              })}
            </div>
            {/* Cartoes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(112px, 1fr))', gap: 8, marginTop: 22 }}>
              {a.linhas.map((l: any) => <div key={l.n}>{CartaoEtapa({ motoId: moto.id, l, atual: a.atual === l.n })}</div>)}
            </div>
          </div>
        </div>
        {BarraEdicao({ motoId: moto.id, a })}
        {rodape}
      </div>
    );
  }

  return (
    <div style={{ padding: isPhone ? 12 : 28, display: 'grid', gap: 16 }}>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: isPhone ? 12 : '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por ID, marca, modelo ou placa..."
          style={{ flex: '1 1 260px', border: '1px solid var(--border)', borderRadius: 999, padding: '9px 16px', fontSize: 13, background: 'var(--gray-50, #f8fafc)', fontFamily: 'Geist, sans-serif', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chip(`Todas (${totais.total})`, filtro === 'todas', () => setFiltro('todas'))}
          {chip(`Em andamento (${totais.andamento})`, filtro === 'andamento', () => setFiltro('andamento'))}
          {chip(`Não iniciadas (${totais.naoIniciadas})`, filtro === 'nao_iniciadas', () => setFiltro('nao_iniciadas'))}
          {chip(`Concluídas (${totais.concluidas})`, filtro === 'concluidas', () => setFiltro('concluidas'))}
        </div>
      </div>

      {erro ? <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div> : null}
      {carregando ? <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-muted)' }}>Carregando...</div> : null}
      {!carregando && !lista.length ? <div style={{ padding: 32, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>Nenhuma moto neste filtro.</div> : null}

      {lista.map(({ moto, a }) => {
        const aberto = expandidos.includes(moto.id);
        const completa = a.concluidas === ETAPAS.length;
        const etapaAtual = ETAPAS.find((e) => e.n === a.atual);
        const faseAtual = etapaAtual ? FASES[etapaAtual.fase] : FASES.desmonte;
        const status = completa ? { t: 'Concluído', c: '#16a34a', f: '#ecfdf3' } : a.concluidas > 0 ? { t: 'Em andamento', c: '#c2560a', f: '#ffedd5' } : { t: 'Não iniciado', c: '#6b6a80', f: '#f1f1f6' };
        return (
          <div key={moto.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <button type="button" onClick={() => alternarExpandido(moto.id)}
              style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: isPhone ? '14px' : '16px 20px', display: 'grid', gridTemplateColumns: isPhone ? '24px minmax(0,1fr)' : '24px minmax(220px, 1.3fr) minmax(200px, 1fr) minmax(220px, 1.2fr) 150px 130px', gap: isPhone ? 10 : 18, alignItems: 'center', fontFamily: 'Geist, sans-serif' }}>
              <span style={{ color: 'var(--ink-muted)', fontSize: 14 }}>{aberto ? '▾' : '▸'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}><span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>#{moto.id}</span> {moto.marca} {moto.modelo}{moto.ano ? ` ${moto.ano}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{moto.placa ? `Placa ${moto.placa}` : 'Sem placa'}</div>
              </div>
              {!isPhone && (
                <div>
                  <div style={{ height: 8, borderRadius: 99, background: '#e9e9f1', overflow: 'hidden' }}>
                    <div style={{ width: `${(a.concluidas / ETAPAS.length) * 100}%`, height: '100%', background: completa ? '#16a34a' : faseAtual.cor, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 5 }}>{a.concluidas} de {ETAPAS.length} etapas concluídas</div>
                </div>
              )}
              {!isPhone && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {completa ? 'Fluxo finalizado' : <><span style={{ color: faseAtual.cor, fontWeight: 700 }}>Etapa {a.atual}</span> · {etapaAtual?.nome}</>}
                </div>
              )}
              {!isPhone && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  {a.diasDesdeCompra != null ? <><strong>{pluralDias(a.diasDesdeCompra)}</strong><div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{completa ? 'da compra até a conclusão' : 'desde a compra'}</div></> : <span style={{ color: 'var(--ink-muted)' }}>Sem data de compra</span>}
                </div>
              )}
              <span style={{ justifySelf: isPhone ? 'start' : 'end', gridColumn: isPhone ? '2' : undefined, padding: '4px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: status.f, color: status.c }}>
                {status.t}{isPhone ? ` · ${a.concluidas}/${ETAPAS.length}` : ''}
              </span>
            </button>
            {aberto && (
              <div style={{ padding: isPhone ? '4px 12px 16px' : '6px 22px 20px', borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                {Fluxo({ moto, a })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
