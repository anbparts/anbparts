'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';

// Estoque > Markup (so o Bruno). Custo = preco de compra da moto; nao existe custo por peca, entao cada segmento (categorias da Curva ABC)
// mostra quanto vende/liquida e quanto do CUSTO DA MOTO ele paga. Visoes: Mapa da moto (blocos ligados por setas), Ranking e Comparar motos.
type Lado = { qtd: number; bruto: number; liq: number };
type PecaDet = { id: number; sku: string; descricao: string; vendida: boolean; precoML: number; valorLiq: number; dataVenda: string | null };
type Segmento = { nome: string; vendidas: Lado; estoque: Lado; pecas: PecaDet[] };
type MotoResumo = { id: number; prefixo?: string | null; nome: string; custo: number; vendidas: Lado; estoque: Lado };
// "#12 · KY01 · KYMCO DOWNTOWN 300i 2020": ID + codigo configurado, como na 1a coluna da pagina Motos
const rotuloMoto = (m: MotoResumo) => `#${m.id}${m.prefixo ? ` · ${m.prefixo}` : ''} · ${m.nome}`;
type Base = 'vendidas' | 'estoque' | 'total';
type Metrica = 'bruto' | 'liq';
type Visao = 'mapa' | 'ranking' | 'comparar';

const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const vezes = (v: number | null) => (v == null || !isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`);
const dia = (v?: string | null) => (v ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : '');

const somaLado = (a: Lado, b: Lado): Lado => ({ qtd: a.qtd + b.qtd, bruto: a.bruto + b.bruto, liq: a.liq + b.liq });
const ladoDaBase = (v: { vendidas: Lado; estoque: Lado }, base: Base): Lado => (base === 'vendidas' ? v.vendidas : base === 'estoque' ? v.estoque : somaLado(v.vendidas, v.estoque));
const valorDe = (l: Lado, m: Metrica) => (m === 'bruto' ? l.bruto : l.liq);
const corMarkup = (m: number | null) => (m == null ? '#64748b' : m >= 2 ? '#15803d' : m >= 1 ? '#1d4ed8' : '#b45309');

// Onde cada segmento "encosta" na moto desenhada (coordenadas locais do desenho, 460 x 300). A primeira regra que casar vale.
const ZONAS: { re: RegExp; x: number; y: number }[] = [
  { re: /farol|lanterna|iluminacao|seta|pisca/, x: 365, y: 88 },
  { re: /eletric|bateria|chicote|painel|ignicao|cdi|regulador|retificador|sensor|modulo|partida|rele|fusivel/, x: 150, y: 132 },
  { re: /escape|silencioso|ponteira|catalisador/, x: 110, y: 222 },
  { re: /dianteira|bengala|garfo|mesa|coluna de direcao|direcao/, x: 352, y: 150 },
  { re: /amortecedor|traseira|balanca|suspens/, x: 125, y: 165 },
  { re: /freio|disco|pinca|pastilha/, x: 378, y: 205 },
  { re: /roda|pneu|aro|raio|cubo|rolamento/, x: 90, y: 152 },
  { re: /tanque|combustivel|bomba|bico|injec|carburador|filtro|caixa de ar|admissao|alimentacao/, x: 232, y: 92 },
  { re: /banco|assento|selim/, x: 150, y: 98 },
  { re: /guidao|manete|manopla|comando|punho|retrovisor|acelerador/, x: 308, y: 78 },
  { re: /carenagem|plastico|paralama|capa|lateral|tampa|rabeta|bolha|para-brisa/, x: 300, y: 125 },
  { re: /motor|cilindro|cabecote|carter|virabrequim|pistao|cambio|embreagem|bloco|vela|junta/, x: 240, y: 165 },
  { re: /transmissao|corrente|coroa|pinhao|relacao|kit/, x: 150, y: 205 },
  { re: /quadro|chassi|estrutura|suporte|pedal|descanso|pedaleira|protetor|cavalete/, x: 215, y: 140 },
];
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function ancora(nome: string, repetidas: number) {
  const n = semAcento(nome);
  const z = ZONAS.find((zz) => zz.re.test(n));
  const base = z ? { x: z.x, y: z.y } : { x: 240, y: 120 };
  return { x: base.x + (repetidas % 3) * 9 - 9, y: base.y + Math.floor(repetidas / 3) * 9 };
}

const entrada: any = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontFamily: 'inherit', color: 'var(--gray-800)', minWidth: 0 };
const rotulo: any = { fontSize: 10.5, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3, display: 'block' };
const card: any = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const th: any = { textAlign: 'left', padding: '8px 10px', fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td: any = { padding: '8px 10px', fontSize: 13, color: 'var(--gray-800)', borderBottom: '1px solid var(--gray-100)' };

function Segmentado<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', background: 'var(--white)' }}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer', background: valor === o.id ? '#0f172a' : 'transparent', color: valor === o.id ? '#fff' : 'var(--gray-600)' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Indicador({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div style={{ ...card, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: cor || 'var(--gray-800)', marginTop: 3 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

export default function MarkupTab({ padding }: { padding: number }) {
  const isPhone = useIsPhone();
  const [motoId, setMotoId] = useState(0);
  const [motos, setMotos] = useState<MotoResumo[]>([]);
  const [moto, setMoto] = useState<MotoResumo | null>(null);
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [base, setBase] = useState<Base>('vendidas');
  const [metrica, setMetrica] = useState<Metrica>('bruto');
  const [visao, setVisao] = useState<Visao>('mapa');
  const [segSel, setSegSel] = useState('');

  useEffect(() => {
    let cancelado = false;
    setCarregando(true); setErro('');
    fetch(`${API_BASE}/curva-abc/markup${motoId ? `?motoId=${motoId}` : ''}`, { credentials: 'include' })
      .then(async (resp) => {
        const d = await resp.json().catch(() => ({}));
        if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
        if (cancelado) return;
        const lista: MotoResumo[] = Array.isArray(d.motos) ? d.motos : [];
        setMotos(lista);
        if (!motoId) { if (lista.length) setMotoId(lista[0].id); return; }
        setMoto(d.moto || null);
        setSegmentos(Array.isArray(d.segmentos) ? d.segmentos : []);
        setSegSel('');
      })
      .catch((e: any) => { if (!cancelado) setErro(e?.message || 'Erro ao carregar'); })
      .then(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [motoId]);

  const custo = moto?.custo || 0;
  const totalBase = moto ? ladoDaBase(moto, base) : { qtd: 0, bruto: 0, liq: 0 };
  const markupVenda = custo > 0 ? totalBase.bruto / custo : null;
  const markupLiq = custo > 0 ? totalBase.liq / custo : null;
  const segmentoAtual = segmentos.find((s) => s.nome === segSel) || null;

  const valorSeg = (s: Segmento) => valorDe(ladoDaBase(s, base), metrica);
  const segsVisiveis = useMemo(
    () => segmentos.filter((s) => ladoDaBase(s, base).qtd > 0).sort((a, b) => valorSeg(b) - valorSeg(a)),
    [segmentos, base, metrica], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totalMetrica = valorDe(totalBase, metrica);

  // ── Mapa: moto desenhada no centro, 1 bloco por segmento, setas do bloco ate a regiao da moto ──
  const mapa = useMemo(() => {
    const ordenados = segsVisiveis.map((s) => ({ s, a: { x: 0, y: 0 } }));
    const usados: Record<string, number> = {};
    ordenados.forEach((o) => {
      const z = ZONAS.find((zz) => zz.re.test(semAcento(o.s.nome)));
      const chave = z ? `${z.x},${z.y}` : 'fallback';
      o.a = ancora(o.s.nome, usados[chave] || 0);
      usados[chave] = (usados[chave] || 0) + 1;
    });
    const porX = [...ordenados].sort((a, b) => a.a.x - b.a.x);
    const metade = Math.ceil(porX.length / 2);
    const esquerda = porX.slice(0, metade).sort((a, b) => a.a.y - b.a.y);
    const direita = porX.slice(metade).sort((a, b) => a.a.y - b.a.y);
    const linhas = Math.max(esquerda.length, direita.length, 1);
    const alturaCard = 66, passo = 78;
    const altura = Math.max(420, linhas * passo + 24);
    return { esquerda, direita, altura, alturaCard, passo, oy: (altura - 300) / 2 };
  }, [segsVisiveis]);

  const LARG = 1000, LARG_CARD = 262, OX = 270;

  function blocoSvg(item: { s: Segmento; a: { x: number; y: number } }, lado: 'e' | 'd', idx: number) {
    const { s, a } = item;
    const l = ladoDaBase(s, base);
    const v = valorDe(l, metrica);
    const paga = custo > 0 ? v / custo : 0;
    const x = lado === 'e' ? 0 : LARG - LARG_CARD;
    const y = 12 + idx * mapa.passo;
    const sel = s.nome === segSel;
    const ax = OX + a.x, ay = mapa.oy + a.y;
    const bx = lado === 'e' ? LARG_CARD : LARG - LARG_CARD;
    const by = y + mapa.alturaCard / 2;
    const meio = (bx + ax) / 2;
    const cor = sel ? '#0f172a' : '#2563eb';
    return (
      <g key={`${lado}-${s.nome}`} style={{ cursor: 'pointer' }} onClick={() => setSegSel(sel ? '' : s.nome)}>
        <path d={`M ${bx} ${by} C ${meio} ${by}, ${meio} ${ay}, ${ax} ${ay}`} fill="none" stroke={cor} strokeWidth={sel ? 2.4 : 1.4} strokeDasharray={sel ? '' : '5 4'} opacity={sel ? 1 : 0.55} markerEnd="url(#ponta)" />
        <circle cx={ax} cy={ay} r={sel ? 6 : 4.5} fill={cor} />
        <rect x={x} y={y} width={LARG_CARD} height={mapa.alturaCard} rx={12} fill={sel ? '#eff6ff' : '#ffffff'} stroke={sel ? '#0f172a' : '#cbd5e1'} strokeWidth={sel ? 2 : 1} />
        <text x={x + 12} y={y + 20} fontSize={13} fontWeight={700} fill="#0f172a">{s.nome.length > 27 ? s.nome.slice(0, 26) + '…' : s.nome}</text>
        <text x={x + 12} y={y + 43} fontSize={18} fontWeight={800} fill="#0f172a">{brl(v)}</text>
        <text x={x + LARG_CARD - 12} y={y + 43} fontSize={12} fontWeight={700} textAnchor="end" fill={corMarkup(paga)}>{custo > 0 ? `paga ${pct(paga)}` : ''}</text>
        <text x={x + 12} y={y + 58} fontSize={11} fill="#64748b">{l.qtd} peça(s) · {totalMetrica > 0 ? pct(v / totalMetrica) : '0%'} da moto</text>
        <rect x={x + 12} y={y + mapa.alturaCard - 5} width={LARG_CARD - 24} height={3} rx={1.5} fill="#e2e8f0" />
        <rect x={x + 12} y={y + mapa.alturaCard - 5} width={Math.max(0, Math.min(1, totalMetrica > 0 ? v / totalMetrica : 0)) * (LARG_CARD - 24)} height={3} rx={1.5} fill="#2563eb" />
      </g>
    );
  }

  const detalhe = segmentoAtual ? (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gray-800)' }}>{segmentoAtual.nome}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            Vendidas: {segmentoAtual.vendidas.qtd} · {brl(segmentoAtual.vendidas.bruto)} (líq. {brl(segmentoAtual.vendidas.liq)}) · Em estoque: {segmentoAtual.estoque.qtd} · {brl(segmentoAtual.estoque.bruto)} (líq. {brl(segmentoAtual.estoque.liq)})
          </div>
        </div>
        <button type="button" onClick={() => setSegSel('')} style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Fechar</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={th}>SKU</th><th style={th}>Descrição</th><th style={th}>Situação</th>
              <th style={{ ...th, textAlign: 'right' }}>Preço ML</th><th style={{ ...th, textAlign: 'right' }}>Líquido</th>
              <th style={{ ...th, textAlign: 'right' }}>Paga do custo (preço)</th><th style={{ ...th, textAlign: 'right' }}>Paga do custo (líq.)</th>
            </tr>
          </thead>
          <tbody>
            {segmentoAtual.pecas
              .filter((p) => (base === 'total' ? true : base === 'vendidas' ? p.vendida : !p.vendida))
              .sort((a, b) => b.precoML - a.precoML)
              .map((p) => (
                <tr key={p.id}>
                  <td style={{ ...td, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>{p.sku}</td>
                  <td style={td}>{p.descricao}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: p.vendida ? '#15803d' : '#1d4ed8', fontWeight: 700 }}>{p.vendida ? `Vendida${p.dataVenda ? ` em ${dia(p.dataVenda)}` : ''}` : 'Em estoque'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{brl(p.precoML)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{brl(p.valorLiq)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{custo > 0 ? pct(p.precoML / custo) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{custo > 0 ? pct(p.valorLiq / custo) : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ padding }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-800)' }}>Markup por moto e segmento</div>
        <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 3 }}>
          Custo = preço de compra da moto. Cada segmento (categorias da Curva ABC) mostra quanto vende e quanto <b>do custo da moto</b> ele paga. Peças em prejuízo e sucata ficam de fora.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        {visao !== 'comparar' && (
          <div style={{ minWidth: isPhone ? '100%' : 280 }}>
            <label style={rotulo}>Moto</label>
            <select style={{ ...entrada, width: '100%' }} value={motoId} onChange={(e) => setMotoId(Number(e.target.value) || 0)}>
              {motos.map((m) => <option key={m.id} value={m.id}>{rotuloMoto(m)}</option>)}
            </select>
          </div>
        )}
        <div><label style={rotulo}>Peças</label><Segmentado valor={base} onChange={setBase} opcoes={[{ id: 'vendidas', label: 'Vendidas' }, { id: 'estoque', label: 'Em estoque' }, { id: 'total', label: 'Total' }]} /></div>
        <div><label style={rotulo}>Valor</label><Segmentado valor={metrica} onChange={setMetrica} opcoes={[{ id: 'bruto', label: 'Preço ML' }, { id: 'liq', label: 'Líquido' }]} /></div>
        <div><label style={rotulo}>Visão</label><Segmentado valor={visao} onChange={setVisao} opcoes={[{ id: 'mapa', label: 'Mapa da moto' }, { id: 'ranking', label: 'Ranking' }, { id: 'comparar', label: 'Comparar motos' }]} /></div>
      </div>

      {erro && <div style={{ marginBottom: 12, background: '#fff7f7', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', fontSize: 12.5 }}>{erro}</div>}
      {carregando && <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>Carregando...</div>}

      {visao === 'comparar' ? (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Moto</th><th style={{ ...th, textAlign: 'right' }}>Custo</th><th style={{ ...th, textAlign: 'right' }}>Peças</th>
                <th style={{ ...th, textAlign: 'right' }}>Preço ML</th><th style={{ ...th, textAlign: 'right' }}>Líquido</th>
                <th style={{ ...th, textAlign: 'right' }}>Markup preço</th><th style={{ ...th, textAlign: 'right' }}>Markup líquido</th>
              </tr>
            </thead>
            <tbody>
              {motos.map((m) => {
                const l = ladoDaBase(m, base);
                const mv = m.custo > 0 ? l.bruto / m.custo : null;
                const ml = m.custo > 0 ? l.liq / m.custo : null;
                return (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => { setMotoId(m.id); setVisao('mapa'); }} title="Abrir no mapa">
                    <td style={{ ...td, fontWeight: 700 }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--gray-500)', fontWeight: 400 }}>#{m.id}</span>
                      {m.prefixo ? <span style={{ marginLeft: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, fontWeight: 700, color: 'var(--blue-600)', background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 4, padding: '1px 5px' }}>{m.prefixo}</span> : null}
                      <span style={{ marginLeft: 8 }}>{m.nome}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{brl(m.custo)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{l.qtd}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{brl(l.bruto)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{brl(l.liq)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: corMarkup(mv) }}>{vezes(mv)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: corMarkup(ml) }}>{vezes(ml)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : moto ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
            <Indicador titulo="Custo da moto" valor={brl(custo)} sub={custo > 0 ? undefined : 'Preço de compra não informado'} />
            <Indicador titulo="Preço ML" valor={brl(totalBase.bruto)} sub={`${totalBase.qtd} peça(s)`} />
            <Indicador titulo="Líquido" valor={brl(totalBase.liq)} />
            <Indicador titulo="Markup (preço)" valor={vezes(markupVenda)} cor={corMarkup(markupVenda)} sub={markupVenda != null ? `${pct(markupVenda - 1)} sobre o custo` : undefined} />
            <Indicador titulo="Markup (líquido)" valor={vezes(markupLiq)} cor={corMarkup(markupLiq)} sub={markupLiq != null ? `${pct(markupLiq - 1)} sobre o custo` : undefined} />
          </div>

          {!segsVisiveis.length ? (
            <div style={{ ...card, fontSize: 13, color: 'var(--gray-500)' }}>Nenhuma peça nessa seleção.</div>
          ) : visao === 'mapa' && !isPhone ? (
            <div style={{ ...card, padding: 8, background: '#f8fafc' }}>
              <svg viewBox={`0 0 ${LARG} ${mapa.altura}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Moto genérica com os segmentos">
                <defs>
                  <marker id="ponta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker>
                </defs>
                <g transform={`translate(${OX},${mapa.oy})`} fill="none" stroke="#94a3b8" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={90} cy={210} r={58} fill="#ffffff" /><circle cx={90} cy={210} r={40} strokeWidth={2} />
                  <circle cx={370} cy={210} r={58} fill="#ffffff" /><circle cx={370} cy={210} r={40} strokeWidth={2} />
                  <path d="M 90 210 L 190 160 L 240 120 L 335 100" />
                  <line x1={90} y1={210} x2={195} y2={185} />
                  <line x1={340} y1={100} x2={370} y2={210} />
                  <path d="M 200 105 Q 235 70 300 95 L 300 115 Q 250 125 200 118 Z" fill="#e2e8f0" />
                  <path d="M 95 100 Q 140 88 200 105 L 198 120 Q 140 118 95 118 Z" fill="#cbd5e1" />
                  <rect x={185} y={135} width={105} height={65} rx={14} fill="#e2e8f0" />
                  <path d="M 330 92 L 300 76 L 285 76" />
                  <path d="M 345 80 Q 372 78 380 98 L 352 100 Z" fill="#e2e8f0" />
                  <path d="M 200 205 L 70 228" strokeWidth={9} />
                </g>
                {mapa.esquerda.map((it, i) => blocoSvg(it, 'e', i))}
                {mapa.direita.map((it, i) => blocoSvg(it, 'd', i))}
              </svg>
              <div style={{ fontSize: 11.5, color: 'var(--gray-500)', padding: '4px 8px 6px' }}>Clique em um bloco para ver as peças do segmento. “Paga X%” = quanto do custo da moto o segmento sozinho cobre. A posição da seta é uma referência aproximada do segmento.</div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={th}>Segmento</th><th style={{ ...th, textAlign: 'right' }}>Peças</th><th style={{ ...th, textAlign: 'right' }}>Preço ML</th><th style={{ ...th, textAlign: 'right' }}>Líquido</th>
                    <th style={{ ...th, textAlign: 'right' }}>Paga do custo (preço)</th><th style={{ ...th, textAlign: 'right' }}>Paga do custo (líq.)</th><th style={th}>Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {segsVisiveis.map((s) => {
                    const l = ladoDaBase(s, base);
                    const part = totalMetrica > 0 ? valorDe(l, metrica) / totalMetrica : 0;
                    return (
                      <tr key={s.nome} style={{ cursor: 'pointer', background: s.nome === segSel ? '#eff6ff' : undefined }} onClick={() => setSegSel(s.nome === segSel ? '' : s.nome)}>
                        <td style={{ ...td, fontWeight: 700 }}>{s.nome}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{l.qtd}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{brl(l.bruto)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{brl(l.liq)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: corMarkup(custo > 0 ? l.bruto / custo : null) }}>{custo > 0 ? pct(l.bruto / custo) : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: corMarkup(custo > 0 ? l.liq / custo : null) }}>{custo > 0 ? pct(l.liq / custo) : '—'}</td>
                        <td style={{ ...td, minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, part * 100)}%`, height: '100%', background: '#2563eb' }} /></div>
                            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44, textAlign: 'right' }}>{pct(part)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {detalhe}
        </>
      ) : !carregando ? (
        <div style={{ ...card, fontSize: 13, color: 'var(--gray-500)' }}>Nenhuma moto com peças encontrada.</div>
      ) : null}
    </div>
  );
}
