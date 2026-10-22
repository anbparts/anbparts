'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 14 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)', width: '100%', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  th: { textAlign: 'left' as const, padding: '8px 10px', fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const },
  td: { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' as const },
};

const NOMES_RECURSO: Record<string, string> = {
  ml_categoria: 'Mercado Livre · categoria (IA)',
  ml_categoria_cache: 'Mercado Livre · categoria (resposta guardada)',
  nuvemshop_sugerir_ia: 'Nuvemshop · "Analisar com IA"',
  nuvemshop_tags: 'Nuvemshop · tags',
};
const nomeRecurso = (r: string) => NOMES_RECURSO[r] || r;
const fmtNum = (n: number) => Number(n || 0).toLocaleString('pt-BR');
const usd = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtDataHora = (v?: string | null) => { if (!v) return '-'; const d = new Date(v + (String(v).endsWith('Z') ? '' : 'Z')); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR'); };

type Status = { origemAtiva: 'banco' | 'ambiente' | 'nenhuma'; final: string; noBanco: boolean; legivelNoBanco: boolean; atualizadoEm: string | null; atualizadoPor: string | null; ambienteConfigurado: boolean; podeEditar: boolean };
type Uso = {
  dias: number; totais: { chamadas: number; evitadas: number; erros: number; entrada: number; saida: number; custoUsd: number };
  porRecurso: Array<{ recurso: string; chamadas: number; evitadas: number; erros: number; entrada: number; saida: number; custoUsd: number }>;
  porUsuario: Array<{ usuario: string; chamadas: number; entrada: number; saida: number; custoUsd: number }>;
  porDia: Array<{ dia: string; chamadas: number; evitadas: number; entrada: number; saida: number }>;
  ultimas: Array<{ id: number; criadoEm: string; recurso: string; usuario: string | null; modelo: string | null; tipo: string; entrada: number; saida: number; ok: boolean; erro: string | null; duracaoMs: number | null; contexto: string | null }>;
  precos: { entradaUsdMtok: number; saidaUsdMtok: number };
};

async function chamar(path: string, init?: RequestInit) {
  const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok || d?.ok === false) throw new Error(d?.error || d?.mensagem || `Erro ${resp.status}`);
  return d;
}

