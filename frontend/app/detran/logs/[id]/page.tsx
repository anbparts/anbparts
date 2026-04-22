'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { detranShell as ds, formatDetranDate, formatDetranDuration, formatDetranFlow, getDetranStatusMeta } from '@/lib/detran-ui';

function prettyJson(value: any) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export default function DetranLogDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!Number.isInteger(id) || id <= 0) {
        setError('Log invalido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const response = await api.detran.execucao(id);
        if (!active) return;
        setItem(response.execucao || null);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Nao foi possivel carregar o log tecnico.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id]);

  const statusMeta = useMemo(() => getDetranStatusMeta(item?.status), [item?.status]);
  const etapas = Array.isArray(item?.etapas) ? item.etapas : [];

  return (
    <>
      <div style={{ ...ds.topbar, padding: isPhone ? '0 14px' : ds.topbar.padding }}>
        <div>
          <div style={ds.title}>Log tecnico</div>
          <div style={ds.sub}>Detalhamento completo da execucao Detran dentro do ANB</div>
        </div>
        <Link href="/detran/logs" style={{ ...ds.btn, background: 'var(--ink)', color: '#fff' }}>
          Voltar para logs
        </Link>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'grid', gap: 18 }}>
        {error ? <div style={{ ...ds.card, padding: 18, color: 'var(--red)' }}>{error}</div> : null}

        {loading ? (
          <div style={{ ...ds.card, padding: 18, color: 'var(--ink-muted)' }}>Carregando log tecnico...</div>
        ) : item ? (
          <>
            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Cabecalho da execucao</div>
                <div style={ds.sectionSub}>Resumo do runId, fluxo, status e dados principais da POC</div>
              </div>
              <div style={{ padding: 18, display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                  <div style={{ ...ds.mono, fontSize: 12, color: 'var(--blue-500)' }}>{item.runId}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{formatDetranFlow(item.flow)}</div>
                    <span style={{ ...ds.btn, ...statusMeta, padding: '4px 10px', borderRadius: 999, cursor: 'default' }}>{statusMeta.label}</span>
                  </div>
                </div>
                {[
                  ['Veiculo', item.placa || item.renavam || item.chassi || '-'],
                  ['Tipo peca', item.tipoPeca || '-'],
                  ['Criada em', formatDetranDate(item.createdAt)],
                  ['Duracao', formatDetranDuration(item.duracaoMs)],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
                <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Mensagem final</div>
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: 'var(--ink)' }}>{item.resultadoMensagem || item.errorMessage || 'Ainda sem mensagem final registrada.'}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1.1fr) minmax(0, .9fr)', gap: 18 }}>
              <div style={ds.card}>
                <div style={ds.sectionHead}>
                  <div style={ds.sectionTitle}>Linha do tempo das etapas</div>
                  <div style={ds.sectionSub}>Aqui vao entrar os logs que o worker do SISDEV for registrando durante a automacao</div>
                </div>
                <div style={{ padding: 18, display: 'grid', gap: 12 }}>
                  {etapas.map((step: any) => {
                    const stepStatus = getDetranStatusMeta(step.status);
                    return (
                      <div key={step.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>Etapa {step.ordem}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{step.data?.label || step.step}</div>
                          </div>
                          <span style={{ ...ds.btn, ...stepStatus, padding: '4px 10px', borderRadius: 999, cursor: 'default' }}>{stepStatus.label}</span>
                        </div>
                        {step.data?.hint ? <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8, lineHeight: 1.6 }}>{step.data.hint}</div> : null}
                        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Inicio</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>{formatDetranDate(step.startedAt)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Fim</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>{formatDetranDate(step.finishedAt)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Duracao</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>{formatDetranDuration(step.durationMs)}</div>
                          </div>
                        </div>
                        {step.message ? (
                          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: 'var(--ink)' }}>{step.message}</div>
                        ) : null}
                        {(step.url || step.title) ? (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'grid', gap: 6, fontSize: 12, color: 'var(--ink-muted)' }}>
                            <div><strong>URL:</strong> {step.url || '-'}</div>
                            <div><strong>Titulo:</strong> {step.title || '-'}</div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 18 }}>
                <div style={ds.card}>
                  <div style={ds.sectionHead}>
                    <div style={ds.sectionTitle}>Entrada da execucao</div>
                    <div style={ds.sectionSub}>Payload persistido pelo formulario da POC</div>
                  </div>
                  <div style={{ padding: 18 }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, fontFamily: 'Geist Mono, monospace' }}>
                      {prettyJson({
                        placa: item.placa,
                        renavam: item.renavam,
                        chassi: item.chassi,
                        tipoPeca: item.tipoPeca,
                        notaFiscalEntrada: item.notaFiscalEntrada,
                        cartelaNumero: item.cartelaNumero,
                        etiquetaInformada: item.etiquetaInformada,
                        modoEtiqueta: item.modoEtiqueta,
                        observacoes: item.observacoes,
                        payload: item.payload,
                      })}
                    </pre>
                  </div>
                </div>

                <div style={ds.card}>
                  <div style={ds.sectionHead}>
                    <div style={ds.sectionTitle}>Summary e artifacts</div>
                    <div style={ds.sectionSub}>Espaco reservado para screenshots, HTML, HAR e mensagem apos o Proximo</div>
                  </div>
                  <div style={{ padding: 18, display: 'grid', gap: 18 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Summary</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, fontFamily: 'Geist Mono, monospace' }}>
                        {prettyJson(item.summary)}
                      </pre>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Artifacts</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, fontFamily: 'Geist Mono, monospace' }}>
                        {prettyJson(item.artifacts)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
