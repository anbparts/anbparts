'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type LayoutMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

const s = {
  btnBase: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
    fontFamily: 'Inter, sans-serif',
    transition: 'all 150ms ease',
  },
  input: {
    width: '100%',
    background: 'var(--white)',
    border: '1px solid #dbe3ef',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    color: 'var(--gray-800)',
    outline: 'none',
    lineHeight: 1.5,
  },
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

function questionStatusLabel(status: string | null | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ANSWERED') return 'Respondida';
  if (normalized === 'UNANSWERED') return 'Sem resposta';
  if (normalized === 'DISMISSED') return 'Excluida';
  if (normalized === 'CLOSED') return 'Fechada';
  if (normalized === 'UNDER_REVIEW') return 'Em analise';
  return normalized || '-';
}

function questionStatusStyle(status: string | null | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ANSWERED') return { bg: '#ecfdf3', color: '#15803d', border: '#bbf7d0' };
  if (normalized === 'UNANSWERED') return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
  if (normalized === 'DISMISSED') return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
  return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
}

function useLayoutMode() {
  const [mode, setMode] = useState<LayoutMode>('desktop');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');

    const syncMode = () => {
      if (phoneMedia.matches) {
        setMode('phone');
        return;
      }

      if (tabletPortraitMedia.matches) {
        setMode('tablet-portrait');
        return;
      }

      if (tabletLandscapeMedia.matches) {
        setMode('tablet-landscape');
        return;
      }

      setMode('desktop');
    };

    syncMode();
    phoneMedia.addEventListener('change', syncMode);
    tabletPortraitMedia.addEventListener('change', syncMode);
    tabletLandscapeMedia.addEventListener('change', syncMode);

    return () => {
      phoneMedia.removeEventListener('change', syncMode);
      tabletPortraitMedia.removeEventListener('change', syncMode);
      tabletLandscapeMedia.removeEventListener('change', syncMode);
    };
  }, []);

  return mode;
}

function PendingChip({ count, fullWidth = false }: { count: number; fullWidth?: boolean }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: fullWidth ? '100%' : 'auto',
        minHeight: 40,
        padding: '9px 14px',
        borderRadius: 999,
        background: 'var(--gray-50)',
        border: '1px solid var(--border)',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--gray-700)',
        whiteSpace: 'nowrap',
      }}
    >
      {count} {count === 1 ? 'pergunta pendente' : 'perguntas pendentes'}
    </div>
  );
}

