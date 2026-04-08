'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--gray-800)', outline: 'none' },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MercadoLivrePerguntasPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [perguntas, setPerguntas] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  async function load() {
    const rows = await api.mercadoLivre.perguntas();
    setPerguntas(rows);
    setRespostas((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        if (!(row.questionId in next)) {
          next[row.questionId] = '';
        }
      });
      return next;
    });
  }

  useEffect(() => {
    load()
      .catch((error) => alert(error.message || 'Erro ao carregar perguntas do Mercado Livre'))
      .finally(() => setLoading(false));
  }, []);

  async function syncPerguntas() {
    setSyncing(true);
    try {
      await api.mercadoLivre.syncPerguntas();
      await load();
    } catch (error: any) {
      alert(error.message || 'Erro ao atualizar perguntas');
    } finally {
      setSyncing(false);
    }
  }

  async function responder(questionId: string) {
    const text = String(respostas[questionId] || '').trim();
    if (!text) {
      alert('Digite a resposta para o cliente antes de enviar.');
      return;
    }

    setRespondingId(questionId);
    try {
      await api.mercadoLivre.responderPergunta(questionId, text);
      await load();
    } catch (error: any) {
      alert(error.message || 'Erro ao responder a pergunta');
    } finally {
      setRespondingId(null);
    }
  }

  async function excluir(questionId: string) {
    if (!confirm('Excluir essa pergunta da fila pendente?')) return;

    setDeletingId(questionId);
    try {
      await api.mercadoLivre.excluirPergunta(questionId);
      await load();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir a pergunta');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Perguntas</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Perguntas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Somente perguntas pendentes de resposta do Mercado Livre</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={syncPerguntas} disabled={syncing}>
          {syncing ? 'Atualizando...' : 'Atualizar agora'}
        </button>
      </div>

      <div style={{ padding: 28 }}>
        {!perguntas.length ? (
          <div style={{ ...s.card, color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma pergunta pendente encontrada.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {perguntas.map((pergunta) => (
              <div key={pergunta.questionId} style={{ ...s.card, borderColor: '#fcd34d' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 6 }}>
                      Pergunta #{pergunta.questionId}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>
                      {pergunta.idPeca || pergunta.sku || pergunta.tituloAnuncio || 'Sem identificacao'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                      {pergunta.descricao || pergunta.tituloAnuncio || 'Sem descricao'}
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: '1px solid #fcd34d', background: 'var(--amber-light)', color: 'var(--amber)' }}>
                    Aguardando resposta
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 }}>Cliente</div>
                    <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{pergunta.nomeCliente || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 }}>Item ML</div>
                    <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{pergunta.itemId || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 }}>SKU / ID peca</div>
                    <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{pergunta.idPeca || pergunta.sku || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 }}>Recebida em</div>
                    <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{formatDateTime(pergunta.dataPergunta)}</div>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #dbe3ef', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Pergunta recebida</div>
                  <div style={{ fontSize: 14, color: 'var(--gray-800)', lineHeight: 1.7 }}>{pergunta.texto || '-'}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Resposta para o cliente</div>
                  <textarea
                    style={{ ...s.input, minHeight: 110, resize: 'vertical' as const }}
                    value={respostas[pergunta.questionId] || ''}
                    onChange={(e) => setRespostas((current) => ({ ...current, [pergunta.questionId]: e.target.value }))}
                    placeholder="Digite aqui a resposta que sera enviada para o cliente"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {pergunta.linkAnuncio ? (
                        <a href={pergunta.linkAnuncio} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--blue-500)', textDecoration: 'none' }}>
                          Abrir anuncio no Mercado Livre
                        </a>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', borderColor: '#fca5a5' }}
                        onClick={() => excluir(String(pergunta.questionId))}
                        disabled={deletingId === String(pergunta.questionId) || respondingId === String(pergunta.questionId)}
                      >
                        {deletingId === String(pergunta.questionId) ? 'Excluindo...' : 'Excluir'}
                      </button>
                      <button
                        style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }}
                        onClick={() => responder(String(pergunta.questionId))}
                        disabled={respondingId === String(pergunta.questionId) || deletingId === String(pergunta.questionId)}
                      >
                        {respondingId === String(pergunta.questionId) ? 'Respondendo...' : 'Responder'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
