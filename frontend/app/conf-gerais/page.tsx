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
  const [nuvemshopAtiva, setNuvemshopAtiva] = useState(false);
  const [nuvemshopLojaId, setNuvemshopLojaId] = useState('205449158');
  const [savingLojas, setSavingLojas] = useState(false);

  async function load() {
    const produtoConfig = await fetch(`${API}/bling/config-produtos`).then((r) => r.json());
    setFretePadrao(String(produtoConfig.fretePadrao ?? '29.90'));
    setTaxaPadraoPct(String(produtoConfig.taxaPadraoPct ?? '17'));
    const blingCfg = await fetch(`${API}/bling/config`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
    if (blingCfg.nuvemshopAtiva !== undefined) setNuvemshopAtiva(!!blingCfg.nuvemshopAtiva);
    if (blingCfg.nuvemshopLojaId) setNuvemshopLojaId(String(blingCfg.nuvemshopLojaId));
  }

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveLojas() {
    setSavingLojas(true);
    try {
      await fetch(`${API}/bling/auditoria-automatica/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nuvemshopAtiva, nuvemshopLojaId: Number(nuvemshopLojaId) || 205449158 }),
      });
      alert('Configuracao de lojas salva!');
    } catch {
      alert('Erro ao salvar');
    }
    setSavingLojas(false);
  }

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

        {/* Lojas Monitoradas */}
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 4 }}>Lojas Monitoradas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Configure quais lojas devem ser consideradas nas verificacoes de divergencia da auditoria e consulta manual.</div>
          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            {/* ML - informativo */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Mercado Livre</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>Sempre ativo — regras de divergencia de ML sao fixas</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>ID loja Bling</label>
                <input style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, width: 120, background: 'var(--gray-50)', color: 'var(--gray-400)' }} type="number" value="205204423" readOnly disabled />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 10px', borderRadius: 6 }}>Sempre ativo</span>
            </div>
            {/* Nuvemshop */}
            <div style={{ border: `1px solid ${nuvemshopAtiva ? 'var(--blue-500)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: nuvemshopAtiva ? 'rgba(59,130,246,.04)' : 'transparent' }}>
              <span style={{ fontSize: 20 }}>🏪</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Nuvemshop</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>Quando ativo, gera divergencia para produtos com estoque sem anuncio na Nuvemshop</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>ID loja Bling</label>
                <input style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, width: 120 }} type="number" value={nuvemshopLojaId} onChange={(e) => setNuvemshopLojaId(e.target.value)} />
              </div>
              <select style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer', background: 'var(--white)' }} value={nuvemshopAtiva ? '1' : '0'} onChange={(e) => setNuvemshopAtiva(e.target.value === '1')}>
                <option value="1">Ativa</option>
                <option value="0">Pausada</option>
              </select>
            </div>
          </div>
          <button
            style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: savingLojas ? 'not-allowed' : 'pointer', background: 'var(--gray-800)', color: '#fff', opacity: savingLojas ? 0.7 : 1 }}
            onClick={saveLojas}
            disabled={savingLojas}
          >
            {savingLojas ? 'Salvando...' : 'Salvar configuracao de lojas'}
          </button>
        </div>
      </div>
    </>
  );
}
