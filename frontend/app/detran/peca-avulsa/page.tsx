'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { detranShell as ds } from '@/lib/detran-ui';

const EMPTY_FORM = {
  placa: '',
  renavam: '',
  chassi: '',
  tipoPeca: '',
  notaFiscalEntrada: '',
  modoEtiqueta: 'direta',
  etiquetaInformada: '',
  cartelaNumero: '',
  observacoes: '',
};

export default function DetranPecaAvulsaPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
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

  function setField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setFeedback('');
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response = await api.detran.createExecucao({
        flow: 'peca_avulsa_poc',
        placa: form.placa,
        renavam: form.renavam,
        chassi: form.chassi,
        tipoPeca: form.tipoPeca,
        notaFiscalEntrada: form.notaFiscalEntrada,
        modoEtiqueta: form.modoEtiqueta,
        etiquetaInformada: form.modoEtiqueta === 'direta' ? form.etiquetaInformada : null,
        cartelaNumero: form.modoEtiqueta === 'lista' ? form.cartelaNumero : null,
        observacoes: form.observacoes,
        metadata: {
          source: 'frontend-form',
          plannedCapture: ['screenshots', 'htmlAfterProximo', 'networkTrace', 'successMessage'],
        },
      });

      const execucaoId = response?.execucao?.id;
      setFeedback('Execucao POC criada com sucesso. Abrindo o log tecnico...');
      if (execucaoId) {
        router.push(`/detran/logs/${execucaoId}`);
      }
    } catch (err: any) {
      setError(err.message || 'Nao foi possivel criar a execucao da POC.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ ...ds.topbar, padding: isPhone ? '0 14px' : ds.topbar.padding }}>
        <div>
          <div style={ds.title}>Peca Avulsa (POC)</div>
          <div style={ds.sub}>Primeiro fluxo real do modulo Detran: autenticacao + entrada de peca avulsa</div>
        </div>
        <button onClick={handleSubmit} disabled={saving} style={{ ...ds.btn, background: 'var(--blue-500)', color: '#fff', opacity: saving ? 0.75 : 1 }}>
          {saving ? 'Criando...' : 'Criar execucao POC'}
        </button>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'grid', gap: 18, maxWidth: 980 }}>
        {error ? <div style={{ ...ds.card, padding: 18, color: 'var(--red)' }}>{error}</div> : null}
        {feedback ? <div style={{ ...ds.card, padding: 18, color: 'var(--green)' }}>{feedback}</div> : null}

        <div style={ds.card}>
          <div style={ds.sectionHead}>
            <div style={ds.sectionTitle}>Dados da execucao</div>
            <div style={ds.sectionSub}>Esses campos formam a primeira execucao persistida da POC e vao alimentar o log tecnico do fluxo.</div>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <div>
                <label style={ds.label}>Placa</label>
                <input style={ds.input} value={form.placa} onChange={(e) => setField('placa', e.target.value.toUpperCase())} placeholder="FIF1F35" />
              </div>
              <div>
                <label style={ds.label}>Renavam</label>
                <input style={ds.input} value={form.renavam} onChange={(e) => setField('renavam', e.target.value)} placeholder="000586622632" />
              </div>
              <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                <label style={ds.label}>Chassi (opcional, mas recomendado)</label>
                <input style={ds.input} value={form.chassi} onChange={(e) => setField('chassi', e.target.value.toUpperCase())} placeholder="9321CT3J7DD444387" />
              </div>
              <div>
                <label style={ds.label}>Tipo de peca</label>
                <input style={ds.input} value={form.tipoPeca} onChange={(e) => setField('tipoPeca', e.target.value)} placeholder="Banco, Balanca, Farol..." />
              </div>
              <div>
                <label style={ds.label}>Numero da nota fiscal de entrada</label>
                <input style={ds.input} value={form.notaFiscalEntrada} onChange={(e) => setField('notaFiscalEntrada', e.target.value)} placeholder="12345" />
              </div>
              <div>
                <label style={ds.label}>Modo da etiqueta</label>
                <select style={ds.input} value={form.modoEtiqueta} onChange={(e) => setField('modoEtiqueta', e.target.value)}>
                  <option value="direta">Informar etiqueta direto</option>
                  <option value="lista">Selecionar cartela/lista valida</option>
                </select>
              </div>
              <div>
                <label style={ds.label}>{form.modoEtiqueta === 'direta' ? 'Etiqueta informada' : 'Numero da cartela'}</label>
                <input
                  style={ds.input}
                  value={form.modoEtiqueta === 'direta' ? form.etiquetaInformada : form.cartelaNumero}
                  onChange={(e) => setField(form.modoEtiqueta === 'direta' ? 'etiquetaInformada' : 'cartelaNumero', e.target.value.toUpperCase())}
                  placeholder={form.modoEtiqueta === 'direta' ? 'SP5230...' : 'SP52302000265011'}
                />
              </div>
              <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                <label style={ds.label}>Observacoes da rodada</label>
                <textarea
                  style={ds.textarea}
                  value={form.observacoes}
                  onChange={(e) => setField('observacoes', e.target.value)}
                  placeholder="Ex: consultar pela placa primeiro, abrir a lupa do tipo de peca e registrar tudo o que acontecer apos o Proximo."
                />
              </div>
            </div>
          </div>
        </div>

        <div style={ds.card}>
          <div style={ds.sectionHead}>
            <div style={ds.sectionTitle}>O que esta primeira execucao vai deixar pronto</div>
            <div style={ds.sectionSub}>Mesmo antes da automacao final, essa base ja cria o runId, as etapas e o trilho de log para o worker do SISDEV.</div>
          </div>
          <div style={{ padding: 18, display: 'grid', gap: 10 }}>
            {[
              'Cria um runId unico para a rodada do SISDEV.',
              'Registra o fluxo planejado completo de autenticacao + OTP + consulta + tipo + etiqueta + Proximo.',
              'Abre uma pagina de log tecnico pronta para receber screenshots, HTML e requests apos o Proximo.',
              'Deixa a execucao rastreavel no historico do modulo Detran do ANB.',
            ].map((item) => (
              <div key={item} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--ink)' }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
