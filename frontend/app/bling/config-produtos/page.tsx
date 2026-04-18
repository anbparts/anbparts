'use client';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';
import { api } from '@/lib/api';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

type PrefixoItem = { prefixo: string; motoId: string };

function emptyPrefixo(): PrefixoItem {
  return { prefixo: '', motoId: '' };
}

export default function BlingConfigProdutosPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [prefixos, setPrefixos] = useState<PrefixoItem[]>([emptyPrefixo()]);
  const [savedPrefs, setSavedPrefs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [exibirBuscarProdutos, setExibirBuscarProdutos] = useState(true);
  const [exibirCompararCSV, setExibirCompararCSV] = useState(true);
  const [savingVisibilidade, setSavingVisibilidade] = useState(false);

  async function saveVisibilidade() {
    setSavingVisibilidade(true);
    try {
      await fetch(`${API}/bling/config-produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exibirBuscarProdutos, exibirCompararCSV }),
      });
      alert('Visibilidade salva!');
    } catch {
      alert('Erro ao salvar');
    }
    setSavingVisibilidade(false);
  }

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/bling/config-produtos`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.prefixos) ? data.prefixos : [];
        setSavedPrefs(list);
        setPrefixos(list.length ? list.map((item: any) => ({
          prefixo: String(item.prefixo || ''),
          motoId: String(item.motoId || ''),
        })) : [emptyPrefixo()]);
        setExibirBuscarProdutos(data.exibirBuscarProdutos !== false);
        setExibirCompararCSV(data.exibirCompararCSV !== false);
      })
      .catch(() => {});
  }, []);

  async function save() {
    const validos = prefixos
      .filter((item) => item.prefixo.trim() && item.motoId)
      .map((item) => ({ prefixo: item.prefixo.trim().toUpperCase(), motoId: Number(item.motoId) }));

    setSaving(true);
    try {
      await fetch(`${API}/bling/config-produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixos: validos, exibirBuscarProdutos, exibirCompararCSV }),
      });
      setSavedPrefs(validos);
      alert('Configuracoes salvas com sucesso!');
    } catch {
      alert('Erro ao salvar');
    }
    setSaving(false);
  }

  function add() {
    setPrefixos((current) => [...current, emptyPrefixo()]);
  }

  function remove(index: number) {
    setPrefixos((current) => {
      const next = current.filter((_, idx) => idx !== index);
      return next.length ? next : [emptyPrefixo()];
    });
  }

  function update(index: number, field: keyof PrefixoItem, value: string) {
    setPrefixos((current) => current.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Produtos Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>De/para do prefixo do SKU para vincular as motos na importacao</div>
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 860 }}>
        <div style={s.card}>
          <div style={s.h3}>De/Para - Prefixo do SKU para Moto</div>
          <p style={s.p}>
            Configure qual prefixo do SKU no Bling corresponde a qual moto no ANB. Na importacao,
            o sistema le o SKU e vincula automaticamente a moto correta. Prefixos mais longos tem prioridade.
          </p>

          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 10 }}>Exemplo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
              <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--white)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 6 }}><strong style={{ color: '#FF6900' }}>CR-</strong>042</code>
              <span style={{ color: 'var(--gray-400)' }}>-&gt;</span>
              <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>YAMAHA CROSSER</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Prefixo SKU</div>
            <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Moto no ANB</div>
            <div />
          </div>

          {prefixos.map((item, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 10, marginBottom: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...s.input, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '.5px', paddingRight: 38 }}
                  placeholder="Ex: CR-"
                  value={item.prefixo}
                  onChange={(e) => update(index, 'prefixo', e.target.value.toUpperCase())}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-100)', padding: '1px 4px', borderRadius: 3 }}>SKU</span>
              </div>
              <select style={{ ...s.input, cursor: 'pointer' }} value={item.motoId} onChange={(e) => update(index, 'motoId', e.target.value)}>
                <option value="">Selecione a moto...</option>
                {motos.map((moto: any) => (
                  <option key={moto.id} value={moto.id}>ID {moto.id} - {moto.marca} {moto.modelo} {moto.ano ? `(${moto.ano})` : ''}</option>
                ))}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.prefixo && item.motoId && <span style={{ color: 'var(--green)', fontSize: 16 }}>+</span>}
                <button
                  onClick={() => remove(index)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', color: 'var(--gray-300)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  x
                </button>
              </div>
            </div>
          ))}

          <button onClick={add} style={{ ...s.btn, background: 'var(--gray-50)', color: 'var(--gray-500)', border: '1px dashed var(--border)', width: '100%', justifyContent: 'center', marginBottom: 16 }}>
            + Adicionar prefixo
          </button>

          {savedPrefs.length > 0 && (
            <div style={{ background: 'var(--green-light)', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 10 }}>De/Para salvo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {savedPrefs.map((pref: any, index: number) => {
                  const moto = motos.find((item: any) => String(item.id) === String(pref.motoId));
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--white)', border: '1px solid #86efac', borderRadius: 7, padding: '5px 12px', fontSize: 13 }}>
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'rgba(22,163,74,.1)', padding: '1px 6px', borderRadius: 4, color: 'var(--green)', fontWeight: 700 }}>{pref.prefixo}</code>
                      <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>-&gt;</span>
                      <span style={{ color: 'var(--gray-700)', fontWeight: 500 }}>{moto ? `${moto.marca} ${moto.modelo}` : `Moto ID ${pref.motoId}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>

        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={s.h3}>Visibilidade dos Blocos — Página Produtos</div>
          <p style={s.p}>Ative ou desative a exibição dos blocos avançados na página de Produtos Bling.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { label: 'Buscar produtos ativos no Bling', desc: 'Permite buscar e importar produtos ativos diretamente do Bling.', value: exibirBuscarProdutos, set: setExibirBuscarProdutos },
              { label: 'Comparar CSV exportado do Bling', desc: 'Permite comparar um CSV exportado do Bling com a base do ANB.', value: exibirCompararCSV, set: setExibirCompararCSV },
            ].map(({ label, desc, value, set }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{desc}</div>
                </div>
                <button
                  type="button"
                  onClick={() => set(!value)}
                  style={{
                    width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: value ? 'var(--blue-500)' : 'var(--gray-300)',
                    position: 'relative', transition: 'background 150ms',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: value ? 22 : 2,
                    width: 20, height: 20, borderRadius: 999, background: '#fff',
                    transition: 'left 150ms', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }} />
                </button>
              </div>
            ))}
          </div>
          <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', marginTop: 16 }} onClick={saveVisibilidade} disabled={savingVisibilidade}>
            {savingVisibilidade ? 'Salvando...' : 'Salvar visibilidade'}
          </button>
        </div>

        <div style={{ ...s.card, background: 'var(--gray-50)' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.9 }}>
            <strong style={{ color: 'var(--gray-500)' }}>Dicas</strong><br />
            • Use prefixos curtos e consistentes: <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>CR-</code> Crosser · <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>HD-</code> Harley · <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BM</code> BMW<br />
            • Prefixos mais longos tem prioridade: <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-GS-</code> vence <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-</code>
          </div>
        </div>
      </div>
    </>
  );
}
