'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Variavel = { key: string; label: string; fonte: 'moto' | 'peca' };

const SAMPLE: Record<string, string> = {
  marca: 'Honda',
  modelo: 'NC 750X',
  ano: '2022',
  cor: 'Vermelha',
  placa: 'FZP-7J42',
  chassi: '9C2RC9100PR000225',
  renavam: '1344048266',
  etiqueta: 'SP22102020206005',
  sku: 'HO01_0130',
  descricao: 'Carcaça Bloco Motor STD HONDA NC 750X 2022 - Usado',
};

function preencherPreview(tpl: string) {
  return String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, k) => (SAMPLE[k] !== undefined ? SAMPLE[k] : `{{${k}}}`));
}

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', color: 'var(--gray-800)', outline: 'none', boxSizing: 'border-box' as const },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontFamily: 'Inter, sans-serif' },
};

export default function ConfTextoPecaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tipos, setTipos] = useState<string[]>([]);
  const [variaveis, setVariaveis] = useState<Variavel[]>([]);
  const [templates, setTemplates] = useState<Record<string, { template: string; ativo: boolean }>>({});
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string>('');
  const [template, setTemplate] = useState('');
  const [ativo, setAtivo] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function carregar() {
    const d = await api.confTextoPeca.get();
    setTipos(d.tipos || []);
    setVariaveis(d.variaveis || []);
    setTemplates(d.templates || {});
  }

  useEffect(() => {
    carregar().catch((e) => alert(e.message || 'Erro ao carregar')).finally(() => setLoading(false));
  }, []);

  function selecionarTipo(tipo: string) {
    setSelecionado(tipo);
    const cfg = templates[tipo];
    setTemplate(cfg?.template || '');
    setAtivo(cfg ? cfg.ativo : true);
  }

  function inserirVariavel(key: string) {
    const token = `{{${key}}}`;
    const ta = textareaRef.current;
    if (!ta) { setTemplate((t) => t + token); return; }
    const start = ta.selectionStart ?? template.length;
    const end = ta.selectionEnd ?? template.length;
    const novo = template.slice(0, start) + token + template.slice(end);
    setTemplate(novo);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function salvar() {
    if (!selecionado) return;
    setSaving(true);
    try {
      await api.confTextoPeca.save({ tipo: selecionado, template, ativo });
      await carregar();
      alert('Texto salvo.');
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function remover() {
    if (!selecionado) return;
    if (!confirm(`Remover o texto configurado para "${selecionado}"?`)) return;
    setSaving(true);
    try {
      await api.confTextoPeca.remove(selecionado);
      await carregar();
      setTemplate('');
      setAtivo(true);
    } catch (e: any) {
      alert(e.message || 'Erro ao remover');
    } finally {
      setSaving(false);
    }
  }

  const tiposFiltrados = useMemo(
    () => tipos.filter((t) => t.toLowerCase().includes(busca.trim().toLowerCase())),
    [tipos, busca],
  );
  const totalConfigurados = useMemo(() => Object.keys(templates).filter((t) => (templates[t]?.template || '').trim()).length, [templates]);

  if (loading) {
    return (
      <>
        <div style={s.topbar}><div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Texto NF-e</div></div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Texto NF-e</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Textos padrão por tipo de peça, com variáveis dos dados da moto</div>
        </div>
        <Link href="/motos" style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', border: '1px solid var(--border)', textDecoration: 'none' }}>← Voltar para Motos</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 18, padding: 22, alignItems: 'start' }}>
        {/* Lista de tipos */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>Tipos de peça</div>
            <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginBottom: 10 }}>{totalConfigurados} de {tipos.length} com texto configurado</div>
            <input style={{ ...s.input, padding: '7px 10px' }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tipo..." />
          </div>
          <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
            {tiposFiltrados.map((tipo) => {
              const cfg = templates[tipo];
              const temTexto = !!(cfg?.template || '').trim();
              const ativoCfg = cfg ? cfg.ativo : false;
              const sel = tipo === selecionado;
              return (
                <button
                  key={tipo}
                  onClick={() => selecionarTipo(tipo)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '10px 14px', border: 'none', borderTop: '1px solid var(--gray-100, #eef1f5)', cursor: 'pointer',
                    background: sel ? '#eff6ff' : 'transparent', fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span style={{ fontSize: 13, color: sel ? 'var(--blue-500)' : 'var(--gray-700)', fontWeight: sel ? 700 : 500 }}>{tipo}</span>
                  {temTexto ? (
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: ativoCfg ? 'var(--green)' : 'var(--amber)', flexShrink: 0 }} title={ativoCfg ? 'Configurado e ativo' : 'Configurado (pausado)'} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        {!selecionado ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--gray-400)', fontSize: 14 }}>
            Selecione um tipo de peça à esquerda para criar/editar o texto da NF-e.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>{selecionado}</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-600)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                  Ativo
                </label>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>
                Clique numa variável para inserir no texto (no ponto do cursor):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                {variaveis.map((v) => (
                  <span key={v.key} style={s.chip} onClick={() => inserirVariavel(v.key)} title={`{{${v.key}}} — ${v.fonte === 'moto' ? 'dado da moto' : 'dado da peça'}`}>
                    + {v.label}
                  </span>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                style={{ ...s.input, minHeight: 240, resize: 'vertical', fontFamily: 'Geist Mono, monospace', fontSize: 12.5, lineHeight: 1.6 }}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder={'Escreva o texto padrão. Use as variáveis acima e digite XXX onde o sistema não tem o dado.\n\nEx.: Marca: {{marca}} / Veículo de origem: {{marca}} {{modelo}}'}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvar} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar texto'}
                </button>
                {(templates[selecionado]?.template || '').trim() ? (
                  <button style={{ ...s.btn, background: 'var(--white)', color: 'var(--red, #dc2626)', border: '1px solid #fecaca' }} onClick={remover} disabled={saving}>
                    Remover texto
                  </button>
                ) : null}
              </div>
            </div>

            {/* Prévia */}
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 10 }}>
                Prévia (com dados de exemplo) — é como vai sair preenchido na separação/NF-e:
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #dbe3ef', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--gray-800)', whiteSpace: 'pre-wrap', lineHeight: 1.6, minHeight: 60 }}>
                {template.trim() ? preencherPreview(template) : <span style={{ color: 'var(--gray-400)' }}>O texto preenchido aparece aqui.</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
