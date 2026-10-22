'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';

// Estoque > Historico Preco: log de reajustes de preco das pecas, com a conversao em venda de cada motivo.
type Item = {
  id: number; sku: string; descricao: string | null; valorAnterior: number | string; valorNovo: number | string; motivo: string | null;
  observacao: string | null; criadoEm: string; usuario: string | null;
  pecaDisponivel: boolean | null; pecaEmPrejuizo: boolean | null; pecaDataVenda: string | null;
};

const MOTIVOS: Record<string, { nome: string; bg: string; cor: string; borda: string }> = {
  desconto_cliente: { nome: 'Desconto ao cliente', bg: '#fff7ed', cor: '#c2410c', borda: '#fed7aa' },
  reajuste_mercado: { nome: 'Reajuste de mercado', bg: '#eff6ff', cor: '#1d4ed8', borda: '#bfdbfe' },
  reversao_automatica: { nome: 'Ajuste automático (reversão)', bg: '#f1f5f9', cor: '#475569', borda: '#cbd5e1' },
};
const motivoInfo = (m: string | null) => MOTIVOS[String(m || '')] || { nome: m || '—', bg: '#f1f5f9', cor: '#475569', borda: '#cbd5e1' };
// reversao_automatica dispara justamente quando o desconto NAO virou venda em 3 dias: % de conversao dela nao faz sentido
const SEM_ESTATISTICA = new Set(['reversao_automatica']);

const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (v?: string | null) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const dia = (v?: string | null) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); };

function situacao(it: Item): { chave: string; texto: string; bg: string; cor: string; borda: string } {
  if (it.pecaDisponivel == null) return { chave: 'sem_peca', texto: 'Peça não encontrada', bg: '#f1f5f9', cor: '#475569', borda: '#cbd5e1' };
  if (it.pecaEmPrejuizo) return { chave: 'prejuizo', texto: 'Prejuízo', bg: '#fef2f2', cor: '#b91c1c', borda: '#fecaca' };
  if (it.pecaDisponivel === false) return { chave: 'vendida', texto: `Vendida${it.pecaDataVenda ? ` em ${dia(it.pecaDataVenda)}` : ''}`, bg: '#f0fdf4', cor: '#15803d', borda: '#bbf7d0' };
  return { chave: 'disponivel', texto: 'Disponível', bg: '#eff6ff', cor: '#1d4ed8', borda: '#bfdbfe' };
}

const entrada: any = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontFamily: 'inherit', color: 'var(--gray-800)', minWidth: 0 };
const rotulo: any = { fontSize: 10.5, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3, display: 'block' };

function Chip({ e, children }: { e: { bg: string; cor: string; borda: string }; children?: any }) {
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: e.bg, color: e.cor, border: `1px solid ${e.borda}`, whiteSpace: 'nowrap' }}>{children}</span>;
}

