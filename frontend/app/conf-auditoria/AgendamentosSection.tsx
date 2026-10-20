'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type Modo = 'desligado' | 'estoque' | 'status' | 'completo';
type Verificar = { anbBling: boolean; ml: Modo; nuvemshop: Modo; shopee: Modo; magalu: Modo };
type Periodo = { tipo: 'dias' | 'mes_atual' | 'mes_anterior'; dias: number };
type AgendConfig = {
  madrugada: { verificar: Verificar; enviarEmail: boolean };
  rapida: { ativo: boolean; horarios: string[]; periodo: Periodo; verificar: Verificar; enviarEmail: boolean };
};
type LinhaRelatorio = {
  id: string; nome: string; ativo: boolean; horarios: string[]; proxima: string | null; escopo: string; periodo: string | null;
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

export default function AgendamentosSection({ isPhone }: { isPhone: boolean }) {
  const [config, setConfig] = useState<AgendConfig | null>(null);
  const [relatorio, setRelatorio] = useState<LinhaRelatorio[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

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

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    try {
      const resp = await fetch(`${API}/bling/auditoria-automatica/agendamentos`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
      setConfig(d.config);
      setRelatorio(Array.isArray(d.relatorio) ? d.relatorio : []);
      alert('Agendamentos salvos.');
    } catch (e: any) { alert(`Erro ao salvar: ${e?.message || e}`); }
    setSalvando(false);
  }

  if (erro) return <div style={{ ...s.card, color: 'var(--red)', fontSize: 13 }}>{erro}</div>;
  if (!config) return <div style={{ ...s.card, color: 'var(--gray-400)', fontSize: 13 }}>Carregando agendamentos...</div>;

  const r = config.rapida;
  const setRapida = (patch: Partial<AgendConfig['rapida']>) => setConfig({ ...config, rapida: { ...r, ...patch } });
  const setHorario = (i: number, v: string) => setRapida({ horarios: r.horarios.map((h, idx) => (idx === i ? v : h)) });

  return (
    <>
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 4 }}>Relatório dos agendamentos</div>
        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Como cada rotina está configurada hoje e como vai rodar na próxima vez (horário de São Paulo).</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {relatorio.map((linha) => (
            <div key={linha.id} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${linha.ativo ? 'var(--green)' : 'var(--amber)'}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5, color: 'var(--gray-800)' }}>{linha.nome}</strong>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: linha.ativo ? 'var(--green)' : 'var(--amber)' }}>{linha.ativo ? 'Ativa' : 'Pausada'}</span>
              </div>
              <div style={{ display: 'grid', gap: 4, fontSize: 12.5, color: 'var(--gray-600)' }}>
                <div><strong>Horários:</strong> {linha.horarios.length ? linha.horarios.join(' · ') : 'nenhum'}{linha.proxima ? ` — próxima: ${linha.proxima}` : ''}</div>
                <div><strong>{linha.periodo ? 'Período' : 'Escopo'}:</strong> {linha.periodo || linha.escopo}{linha.periodo ? ` — ${linha.escopo}` : ''}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><strong>Verifica:</strong>{linha.verifica.map((v) => <span key={v} style={s.pill}>{v}</span>)}</div>
                <div><strong>E-mail:</strong> {linha.email}</div>
                {linha.detalhe ? <div><strong>Lotes:</strong> {linha.detalhe}</div> : null}
                <div><strong>Última execução:</strong> {linha.ultima ? <>{fmtDataHora(linha.ultima.startedAt)}{linha.ultima.status ? <> — <span style={{ color: statusCor(linha.ultima.status), fontWeight: 600 }}>{linha.ultima.status}</span> ({origemTxt(linha.ultima.origem)}; {linha.ultima.totalSkus ?? 0} SKU(s), {linha.ultima.totalDivergencias ?? 0} divergência(s))</> : null}</> : 'nunca'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>Auditoria completa (madrugada) — o que verifica</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Horário, escopo e lotes ficam no bloco "Rotina de Validação" acima. Aqui você escolhe quais sistemas entram na verificação. Em cada canal escolha o que conferir: só estoque, só status ou completo. Canal em "Não verificar" deixa de ser consultado (Nuvemshop, Shopee e Magalu); no ML e no Estoque ANB × Bling só os alertas são ocultados.</div>
        <VerificarEditor valor={config.madrugada.verificar} onChange={(v) => setConfig({ ...config, madrugada: { ...config.madrugada, verificar: v } })}
          enviarEmail={config.madrugada.enviarEmail} onEmail={(b) => setConfig({ ...config, madrugada: { ...config.madrugada, enviarEmail: b } })} isPhone={isPhone} />
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 4 }}>Conferência menor (durante o dia)</div>
        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 14 }}>Confere só os SKUs com peça vendida no período escolhido. Os botões "Conferência rápida" e "Conferência do mês" da tela de Auditoria usam esta configuração (o do mês sempre usa o mês atual).</div>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={s.label}>Rotina</label>
            <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={r.ativo ? '1' : '0'} onChange={(e) => setRapida({ ativo: e.target.value === '1' })}>
              <option value="1">Ativa</option><option value="0">Pausada</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Período dos SKUs vendidos</label>
            <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={r.periodo.tipo} onChange={(e) => setRapida({ periodo: { ...r.periodo, tipo: e.target.value as Periodo['tipo'] } })}>
              <option value="dias">Últimos N dias</option>
              <option value="mes_atual">Mês atual</option>
              <option value="mes_anterior">Mês anterior</option>
            </select>
          </div>
          {r.periodo.tipo === 'dias' ? (
            <div>
              <label style={s.label}>Quantidade de dias (hoje menos N)</label>
              <input style={{ ...s.input, width: '100%' }} type="number" min="1" max="365" value={r.periodo.dias} onChange={(e) => setRapida({ periodo: { ...r.periodo, dias: Math.max(1, Math.min(365, Number(e.target.value) || 1)) } })} />
            </div>
          ) : null}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Horários de execução (até 8)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {r.horarios.map((h, i) => (
              <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input style={{ ...s.input, width: 112 }} type="time" value={h} onChange={(e) => setHorario(i, e.target.value)} />
                <button type="button" title="Remover horário" onClick={() => setRapida({ horarios: r.horarios.filter((_, idx) => idx !== i) })} style={{ ...s.btn, padding: '6px 10px', background: 'var(--white)', color: 'var(--gray-500)', border: '1px solid var(--border)' }}>×</button>
              </span>
            ))}
            {r.horarios.length < 8 ? <button type="button" onClick={() => setRapida({ horarios: [...r.horarios, '12:00'] })} style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)' }}>+ Horário</button> : null}
          </div>
        </div>
        <VerificarEditor valor={r.verificar} onChange={(v) => setRapida({ verificar: v })} enviarEmail={r.enviarEmail} onEmail={(b) => setRapida({ enviarEmail: b })} isPhone={isPhone} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: salvando ? 0.6 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar agendamentos'}</button>
      </div>
    </>
  );
}
