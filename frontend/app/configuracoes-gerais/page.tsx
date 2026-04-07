'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 },
  input: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  label: { fontSize: 11, fontWeight: 500, color: 'var(--gray-500)', display: 'block', marginBottom: 4 },
};

type ConfiguracaoGeral = {
  emailRemetente: string;
  auditoriaEmailDestinatario: string;
  auditoriaEmailTitulo: string;
  detranEmailDestinatario: string;
  detranEmailTitulo: string;
  despesasEmailAtivo: boolean;
  despesasEmailHorario: string;
  despesasEmailDestinatario: string;
  despesasEmailTitulo: string;
  resendApiKeyConfigured: boolean;
  auditoriaEmailConfigurado: boolean;
  detranEmailConfigurado: boolean;
  despesasEmailConfigurado: boolean;
};

export default function ConfiguracoesGeraisPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfiguracaoGeral | null>(null);
  const [resendApiKey, setResendApiKey] = useState('');
  const [emailRemetente, setEmailRemetente] = useState('alertas@mail.anbparts.com.br');
  const [auditoriaEmailDestinatario, setAuditoriaEmailDestinatario] = useState('');
  const [auditoriaEmailTitulo, setAuditoriaEmailTitulo] = useState('');
  const [detranEmailDestinatario, setDetranEmailDestinatario] = useState('');
  const [detranEmailTitulo, setDetranEmailTitulo] = useState('');
  const [despesasEmailAtivo, setDespesasEmailAtivo] = useState(false);
  const [despesasEmailHorario, setDespesasEmailHorario] = useState('07:00');
  const [despesasEmailDestinatario, setDespesasEmailDestinatario] = useState('');
  const [despesasEmailTitulo, setDespesasEmailTitulo] = useState('');

  async function loadConfig() {
    const data = await api.configuracoesGerais.get();
    setConfig(data);
    setResendApiKey('');
    setEmailRemetente(data.emailRemetente || 'alertas@mail.anbparts.com.br');
    setAuditoriaEmailDestinatario(data.auditoriaEmailDestinatario || '');
    setAuditoriaEmailTitulo(data.auditoriaEmailTitulo || '');
    setDetranEmailDestinatario(data.detranEmailDestinatario || '');
    setDetranEmailTitulo(data.detranEmailTitulo || '');
    setDespesasEmailAtivo(!!data.despesasEmailAtivo);
    setDespesasEmailHorario(data.despesasEmailHorario || '07:00');
    setDespesasEmailDestinatario(data.despesasEmailDestinatario || '');
    setDespesasEmailTitulo(data.despesasEmailTitulo || '');
  }

  useEffect(() => {
    loadConfig()
      .catch((error) => alert(error.message || 'Erro ao carregar configuracoes gerais'))
      .finally(() => setLoading(false));
  }, []);

  async function salvar() {
    setSaving(true);
    try {
      await api.configuracoesGerais.save({
        resendApiKey,
        emailRemetente,
        auditoriaEmailDestinatario,
        auditoriaEmailTitulo,
        detranEmailDestinatario,
        detranEmailTitulo,
        despesasEmailAtivo,
        despesasEmailHorario,
        despesasEmailDestinatario,
        despesasEmailTitulo,
      });
      await loadConfig();
      alert('Configuracoes gerais salvas.');
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar configuracoes gerais');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Configuracoes Gerais</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Configuracoes Gerais</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Centraliza as configuracoes de email reutilizadas pelos processos automaticos do sistema</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuracoes'}</button>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Resend', value: config?.resendApiKeyConfigured ? 'Configurado' : 'Nao configurado', color: config?.resendApiKeyConfigured ? 'var(--green)' : 'var(--amber)' },
            { label: 'Auditoria', value: config?.auditoriaEmailConfigurado ? 'Configurado' : 'Revisar', color: config?.auditoriaEmailConfigurado ? 'var(--green)' : 'var(--amber)' },
            { label: 'Detran', value: config?.detranEmailConfigurado ? 'Configurado' : 'Revisar', color: config?.detranEmailConfigurado ? 'var(--green)' : 'var(--amber)' },
            { label: 'Despesas', value: config?.despesasEmailConfigurado ? 'Configurado' : 'Revisar', color: config?.despesasEmailConfigurado ? 'var(--green)' : 'var(--amber)' },
          ].map((item) => (
            <div key={item.label} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Infra de envio</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Essas configuracoes alimentam os fluxos de email da auditoria automatica, do alerta de baixa de etiqueta DETRAN e das despesas do dia.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={s.label}>API Key do Resend</label>
              <input style={{ ...s.input, width: '100%' }} type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder={config?.resendApiKeyConfigured ? 'Ja configurada. Preencha so para trocar.' : 'Cole aqui a API Key'} />
            </div>
            <div>
              <label style={s.label}>Email remetente</label>
              <input style={{ ...s.input, width: '100%' }} value={emailRemetente} onChange={(e) => setEmailRemetente(e.target.value)} placeholder="alertas@mail.anbparts.com.br" />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 10 }}>Deixe a API Key em branco para manter a atual.</div>
        </div>

        <div style={{ ...s.card, background: '#f8fafc', borderColor: '#dbe3ef' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Processo: Auditoria Automatica</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>Destinatario e titulo abaixo pertencem ao envio de email do processo de auditoria automatica.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <label style={s.label}>Email destinatario da auditoria</label>
              <input style={{ ...s.input, width: '100%' }} value={auditoriaEmailDestinatario} onChange={(e) => setAuditoriaEmailDestinatario(e.target.value)} placeholder="voce@anbparts.com.br" />
            </div>
            <div>
              <label style={s.label}>Titulo do email da auditoria</label>
              <input style={{ ...s.input, width: '100%' }} value={auditoriaEmailTitulo} onChange={(e) => setAuditoriaEmailTitulo(e.target.value)} placeholder="ALERTA ANB Parts - Divergencia de Produtos / Anuncios - Verifique" />
            </div>
          </div>
        </div>

        <div style={{ ...s.card, background: '#fff7ed', borderColor: '#fed7aa' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Processo: Baixa Etiqueta DETRAN</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>Destinatario e titulo abaixo pertencem ao processo de alerta de baixa de etiqueta DETRAN quando uma peca com etiqueta for vendida.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <label style={s.label}>Email destinatario da baixa DETRAN</label>
              <input style={{ ...s.input, width: '100%' }} value={detranEmailDestinatario} onChange={(e) => setDetranEmailDestinatario(e.target.value)} placeholder="voce@anbparts.com.br" />
            </div>
            <div>
              <label style={s.label}>Titulo do email da baixa DETRAN</label>
              <input style={{ ...s.input, width: '100%' }} value={detranEmailTitulo} onChange={(e) => setDetranEmailTitulo(e.target.value)} placeholder="ALERTA ANB Parts - Baixa de Etiqueta DETRAN - Verifique" />
            </div>
          </div>
        </div>

        <div style={{ ...s.card, background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Processo: Despesas do dia</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>Essa rotina envia por email as despesas pendentes que vencem no dia configurado abaixo.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Rotina ativa</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={despesasEmailAtivo ? 'ativa' : 'pausada'} onChange={(e) => setDespesasEmailAtivo(e.target.value === 'ativa')}>
                <option value="pausada">Pausada</option>
                <option value="ativa">Ativa</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Horario da rotina</label>
              <input style={{ ...s.input, width: '100%' }} type="time" value={despesasEmailHorario} onChange={(e) => setDespesasEmailHorario(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Email destinatario das despesas</label>
              <input style={{ ...s.input, width: '100%' }} value={despesasEmailDestinatario} onChange={(e) => setDespesasEmailDestinatario(e.target.value)} placeholder="financeiro@empresa.com.br" />
            </div>
            <div>
              <label style={s.label}>Titulo do email das despesas</label>
              <input style={{ ...s.input, width: '100%' }} value={despesasEmailTitulo} onChange={(e) => setDespesasEmailTitulo(e.target.value)} placeholder="ALERTA ANB Parts - Despesas do Dia - Verifique" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
