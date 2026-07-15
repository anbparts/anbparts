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
  detranBaixaAtivo: boolean;
  detranBaixaIntervaloMin: number;
  nfeTextoEmailDestinatario: string;
  nfeTextoEmailTitulo: string;
  despesasEmailAtivo: boolean;
  despesasEmailHorario: string;
  despesasEmailDestinatario: string;
  despesasEmailTitulo: string;
  mercadoLivrePerguntasAtivo: boolean;
  mercadoLivrePerguntasIntervaloMin: number;
  mercadoLivrePerguntasEmailDestinatario: string;
  mercadoLivrePerguntasEmailTitulo: string;
  fotosDrivePendentesAtivo: boolean;
  fotosDrivePendentesIntervaloMin: number;
  fotosDrivePendentesEmailDestinatario: string;
  fotosDrivePendentesEmailTitulo: string;
  fotosDrivePendentesEmailConfigurado: boolean;
  resendApiKeyConfigured: boolean;
  auditoriaEmailConfigurado: boolean;
  detranEmailConfigurado: boolean;
  despesasEmailConfigurado: boolean;
  mercadoLivrePerguntasEmailConfigurado: boolean;
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
  const [detranBaixaAtivo, setDetranBaixaAtivo] = useState(false);
  const [detranBaixaIntervaloMin, setDetranBaixaIntervaloMin] = useState('20');
  const [nfeTextoEmailDestinatario, setNfeTextoEmailDestinatario] = useState('');
  const [nfeTextoEmailTitulo, setNfeTextoEmailTitulo] = useState('');
  const [despesasEmailAtivo, setDespesasEmailAtivo] = useState(false);
  const [despesasEmailHorario, setDespesasEmailHorario] = useState('07:00');
  const [despesasEmailDestinatario, setDespesasEmailDestinatario] = useState('');
  const [despesasEmailTitulo, setDespesasEmailTitulo] = useState('');
  const [mercadoLivrePerguntasAtivo, setMercadoLivrePerguntasAtivo] = useState(false);
  const [mercadoLivrePerguntasIntervaloMin, setMercadoLivrePerguntasIntervaloMin] = useState('5');
  const [mercadoLivrePerguntasEmailDestinatario, setMercadoLivrePerguntasEmailDestinatario] = useState('');
  const [mercadoLivrePerguntasEmailTitulo, setMercadoLivrePerguntasEmailTitulo] = useState('');
  const [fotosDrivePendentesAtivo, setFotosDrivePendentesAtivo] = useState(false);
  const [fotosDrivePendentesIntervaloMin, setFotosDrivePendentesIntervaloMin] = useState('20');
  const [fotosDrivePendentesEmailDestinatario, setFotosDrivePendentesEmailDestinatario] = useState('');
  const [fotosDrivePendentesEmailTitulo, setFotosDrivePendentesEmailTitulo] = useState('');

  async function loadConfig() {
    const data = await api.configuracoesGerais.get();
    setConfig(data);
    setResendApiKey('');
    setEmailRemetente(data.emailRemetente || 'alertas@mail.anbparts.com.br');
    setAuditoriaEmailDestinatario(data.auditoriaEmailDestinatario || '');
    setAuditoriaEmailTitulo(data.auditoriaEmailTitulo || '');
    setDetranEmailDestinatario(data.detranEmailDestinatario || '');
    setDetranEmailTitulo(data.detranEmailTitulo || '');
    setDetranBaixaAtivo(!!data.detranBaixaAtivo);
    setDetranBaixaIntervaloMin(String(data.detranBaixaIntervaloMin || 20));
    setNfeTextoEmailDestinatario(data.nfeTextoEmailDestinatario || '');
    setNfeTextoEmailTitulo(data.nfeTextoEmailTitulo || '');
    setDespesasEmailAtivo(!!data.despesasEmailAtivo);
    setDespesasEmailHorario(data.despesasEmailHorario || '07:00');
    setDespesasEmailDestinatario(data.despesasEmailDestinatario || '');
    setDespesasEmailTitulo(data.despesasEmailTitulo || '');
    setMercadoLivrePerguntasAtivo(!!data.mercadoLivrePerguntasAtivo);
    setMercadoLivrePerguntasIntervaloMin(String(data.mercadoLivrePerguntasIntervaloMin || 5));
    setMercadoLivrePerguntasEmailDestinatario(data.mercadoLivrePerguntasEmailDestinatario || '');
    setMercadoLivrePerguntasEmailTitulo(data.mercadoLivrePerguntasEmailTitulo || '');
    setFotosDrivePendentesAtivo(!!data.fotosDrivePendentesAtivo);
    setFotosDrivePendentesIntervaloMin(String(data.fotosDrivePendentesIntervaloMin || 20));
    setFotosDrivePendentesEmailDestinatario(data.fotosDrivePendentesEmailDestinatario || '');
    setFotosDrivePendentesEmailTitulo(data.fotosDrivePendentesEmailTitulo || '');
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
        detranBaixaAtivo,
        detranBaixaIntervaloMin: Number(detranBaixaIntervaloMin) || 20,
        nfeTextoEmailDestinatario,
        nfeTextoEmailTitulo,
        despesasEmailAtivo,
        despesasEmailHorario,
        despesasEmailDestinatario,
        despesasEmailTitulo,
        mercadoLivrePerguntasAtivo,
        mercadoLivrePerguntasIntervaloMin: Number(mercadoLivrePerguntasIntervaloMin) || 5,
        mercadoLivrePerguntasEmailDestinatario,
        mercadoLivrePerguntasEmailTitulo,
        fotosDrivePendentesAtivo,
        fotosDrivePendentesIntervaloMin: Number(fotosDrivePendentesIntervaloMin) || 20,
        fotosDrivePendentesEmailDestinatario,
        fotosDrivePendentesEmailTitulo,
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
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. E-mails</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. E-mails</div>
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
            { label: 'Perguntas ML', value: config?.mercadoLivrePerguntasEmailConfigurado ? 'Configurado' : 'Revisar', color: config?.mercadoLivrePerguntasEmailConfigurado ? 'var(--green)' : 'var(--amber)' },
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
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>Quando ativo, a rotina roda no intervalo abaixo, junta TODAS as pecas vendidas com etiqueta ainda pendente de baixa num UNICO e-mail e avisa so 1x por etiqueta (nao repete). Se a etiqueta for baixada e a peca voltar a ficar pendente no futuro, avisa de novo.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={s.label}>Verificacao e email ativos</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={detranBaixaAtivo ? 'ativa' : 'pausada'} onChange={(e) => setDetranBaixaAtivo(e.target.value === 'ativa')}>
                <option value="pausada">Pausada</option>
                <option value="ativa">Ativa</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Tempo de processamento (min)</label>
              <input style={{ ...s.input, width: '100%' }} type="number" min="1" step="1" value={detranBaixaIntervaloMin} onChange={(e) => setDetranBaixaIntervaloMin(e.target.value)} />
            </div>
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

        <div style={{ ...s.card, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Processo: Texto da NF-e</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>Quando uma peça vendida tiver texto configurado para o seu tipo (em Motos → Conf. Texto), este e-mail avisa que é preciso incluir o texto na NF-e. Dispara junto com a venda da etiqueta.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <label style={s.label}>Email destinatario do texto NF-e</label>
              <input style={{ ...s.input, width: '100%' }} value={nfeTextoEmailDestinatario} onChange={(e) => setNfeTextoEmailDestinatario(e.target.value)} placeholder="voce@anbparts.com.br" />
            </div>
            <div>
              <label style={s.label}>Titulo do email do texto NF-e</label>
              <input style={{ ...s.input, width: '100%' }} value={nfeTextoEmailTitulo} onChange={(e) => setNfeTextoEmailTitulo(e.target.value)} placeholder="ANB Parts - Texto da NF-e necessario - Verifique" />
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

        <div style={{ ...s.card, background: '#f5f3ff', borderColor: '#ddd6fe' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 6 }}>Processo: Perguntas Mercado Livre</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>
            Quando ativo, o sistema passa a ler novas perguntas do Mercado Livre no intervalo configurado abaixo e envia o e-mail com a mensagem completa sempre que houver pergunta nova.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Leitura e email ativos</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={mercadoLivrePerguntasAtivo ? 'ativa' : 'pausada'} onChange={(e) => setMercadoLivrePerguntasAtivo(e.target.value === 'ativa')}>
                <option value="pausada">Pausada</option>
                <option value="ativa">Ativa</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Tempo de processamento (min)</label>
              <input style={{ ...s.input, width: '100%' }} type="number" min="1" step="1" value={mercadoLivrePerguntasIntervaloMin} onChange={(e) => setMercadoLivrePerguntasIntervaloMin(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Email destinatario das perguntas</label>
              <input style={{ ...s.input, width: '100%' }} value={mercadoLivrePerguntasEmailDestinatario} onChange={(e) => setMercadoLivrePerguntasEmailDestinatario(e.target.value)} placeholder="vendas@empresa.com.br" />
            </div>
            <div>
              <label style={s.label}>Titulo do email das perguntas</label>
              <input style={{ ...s.input, width: '100%' }} value={mercadoLivrePerguntasEmailTitulo} onChange={(e) => setMercadoLivrePerguntasEmailTitulo(e.target.value)} placeholder="ALERTA ANB Parts - Perguntas Mercado Livre - Verifique" />
            </div>
          </div>
        </div>

        <div style={{ ...s.card, background: '#f5f3ff', borderColor: '#ddd6fe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>Processo: Fotos prontas no Drive</div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: config?.fotosDrivePendentesEmailConfigurado ? '#ecfdf3' : '#fff7ed', color: config?.fotosDrivePendentesEmailConfigurado ? '#047857' : '#c2410c' }}>
              {config?.fotosDrivePendentesEmailConfigurado ? 'Configurado' : 'Incompleto'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>
            Quando ativo, o sistema faz a mesma verificacao do botao "Escanear pastas" (Cadastro &rarr; Fotos Drive) no intervalo abaixo e, ao encontrar SKUs com o zip pronto, envia 1 e-mail agrupando os novos. Avisa so 1x por SKU; se a pasta for processada e o SKU reaparecer depois com fotos novas, avisa de novo.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={s.label}>Verificacao e email ativos</label>
              <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={fotosDrivePendentesAtivo ? 'ativa' : 'pausada'} onChange={(e) => setFotosDrivePendentesAtivo(e.target.value === 'ativa')}>
                <option value="pausada">Pausada</option>
                <option value="ativa">Ativa</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Tempo de processamento (min)</label>
              <input style={{ ...s.input, width: '100%' }} type="number" min="1" step="1" value={fotosDrivePendentesIntervaloMin} onChange={(e) => setFotosDrivePendentesIntervaloMin(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Email destinatario do aviso</label>
              <input style={{ ...s.input, width: '100%' }} value={fotosDrivePendentesEmailDestinatario} onChange={(e) => setFotosDrivePendentesEmailDestinatario(e.target.value)} placeholder="fotos@empresa.com.br" />
            </div>
            <div>
              <label style={s.label}>Titulo do email do aviso</label>
              <input style={{ ...s.input, width: '100%' }} value={fotosDrivePendentesEmailTitulo} onChange={(e) => setFotosDrivePendentesEmailTitulo(e.target.value)} placeholder="ANB Parts - Fotos prontas no Drive - Processar" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
