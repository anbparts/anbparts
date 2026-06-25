'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function ConfGeraisPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fretePadrao, setFretePadrao] = useState('29.90');
  const [taxaPadraoPct, setTaxaPadraoPct] = useState('17');
  const [nuvemshopAtiva, setNuvemshopAtiva] = useState(false);
  const [nuvemshopLojaId, setNuvemshopLojaId] = useState('205449158');
  const [savingLojas, setSavingLojas] = useState(false);
  const [limpezaFotosPecaAtivo, setLimpezaFotosPecaAtivo] = useState(false);
  const [limpezaFotosPecaHorario, setLimpezaFotosPecaHorario] = useState('03:00');
  const [limpezaFotosPecaDias, setLimpezaFotosPecaDias] = useState('30');
  const [limpezaFotosPecaUltimaExecucaoEm, setLimpezaFotosPecaUltimaExecucaoEm] = useState<string | null>(null);
  const [savingLimpeza, setSavingLimpeza] = useState(false);
  const [recomp, setRecomp] = useState<any>(null);
  const [recompBusy, setRecompBusy] = useState(false);

  async function load() {
    const produtoConfig = await fetch(`${API}/bling/config-produtos`).then((r) => r.json());
    setFretePadrao(String(produtoConfig.fretePadrao ?? '29.90'));
    setTaxaPadraoPct(String(produtoConfig.taxaPadraoPct ?? '17'));
    const blingCfg = await fetch(`${API}/bling/config`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
    if (blingCfg.nuvemshopAtiva !== undefined) setNuvemshopAtiva(!!blingCfg.nuvemshopAtiva);
    if (blingCfg.nuvemshopLojaId) setNuvemshopLojaId(String(blingCfg.nuvemshopLojaId));
    const geralCfg = await fetch(`${API}/configuracoes-gerais`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
    setLimpezaFotosPecaAtivo(!!geralCfg.limpezaFotosPecaAtivo);
    setLimpezaFotosPecaHorario(geralCfg.limpezaFotosPecaHorario || '03:00');
    setLimpezaFotosPecaDias(String(geralCfg.limpezaFotosPecaDias || 30));
    setLimpezaFotosPecaUltimaExecucaoEm(geralCfg.limpezaFotosPecaUltimaExecucaoEm || null);
    await fetchRecompStatus();
  }

  async function fetchRecompStatus() {
    const st = await fetch(`${API}/pecas/recompressao-fotos/status`, { credentials: 'include' })
      .then((r) => r.json())
      .catch(() => null);
    if (st) setRecomp(st);
    return st;
  }

  async function iniciarRecompressao() {
    if (!confirm('Iniciar a recompressao das fotos de capa antigas para ~75 KB? E uma operacao unica e irreversivel.')) return;
    setRecompBusy(true);
    try {
      await fetch(`${API}/pecas/recompressao-fotos/iniciar`, { method: 'POST', credentials: 'include' });
      await fetchRecompStatus();
    } catch {
      alert('Erro ao iniciar a recompressao');
    }
    setRecompBusy(false);
  }

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Enquanto a recompressao roda, atualiza a barra de status a cada 1,5s.
  useEffect(() => {
    if (!recomp?.rodando) return;
    const t = setInterval(() => { fetchRecompStatus(); }, 1500);
    return () => clearInterval(t);
  }, [recomp?.rodando]);

  async function saveLojas() {
    setSavingLojas(true);
    try {
      await fetch(`${API}/bling/auditoria-automatica/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nuvemshopAtiva, nuvemshopLojaId: Number(nuvemshopLojaId) || 205449158 }),
      });
      alert('Configuracao de lojas salva!');
    } catch {
      alert('Erro ao salvar');
    }
    setSavingLojas(false);
  }

  async function saveLimpeza() {
    setSavingLimpeza(true);
    try {
      const resp = await fetch(`${API}/configuracoes-gerais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          limpezaFotosPecaAtivo,
          limpezaFotosPecaHorario,
          limpezaFotosPecaDias: Number(limpezaFotosPecaDias) || 30,
        }),
      });
      if (!resp.ok) throw new Error();
      await load();
      alert('Configuracao de limpeza de fotos salva!');
    } catch {
      alert('Erro ao salvar configuracao de limpeza de fotos');
    }
    setSavingLimpeza(false);
  }

  async function salvar() {
    const frete = Number(fretePadrao);
    const taxa = Number(taxaPadraoPct);

    if (!Number.isFinite(frete) || frete < 0) {
      alert('Informe um frete padrao valido');
      return;
    }

    if (!Number.isFinite(taxa) || taxa < 0) {
      alert('Informe uma taxa valida');
      return;
    }

    setSaving(true);
    try {
      await fetch(`${API}/bling/config-produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fretePadrao: frete,
          taxaPadraoPct: taxa,
        }),
      });
      alert('Valores padrao salvos com sucesso!');
    } catch {
      alert('Erro ao salvar valores padrao');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Gerais</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Gerais</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Parametros reutilizados no preenchimento dos produtos</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </div>

      <div style={{ padding: 28, maxWidth: 920 }}>
        <div style={s.card}>
          <div style={s.h3}>Valores Padrão</div>
          <p style={s.p}>
            Defina o frete padrao e a taxa do Mercado Livre usados para preencher e calcular os itens
            importados do Bling. Esses mesmos valores tambem serao usados ao aprovar um cancelamento.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Frete padrao (R$)</div>
              <input
                style={s.input}
                type="number"
                step="0.01"
                min="0"
                value={fretePadrao}
                onChange={(e) => setFretePadrao(e.target.value)}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Taxa ML (%)</div>
              <input
                style={s.input}
                type="number"
                step="0.01"
                min="0"
                value={taxaPadraoPct}
                onChange={(e) => setTaxaPadraoPct(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Lojas Monitoradas */}
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 4 }}>Lojas Monitoradas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Configure quais lojas devem ser consideradas nas verificacoes de divergencia da auditoria e consulta manual.</div>
          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            {/* ML - informativo */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Mercado Livre</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>Sempre ativo — regras de divergencia de ML sao fixas</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>ID loja Bling</label>
                <input style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, width: 120, background: 'var(--gray-50)', color: 'var(--gray-400)' }} type="number" value="205204423" readOnly disabled />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 10px', borderRadius: 6 }}>Sempre ativo</span>
            </div>
            {/* Nuvemshop */}
            <div style={{ border: `1px solid ${nuvemshopAtiva ? 'var(--blue-500)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: nuvemshopAtiva ? 'rgba(59,130,246,.04)' : 'transparent' }}>
              <span style={{ fontSize: 20 }}>🏪</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Nuvemshop</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>Quando ativo, gera divergencia para produtos com estoque sem anuncio na Nuvemshop</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>ID loja Bling</label>
                <input style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, width: 120 }} type="number" value={nuvemshopLojaId} onChange={(e) => setNuvemshopLojaId(e.target.value)} />
              </div>
              <select style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer', background: 'var(--white)' }} value={nuvemshopAtiva ? '1' : '0'} onChange={(e) => setNuvemshopAtiva(e.target.value === '1')}>
                <option value="1">Ativa</option>
                <option value="0">Pausada</option>
              </select>
            </div>
          </div>
          <button
            style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: savingLojas ? 'not-allowed' : 'pointer', background: 'var(--gray-800)', color: '#fff', opacity: savingLojas ? 0.7 : 1 }}
            onClick={saveLojas}
            disabled={savingLojas}
          >
            {savingLojas ? 'Salvando...' : 'Salvar configuracao de lojas'}
          </button>
        </div>

        {/* Limpeza de fotos de pecas vendidas */}
        <div style={s.card}>
          <div style={s.h3}>Limpeza de Fotos de Peças Vendidas</div>
          <p style={s.p}>
            Quando ativa, esta rotina roda 1x por dia no horario configurado e apaga a foto de capa das pecas que ja foram
            vendidas ha mais que a quantidade de dias informada. Como cada peca e unica e nao sera revendida, a foto deixa de
            ser necessaria e o espaco e liberado no banco. Pecas marcadas como prejuizo nunca tem a foto apagada.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Rotina</div>
              <select style={{ ...s.input, cursor: 'pointer' }} value={limpezaFotosPecaAtivo ? '1' : '0'} onChange={(e) => setLimpezaFotosPecaAtivo(e.target.value === '1')}>
                <option value="0">Pausada</option>
                <option value="1">Ativa</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Horario</div>
              <input style={s.input} type="time" value={limpezaFotosPecaHorario} onChange={(e) => setLimpezaFotosPecaHorario(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Apagar apos (dias)</div>
              <input style={s.input} type="number" min="1" step="1" value={limpezaFotosPecaDias} onChange={(e) => setLimpezaFotosPecaDias(e.target.value)} />
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>
            Ultima execucao: {limpezaFotosPecaUltimaExecucaoEm ? new Date(limpezaFotosPecaUltimaExecucaoEm).toLocaleString('pt-BR') : 'ainda nao executada'}
          </div>

          <button
            style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: savingLimpeza ? 'not-allowed' : 'pointer', background: 'var(--gray-800)', color: '#fff', opacity: savingLimpeza ? 0.7 : 1 }}
            onClick={saveLimpeza}
            disabled={savingLimpeza}
          >
            {savingLimpeza ? 'Salvando...' : 'Salvar configuracao de limpeza'}
          </button>
        </div>

        {/* Recompressao assistida das fotos de capa antigas */}
        <div style={s.card}>
          <div style={s.h3}>Recompressão das Fotos de Capa Antigas (única vez)</div>
          <p style={s.p}>
            Reduz as fotos de capa ja existentes para ~75 KB (mesmo alvo das novas), liberando espaco no banco.
            Roda em blocos, e pode ser acompanhada abaixo. So toca nas fotos acima do alvo — as ja otimizadas sao puladas,
            e cada foto e processada no maximo uma vez. <strong>E uma operacao irreversivel</strong> (recompressao com perda).
          </p>

          {(() => {
            const rodando = !!recomp?.rodando;
            const blocosTotais = Number(recomp?.blocosTotais || 0);
            const blocosFeitos = Number(recomp?.blocosFeitos || 0);
            const pct = blocosTotais > 0 ? Math.round((blocosFeitos / blocosTotais) * 100) : (recomp?.concluido ? 100 : 0);
            const pendentes = Number(recomp?.pendentes ?? 0);
            const nadaPraFazer = !rodando && !recomp?.iniciado && pendentes === 0;

            return (
              <>
                {!rodando && !recomp?.iniciado && (
                  <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 14 }}>
                    {pendentes > 0
                      ? <>Há <strong>{pendentes}</strong> foto(s) acima do alvo prontas para recompressão.</>
                      : <>Nenhuma foto acima do alvo — tudo já está otimizado. ✅</>}
                  </div>
                )}

                {(rodando || recomp?.iniciado) && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ height: 12, background: 'var(--gray-100, #eef1f5)', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: rodando ? 'var(--blue-500)' : 'var(--green)', transition: 'width .4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--gray-600)' }}>Blocos: <strong>{blocosFeitos}/{blocosTotais}</strong> ({pct}%)</span>
                      <span style={{ color: 'var(--gray-600)' }}>Processadas: <strong>{Number(recomp?.processadas || 0)}/{Number(recomp?.total || 0)}</strong></span>
                      <span style={{ color: 'var(--green)' }}>Sucesso: <strong>{Number(recomp?.sucesso || 0)}</strong></span>
                      <span style={{ color: Number(recomp?.erros || 0) > 0 ? 'var(--red, #dc2626)' : 'var(--gray-400)' }}>Erros: <strong>{Number(recomp?.erros || 0)}</strong></span>
                      <span style={{ fontWeight: 600, color: rodando ? 'var(--blue-500)' : 'var(--green)' }}>
                        {rodando ? 'Processando...' : (recomp?.concluido ? 'Concluído' : '')}
                      </span>
                    </div>
                    {!!recomp?.erros && recomp?.ultimoErro && (
                      <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 6 }}>Último erro: {recomp.ultimoErro}</div>
                    )}
                    {recomp?.concluido && !rodando && (
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8 }}>
                        Faltam <strong>{pendentes}</strong> foto(s) acima do alvo. Depois de zerar, rode <code>VACUUM (FULL, ANALYZE) "Peca"</code> no banco para liberar o disco.
                      </div>
                    )}
                  </div>
                )}

                <button
                  style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: (rodando || recompBusy || nadaPraFazer) ? 'not-allowed' : 'pointer', background: 'var(--gray-800)', color: '#fff', opacity: (rodando || recompBusy || nadaPraFazer) ? 0.6 : 1 }}
                  onClick={iniciarRecompressao}
                  disabled={rodando || recompBusy || nadaPraFazer}
                >
                  {rodando ? 'Processando...' : recompBusy ? 'Iniciando...' : (recomp?.iniciado && pendentes > 0) ? 'Continuar recompressão' : 'Comprimir fotos antigas'}
                </button>
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}
