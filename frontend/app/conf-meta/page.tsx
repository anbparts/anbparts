'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isBruno } from '@/lib/permissions';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', display: 'block', marginBottom: 5 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--gray-800)', outline: 'none', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

type TemplateInfo = { name: string; language: string; status: string; category: string; bodyText: string; varCount: number };

export default function ConfMetaPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [token, setToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [templateNome, setTemplateNome] = useState('');
  const [ativo, setAtivo] = useState(false);

  // Rotina de fotos pendentes
  const [fotosAtivo, setFotosAtivo] = useState(false);
  const [fotosIntervalo, setFotosIntervalo] = useState('1');
  const [fotosUltimaEm, setFotosUltimaEm] = useState<string | null>(null);

  // Bloco de teste
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [to, setTo] = useState('');
  const [variaveis, setVariaveis] = useState<string[]>([]);
  const [testando, setTestando] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const selectedTemplate = templates.find((t) => t.name === selectedTemplateName) || null;

  async function load() {
    const data = await api.confMeta.get();
    setTokenConfigured(!!data.whatsappTokenConfigured);
    setToken('');
    setPhoneNumberId(data.whatsappPhoneNumberId || '');
    setWabaId(data.whatsappWabaId || '');
    setTemplateNome(data.whatsappTemplateNome || '');
    setAtivo(!!data.whatsappAtivo);
    setFotosAtivo(!!data.whatsappFotosPendentesAtivo);
    setFotosIntervalo(String(data.whatsappFotosPendentesIntervaloHoras || 1));
    setFotosUltimaEm(data.whatsappFotosPendentesUltimaExecucaoEm || null);
  }

  useEffect(() => {
    if (!isBruno(user)) return;
    load()
      .catch((e) => alert(e.message || 'Erro ao carregar configuracoes da Meta'))
      .finally(() => setLoading(false));
  }, [user]);

  async function salvar() {
    setSaving(true);
    try {
      await api.confMeta.save({
        whatsappToken: token, // so grava se preenchido
        whatsappPhoneNumberId: phoneNumberId,
        whatsappWabaId: wabaId,
        whatsappTemplateNome: templateNome,
        whatsappAtivo: ativo,
        whatsappFotosPendentesAtivo: fotosAtivo,
        whatsappFotosPendentesIntervaloHoras: Number(fotosIntervalo) || 1,
      });
      await load();
      alert('Configuracoes da Meta salvas.');
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar configuracoes da Meta');
    } finally {
      setSaving(false);
    }
  }

  async function carregarTemplates() {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const data = await api.confMeta.templates();
      setTemplates(data.templates || []);
    } catch (e: any) {
      setTemplatesError(e.message || 'Falha ao carregar templates');
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }

  function escolherTemplate(name: string) {
    setSelectedTemplateName(name);
    const t = templates.find((x) => x.name === name) || null;
    setVariaveis(t ? Array.from({ length: t.varCount }, () => '') : []);
    setTestResult(null);
  }

  async function enviarTeste() {
    if (!selectedTemplate) {
      alert('Selecione um template.');
      return;
    }
    if (!to.trim()) {
      alert('Informe o numero do destinatario (com DDD, ex.: 5511999999999).');
      return;
    }
    setTestando(true);
    setTestResult(null);
    try {
      const resp = await api.confMeta.testar({
        to: to.trim(),
        templateNome: selectedTemplate.name,
        language: selectedTemplate.language,
        variaveis,
      });
      setTestResult({ ok: true, msg: `Enviado com sucesso! ID: ${resp.id || '-'}` });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || 'Falha ao enviar o teste' });
    } finally {
      setTestando(false);
    }
  }

  if (!isBruno(user)) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Meta</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-500)', fontSize: 14 }}>
          Acesso restrito ao administrador.
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Meta</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Meta</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Credenciais da API oficial do WhatsApp (Meta Cloud API)</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </div>

      <div style={{ padding: 28, maxWidth: 900 }}>
        {/* Credenciais */}
        <div style={s.card}>
          <div style={s.h3}>Credenciais do WhatsApp Business (Meta)</div>
          <p style={s.p}>
            Configure aqui as credenciais geradas no painel da Meta. O <strong>Token</strong> e sensivel e fica protegido —
            depois de salvo, ele nao e mais exibido (preencha apenas para trocar).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <div>
              <label style={s.label}>WABA ID (WhatsApp Business Account ID)</label>
              <input style={s.input} value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="Ex.: 27266578829666892" />
            </div>
            <div>
              <label style={s.label}>Phone Number ID</label>
              <input style={s.input} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="Ex.: 1214724495052015" />
            </div>
            <div>
              <label style={s.label}>Template padrao (do sistema)</label>
              <input style={s.input} value={templateNome} onChange={(e) => setTemplateNome(e.target.value)} placeholder="Ex.: skus_pendentes_imagem" />
            </div>
            <div>
              <label style={s.label}>Token permanente</label>
              <input style={s.input} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={tokenConfigured ? 'Ja configurado. Preencha so para trocar.' : 'Cole aqui o token permanente'} />
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...s.label, marginBottom: 0 }}>Envio ativo</span>
            <select style={{ ...s.input, width: 160, cursor: 'pointer' }} value={ativo ? 'ativo' : 'pausado'} onChange={(e) => setAtivo(e.target.value === 'ativo')}>
              <option value="pausado">Pausado</option>
              <option value="ativo">Ativo</option>
            </select>
            <span style={{ fontSize: 12, color: tokenConfigured ? 'var(--green)' : 'var(--amber)' }}>
              {tokenConfigured ? 'Token configurado ✓' : 'Token ainda nao configurado'}
            </span>
          </div>
        </div>

        {/* Rotina de fotos pendentes */}
        <div style={{ ...s.card, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={s.h3}>Rotina: alerta de fotos pendentes</div>
          <p style={s.p}>
            Quando ativa, o sistema varre a pasta raiz do Pre-Cadastro (a configurada em Conf. Google) no intervalo definido,
            identifica as pastas com 2+ fotos ainda <strong>sem tratamento</strong> (sem nomes Capa/02/03...) e envia a lista de SKUs
            por WhatsApp. Usa o <strong>Template padrao</strong> acima e manda para os usuarios com a flag
            <strong> "Fotos pendentes (WhatsApp)"</strong> marcada (em Conf. Perfil) e telefone preenchido. Cada SKU e avisado uma unica vez.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label style={s.label}>Rotina</label>
              <select style={{ ...s.input, cursor: 'pointer' }} value={fotosAtivo ? 'ativo' : 'pausado'} onChange={(e) => setFotosAtivo(e.target.value === 'ativo')}>
                <option value="pausado">Pausada</option>
                <option value="ativo">Ativa</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Intervalo (horas)</label>
              <input style={s.input} type="number" min="1" max="168" step="1" value={fotosIntervalo} onChange={(e) => setFotosIntervalo(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
            Ultima execucao: {fotosUltimaEm ? new Date(fotosUltimaEm).toLocaleString('pt-BR') : 'ainda nao executada'}
          </div>
        </div>

        {/* Bloco de teste */}
        <div style={{ ...s.card, background: '#f8fafc', borderColor: '#dbe3ef' }}>
          <div style={s.h3}>Enviar mensagem de teste</div>
          <p style={s.p}>
            Carregue os templates da sua conta, escolha um, preencha as variaveis (se houver) e o destinatario, e dispare um teste.
            Lembrando: so templates <strong>aprovados</strong> entregam — os "Em analise" a Meta recusa.
            <br />Salve as credenciais (Token + WABA ID) antes de carregar a lista.
          </p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--gray-800)', color: '#fff' }} onClick={carregarTemplates} disabled={templatesLoading}>
              {templatesLoading ? 'Carregando...' : templates.length ? 'Recarregar templates' : 'Carregar templates'}
            </button>
            {templates.length ? <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{templates.length} template(s) encontrado(s)</span> : null}
          </div>

          {templatesError ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>{templatesError}</div>
          ) : null}

          {templates.length ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={s.label}>Template</label>
                <select style={{ ...s.input, cursor: 'pointer' }} value={selectedTemplateName} onChange={(e) => escolherTemplate(e.target.value)}>
                  <option value="">Selecione um template...</option>
                  {templates.map((t) => (
                    <option key={`${t.name}-${t.language}`} value={t.name}>
                      {t.name} — {t.status} — {t.language} {t.varCount ? `(${t.varCount} variavel(is))` : '(sem variaveis)'}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplate ? (
                <>
                  {selectedTemplate.status !== 'APPROVED' ? (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, color: '#b45309', fontSize: 12.5 }}>
                      ⚠️ Este template esta com status <strong>{selectedTemplate.status}</strong> — a Meta so entrega templates APROVADOS. O teste vai falhar ate aprovar.
                    </div>
                  ) : null}

                  {selectedTemplate.bodyText ? (
                    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12.5, color: 'var(--gray-600)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {selectedTemplate.bodyText}
                    </div>
                  ) : null}

                  <div>
                    <label style={s.label}>Destinatario (com DDI+DDD, ex.: 5511999999999)</label>
                    <input style={s.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="5511999999999" />
                  </div>

                  {variaveis.map((val, idx) => (
                    <div key={idx}>
                      <label style={s.label}>Variavel {`{{${idx + 1}}}`}</label>
                      <input
                        style={s.input}
                        value={val}
                        onChange={(e) => setVariaveis((cur) => cur.map((v, i) => (i === idx ? e.target.value : v)))}
                        placeholder={idx === 0 ? 'Ex.: 3' : 'Ex.: HD04_0026, HD04_0040'}
                      />
                    </div>
                  ))}

                  <div>
                    <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={enviarTeste} disabled={testando}>
                      {testando ? 'Enviando...' : 'Enviar teste'}
                    </button>
                  </div>

                  {testResult ? (
                    <div style={{
                      background: testResult.ok ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${testResult.ok ? '#86efac' : '#fecaca'}`,
                      borderRadius: 8, padding: 12,
                      color: testResult.ok ? '#16a34a' : '#b91c1c',
                      fontSize: 13, fontWeight: 600,
                    }}>
                      {testResult.ok ? '✓ ' : '✕ '}{testResult.msg}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