export default function MercadoLivrePerguntasPage() {
  const layoutMode = useLayoutMode();
  const isPhone = layoutMode === 'phone';
  const isTabletPortrait = layoutMode === 'tablet-portrait';
  const isTabletLandscape = layoutMode === 'tablet-landscape';
  const isDesktop = layoutMode === 'desktop';
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [perguntas, setPerguntas] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoError, setHistoricoError] = useState('');
  const [historico, setHistorico] = useState<any | null>(null);

  const shellOffset = isDesktop ? 0 : 64;
  const pagePadding = isPhone ? 14 : isTabletPortrait ? 18 : isTabletLandscape ? 22 : 28;
  const cardPadding = isPhone ? 12 : isTabletPortrait ? 14 : isTabletLandscape ? 16 : 16;
  const topbarSticky = isDesktop || isTabletLandscape;
  const containerMaxWidth = isDesktop ? 1180 : isTabletLandscape ? 1080 : isTabletPortrait ? 860 : '100%';
  const stackIntro = isPhone || isTabletPortrait;
  const stackCardHeader = isPhone || isTabletPortrait;
  const metaColumns = isPhone
    ? 'repeat(2, minmax(0, 1fr))'
    : isTabletPortrait || isTabletLandscape
    ? 'repeat(2, minmax(0, 1fr))'
    : 'repeat(4, minmax(0, 1fr))';
  const contentColumns = isDesktop
    ? 'minmax(0, 0.94fr) minmax(340px, 0.88fr)'
    : isTabletLandscape
    ? 'minmax(0, 1fr) minmax(320px, 0.92fr)'
    : '1fr';

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
      setSuccessMessage('Mensagem respondida com sucesso!');
      await load();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error: any) {
      alert(error.message || 'Erro ao responder a pergunta');
    } finally {
      setRespondingId(null);
    }
  }

  async function excluir(questionId: string) {
    if (!confirm('Excluir essa pergunta no Mercado Livre e remover da fila do ANB?')) return;

    setDeletingId(questionId);
    try {
      await api.mercadoLivre.excluirPergunta(questionId);
      await load();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir a pergunta no Mercado Livre');
    } finally {
      setDeletingId(null);
    }
  }

  async function abrirHistoricoPergunta(pergunta: any) {
    const itemId = String(pergunta?.itemId || '').trim();
    if (!itemId) {
      alert('Essa pergunta nao possui Item ML para consultar o historico.');
      return;
    }

    setHistoricoAberto(true);
    setHistoricoError('');
    setHistorico({
      itemId,
      tituloAnuncio: pergunta?.tituloAnuncio || pergunta?.descricao || '',
      linkAnuncio: pergunta?.linkAnuncio || '',
      perguntas: [],
      total: 0,
    });
    setHistoricoLoading(true);

    try {
      const data = await api.mercadoLivre.historicoPerguntasAnuncio(itemId);
      setHistorico(data);
    } catch (error: any) {
      setHistoricoError(error.message || 'Erro ao carregar historico de perguntas');
    } finally {
      setHistoricoLoading(false);
    }
  }

  function fecharHistoricoPergunta() {
    setHistoricoAberto(false);
    setHistoricoLoading(false);
    setHistoricoError('');
  }

  if (loading) {
    return (
      <>
        <div
          style={{
            position: topbarSticky ? 'sticky' : 'static',
            top: topbarSticky ? shellOffset : undefined,
            zIndex: 50,
            padding: isPhone ? '16px 14px 14px' : '18px 20px 16px',
            background: 'rgba(255,255,255,.92)',
            borderBottom: '1px solid var(--border)',
            backdropFilter: topbarSticky ? 'blur(12px)' : undefined,
          }}
        >
          <div style={{ maxWidth: containerMaxWidth, margin: '0 auto' }}>
            <div style={{ fontSize: isPhone ? 20 : 22, fontWeight: 700, color: 'var(--gray-800)', letterSpacing: '-0.5px' }}>
              Perguntas
            </div>
          </div>
        </div>
        <div style={{ padding: pagePadding, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div
        style={{
          position: topbarSticky ? 'sticky' : 'static',
          top: topbarSticky ? shellOffset : undefined,
          zIndex: 50,
          padding: isPhone ? '16px 14px 14px' : isTabletPortrait ? '18px 18px 16px' : '18px 22px',
          background: 'rgba(255,255,255,.92)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: topbarSticky ? 'blur(12px)' : undefined,
        }}
      >
        <div
          style={{
            maxWidth: containerMaxWidth,
            margin: '0 auto',
            display: 'flex',
            flexDirection: stackIntro ? 'column' : 'row',
            alignItems: stackIntro ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: isPhone ? 12 : 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: isPhone ? 20 : isTabletPortrait ? 30 : 28,
                fontWeight: 700,
                color: 'var(--gray-800)',
                letterSpacing: isPhone ? '-0.5px' : '-0.8px',
                lineHeight: 1.06,
              }}
            >
              Perguntas do Mercado Livre
            </div>
            <div
              style={{
                fontSize: isPhone ? 13 : isTabletPortrait ? 14 : 13.5,
                color: 'var(--gray-500)',
                marginTop: isPhone ? 4 : 6,
                lineHeight: 1.6,
                maxWidth: isDesktop ? 560 : isTabletLandscape ? 520 : '100%',
              }}
            >
              Somente perguntas pendentes de resposta, com visual adaptado para celular, tablet e desktop.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: isPhone ? 'row' : 'row',
              flexWrap: isPhone ? 'wrap' : 'nowrap',
              alignItems: 'center',
              justifyContent: stackIntro ? 'flex-start' : 'flex-end',
              gap: 10,
              width: stackIntro ? '100%' : 'auto',
              flexShrink: 0,
            }}
          >
            <PendingChip count={perguntas.length} fullWidth={false} />
            <button
              style={{
                ...s.btnBase,
                flex: isPhone ? 1 : undefined,
                minWidth: isPhone ? 0 : 160,
                minHeight: 40,
                background: 'var(--blue-500)',
                color: '#fff',
              }}
              onClick={syncPerguntas}
              disabled={syncing}
            >
              {syncing ? 'Atualizando...' : 'Atualizar agora'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: pagePadding }}>
        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13.5,
            fontWeight: 600,
            color: '#16a34a',
          }}>
            ✓ {successMessage}
          </div>
        )}
        <div style={{ maxWidth: containerMaxWidth, margin: '0 auto' }}>
          {!perguntas.length ? (
            <div
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 18,
                padding: isPhone ? 18 : 22,
                color: 'var(--gray-500)',
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              Nenhuma pergunta pendente encontrada.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: isPhone ? 10 : 12 }}>
              {perguntas.map((pergunta) => {
                const questionId = String(pergunta.questionId);
                const busy = deletingId === questionId || respondingId === questionId;

                return (
                  <div
                    key={questionId}
                    style={{
                      background: 'var(--white)',
                      border: '1px solid #fcd34d',
                      borderRadius: isPhone ? 12 : 14,
                      padding: cardPadding,
                      boxShadow: '0 12px 30px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: stackCardHeader ? 'column' : 'row',
                        alignItems: stackCardHeader ? 'stretch' : 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono, monospace',
                            color: 'var(--gray-400)',
                            letterSpacing: '.08em',
                            textTransform: 'uppercase',
                            marginBottom: 8,
                          }}
                        >
                          Pergunta #{questionId}
                        </div>

                        <div
                          style={{
                            fontSize: isPhone ? 15 : isTabletPortrait ? 18 : 17,
                            fontWeight: 700,
                            color: 'var(--gray-800)',
                            marginBottom: 6,
                            lineHeight: 1.15,
                            letterSpacing: '-0.5px',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {pergunta.idPeca || pergunta.sku || pergunta.tituloAnuncio || 'Sem identificacao'}
                        </div>

                        <div
                          style={{
                            fontSize: isPhone ? 12.5 : 13,
                            color: 'var(--gray-500)',
                            lineHeight: 1.65,
                            overflowWrap: 'anywhere',
                            maxWidth: isDesktop ? 640 : '100%',
                          }}
                        >
                          {pergunta.descricao || pergunta.tituloAnuncio || 'Sem descricao'}
                        </div>
                      </div>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '7px 12px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          border: '1px solid #fcd34d',
                          background: 'var(--amber-light)',
                          color: 'var(--amber)',
                          alignSelf: stackCardHeader ? 'flex-start' : 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Aguardando resposta
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: metaColumns,
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      {[
                        { label: 'Cliente', value: pergunta.nomeCliente || '-' },
                        { label: 'Item ML', value: pergunta.itemId || '-' },
                        { label: 'SKU / ID peca', value: pergunta.idPeca || pergunta.sku || '-' },
                        { label: 'Recebida em', value: formatDateTime(pergunta.dataPergunta) },
                      ].map((item) => (
                        <div
                          key={`${questionId}-${item.label}`}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: isPhone ? '8px 10px' : '9px 11px',
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--gray-400)',
                              textTransform: 'uppercase',
                              letterSpacing: '.07em',
                              marginBottom: 5,
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: isPhone ? 13 : 13.5,
                              color: 'var(--gray-800)',
                              lineHeight: 1.55,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: contentColumns,
                        gap: 10,
                        alignItems: 'start',
                      }}
                    >
                      <div
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #dbe3ef',
                          borderRadius: 10,
                          padding: isPhone ? 10 : 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--gray-400)',
                            textTransform: 'uppercase',
                            letterSpacing: '.07em',
                            marginBottom: 8,
                          }}
                        >
                          Pergunta recebida
                        </div>
                        <div
                          style={{
                            fontSize: isPhone ? 13 : 13.5,
                            color: 'var(--gray-800)',
                            lineHeight: 1.75,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {pergunta.texto || '-'}
                        </div>
                      </div>

                      <div
                        style={{
                          background: '#fbfdff',
                          border: '1px solid #dbe3ef',
                          borderRadius: 10,
                          padding: isPhone ? 10 : 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--gray-400)',
                            textTransform: 'uppercase',
                            letterSpacing: '.07em',
                            marginBottom: 8,
                          }}
                        >
                          Resposta para o cliente
                        </div>

                        <textarea
                          style={{
                            ...s.input,
                            minHeight: isPhone ? 90 : isTabletPortrait ? 100 : 110,
                            resize: 'vertical',
                          }}
                          value={respostas[questionId] || ''}
                          onChange={(e) => setRespostas((current) => ({ ...current, [questionId]: e.target.value }))}
                          placeholder="Digite aqui a resposta que sera enviada para o cliente"
                        />

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: isPhone ? 'column' : 'row',
                            alignItems: isPhone ? 'stretch' : 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            marginTop: 8,
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: isPhone ? 'column' : 'row',
                              alignItems: isPhone ? 'flex-start' : 'center',
                              gap: isPhone ? 8 : 14,
                              flexWrap: 'wrap',
                            }}
                          >
                            {pergunta.linkAnuncio ? (
                              <a
                                href={pergunta.linkAnuncio}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  fontSize: 13,
                                  color: 'var(--blue-500)',
                                  textDecoration: 'none',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                Abrir anuncio no Mercado Livre
                              </a>
                            ) : null}
                            {pergunta.itemId ? (
                              <button
                                type="button"
                                onClick={() => abrirHistoricoPergunta(pergunta)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: 0,
                                  border: 'none',
                                  background: 'transparent',
                                  fontSize: 13,
                                  fontFamily: 'Inter, sans-serif',
                                  color: 'var(--blue-500)',
                                  textDecoration: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                Histórico Pergunta
                              </button>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexDirection: isPhone ? 'column' : 'row',
                              gap: 10,
                              width: isPhone ? '100%' : 'auto',
                            }}
                          >
                            <button
                              style={{
                                ...s.btnBase,
                                width: isPhone ? '100%' : 'auto',
                                background: 'var(--red-light)',
                                color: 'var(--red)',
                                borderColor: '#fca5a5',
                                minHeight: 34,
                              }}
                              onClick={() => excluir(questionId)}
                              disabled={busy}
                            >
                              {deletingId === questionId ? 'Excluindo...' : 'Excluir'}
                            </button>

                            <button
                              style={{
                                ...s.btnBase,
                                width: isPhone ? '100%' : 'auto',
                                background: 'var(--blue-500)',
                                color: '#fff',
                                minHeight: 34,
                              }}
                              onClick={() => responder(questionId)}
                              disabled={busy}
                            >
                              {respondingId === questionId ? 'Respondendo...' : 'Responder'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {historicoAberto ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(15, 23, 42, 0.52)',
            display: 'flex',
            alignItems: isPhone ? 'stretch' : 'center',
            justifyContent: 'center',
            padding: isPhone ? 0 : 24,
          }}
          onClick={fecharHistoricoPergunta}
        >
          <div
            style={{
              width: isPhone ? '100%' : 'min(940px, calc(100vw - 48px))',
              maxHeight: isPhone ? '100vh' : '86vh',
              background: 'var(--white)',
              borderRadius: isPhone ? 0 : 16,
              border: isPhone ? 'none' : '1px solid var(--border)',
              boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: isPhone ? '16px 16px 14px' : '18px 22px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isPhone ? 18 : 20, fontWeight: 700, color: 'var(--gray-800)', lineHeight: 1.2 }}>
                  Histórico Pergunta
                </div>
                <div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--gray-500)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  {historico?.itemId || '-'}{historico?.tituloAnuncio ? ` - ${historico.tituloAnuncio}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={fecharHistoricoPergunta}
                style={{
                  ...s.btnBase,
                  minHeight: 34,
                  padding: '7px 12px',
                  background: '#f8fafc',
                  borderColor: '#dbe3ef',
                  color: 'var(--gray-700)',
                  flexShrink: 0,
                }}
              >
                Fechar
              </button>
            </div>

            <div style={{ padding: isPhone ? 14 : 18, overflowY: 'auto' }}>
              {historicoLoading ? (
                <div style={{ padding: 18, color: 'var(--gray-500)', fontSize: 13 }}>
                  Carregando histórico...
                </div>
              ) : historicoError ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 12,
                    padding: 14,
                    color: '#b91c1c',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {historicoError}
                </div>
              ) : !(historico?.perguntas || []).length ? (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 16,
                    color: 'var(--gray-500)',
                    fontSize: 13,
                  }}
                >
                  Nenhuma pergunta encontrada para este anuncio.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginBottom: 2 }}>
                    {(historico?.perguntas || []).length} pergunta(s), da mais recente para a mais antiga.
                  </div>
                  {(historico?.perguntas || []).map((item: any) => {
                    const statusStyle = questionStatusStyle(item.status);
                    return (
                      <div
                        key={item.questionId}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          background: '#fff',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: isPhone ? 'column' : 'row',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '10px 12px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', marginBottom: 4 }}>
                              Pergunta #{item.questionId || '-'}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--gray-600)' }}>
                              {formatDateTime(item.dataPergunta)}{item.nomeCliente ? ` - ${item.nomeCliente}` : item.clienteId ? ` - Cliente ${item.clienteId}` : ''}
                            </div>
                          </div>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              alignSelf: isPhone ? 'flex-start' : 'center',
                              padding: '4px 9px',
                              borderRadius: 999,
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: statusStyle.bg,
                              color: statusStyle.color,
                              border: `1px solid ${statusStyle.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {questionStatusLabel(item.status)}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 0 }}>
                          <div style={{ padding: 12, borderRight: isPhone ? 'none' : '1px solid #e2e8f0', borderBottom: isPhone ? '1px solid #e2e8f0' : 'none' }}>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                              Pergunta
                            </div>
                            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--gray-800)', overflowWrap: 'anywhere' }}>
                              {item.texto || '-'}
                            </div>
                          </div>
                          <div style={{ padding: 12, background: item.respostaTexto ? '#fbfdff' : '#fff' }}>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                              Resposta {item.respondidaEm ? `- ${formatDateTime(item.respondidaEm)}` : ''}
                            </div>
                            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: item.respostaTexto ? 'var(--gray-800)' : 'var(--gray-400)', overflowWrap: 'anywhere' }}>
                              {item.respostaTexto || 'Ainda sem resposta'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
