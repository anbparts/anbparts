'use client';

import { Fragment, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useAuth } from '@/lib/auth';
import { canProcessAction } from '@/lib/permissions';
import { useIsPhone } from '@/lib/use-is-phone';

const API = API_BASE;

const s: any = {
  topbar: { minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50, gap: 12, flexWrap: 'wrap' as const },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' },
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink-soft)', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  th: { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '.05em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' as const, textAlign: 'left' as const },
  td: { padding: '10px 12px', fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
};

const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtData(iso?: string | null) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}
function fmtDoc(doc?: string | null) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}
function iniciais(nome: string) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return p.length ? ((p[0][0] || '') + (p.length > 1 ? (p[p.length - 1][0] || '') : '')).toUpperCase() : '?';
}
function corCanal(canal: string) {
  const c = String(canal || '').toLowerCase();
  if (/mercado|ml\b/.test(c)) return { cor: '#92400e', fundo: '#fef3c7' };
  if (/shopee/.test(c)) return { cor: '#c2410c', fundo: '#ffedd5' };
  if (/magalu|magazine/.test(c)) return { cor: '#1d4ed8', fundo: '#dbeafe' };
  if (/nuvem|tiendanube|loja virtual/.test(c)) return { cor: '#0f766e', fundo: '#ccfbf1' };
  if (/olx/.test(c)) return { cor: '#6d28d9', fundo: '#ede9fe' };
  return { cor: '#475569', fundo: '#f1f5f9' };
}
const pill = (texto: string, c: { cor: string; fundo: string }) => (
  <span key={texto} style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.fundo, color: c.cor, whiteSpace: 'nowrap' }}>{texto}</span>
);

const FILTROS: Array<[string, string]> = [['todos', 'Todos'], ['recorrentes', 'Recorrentes (2+ compras)'], ['unica', 'Compra única'], ['inativos', 'Sem comprar há 6+ meses'], ['oficinas', '🔧 Possíveis oficinas'], ['oficinas_provaveis', 'Provável oficina (CNPJ + nome)'], ['oficinas_cnpj', 'Só CNPJ'], ['oficinas_nome', 'Só nome (CPF)']];

function rotuloOficina(o: any): string {
  if (!o) return '';
  return o.nivel === 'provavel' ? `Provável oficina · CNPJ + “${o.palavra}”` : o.nivel === 'cnpj' ? 'Possível oficina · CNPJ' : `Possível oficina · nome “${o.palavra}”`;
}
const ORDENS: Array<[string, string]> = [['total', 'Maior gasto'], ['pedidos', 'Mais pedidos'], ['pecas', 'Mais peças'], ['ultima', 'Compra mais recente'], ['frequencia', 'Mais frequentes'], ['nome', 'Nome (A-Z)']];

