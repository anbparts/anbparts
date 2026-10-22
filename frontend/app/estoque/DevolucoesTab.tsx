'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { useIsPhone } from '@/lib/use-is-phone';
import CanalBadge from '@/components/ui/CanalBadge';
import { MotivoDevolucaoModal, TiposDevolucaoModal, type MotivoOpcao } from '@/components/devolucoes/DevolucaoModais';

// Estoque > Devolucoes: historico de todos os cancelamentos e devolucoes (peca, pedido, marketplace, moto, valor e motivo).
type Registro = {
  id: number; pecaId: number | null; idPeca: string | null; descricao: string | null; pedidoNum: string | null; dataVenda: string | null; dataDevolucao: string;
  motoNome: string | null; motoLabel: string | null; valor: number | null; valorLiq: number | null; canal: string | null;
  motivoId: number | null; motivoNome: string | null; observacao: string | null; origem: string | null;
};
type Resposta = {
  total: number; per: number; page: number; podeEditar: boolean; canais: string[]; motivos: MotivoOpcao[];
  resumo: { qtd: number; valor: number; valorLiq: number; semMotivo: number; porMotivo: Array<{ nome: string; qtd: number }> };
  itens: Registro[];
};

const ORIGENS: Record<string, string> = {
  cancelamento_importado: 'Cancelamento importado', cancelamento_estoque: 'Cancelamento no estoque', devolucao_manual: 'Devolução registrada', historico_antigo: 'Histórico anterior',
};
const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBr = (v?: string | null) => { if (!v) return '—'; const [y, m, d] = String(v).slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : v; };

const entrada: any = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--white)', fontFamily: 'inherit', color: 'var(--gray-800)', minWidth: 0 };
const rotulo: any = { fontSize: 10.5, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3, display: 'block' };

