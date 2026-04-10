'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3: { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p: { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  input: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function ConfGeraisPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fretePadrao, setFretePadrao] = useState('29.90');
  const [taxaPadraoPct, setTaxaPadraoPct] = useState('17');

  async function load() {
    const produtoConfig = await fetch(`${API}/bling/config-produtos`).then((r) => r.json());
    setFretePadrao(String(produtoConfig.fretePadrao ?? '29.90'));
    setTaxaPadraoPct(String(produtoConfig.taxaPadraoPct ?? '17'));
  }

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function salvar() {
    const frete = Number(fretePadrao);
    const taxa = Number(taxaPadraoPct);

    if (!Number.isFinite(frete) || frete < 0) {
      alert('Informe um frete padrao valido');
      return;
    }

    if (!Number.isFinite(taxa) || taxa < 0) {
      alert('Informe uma taxa valida');
      return;
    }

    setSaving(true);
    try {
      await fetch(`${API}/bling/config-produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fretePadrao: frete,
          taxaPadraoPct: taxa,
        }),
      });
      alert('Valores padrao salvos com sucesso!');
    } catch {
      alert('Erro ao salvar valores padrao');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <>
        <div style={s.topbar}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Conf. Gerais</div>
        </div>
        <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
      </>
    );
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Conf. Gerais</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Parametros reutilizados no preenchimento dos produtos</div>
        </div>
        <button style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff' }} onClick={salvar} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </div>

      <div style={{ padding: 28, maxWidth: 920 }}>
        <div style={s.card}>
          <div style={s.h3}>Valores Padrão</div>
          <p style={s.p}>
            Defina o frete padrao e a taxa do Mercado Livre usados para preencher e calcular os itens
            importados do Bling. Esses mesmos valores tambem serao usados ao aprovar um cancelamento.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Frete padrao (R$)</div>
              <input
                style={s.input}
                type="number"
                step="0.01"
                min="0"
                value={fretePadrao}
                onChange={(e) => setFretePadrao(e.target.value)}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 8 }}>Taxa ML (%)</div>
              <input
                style={s.input}
                type="number"
                step="0.01"
                min="0"
                value={taxaPadraoPct}
                onChange={(e) => setTaxaPadraoPct(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