export default function HistoricoPrecoTab({ padding, skuInicial }: { padding: number; skuInicial?: string }) {
  const isPhone = useIsPhone();
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [sku, setSku] = useState(skuInicial || '');
  const [skuAplicado, setSkuAplicado] = useState(skuInicial || '');
  const [motivo, setMotivo] = useState('');
  const [status, setStatus] = useState('');
  const [sentido, setSentido] = useState('');
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++seq.current;
    setCarregando(true); setErro('');
    try {
      const qs = new URLSearchParams({ limit: '500' });
      if (skuAplicado.trim()) qs.set('sku', skuAplicado.trim());
      const resp = await fetch(`${API_BASE}/pecas/historico-preco?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      if (minha === seq.current) setItens(Array.isArray(d.itens) ? d.itens : []);
    } catch (e: any) { if (minha === seq.current) setErro(e?.message || 'Erro ao carregar'); }
    if (minha === seq.current) setCarregando(false);
  }, [skuAplicado]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const t = setTimeout(() => setSkuAplicado(sku.trim()), 350);
    return () => clearTimeout(t);
  }, [sku]);

  const filtrados = itens.filter((it) => {
    if (motivo && it.motivo !== motivo) return false;
    if (status && situacao(it).chave !== status) return false;
    const subiu = Number(it.valorNovo) > Number(it.valorAnterior);
    if (sentido === 'subiu' && !subiu) return false;
    if (sentido === 'caiu' && subiu) return false;
    return true;
  });
  const filtrando = Boolean(skuAplicado || motivo || status || sentido);
  const limpar = () => { setSku(''); setSkuAplicado(''); setMotivo(''); setStatus(''); setSentido(''); };

  // conversao em venda por motivo (sobre o que esta filtrado)
  const stats: Record<string, { total: number; vendidos: number; prejuizo: number }> = {};
  for (const it of filtrados) {
    const m = String(it.motivo || '');
    if (SEM_ESTATISTICA.has(m)) continue;
    const e = (stats[m] = stats[m] || { total: 0, vendidos: 0, prejuizo: 0 });
    e.total += 1;
    if (it.pecaEmPrejuizo) e.prejuizo += 1; else if (it.pecaDisponivel === false) e.vendidos += 1;
  }
  const ordem = ['desconto_cliente', 'reajuste_mercado'];
  const motivosStats = ordem.filter((m) => stats[m]).concat(Object.keys(stats).filter((m) => !ordem.includes(m)));
  const aumentos = filtrados.filter((i) => Number(i.valorNovo) > Number(i.valorAnterior)).length;
  const reducoes = filtrados.filter((i) => Number(i.valorNovo) < Number(i.valorAnterior)).length;
  const motivosDisponiveis = Array.from(new Set(itens.map((i) => String(i.motivo || '')).filter(Boolean))) as string[];

  const cartao = (titulo: string, valor: string, cor = 'var(--gray-800)', dica?: string) => (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', minWidth: isPhone ? 0 : 170, flex: isPhone ? '1 1 140px' : '0 0 auto' }}>
      <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
      {dica ? <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{dica}</div> : null}
    </div>
  );

  const preco = (it: Item) => {
    const a = Number(it.valorAnterior); const n = Number(it.valorNovo);
    const pct = a ? ((n - a) / a) * 100 : 0;
    const subiu = n > a;
    const cor = subiu ? '#15803d' : '#b91c1c';
    return (
      <div style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--gray-500)', textDecoration: 'line-through', fontSize: 12.5 }}>{brl(a)}</span>
        <span style={{ margin: '0 6px', color: 'var(--gray-400)' }}>→</span>
        <strong style={{ color: 'var(--gray-800)' }}>{brl(n)}</strong>
        <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: cor, background: subiu ? '#f0fdf4' : '#fef2f2', border: `1px solid ${subiu ? '#bbf7d0' : '#fecaca'}`, borderRadius: 99, padding: '2px 8px' }}>{subiu ? '▲' : '▼'} {Math.abs(pct).toFixed(1).replace('.', ',')}%</span>
      </div>
    );
  };

  return (
    <div style={{ padding, maxWidth: 1500 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {cartao(filtrando ? 'Reajustes no filtro' : 'Reajustes de preço', String(filtrados.length), 'var(--gray-800)', itens.length >= 500 ? 'mostrando os 500 mais recentes' : undefined)}
        {cartao('Aumentos', String(aumentos), '#15803d')}
        {cartao('Reduções', String(reducoes), '#b91c1c')}
        {motivosStats.map((m) => {
          const e = stats[m]; const pct = e.total ? (e.vendidos / e.total) * 100 : 0;
          return cartao(`${motivoInfo(m).nome}`, `${pct.toFixed(0)}% venderam`, pct >= 50 ? '#15803d' : pct > 0 ? '#c2410c' : 'var(--gray-500)', `${e.vendidos} de ${e.total} uso(s)${e.prejuizo ? ` · ${e.prejuizo} em prejuízo` : ''}`);
        })}
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'minmax(220px, 1.5fr) repeat(3, minmax(150px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
        <div style={isPhone ? { gridColumn: '1 / -1' } : undefined}>
          <label style={rotulo}>SKU</label>
          <input value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} placeholder="Filtrar por SKU" style={{ ...entrada, width: '100%', boxSizing: 'border-box', fontFamily: 'Geist Mono, monospace' }} />
        </div>
        <div>
          <label style={rotulo}>Motivo</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todos</option>
            {motivosDisponiveis.map((m) => <option key={m} value={m}>{motivoInfo(m).nome}</option>)}
          </select>
        </div>
        <div>
          <label style={rotulo}>Situação da peça</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todas</option>
            <option value="disponivel">Disponível</option>
            <option value="vendida">Vendida</option>
            <option value="prejuizo">Prejuízo</option>
          </select>
        </div>
        <div>
          <label style={rotulo}>Sentido</label>
          <select value={sentido} onChange={(e) => setSentido(e.target.value)} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Aumento e redução</option>
            <option value="subiu">Só aumentos</option>
            <option value="caiu">Só reduções</option>
          </select>
        </div>
        {filtrando ? <button type="button" onClick={limpar} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Limpar</button> : <span />}
      </div>

      {erro ? <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{erro}</div> : null}

      {isPhone ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtrados.map((it) => (
            <div key={it.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13.5, color: 'var(--blue-500)' }}>{it.sku}</span>
                <span style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{quando(it.criadoEm)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-800)', marginTop: 4 }}>{it.descricao || '—'}</div>
              <div style={{ marginTop: 8 }}>{preco(it)}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}><Chip e={motivoInfo(it.motivo)}>{motivoInfo(it.motivo).nome}</Chip><Chip e={situacao(it)}>{situacao(it).texto}</Chip></div>
              {it.observacao ? <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8 }}>Obs.: {it.observacao}</div> : null}
              {it.usuario ? <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 6 }}>por {it.usuario}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1050 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50, #f9fafb)' }}>
                  {['Quando', 'Peça', 'Preço', 'Motivo', 'Situação da peça', 'Observação', 'Por'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-600)' }}>{quando(it.criadoEm)}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 300 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12.5, color: 'var(--blue-500)' }}>{it.sku}</div>
                      <div style={{ color: 'var(--gray-800)', marginTop: 2 }}>{it.descricao || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{preco(it)}</td>
                    <td style={{ padding: '10px 12px' }}><Chip e={motivoInfo(it.motivo)}>{motivoInfo(it.motivo).nome}</Chip></td>
                    <td style={{ padding: '10px 12px' }}><Chip e={situacao(it)}>{situacao(it).texto}</Chip></td>
                    <td style={{ padding: '10px 12px', color: 'var(--gray-600)', maxWidth: 240 }}>{it.observacao || <span style={{ color: 'var(--gray-300)' }}>—</span>}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-500)' }}>{it.usuario || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {carregando && !itens.length ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 14 }}>Carregando...</div> : null}
      {!carregando && !filtrados.length ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, textAlign: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{filtrando ? 'Nenhum reajuste com esses filtros' : 'Nenhum reajuste registrado'}</div>
        </div>
      ) : null}
    </div>
  );
}