export default function ConfAnthropicPage() {
  const isPhone = useIsPhone();
  const [status, setStatus] = useState<Status | null>(null);
  const [uso, setUso] = useState<Uso | null>(null);
  const [dias, setDias] = useState(30);
  const [novaChave, setNovaChave] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [erro, setErro] = useState('');

  async function carregarStatus() { try { setStatus(await chamar('/anthropic/status')); } catch (e: any) { setErro(e?.message || 'Erro ao carregar'); } }
  async function carregarUso(d = dias) { try { setUso(await chamar(`/anthropic/uso?dias=${d}`)); setErro(''); } catch (e: any) { setErro(e?.message || 'Erro ao carregar o relatorio'); } }
  useEffect(() => { carregarStatus(); }, []);
  useEffect(() => { carregarUso(dias); }, [dias]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setSalvando(true); setMsg(null);
    try {
      const d = await chamar('/anthropic/chave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: novaChave }) });
      setNovaChave('');
      setMsg({ ok: true, texto: `Chave salva. ${d.mensagem || ''}` });
      await carregarStatus();
    } catch (e: any) { setMsg({ ok: false, texto: e?.message || 'Erro ao salvar' }); }
    setSalvando(false);
  }
  async function testar() {
    setTestando(true); setMsg(null);
    try { const d = await chamar('/anthropic/testar', { method: 'POST' }).catch((e) => ({ ok: false, mensagem: e?.message })); setMsg({ ok: !!d.ok, texto: d.mensagem || '' }); }
    finally { setTestando(false); }
  }

  const pad = isPhone ? 14 : 28;
  const maxDia = Math.max(1, ...(uso?.porDia || []).map((x) => x.entrada + x.saida));
  const tile = (rotulo: string, valor: string, sub?: string) => (
    <div style={{ ...s.card, padding: '12px 16px', marginBottom: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Anthropic</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Chave da API e consumo de tokens do sistema</div>
        </div>
      </div>

      <div style={{ padding: pad, maxWidth: 1200 }}>
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Chave da API</div>
          {status ? (
            <div style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.7, marginBottom: 12 }}>
              <div>
                Em uso: {status.origemAtiva === 'nenhuma' ? <strong style={{ color: '#b91c1c' }}>nenhuma chave configurada (os recursos de IA ficam desligados)</strong>
                  : <><strong>…{status.final}</strong> <span style={{ color: 'var(--gray-500)' }}>({status.origemAtiva === 'banco' ? 'guardada no sistema' : 'variável de ambiente do servidor'})</span></>}
              </div>
              {status.noBanco ? <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Guardada no sistema em {fmtDataHora(status.atualizadoEm)}{status.atualizadoPor ? ` por ${status.atualizadoPor}` : ''}.{!status.legivelNoBanco ? ' ⚠ Não foi possível ler a chave guardada (o segredo do servidor mudou): salve a chave de novo.' : ''}</div> : null}
              {status.ambienteConfigurado && status.origemAtiva === 'banco' ? <div style={{ fontSize: 12, color: '#92400e' }}>Ainda existe uma chave antiga na variável de ambiente ANTHROPIC_API_KEY do Railway. Ela não é mais usada; revogue-a no console da Anthropic e apague a variável.</div> : null}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 12 }}>Carregando...</div>}
          {status?.podeEditar ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...s.input, flex: '1 1 320px', width: 'auto', fontFamily: 'JetBrains Mono, monospace' }} type="password" autoComplete="off" placeholder="Cole a nova chave (sk-ant-...)" value={novaChave} onChange={(e) => setNovaChave(e.target.value)} />
              <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: !novaChave.trim() || salvando ? 0.6 : 1 }} onClick={salvar} disabled={!novaChave.trim() || salvando}>{salvando ? 'Validando e salvando...' : 'Validar e salvar'}</button>
              <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }} onClick={testar} disabled={testando}>{testando ? 'Testando...' : 'Testar a chave em uso'}</button>
            </div>
          ) : <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Seu usuário não tem permissão para trocar a chave.</div>}
          {msg ? <div style={{ marginTop: 10, fontSize: 13, color: msg.ok ? '#166534' : '#b91c1c' }}>{msg.texto}</div> : null}
          <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 10 }}>A chave fica criptografada no banco e nunca volta para a tela. Antes de salvar, o sistema confere com a Anthropic se ela é válida.</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Consumo de tokens</div>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDias(d)} style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: dias === d ? 'var(--gray-800)' : 'var(--white)', color: dias === d ? '#fff' : 'var(--gray-600)', borderColor: dias === d ? 'var(--gray-800)' : 'var(--border)' }}>Últimos {d} dias</button>
          ))}
        </div>
        {erro ? <div style={{ ...s.card, color: '#b91c1c', fontSize: 13 }}>{erro}</div> : null}

        {uso ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
              {tile('Chamadas à IA', fmtNum(uso.totais.chamadas), uso.totais.erros ? `${uso.totais.erros} com erro` : undefined)}
              {tile('Tokens de entrada', fmtNum(uso.totais.entrada))}
              {tile('Tokens de saída', fmtNum(uso.totais.saida))}
              {tile('Custo estimado', usd(uso.totais.custoUsd), `US$ ${uso.precos.entradaUsdMtok}/${uso.precos.saidaUsdMtok} por milhão (entrada/saída)`)}
              {tile('Chamadas evitadas', fmtNum(uso.totais.evitadas), 'resolvidas por regra, API do ML ou resposta guardada')}
            </div>

            <div style={s.card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Por recurso (onde está o consumo)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead><tr>{['Recurso', 'Chamadas', 'Evitadas', 'Erros', 'Entrada', 'Saída', 'Média entrada/chamada', 'Custo'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {uso.porRecurso.length ? uso.porRecurso.map((r) => (
                      <tr key={r.recurso}>
                        <td style={{ ...s.td, fontWeight: 600 }}>{nomeRecurso(r.recurso)}</td>
                        <td style={s.td}>{fmtNum(r.chamadas)}</td><td style={s.td}>{fmtNum(r.evitadas)}</td><td style={{ ...s.td, color: r.erros ? '#b91c1c' : undefined }}>{fmtNum(r.erros)}</td>
                        <td style={s.td}>{fmtNum(r.entrada)}</td><td style={s.td}>{fmtNum(r.saida)}</td>
                        <td style={s.td}>{r.chamadas ? fmtNum(Math.round(r.entrada / r.chamadas)) : '-'}</td><td style={s.td}>{usd(r.custoUsd)}</td>
                      </tr>
                    )) : <tr><td style={{ ...s.td, color: 'var(--gray-400)' }} colSpan={8}>Nenhum uso registrado neste período. O registro começa a valer depois da atualização do sistema.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
              <div style={s.card}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Por usuário</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Usuário', 'Chamadas', 'Entrada', 'Saída', 'Custo'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {uso.porUsuario.length ? uso.porUsuario.map((r) => (
                      <tr key={r.usuario}><td style={{ ...s.td, fontWeight: 600 }}>{r.usuario}</td><td style={s.td}>{fmtNum(r.chamadas)}</td><td style={s.td}>{fmtNum(r.entrada)}</td><td style={s.td}>{fmtNum(r.saida)}</td><td style={s.td}>{usd(r.custoUsd)}</td></tr>
                    )) : <tr><td style={{ ...s.td, color: 'var(--gray-400)' }} colSpan={5}>-</td></tr>}
                  </tbody>
                </table>
                <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 8 }}>"sistema (automático)" = rotinas em segundo plano, sem usuário logado.</div>
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Por dia (tokens de entrada + saída)</div>
                {uso.porDia.length ? (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 130, overflowX: 'auto' }}>
                    {uso.porDia.map((d) => {
                      const total = d.entrada + d.saida;
                      return (
                        <div key={d.dia} title={`${d.dia}: ${fmtNum(total)} tokens · ${d.chamadas} chamada(s) · ${d.evitadas} evitada(s)`} style={{ flex: '1 0 14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <div style={{ width: '100%', background: '#2563eb', borderRadius: '3px 3px 0 0', height: Math.max(2, Math.round((total / maxDia) * 100)) }} />
                          <div style={{ fontSize: 9, color: 'var(--gray-400)', marginTop: 3 }}>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Sem dados no período.</div>}
              </div>
            </div>

            <div style={s.card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Últimas chamadas (100)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead><tr>{['Quando', 'Recurso', 'Usuário', 'O quê', 'Entrada', 'Saída', 'Resultado'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {uso.ultimas.length ? uso.ultimas.map((u) => (
                      <tr key={u.id}>
                        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDataHora(u.criadoEm)}</td>
                        <td style={s.td}>{nomeRecurso(u.recurso)}</td>
                        <td style={s.td}>{u.usuario || '-'}</td>
                        <td style={{ ...s.td, color: 'var(--gray-600)', maxWidth: 280 }}>{u.contexto || '-'}</td>
                        <td style={s.td}>{u.tipo === 'evitada' ? '-' : fmtNum(u.entrada)}</td><td style={s.td}>{u.tipo === 'evitada' ? '-' : fmtNum(u.saida)}</td>
                        <td style={{ ...s.td, color: u.tipo === 'evitada' ? '#166534' : u.ok ? 'var(--gray-700)' : '#b91c1c' }}>{u.tipo === 'evitada' ? 'evitada (sem IA)' : u.ok ? 'ok' : `erro${u.erro ? `: ${u.erro}` : ''}`}</td>
                      </tr>
                    )) : <tr><td style={{ ...s.td, color: 'var(--gray-400)' }} colSpan={7}>Nenhum registro.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