export default function DevolucoesTab({ padding }: { padding: number }) {
  const isPhone = useIsPhone();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [page, setPage] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [canal, setCanal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [editar, setEditar] = useState<Registro | null>(null);
  const [tipos, setTipos] = useState(false);
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++seq.current;
    setCarregando(true); setErro('');
    try {
      const qs = new URLSearchParams({ page: String(page), per: '50' });
      if (buscaAplicada) qs.set('busca', buscaAplicada);
      if (de) qs.set('de', de);
      if (ate) qs.set('ate', ate);
      if (canal) qs.set('canal', canal);
      if (motivo) qs.set('motivo', motivo);
      const resp = await fetch(`${API_BASE}/devolucoes-historico?${qs}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
      if (minha === seq.current) setDados(d);
    } catch (e: any) { if (minha === seq.current) setErro(e?.message || 'Erro ao carregar'); }
    if (minha === seq.current) setCarregando(false);
  }, [page, buscaAplicada, de, ate, canal, motivo]);
  useEffect(() => { carregar(); }, [carregar]);

  // busca por digitacao, com pequena pausa
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setBuscaAplicada(busca.trim()); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  async function salvar(r: Registro, motivoId: number | null, observacao: string) {
    const resp = await fetch(`${API_BASE}/devolucoes-historico/${r.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivoId, observacao }) });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok || d.ok === false) throw new Error(d.error || `Erro ${resp.status}`);
    setEditar(null);
    await carregar();
  }

  const filtrando = Boolean(buscaAplicada || de || ate || canal || motivo);
  const limpar = () => { setBusca(''); setBuscaAplicada(''); setDe(''); setAte(''); setCanal(''); setMotivo(''); setPage(1); };
  const mudar = (fn: () => void) => { fn(); setPage(1); };
  const resumo = dados?.resumo;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.per)) : 1;
  const podeEditar = !!dados?.podeEditar;

  const cartao = (titulo: string, valor: string, cor = 'var(--gray-800)', dica?: string) => (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', minWidth: isPhone ? 0 : 170, flex: isPhone ? '1 1 140px' : '0 0 auto' }}>
      <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
      {dica ? <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{dica}</div> : null}
    </div>
  );

  const chipMotivo = (r: Registro) => r.motivoNome
    ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>{r.motivoNome}</span>
    : <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: '#fffbeb', color: '#92400e', border: '1px dashed #fcd34d', whiteSpace: 'nowrap' }}>Sem motivo</span>;

  const botaoEditar = (r: Registro) => podeEditar ? (
    <button type="button" onClick={() => setEditar(r)} style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', cursor: 'pointer' }}>{r.motivoNome ? 'Editar' : 'Informar motivo'}</button>
  ) : null;

  return (
    <div style={{ padding, maxWidth: 1500 }}>
      {/* Resumo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {cartao(filtrando ? 'Registros no filtro' : 'Cancelamentos e devoluções', String(resumo?.qtd ?? '—'))}
        {cartao('Valor vendido (estornado)', brl(resumo?.valor ?? 0), 'var(--blue-500)', 'preço de venda das peças')}
        {cartao('Valor líquido estornado', brl(resumo?.valorLiq ?? 0), 'var(--green)')}
        {cartao('Sem motivo informado', String(resumo?.semMotivo ?? '—'), (resumo?.semMotivo || 0) > 0 ? '#b45309' : 'var(--gray-800)', 'ajuste em Editar / Informar motivo')}
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'minmax(220px, 1.6fr) repeat(4, minmax(130px, 1fr)) auto', gap: 10, alignItems: 'end' }}>
        <div style={isPhone ? { gridColumn: '1 / -1' } : undefined}>
          <label style={rotulo}>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU, descrição, pedido ou moto" style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div><label style={rotulo}>De</label><input type="date" value={de} onChange={(e) => mudar(() => setDe(e.target.value))} style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} /></div>
        <div><label style={rotulo}>Até</label><input type="date" value={ate} onChange={(e) => mudar(() => setAte(e.target.value))} style={{ ...entrada, width: '100%', boxSizing: 'border-box' }} /></div>
        <div>
          <label style={rotulo}>Marketplace</label>
          <select value={canal} onChange={(e) => mudar(() => setCanal(e.target.value))} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todos</option>
            {(dados?.canais || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={rotulo}>Motivo</label>
          <select value={motivo} onChange={(e) => mudar(() => setMotivo(e.target.value))} style={{ ...entrada, width: '100%', cursor: 'pointer' }}>
            <option value="">Todos</option>
            <option value="sem">Sem motivo informado</option>
            {(dados?.motivos || []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, ...(isPhone ? { gridColumn: '1 / -1' } : {}) }}>
          {filtrando ? <button type="button" onClick={limpar} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Limpar</button> : null}
          <button type="button" onClick={() => setTipos(true)} style={{ ...entrada, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>⚙ Tipos de devolução</button>
        </div>
      </div>

      {resumo && resumo.porMotivo.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {resumo.porMotivo.map((m) => (
            <span key={m.nome} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-600)' }}>{m.nome}: <strong style={{ color: 'var(--gray-800)' }}>{m.qtd}</strong></span>
          ))}
        </div>
      ) : null}

      {erro ? <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{erro}</div> : null}

      {/* Lista */}
      {isPhone ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {(dados?.itens || []).map((r) => (
            <div key={r.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13.5, color: 'var(--blue-500)' }}>{r.idPeca || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{dataBr(r.dataDevolucao)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-800)', marginTop: 4 }}>{r.descricao || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>{[r.motoLabel, r.motoNome].filter(Boolean).join(' · ') || '—'}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Pedido {r.pedidoNum ? `#${r.pedidoNum}` : '—'}</span>
                <CanalBadge canal={r.canal} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--blue-500)', marginLeft: 'auto' }}>{brl(r.valor)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>{chipMotivo(r)}{botaoEditar(r)}</div>
              {r.observacao ? <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8 }}>Obs.: {r.observacao}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50, #f9fafb)', textAlign: 'left' }}>
                  {['Devolução', 'Peça', 'Pedido', 'Marketplace', 'Moto', 'Venda', 'Valor', 'Motivo', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', textAlign: h === 'Valor' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(dados?.itens || []).map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-700)' }}>
                      {dataBr(r.dataDevolucao)}
                      <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginTop: 2 }}>{ORIGENS[r.origem || ''] || r.origem || ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 300 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12.5, color: 'var(--blue-500)' }}>{r.idPeca || '—'}</div>
                      <div style={{ color: 'var(--gray-800)', marginTop: 2 }}>{r.descricao || '—'}</div>
                      {r.observacao ? <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 3 }}>Obs.: {r.observacao}</div> : null}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.pedidoNum ? `#${r.pedidoNum}` : '—'}</td>
                    <td style={{ padding: '10px 12px' }}><CanalBadge canal={r.canal} />{!r.canal ? <span style={{ color: 'var(--gray-400)' }}>—</span> : null}</td>
                    <td style={{ padding: '10px 12px', maxWidth: 230 }}>
                      {r.motoLabel ? <div style={{ fontWeight: 700, fontSize: 12.5 }}>{r.motoLabel}</div> : null}
                      <div style={{ color: 'var(--gray-600)', fontSize: 12.5 }}>{r.motoNome || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--gray-600)' }}>{dataBr(r.dataVenda)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--blue-500)' }}>
                      {brl(r.valor)}
                      {r.valorLiq != null ? <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--green)', marginTop: 2 }}>líq. {brl(r.valorLiq)}</div> : null}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{chipMotivo(r)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{botaoEditar(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {carregando && !dados ? <div style={{ fontSize: 13, color: 'var(--gray-400)', padding: 14 }}>Carregando...</div> : null}
      {!carregando && dados && !dados.itens.length ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, textAlign: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{filtrando ? 'Nenhum registro com esses filtros' : 'Nenhum cancelamento ou devolução registrado ainda'}</div>
          {!filtrando ? <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 6 }}>A partir de agora todo cancelamento de venda e toda devolução registrada entram aqui automaticamente.</div> : null}
        </div>
      ) : null}

      {dados && dados.total > dados.per ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button type="button" disabled={page <= 1 || carregando} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>← Anterior</button>
          <span style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>Página {page} de {totalPaginas} · {dados.total} registros</span>
          <button type="button" disabled={page >= totalPaginas || carregando} onClick={() => setPage((p) => p + 1)} style={{ ...entrada, cursor: 'pointer', fontWeight: 600 }}>Próxima →</button>
        </div>
      ) : null}

      {editar ? (
        <MotivoDevolucaoModal
          titulo="Motivo da devolução"
          subtitulo={`${editar.idPeca || ''} — ${editar.descricao || ''}${editar.pedidoNum ? ` · pedido #${editar.pedidoNum}` : ''}`}
          motivos={dados?.motivos || []} motivoIdAtual={editar.motivoId} observacaoAtual={editar.observacao}
          podeGerenciar={podeEditar} onGerenciar={() => setTipos(true)}
          onSalvar={(motivoId, obs) => salvar(editar, motivoId, obs)} onClose={() => setEditar(null)}
        />
      ) : null}
      {tipos ? <TiposDevolucaoModal onClose={() => setTipos(false)} onAlterou={carregar} /> : null}
    </div>
  );
}