export default function BlingClientesPage() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  const podeSincronizar = canProcessAction(user, 'bling_pedidos', 'sincronizar');
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [ordem, setOrdem] = useState('total');
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, any>>({});
  const [exportando, setExportando] = useState(false);
  const [oficinaIds, setOficinaIds] = useState<Set<string>>(new Set());
  const [levando, setLevando] = useState<string | null>(null);

  async function chamar(path: string, init?: RequestInit) {
    const resp = await fetch(`${API}${path}`, { credentials: 'include', ...init });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok || d?.ok === false) throw new Error(d?.error || `Erro ${resp.status}`);
    return d;
  }

  async function carregar(p = pagina, f = filtro, o = ordem, b = busca) {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ pagina: String(p), limite: '50', busca: b, filtro: f, ordem: o });
      setDados(await chamar(`/bling-pedidos/clientes?${qs.toString()}`));
    } catch (e: any) { alert(e?.message || 'Erro ao carregar os clientes'); }
    setCarregando(false);
  }
  useEffect(() => { carregar(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    chamar('/oficinas/clientes-ids').then((d) => setOficinaIds(new Set<string>((d.ids || []) as string[]))).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leva o cliente para Empresa > Oficinas (copia os dados de cadastro; o cliente continua aqui, com o selo)
  async function levarParaOficinas(id: string, nome: string) {
    if (!confirm(`Levar "${nome}" para a aba Oficinas (Empresa)? Os dados de cadastro são copiados e você pode completar lá.`)) return;
    setLevando(id);
    try {
      const d = await chamar('/oficinas/de-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: id }) });
      setOficinaIds((prev) => { const novo = new Set<string>(); prev.forEach((x) => novo.add(x)); novo.add(id); return novo; });
      alert(d.jaExistia ? 'Este cliente já estava em Oficinas.' : 'Cliente levado para Empresa > Oficinas.');
    } catch (e: any) { alert(e?.message || 'Erro ao levar para Oficinas'); }
    setLevando(null);
  }

  async function expandir(id: string) {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    if (!detalhes[id]) {
      try { const d = await chamar(`/bling-pedidos/clientes/${id}`); setDetalhes((prev) => ({ ...prev, [id]: d })); }
      catch (e: any) { alert(e?.message || 'Erro ao carregar o cliente'); }
    }
  }

  async function atualizarCliente(id: string) {
    try {
      await chamar(`/bling-pedidos/clientes/${id}/atualizar`, { method: 'POST' });
      const d = await chamar(`/bling-pedidos/clientes/${id}`);
      setDetalhes((prev) => ({ ...prev, [id]: d }));
    } catch (e: any) { alert(e?.message || 'Erro ao atualizar o cliente'); }
  }

  // Exporta o filtro atual inteiro (todas as paginas) para CSV
  async function exportarCsv() {
    setExportando(true);
    try {
      const linhas: any[] = [];
      for (let p = 1; p <= 40; p++) {
        const qs = new URLSearchParams({ pagina: String(p), limite: '200', busca, filtro, ordem });
        const d = await chamar(`/bling-pedidos/clientes?${qs.toString()}`);
        linhas.push(...d.itens);
        if (linhas.length >= d.total) break;
      }
      const cab = ['Cliente', 'Documento', 'E-mail', 'Telefone', 'Cidade', 'UF', 'Pedidos', 'Peças', 'Total gasto', 'Ticket médio', 'Primeira compra', 'Última compra', 'Frequência (dias)', 'Canais', 'Possível oficina'];
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const corpo = linhas.map((c) => [c.nome, fmtDoc(c.documento), c.email, c.celular || c.telefone, c.cidade, c.uf, c.pedidos, c.pecas,
        String(c.total).replace('.', ','), c.pedidos ? String((c.total / c.pedidos).toFixed(2)).replace('.', ',') : '', fmtData(c.primeira), fmtData(c.ultima), c.frequenciaDias ?? '', (c.canais || []).join(' / '), rotuloOficina(c.oficina)].map(esc).join(';'));
      const blob = new Blob(['﻿' + [cab.map(esc).join(';'), ...corpo].join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { alert(e?.message || 'Erro ao exportar'); }
    setExportando(false);
  }

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1;

  return (
    <>
      <div style={{ ...s.topbar, padding: isPhone ? '12px 14px' : '10px 28px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Clientes</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Clientes consolidados a partir dos pedidos do Bling</div>
        </div>
        <button type="button" style={s.btn} disabled={exportando || !dados?.total} onClick={exportarCsv}>{exportando ? 'Exportando...' : 'Exportar CSV'}</button>
      </div>

      <div style={{ padding: isPhone ? 12 : 28, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Clientes</div><div style={{ fontSize: 22, fontWeight: 700 }}>{dados?.total ?? '—'}</div></div>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Recorrentes</div><div style={{ fontSize: 22, fontWeight: 700 }}>{dados?.recorrentes ?? '—'}{dados?.total ? <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 500 }}> · {Math.round((dados.recorrentes / dados.total) * 100)}%</span> : null}</div></div>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Receita</div><div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{dados ? brl(dados.receita) : '—'}</div></div>
          <div style={{ ...s.card, padding: '12px 16px' }}><div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Peças vendidas</div><div style={{ fontSize: 22, fontWeight: 700 }}>{dados ? Math.round(dados.pecas) : '—'}</div></div>
        </div>

        <div style={{ ...s.card, padding: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(240px, 1.6fr) minmax(180px, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Buscar</div>
              <input style={s.input} placeholder="Nome, CPF/CNPJ, e-mail, cidade ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPagina(1); carregar(1); } }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Ordenar por</div>
              <select style={s.input} value={ordem} onChange={(e) => { setOrdem(e.target.value); setPagina(1); carregar(1, filtro, e.target.value); }}>
                {ORDENS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select></div>
            <button type="button" style={{ ...s.btn, background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }} onClick={() => { setPagina(1); carregar(1); }}>Buscar</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FILTROS.map(([v, r]) => (
              <button key={v} type="button" onClick={() => { setFiltro(v); setPagina(1); carregar(1, v); }}
                style={{ border: '1px solid ' + (filtro === v ? 'var(--ink)' : 'var(--border)'), background: filtro === v ? 'var(--ink)' : 'var(--white)', color: filtro === v ? '#fff' : 'var(--ink-soft)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>{r}</button>
            ))}
          </div>
        </div>

        <div style={{ ...s.card, overflow: 'hidden' }}>
          {carregando && !dados ? <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-muted)' }}>Carregando...</div> : null}
          {dados && !dados.itens.length ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13.5, color: 'var(--ink-muted)' }}>
              Nenhum cliente encontrado. Os clientes aparecem depois que os pedidos são importados em <strong>Bling ERP &gt; Pedidos</strong>.
            </div>
          ) : null}

          {dados && dados.itens.length > 0 && !isPhone && (
            <div style={{ overflowX: 'auto', opacity: carregando ? 0.6 : 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...s.th, width: 28 }} />
                  <th style={s.th}>Cliente</th><th style={s.th}>Contato</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Pedidos</th><th style={{ ...s.th, textAlign: 'right' }}>Peças</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Total gasto</th><th style={{ ...s.th, textAlign: 'right' }}>Ticket</th>
                  <th style={s.th}>Última compra</th><th style={s.th}>Frequência</th><th style={s.th}>Canais</th>
                </tr></thead>
                <tbody>
                  {dados.itens.map((c: any) => {
                    const aberto = expandido === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr onClick={() => expandir(c.id)} style={{ cursor: 'pointer', background: aberto ? 'var(--gray-50)' : undefined }}>
                          <td style={{ ...s.td, color: 'var(--ink-muted)' }}>{aberto ? '▾' : '▸'}</td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--gray-100)', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{iniciais(c.nome)}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{c.nome || '—'}{oficinaIds.has(c.id) ? <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>🔧 Em Oficinas</span> : null}{c.oficina ? <span title={rotuloOficina(c.oficina)} style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: c.oficina.nivel === 'provavel' ? '#fef3c7' : '#f1f5f9', color: c.oficina.nivel === 'provavel' ? '#92400e' : '#475569', border: '1px solid ' + (c.oficina.nivel === 'provavel' ? '#fde68a' : '#e2e8f0'), whiteSpace: 'nowrap' }}>🔧 {c.oficina.nivel === 'provavel' ? 'Provável oficina' : c.oficina.nivel === 'cnpj' ? 'CNPJ' : 'Nome'}</span> : null}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{[fmtDoc(c.documento), c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ''}`].filter(Boolean).join(' · ') || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...s.td, fontSize: 12.5, color: 'var(--ink-soft)' }}>{c.celular || c.telefone || '—'}{c.email ? <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div> : null}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{c.pedidos}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{Math.round(c.pecas)}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{brl(c.total)}</td>
                          <td style={{ ...s.td, textAlign: 'right', color: 'var(--ink-soft)' }}>{c.pedidos ? brl(c.total / c.pedidos) : '—'}</td>
                          <td style={s.td}>{fmtData(c.ultima)}{c.diasSemComprar != null ? <div style={{ fontSize: 11, color: c.diasSemComprar > 180 ? '#b45309' : 'var(--ink-muted)' }}>há {c.diasSemComprar} dia(s)</div> : null}</td>
                          <td style={{ ...s.td, fontSize: 12.5, color: 'var(--ink-soft)' }}>{c.frequenciaDias != null ? `a cada ${c.frequenciaDias} dia(s)` : (c.pedidos === 1 ? 'compra única' : '—')}</td>
                          <td style={s.td}><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(c.canais || []).map((x: string) => pill(x, corCanal(x)))}</div></td>
                        </tr>
                        {aberto && <tr><td colSpan={10} style={{ padding: 0, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>{DetalheCliente(c.id)}</td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {dados && dados.itens.length > 0 && isPhone && (
            <div>
              {dados.itens.map((c: any) => (
                <div key={c.id} style={{ borderBottom: '1px solid var(--border)', padding: 12 }}>
                  <div onClick={() => expandir(c.id)} style={{ cursor: 'pointer', display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{c.nome || '—'}</strong><strong>{brl(c.total)}</strong></div>
                    {c.oficina ? <div style={{ fontSize: 11.5, color: '#92400e' }}>🔧 {rotuloOficina(c.oficina)}</div> : null}
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{c.pedidos} pedido(s) · {Math.round(c.pecas)} peça(s) · última {fmtData(c.ultima)}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(c.canais || []).map((x: string) => pill(x, corCanal(x)))}</div>
                  </div>
                  {expandido === c.id ? <div style={{ marginTop: 8 }}>{DetalheCliente(c.id)}</div> : null}
                </div>
              ))}
            </div>
          )}

          {dados && dados.total > dados.limite && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', fontSize: 12.5, color: 'var(--ink-muted)' }}>
              <span>Página {dados.pagina} de {totalPaginas}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={s.btn} disabled={dados.pagina <= 1} onClick={() => { setPagina(dados.pagina - 1); carregar(dados.pagina - 1); }}>Anterior</button>
                <button type="button" style={s.btn} disabled={dados.pagina >= totalPaginas} onClick={() => { setPagina(dados.pagina + 1); carregar(dados.pagina + 1); }}>Próxima</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  function DetalheCliente(id: string) {
    const d = detalhes[id];
    if (!d) return <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-muted)' }}>Carregando cliente...</div>;
    const c = d.cliente;
    const ativos = d.pedidos.filter((p: any) => !p.cancelado);
    // peças compradas, agrupadas por SKU
    const porSku = new Map<string, { sku: string; descricao: string; qtd: number; total: number }>();
    for (const p of ativos) for (const i of p.itens) {
      const k = i.sku || i.descricao || '—';
      const x = porSku.get(k) || { sku: i.sku || '—', descricao: i.descricao || '', qtd: 0, total: 0 };
      x.qtd += i.quantidade; x.total += i.total; porSku.set(k, x);
    }
    return (
      <div style={{ padding: isPhone ? 10 : '14px 20px 18px', display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14, fontSize: 12.5 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Dados</div>
            <div>{c.nome}</div>
            <div style={{ color: 'var(--ink-muted)' }}>{[c.tipoPessoa === 'J' ? 'Pessoa jurídica' : c.tipoPessoa === 'F' ? 'Pessoa física' : '', fmtDoc(c.documento)].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Contato</div>
            <div>{c.celular || c.telefone || '—'}{c.celular && c.telefone ? ` · ${c.telefone}` : ''}</div>
            <div style={{ wordBreak: 'break-all' }}>{c.email || '—'}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Endereço</div>
            <div>{[c.endereco, c.bairro, c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ''}`, c.cep].filter(Boolean).join(' · ') || '—'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {podeSincronizar ? <button type="button" style={{ ...s.btn, padding: '4px 12px', fontSize: 12 }} onClick={() => atualizarCliente(id)}>Atualizar dados no Bling</button> : null}
              {oficinaIds.has(id)
                ? <span style={{ ...s.btn, padding: '4px 12px', fontSize: 12, cursor: 'default', color: '#15803d', background: '#f0fdf4', borderColor: '#bbf7d0' }}>🔧 Já está em Oficinas</span>
                : <button type="button" disabled={levando === id} style={{ ...s.btn, padding: '4px 12px', fontSize: 12, color: '#92400e', background: '#fffbeb', borderColor: '#fde68a' }} onClick={() => levarParaOficinas(id, c.nome || 'este cliente')}>{levando === id ? 'Levando...' : '🔧 Levar para Oficinas'}</button>}
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Peças compradas ({porSku.size} item(ns) distintos)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--white)', border: '1px solid var(--border)' }}>
              <thead><tr><th style={s.th}>SKU</th><th style={s.th}>Descrição</th><th style={{ ...s.th, textAlign: 'right' }}>Qtd</th><th style={{ ...s.th, textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {Array.from(porSku.values()).map((x, idx) => (
                  <tr key={idx}><td style={{ ...s.td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{x.sku}</td><td style={{ ...s.td, color: 'var(--ink-soft)' }}>{x.descricao}</td><td style={{ ...s.td, textAlign: 'right' }}>{x.qtd}</td><td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{brl(x.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Histórico de pedidos ({d.pedidos.length})</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {d.pedidos.map((p: any) => (
              <div key={p.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, display: 'grid', gap: 3, opacity: p.cancelado ? 0.6 : 1 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ fontFamily: 'JetBrains Mono, monospace' }}>#{p.numero}</strong><span>{fmtData(p.data)}</span>{pill(p.canal || '—', corCanal(p.canal))}
                  {p.cancelado ? <span style={{ color: '#b91c1c', fontWeight: 700 }}>cancelado</span> : null}
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{brl(p.total)}</span>
                </div>
                <div style={{ color: 'var(--ink-muted)' }}>{p.itens.map((i: any) => `${i.sku || '—'} (${i.quantidade}x)`).join(' · ') || 'sem itens'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
