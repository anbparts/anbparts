'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { detranShell as ds } from '@/lib/detran-ui';

const EMPTY_FORM = {
  enabled: false,
  sisdevCpf: '',
  sisdevPassword: '',
  empresaCnpj: '',
  empresaCodigo: '',
  empresaNome: '',
  gmailEmail: '',
  gmailClientId: '',
  gmailClientSecret: '',
  gmailRefreshToken: '',
  otpRemetente: 'detran.sisdev@sp.gov.br',
  otpAssunto: '[DETRAN-SISDEV] Codigo de Verificacao',
  otpRegex: '([A-Z0-9]{4,10})\\s+e seu codigo de verificacao',
  reuseSession: true,
  runHeadless: true,
  timeoutMs: 120000,
  screenshotEachStep: true,
  htmlAfterProximo: true,
  captureNetworkTrace: true,
  notes: '',
};

export default function DetranConfiguracoesPage() {
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
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
        const response = await api.detran.getConfig();
        if (!active) return;
        const config = response.config || {};
        setForm({
          enabled: Boolean(config.enabled),
          sisdevCpf: config.sisdevCpf || '',
          sisdevPassword: '',
          empresaCnpj: config.empresaCnpj || '',
          empresaCodigo: config.empresaCodigo || '',
          empresaNome: config.empresaNome || '',
          gmailEmail: config.gmailEmail || '',
          gmailClientId: config.gmailClientId || '',
          gmailClientSecret: '',
          gmailRefreshToken: '',
          otpRemetente: config.otpRemetente || EMPTY_FORM.otpRemetente,
          otpAssunto: config.otpAssunto || EMPTY_FORM.otpAssunto,
          otpRegex: config.otpRegex || EMPTY_FORM.otpRegex,
          reuseSession: Boolean(config.reuseSession),
          runHeadless: Boolean(config.runHeadless),
          timeoutMs: Number(config.timeoutMs || EMPTY_FORM.timeoutMs),
          screenshotEachStep: Boolean(config.screenshotEachStep),
          htmlAfterProximo: Boolean(config.htmlAfterProximo),
          captureNetworkTrace: Boolean(config.captureNetworkTrace),
          notes: config.notes || '',
        });
        setMeta(config);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Nao foi possivel carregar as configuracoes do Detran.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const readiness = meta?.readiness || {};
  const maskedInfo = useMemo(() => ([
    { label: 'Senha SISDEV', ok: meta?.hasSisdevPassword },
    { label: 'Gmail Client Secret', ok: meta?.hasGmailClientSecret },
    { label: 'Gmail Refresh Token', ok: meta?.hasGmailRefreshToken },
  ]), [meta]);

  function setField<K extends string>(field: K, value: any) {
    setForm((current: any) => ({ ...current, [field]: value }));
    setFeedback('');
  }

  async function handleSave() {
    setSaving(true);
    setFeedback('');
    setError('');
    try {
      const response = await api.detran.saveConfig({
        ...form,
        timeoutMs: Number(form.timeoutMs) || EMPTY_FORM.timeoutMs,
      });
      setMeta(response.config);
      setForm((current: any) => ({
        ...current,
        sisdevPassword: '',
        gmailClientSecret: '',
        gmailRefreshToken: '',
      }));
      setFeedback('Configuracoes do Detran salvas com sucesso.');
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configuracoes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ ...ds.topbar, padding: isPhone ? '0 14px' : ds.topbar.padding }}>
        <div>
          <div style={ds.title}>Config. Detran</div>
          <div style={ds.sub}>Credenciais, Gmail, OTP e comportamento da POC do SISDEV</div>
        </div>
        <button onClick={handleSave} disabled={loading || saving} style={{ ...ds.btn, background: 'var(--ink)', color: '#fff', opacity: loading || saving ? 0.7 : 1 }}>
          {saving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'grid', gap: 18 }}>
        {error ? <div style={{ ...ds.card, padding: 18, color: 'var(--red)' }}>{error}</div> : null}
        {feedback ? <div style={{ ...ds.card, padding: 18, color: 'var(--green)' }}>{feedback}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1fr) 320px', gap: 18 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Acesso SISDEV</div>
                <div style={ds.sectionSub}>Dados do login no auth MAS e identificacao da empresa de desmonte</div>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                    <label style={ds.label}>
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(e) => setField('enabled', e.target.checked)}
                        style={{ marginRight: 8 }}
                      />
                      Habilitar modulo Detran para execucao
                    </label>
                  </div>
                  <div>
                    <label style={ds.label}>CPF do acesso</label>
                    <input style={ds.input} value={form.sisdevCpf} onChange={(e) => setField('sisdevCpf', e.target.value)} placeholder="Somente numeros ou formato livre" />
                  </div>
                  <div>
                    <label style={ds.label}>Senha do acesso</label>
                    <input style={ds.input} type="password" value={form.sisdevPassword} onChange={(e) => setField('sisdevPassword', e.target.value)} placeholder={meta?.hasSisdevPassword ? 'Ja configurada. Preencha so para trocar.' : 'Digite a senha atual'} />
                  </div>
                  <div>
                    <label style={ds.label}>CNPJ da empresa</label>
                    <input style={ds.input} value={form.empresaCnpj} onChange={(e) => setField('empresaCnpj', e.target.value)} placeholder="60.100.111/0001-00" />
                  </div>
                  <div>
                    <label style={ds.label}>Codigo/empresa no SISDEV</label>
                    <input style={ds.input} value={form.empresaCodigo} onChange={(e) => setField('empresaCodigo', e.target.value)} placeholder="60100111000100 ou outro codigo interno" />
                  </div>
                  <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                    <label style={ds.label}>Nome exibido da empresa</label>
                    <input style={ds.input} value={form.empresaNome} onChange={(e) => setField('empresaNome', e.target.value)} placeholder="ANB PARTS LTDA" />
                  </div>
                </div>
              </div>
            </div>

            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Gmail e leitura do OTP</div>
                <div style={ds.sectionSub}>Base do OAuth para ler o codigo do e-mail do SISDEV e regras de captura do OTP</div>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <div>
                    <label style={ds.label}>Email monitorado</label>
                    <input style={ds.input} value={form.gmailEmail} onChange={(e) => setField('gmailEmail', e.target.value)} placeholder="bruno.rigolo@gmail.com" />
                  </div>
                  <div>
                    <label style={ds.label}>Gmail Client ID</label>
                    <input style={ds.input} value={form.gmailClientId} onChange={(e) => setField('gmailClientId', e.target.value)} placeholder="OAuth Client ID do projeto Google" />
                  </div>
                  <div>
                    <label style={ds.label}>Gmail Client Secret</label>
                    <input style={ds.input} type="password" value={form.gmailClientSecret} onChange={(e) => setField('gmailClientSecret', e.target.value)} placeholder={meta?.hasGmailClientSecret ? 'Ja configurado. Preencha so para trocar.' : 'Client Secret do OAuth'} />
                  </div>
                  <div>
                    <label style={ds.label}>Gmail Refresh Token</label>
                    <input style={ds.input} type="password" value={form.gmailRefreshToken} onChange={(e) => setField('gmailRefreshToken', e.target.value)} placeholder={meta?.hasGmailRefreshToken ? 'Ja configurado. Preencha so para trocar.' : 'Refresh Token do Gmail OAuth'} />
                  </div>
                  <div>
                    <label style={ds.label}>Remetente esperado</label>
                    <input style={ds.input} value={form.otpRemetente} onChange={(e) => setField('otpRemetente', e.target.value)} placeholder="detran.sisdev@sp.gov.br" />
                  </div>
                  <div>
                    <label style={ds.label}>Assunto esperado</label>
                    <input style={ds.input} value={form.otpAssunto} onChange={(e) => setField('otpAssunto', e.target.value)} placeholder="[DETRAN-SISDEV] Codigo de Verificacao" />
                  </div>
                  <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                    <label style={ds.label}>Regex do codigo OTP</label>
                    <input style={ds.input} value={form.otpRegex} onChange={(e) => setField('otpRegex', e.target.value)} placeholder="([A-Z0-9]{4,10})\\s+e seu codigo de verificacao" />
                  </div>
                </div>
              </div>
            </div>

            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Comportamento da execucao e logs</div>
                <div style={ds.sectionSub}>Definicoes do robo e do pacote tecnico de evidencias da POC</div>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                  <div>
                    <label style={ds.label}>Timeout por execucao (ms)</label>
                    <input style={ds.input} type="number" value={form.timeoutMs} onChange={(e) => setField('timeoutMs', e.target.value)} min={10000} step={1000} />
                  </div>
                  <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                    {[
                      ['reuseSession', 'Reaproveitar sessao do portal quando existir'],
                      ['runHeadless', 'Executar navegador em modo headless por padrao'],
                      ['screenshotEachStep', 'Capturar screenshot em cada etapa'],
                      ['htmlAfterProximo', 'Salvar HTML logo apos o Proximo'],
                      ['captureNetworkTrace', 'Guardar trace/requisicoes de rede'],
                    ].map(([field, label]) => (
                      <label key={field} style={{ fontSize: 13, color: 'var(--ink)' }}>
                        <input type="checkbox" checked={Boolean(form[field])} onChange={(e) => setField(field, e.target.checked)} style={{ marginRight: 8 }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                    <label style={ds.label}>Observacoes internas do modulo</label>
                    <textarea style={ds.textarea} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Anote detalhes do ambiente, alertas, links uteis ou combinados da POC." />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Estado atual</div>
                <div style={ds.sectionSub}>Indicadores de segredo salvo e prontidao do modulo</div>
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 10 }}>
                {maskedInfo.map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                    <span>{item.label}</span>
                    <strong style={{ color: item.ok ? 'var(--green)' : 'var(--ink-muted)' }}>{item.ok ? 'Configurado' : 'Pendente'}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div style={ds.card}>
              <div style={ds.sectionHead}>
                <div style={ds.sectionTitle}>Checklist</div>
                <div style={ds.sectionSub}>Sinal rapido para saber o que ainda falta para a POC</div>
              </div>
              <div style={{ padding: 18, display: 'grid', gap: 10 }}>
                {[
                  ['Login SISDEV', readiness.hasSisdevLogin],
                  ['Empresa selecionavel', readiness.hasEmpresa],
                  ['Gmail basico', readiness.hasGmailBase],
                  ['Gmail completo', readiness.hasGmailFull],
                  ['Regras OTP', readiness.hasOtpRules],
                  ['POC pronta para rodar', readiness.readyForPoc],
                ].map(([label, ok]) => (
                  <div key={String(label)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: ok ? 'var(--green-light)' : 'var(--gray-50)', fontSize: 13 }}>
                    <strong style={{ color: ok ? 'var(--green)' : 'var(--ink)' }}>{label}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
