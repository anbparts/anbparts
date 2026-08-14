'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Observacao = { id: number; texto: string };
type Transportadora = { id: number; nome: string; observacoes: Observacao[] };

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--gray-800)', outline: 'none', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function ConfSeparacaoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [busca, setBusca] = useState('');
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [editandoNomeId, setEditandoNomeId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [novoTexto, setNovoTexto] = useState('');
  const [editandoObsId, setEditandoObsId] = useState<number | null>(null);
  const [textoEditado, setTextoEditado] = useState('');

  async function carregar() {
    const d = await api.confSeparacao.list();
    setTransportadoras(d.transportadoras || []);
  }

  useEffect(() => {
    carregar().catch((e) => alert(e.message || 'Erro ao carregar')).finally(() => setLoading(false));
  }, []);

  const transportadorasFiltradas = useMemo(
    () => transportadoras.filter((t) => t.nome.toLowerCase().includes(busca.trim().toLowerCase())),
    [transportadoras, busca],
  );
  const selecionada = transportadoras.find((t) => t.id === selecionadoId) || null;

  async function criarTransportadora() {
    const nome = novoNome.trim();
    if (!nome) return;
    setSaving(true);
    try {
      const resp = await api.confSeparacao.criarTransportadora(nome);
      setNovoNome('');
      await carregar();
      if (resp?.id) setSelecionadoId(resp.id);
    } catch (e: any) {
      alert(e.message || 'Erro ao criar transportadora');
    } finally {
      setSaving(false);
    }
  }

  function iniciarRenomear(t: Transportadora) {
    setEditandoNomeId(t.id);
    setNomeEditado(t.nome);
  }

  async function confirmarRenomear() {
    if (!editandoNomeId) return;
    const nome = nomeEditado.trim();
    if (!nome) return;
    setSaving(true);
    try {
      await api.confSeparacao.renomearTransportadora(editandoNomeId, nome);
      setEditandoNomeId(null);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao renomear');
    } finally {
      setSaving(false);
    }
  }

  async function removerTransportadora(t: Transportadora) {
    if (!confirm(`Remover a transportadora "${t.nome}" e todos os textos configurados nela?`)) return;
    setSaving(true);
    try {
      await api.confSeparacao.removerTransportadora(t.id);
      if (selecionadoId === t.id) setSelecionadoId(null);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao remover');
    } finally {
      setSaving(false);
    }
  }

  async function adicionarObservacao() {
    if (!selecionadoId) return;
    const texto = novoTexto.trim();
    if (!texto) return;
    setSaving(true);
    try {
      await api.confSeparacao.adicionarObservacao(selecionadoId, texto);
      setNovoTexto('');
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao adicionar observação');
    } finally {
      setSaving(false);
    }
  }

  function iniciarEditarObs(o: Observacao) {
    setEditandoObsId(o.id);
    setTextoEditado(o.texto);
  }

  async function confirmarEditarObs() {
    if (!editandoObsId) return;
    const texto = textoEditado.trim();
    if (!texto) return;
    setSaving(true);
    try {
      await api.confSeparacao.editarObservacao(editandoObsId, texto);
      setEditandoObsId(null);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar observação');
    } finally {
      setSaving(false);
    }
  }

  async function removerObservacao(o: Observacao) {
    if (!confirm('Remover este texto de observação?')) return;
    setSaving(true);
    try {
      await api.confSeparacao.removerObservacao(o.id);
      await carregar();
    } catch (e: any) {
      alert(e.message || 'Erro ao remover observação');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}><div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Separação</div></div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Separação</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Transportadoras e textos de observação usados no Relatório de Separação</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 18, padding: 22, alignItems: 'start' }}>
        {/* Lista de transportadoras */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Transportadoras</div>
            <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginBottom: 10 }}>{transportadoras.length} cadastrada(s)</div>
            <input style={{ ...s.input, padding: '7px 10px' }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar transportadora..." />
          </div>
          <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            {transportadorasFiltradas.map((t) => {
              const sel = t.id === selecionadoId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelecionadoId(t.id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '10px 14px', border: 'none', borderTop: '1px solid var(--gray-100, #eef1f5)', cursor: 'pointer',
                    background: sel ? '#eff6ff' : 'transparent', fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span style={{ fontSize: 13, color: sel ? 'var(--blue-500)' : 'var(--gray-700)', fontWeight: sel ? 700 : 500 }}>{t.nome}</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)', flexShrink: 0 }}>{t.observacoes.length} texto(s)</span>
                </button>
              );
            })}
            {!transportadorasFiltradas.length && (
              <div style={{ padding: 14, fontSize: 12.5, color: 'var(--gray-400)' }}>Nenhuma transportadora encontrada.</div>
            )}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              style={{ ...s.input, padding: '7px 10px' }}
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criarTransportadora()}
              placeholder="Nova transportadora..."
              disabled={saving}
            />
            <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', padding: '7px 14px' }} onClick={criarTransportadora} disabled={saving || !novoNome.trim()}>
              + Add
            </button>
          </div>
        </div>

        {/* Editor da transportadora selecionada */}
        {!selecionada ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>
            Selecione uma transportadora à esquerda (ou crie uma nova) pra configurar os textos de observação.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                {editandoNomeId === selecionada.id ? (
                  <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
                    <input
                      style={s.input}
                      value={nomeEditado}
                      onChange={(e) => setNomeEditado(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmarRenomear()}
                      autoFocus
                    />
                    <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={confirmarRenomear} disabled={saving}>Salvar</button>
                    <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)' }} onClick={() => setEditandoNomeId(null)} disabled={saving}>Cancelar</button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>{selecionada.nome}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', padding: '6px 12px', fontSize: 12 }} onClick={() => iniciarRenomear(selecionada)}>
                        Renomear
                      </button>
                      <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid #fecaca', color: '#dc2626', padding: '6px 12px', fontSize: 12 }} onClick={() => removerTransportadora(selecionada)}>
                        Remover transportadora
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>
                Textos de observação (aparecem pra você escolher no Relatório de Separação):
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {selecionada.observacoes.map((o) => (
                  <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#f8fafc' }}>
                    {editandoObsId === o.id ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <textarea
                          style={{ ...s.input, minHeight: 80, resize: 'vertical' }}
                          value={textoEditado}
                          onChange={(e) => setTextoEditado(e.target.value)}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', padding: '6px 12px', fontSize: 12 }} onClick={confirmarEditarObs} disabled={saving}>Salvar</button>
                          <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', padding: '6px 12px', fontSize: 12 }} onClick={() => setEditandoObsId(null)} disabled={saving}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontSize: 13, color: 'var(--gray-800)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{o.texto}</div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid var(--border)', color: 'var(--gray-600)', padding: '5px 10px', fontSize: 11.5 }} onClick={() => iniciarEditarObs(o)}>
                            Editar
                          </button>
                          <button style={{ ...s.btn, background: 'var(--white)', border: '1px solid #fecaca', color: '#dc2626', padding: '5px 10px', fontSize: 11.5 }} onClick={() => removerObservacao(o)}>
                            Excluir
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!selecionada.observacoes.length && (
                  <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Nenhum texto configurado ainda pra essa transportadora.</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <textarea
                  style={{ ...s.input, minHeight: 60, resize: 'vertical' }}
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                  placeholder="Novo texto de observação..."
                  disabled={saving}
                />
                <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', flexShrink: 0, alignSelf: 'flex-start' }} onClick={adicionarObservacao} disabled={saving || !novoTexto.trim()}>
                  + Add texto
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
