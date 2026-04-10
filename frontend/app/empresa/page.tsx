'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { api } from '@/lib/api';

const EMPRESA_ANEXO_FIELDS = [
  { key: 'cartaoCnpj', label: 'Cartao CNPJ' },
  { key: 'contratoSocial', label: 'Contrato Social' },
  { key: 'detran', label: 'DETRAN' },
  { key: 'cetesb', label: 'CETESB' },
  { key: 'inscricaoEstadual', label: 'Insc. Estadual' },
  { key: 'inscricaoMunicipal', label: 'Insc. Municipal' },
  { key: 'alvaraMunicipal', label: 'Alvara Municipal' },
  { key: 'avcb', label: 'AVCB' },
  { key: 'jucesp', label: 'JUCESP' },
  { key: 'contratoAluguel', label: 'Contrato Aluguel' },
] as const;

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const },
  td: { padding: '11px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' },
  fl: { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' },
};

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const EMPTY_FORM = {
  razaoSocial: '',
  cnpj: '',
  enderecoCompleto: '',
  telefoneWhats: '',
};

export default function EmpresaPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [anexos, setAnexos] = useState<Record<string, { name: string; dataUrl: string } | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const data = await api.empresa.get();
        if (!active) return;
        setForm({
          razaoSocial: data.razaoSocial || '',
          cnpj: data.cnpj || '',
          enderecoCompleto: data.enderecoCompleto || '',
          telefoneWhats: data.telefoneWhats || '',
        });
        setAnexos(data.anexos || {});
      } catch (error: any) {
        if (!active) return;
        setFeedback(error.message || 'Erro ao carregar cadastro da empresa');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleFileChange(key: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setAnexos((current) => ({ ...current, [key]: { name: file.name, dataUrl } }));
    setFeedback('');
  }

  function clearFile(key: string) {
    setAnexos((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFeedback('');
  }

  async function handleSave() {
    setSaving(true);
    setFeedback('');
    try {
      const response = await api.empresa.save({ ...form, anexos });
      setForm({
        razaoSocial: response.razaoSocial || '',
        cnpj: response.cnpj || '',
        enderecoCompleto: response.enderecoCompleto || '',
        telefoneWhats: response.telefoneWhats || '',
      });
      setAnexos(response.anexos || {});
      setFeedback('Cadastro da empresa salvo com sucesso.');
    } catch (error: any) {
      setFeedback(error.message || 'Erro ao salvar cadastro da empresa');
    } finally {
      setSaving(false);
    }
  }

  const totalAnexos = Object.keys(anexos || {}).length;

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Empresa</div>
          <div style={cs.sub}>Cadastro da empresa e central de documentos</div>
        </div>
        <button onClick={handleSave} disabled={loading || saving} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', opacity: loading ? 0.7 : 1 }}>
          {saving ? 'Salvando...' : 'Salvar empresa'}
        </button>
      </div>

      <div style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div style={cs.card}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Cabecalho da empresa</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                Razao social, CNPJ, endereco completo e telefone / WhatsApp
              </div>
            </div>
            <span style={{ background: 'var(--gray-50)', color: 'var(--ink-soft)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              {totalAnexos} documento(s) anexado(s)
            </span>
          </div>

          <div style={{ padding: 18 }}>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Carregando dados da empresa...</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={cs.fl}>Razao Social</label>
                    <input
                      style={cs.fi}
                      value={form.razaoSocial}
                      onChange={(e) => setForm((current) => ({ ...current, razaoSocial: e.target.value }))}
                      placeholder="Ex: ANB Parts Comercio de Pecas Ltda"
                    />
                  </div>
                  <div>
                    <label style={cs.fl}>CNPJ</label>
                    <input
                      style={cs.fi}
                      value={form.cnpj}
                      onChange={(e) => setForm((current) => ({ ...current, cnpj: e.target.value }))}
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
                  <div>
                    <label style={cs.fl}>Telefone / WhatsApp</label>
                    <input
                      style={cs.fi}
                      value={form.telefoneWhats}
                      onChange={(e) => setForm((current) => ({ ...current, telefoneWhats: e.target.value }))}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={cs.fl}>Endereco Completo</label>
                    <textarea
                      style={{ ...cs.fi, minHeight: 84, resize: 'vertical' as const }}
                      value={form.enderecoCompleto}
                      onChange={(e) => setForm((current) => ({ ...current, enderecoCompleto: e.target.value }))}
                      placeholder="Rua, numero, complemento, bairro, cidade, estado e CEP"
                    />
                  </div>
                </div>
                {feedback ? (
                  <div style={{ marginTop: 14, fontSize: 12, color: feedback.toLowerCase().includes('erro') ? 'var(--red)' : 'var(--green)' }}>
                    {feedback}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div style={cs.card}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600 }}>Documentos da empresa</div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
              Um anexo por documento, seguindo o mesmo padrao usado nas motos
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  {['Documento', 'Arquivo atual', 'Upload', 'Acoes'].map((head) => (
                    <th key={head} style={cs.th}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ ...cs.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>Carregando documentos...</td>
                  </tr>
                ) : (
                  EMPRESA_ANEXO_FIELDS.map((field) => {
                    const attachment = anexos?.[field.key] || null;
                    return (
                      <tr key={field.key}>
                        <td style={{ ...cs.td, fontWeight: 600 }}>{field.label}</td>
                        <td style={cs.td}>
                          {attachment ? (
                            <span style={{ fontSize: 12, color: 'var(--ink)' }}>{attachment.name}</span>
                          ) : (
                            <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>Nenhum arquivo</span>
                          )}
                        </td>
                        <td style={cs.td}>
                          <input type="file" accept=".pdf,image/*" onChange={(event) => handleFileChange(field.key, event)} />
                        </td>
                        <td style={cs.td}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => attachment && downloadDataUrl(attachment.dataUrl, attachment.name)}
                              disabled={!attachment}
                              style={{ ...cs.btn, padding: '6px 10px', fontSize: 11, border: '1px solid var(--border)', background: 'var(--white)', color: attachment ? 'var(--blue-500)' : 'var(--ink-muted)', cursor: attachment ? 'pointer' : 'not-allowed', opacity: attachment ? 1 : 0.7 }}
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => clearFile(field.key)}
                              disabled={!attachment}
                              style={{ ...cs.btn, padding: '6px 10px', fontSize: 11, border: '1px solid #fecaca', background: '#fef2f2', color: attachment ? 'var(--red)' : 'var(--ink-muted)', cursor: attachment ? 'pointer' : 'not-allowed', opacity: attachment ? 1 : 0.7 }}
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
