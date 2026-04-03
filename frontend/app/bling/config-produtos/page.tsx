'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3:     { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p:      { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input:  { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function BlingConfigProdutosPage() {
  const [motos, setMotos]           = useState<any[]>([]);
  const [prefixos, setPrefixos]     = useState<{prefixo: string; motoId: string}[]>([{ prefixo: '', motoId: '' }]);
  const [savedPrefs, setSavedPrefs] = useState<any[]>([]);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/bling/prefixos`).then(r => r.json()).then(d => {
      setSavedPrefs(d);
      if (d.length) setPrefixos(d);
    }).catch(() => {});
  }, []);

  async function save() {
    const validos = prefixos.filter(p => p.prefixo && p.motoId);
    if (!validos.length) { alert('Adicione pelo menos um prefixo com moto selecionada'); return; }
    setSaving(true);
    try {
      await fetch(`${API}/bling/prefixos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixos: validos }) });
      setSavedPrefs(validos);
      alert('De/Para salvo com sucesso!');
    } catch { alert('Erro ao salvar'); }
    setSaving(false);
  }

  function add()          { setPrefixos(p => [...p, { prefixo: '', motoId: '' }]); }
  function remove(i: number) { setPrefixos(p => p.filter((_, idx) => idx !== i)); }
  function update(i: number, field: string, val: string) {
    setPrefixos(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Config. Produtos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Mapeamento de prefixo SKU → Moto</div>
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 720 }}>
        <div style={s.card}>
          <div style={s.h3}>🗺 De/Para — Prefixo do SKU → Moto</div>
          <p style={s.p}>
            Configure qual <strong>prefixo do SKU</strong> no Bling corresponde a qual moto no ANB.
            Na importação, o sistema lê o SKU e vincula automaticamente à moto correta.
            Prefixos mais longos têm prioridade.
          </p>

          {/* Exemplo */}
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 10 }}>Exemplo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--white)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6 }}><strong style={{ color: '#FF6900' }}>CR-</strong>042</code>
              <span style={{ color: 'var(--gray-400)' }}>→</span>
              <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>YAMAHA CROSSER</span>
            </div>
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Prefixo SKU</div>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Moto no ANB</div>
            <div />
          </div>

          {prefixos.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 10, marginBottom: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...s.input, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '.5px', paddingRight: 38 }}
                  placeholder="Ex: CR-"
                  value={item.prefixo}
                  onChange={e => update(i, 'prefixo', e.target.value.toUpperCase())}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-100)', padding: '1px 4px', borderRadius: 3 }}>SKU</span>
              </div>
              <select style={{ ...s.input, cursor: 'pointer' }} value={item.motoId} onChange={e => update(i, 'motoId', e.target.value)}>
                <option value="">Selecione a moto...</option>
                {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo} {m.ano ? `(${m.ano})` : ''}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.prefixo && item.motoId && <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>}
                <button onClick={() => remove(i)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', color: 'var(--gray-300)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
          ))}

          <button onClick={add} style={{ ...s.btn, background: 'var(--gray-50)', color: 'var(--gray-500)', border: '1px dashed var(--border)', width: '100%', justifyContent: 'center', marginBottom: 16 }}>
            + Adicionar prefixo
          </button>

          {/* Preview salvo */}
          {savedPrefs.length > 0 && (
            <div style={{ background: 'var(--green-light)', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 10 }}>✓ De/Para salvo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {savedPrefs.map((p: any, i: number) => {
                  const moto = motos.find((m: any) => String(m.id) === String(p.motoId));
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--white)', border: '1px solid #86efac', borderRadius: 7, padding: '5px 12px', fontSize: 13 }}>
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(22,163,74,.1)', padding: '1px 6px', borderRadius: 4, color: 'var(--green)', fontWeight: 700 }}>{p.prefixo}</code>
                      <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>→</span>
                      <span style={{ color: 'var(--gray-700)', fontWeight: 500 }}>{moto ? `${moto.marca} ${moto.modelo}` : `Moto ID ${p.motoId}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={save} disabled={saving || !prefixos.some(p => p.prefixo && p.motoId)}>
            {saving ? 'Salvando...' : '💾 Salvar de/para'}
          </button>
        </div>

        <div style={{ ...s.card, background: 'var(--gray-50)' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.9 }}>
            <strong style={{ color: 'var(--gray-500)' }}>💡 Dicas</strong><br/>
            • Use prefixos curtos e consistentes: <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>CR-</code> Crosser · <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>HD-</code> Harley · <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-</code> BMWs<br/>
            • Prefixos mais longos têm prioridade: <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-GS-</code> vence <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-</code>
          </div>
        </div>
      </div>
    </>
  );
}
