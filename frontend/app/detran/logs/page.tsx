'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { detranShell as ds, formatDetranDate, formatDetranDuration, formatDetranFlow, getDetranStatusMeta } from '@/lib/detran-ui';

export default function DetranLogsPage() {
  const [items, setItems] = useState<any[]>([]);
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
      setLoading(true);
      setError('');
      try {
        const response = await api.detran.execucoes({ limit: 50 });
        if (!active) return;
        setItems(response.execucoes || []);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Nao foi possivel carregar os logs do Detran.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div style={{ ...ds.topbar, padding: isPhone ? '0 14px' : ds.topbar.padding }}>
        <div>
          <div style={ds.title}>Logs</div>
          <div style={ds.sub}>Trilha tecnica pronta para receber screenshots, HTML e requests da POC do SISDEV</div>
        </div>
        <Link href="/detran/execucoes" style={{ ...ds.btn, background: 'var(--ink)', color: '#fff' }}>
          Ver execucoes
        </Link>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'grid', gap: 18 }}>
        {error ? <div style={{ ...ds.card, padding: 18, color: 'var(--red)' }}>{error}</div> : null}

        <div style={ds.card}>
          <div style={ds.sectionHead}>
            <div style={ds.sectionTitle}>Logs tecnicos por execucao</div>
            <div style={ds.sectionSub}>{loading ? 'Carregando...' : `${items.length} execucao(oes) com trilha tecnica pronta para detalhamento`}</div>
          </div>
          <div style={{ padding: 18, display: 'grid', gap: 14 }}>
            {items.map((item) => {
              const statusMeta = getDetranStatusMeta(item.status);
              const etapas = Array.isArray(item.etapas) ? item.etapas : [];
              const completedSteps = etapas.filter((step: any) => ['success', 'error', 'skipped'].includes(String(step.status || '').toLowerCase())).length;
              const currentStep = etapas.find((step: any) => String(step.status || '').toLowerCase() === 'running') || null;
              return (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isPhone ? 14 : 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ ...ds.mono, fontSize: 12, color: 'var(--blue-500)' }}>{item.runId}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>{formatDetranFlow(item.flow)}</div>
                    </div>
                    <span style={{ ...ds.btn, ...statusMeta, padding: '4px 10px', borderRadius: 999, cursor: 'default' }}>{statusMeta.label}</span>
                  </div>

                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Veiculo</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{item.placa || item.renavam || item.chassi || '-'}</div>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Etapas concluidas</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{completedSteps}/{etapas.length || 0}</div>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Duracao</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{formatDetranDuration(item.duracaoMs)}</div>
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Criada em</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{formatDetranDate(item.createdAt)}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-muted)' }}>
                    Etapa atual: <strong style={{ color: 'var(--ink)' }}>{currentStep?.data?.label || currentStep?.step || item.resultadoMensagem || 'Aguardando worker do SISDEV'}</strong>
                  </div>

                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/detran/logs/${item.id}`} style={{ ...ds.btn, background: 'var(--ink)', color: '#fff' }}>
                      Abrir detalhe tecnico
                    </Link>
                    <Link href="/detran/peca-avulsa" style={{ ...ds.btn, background: 'var(--gray-50)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                      Nova POC
                    </Link>
                  </div>
                </div>
              );
            })}

            {!loading && !items.length ? (
              <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Nenhum log tecnico disponivel ainda.</div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
