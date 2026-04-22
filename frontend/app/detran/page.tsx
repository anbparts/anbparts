'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { detranShell as ds, formatDetranDate, formatDetranDuration, formatDetranFlow, getDetranStatusMeta } from '@/lib/detran-ui';

export default function DetranDashboardPage() {
  const [data, setData] = useState<any>(null);
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
        const response = await api.detran.dashboard();
        if (!active) return;
        setData(response);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Nao foi possivel carregar o painel do Detran.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const readiness = data?.config?.readiness || {};
  const latest = data?.latestExecucao || null;
  const latestStatus = getDetranStatusMeta(latest?.status);

  return (
    <>
      <div style={{ ...ds.topbar, padding: isPhone ? '0 14px' : ds.topbar.padding }}>
        <div>
          <div style={ds.title}>Painel Detran</div>
          <div style={ds.sub}>Modulo inicial da integracao SISDEV restrito ao usuario Bruno</div>
        </div>
        <Link
          href="/detran/peca-avulsa"
          style={{ ...ds.btn, background: 'var(--blue-500)', color: '#fff', padding: isPhone ? '8px 12px' : ds.btn.padding }}
        >
          Nova POC
        </Link>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'grid', gap: 18 }}>
        {error ? (
          <div style={{ ...ds.card, padding: 18, color: 'var(--red)' }}>{error}</div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
          {[
            { label: 'Execucoes', value: data?.totals?.execucoes ?? '-', tone: '#0f172a', bg: '#fff' },
            { label: 'Pendentes', value: data?.totals?.pendentes ?? '-', tone: 'var(--blue-500)', bg: '#eff6ff' },
            { label: 'Sucesso', value: data?.totals?.sucesso ?? '-', tone: 'var(--green)', bg: 'var(--green-light)' },
            { label: 'Erros', value: data?.totals?.erro ?? '-', tone: 'var(--red)', bg: 'var(--red-light)' },
          ].map((card) => (
            <div key={card.label} style={{ ...ds.card, padding: 18, background: card.bg }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace' }}>
                {card.label}
              </div>
              <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 700, color: card.tone, marginTop: 10 }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1.2fr) minmax(0, .8fr)', gap: 18 }}>
          <div style={ds.card}>
            <div style={ds.sectionHead}>
              <div style={ds.sectionTitle}>Prontidao da POC</div>
              <div style={ds.sectionSub}>Checklist da configuracao minima para rodar autenticacao + peca avulsa</div>
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 12 }}>
              {[
                { label: 'Login SISDEV', ok: readiness.hasSisdevLogin, hint: 'CPF e senha do auth MAS gravados no ANB.' },
                { label: 'Empresa de desmonte', ok: readiness.hasEmpresa, hint: 'CNPJ, codigo interno e nome para selecao no portal.' },
                { label: 'Gmail OAuth base', ok: readiness.hasGmailBase, hint: 'Email e Client ID configurados.' },
                { label: 'Gmail OAuth completo', ok: readiness.hasGmailFull, hint: 'Client Secret e Refresh Token salvos.' },
                { label: 'Regras do OTP', ok: readiness.hasOtpRules, hint: 'Remetente, assunto e regex do codigo configurados.' },
                { label: 'Pronto para rodar', ok: readiness.readyForPoc, hint: 'Todos os blocos acima + modulo habilitado.' },
              ].map((item) => (
                <div key={item.label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: item.ok ? 'var(--green-light)' : 'var(--gray-50)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{item.label}</div>
                    <span
                      style={{
                        ...ds.btn,
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: item.ok ? '#dcfce7' : '#f8fafc',
                        border: item.ok ? '1px solid #86efac' : '1px solid var(--border)',
                        color: item.ok ? 'var(--green)' : 'var(--ink-muted)',
                        cursor: 'default',
                      }}
                    >
                      {item.ok ? 'OK' : 'Pendente'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6, lineHeight: 1.6 }}>{item.hint}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Ultima execucao</div>
                <div style={ds.sectionSub}>Resumo da execucao mais recente registrada no modulo</div>
              </div>
              <div style={{ padding: 18 }}>
                {!latest ? (
                  <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Nenhuma execucao registrada ainda.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>{latest.runId}</div>
                      <span style={{ ...ds.btn, ...latestStatus, padding: '4px 10px', borderRadius: 999, cursor: 'default' }}>{latestStatus.label}</span>
                    </div>
                    <div style={{ marginTop: 14, display: 'grid', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
                      <div>Fluxo: <strong>{formatDetranFlow(latest.flow)}</strong></div>
                      <div>Veiculo: <strong>{latest.placa || latest.renavam || latest.chassi || '-'}</strong></div>
                      <div>Tipo peca: <strong>{latest.tipoPeca || '-'}</strong></div>
                      <div>Criada em: <strong>{formatDetranDate(latest.createdAt)}</strong></div>
                      <div>Duracao: <strong>{formatDetranDuration(latest.duracaoMs)}</strong></div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <Link href={`/detran/logs/${latest.id}`} style={{ ...ds.btn, background: 'var(--ink)', color: '#fff' }}>
                        Abrir log tecnico
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Atalhos</div>
                <div style={ds.sectionSub}>Rotas principais do modulo Detran dentro do ANB</div>
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 10 }}>
                {[
                  { href: '/detran/peca-avulsa', label: 'Abrir formulario da POC de peca avulsa' },
                  { href: '/detran/execucoes', label: 'Consultar historico de execucoes' },
                  { href: '/detran/logs', label: 'Ver logs tecnicos e evidencias' },
                  { href: '/detran/configuracoes', label: 'Salvar credenciais, Gmail e comportamento do robo' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={{ ...ds.btn, justifyContent: 'flex-start', background: 'var(--gray-50)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
