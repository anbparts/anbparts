'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 26, marginBottom: 18 },
  h3:     { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 6, letterSpacing: '-0.3px' },
  p:      { fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 14 },
  label:  { fontSize: 12, fontWeight: 500, color: 'var(--gray-600)', display: 'block', marginBottom: 5 },
  input:  { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: 'var(--gray-800)' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

export default function BlingProdutosPage() {
  const [motos, setMotos]           = useState<any[]>([]);
  const [connected, setConnected]   = useState<boolean | null>(null);
  const [syncing, setSyncing]       = useState(false);
  const [result, setResult]         = useState<any>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim]       = useState('');
  const [motoFallback, setMotoFallback] = useState('');
  const [prefixos, setPrefixos]     = useState<any[]>([]);

  useEffect(() => {
    api.motos.list().then(setMotos).catch(() => {});
    fetch(`${API}/bling/config`).then(r => r.json()).then(d => setConnected(d.hasTokens)).catch(() => setConnected(false));
    fetch(`${API}/bling/prefixos`).then(r => r.json()).then(setPrefixos).catch(() => {});
  }, []);

  async function sync() {
    setSyncing(true); setResult(null);
    try {
      const r = await fetch(`${API}/bling/sync/produtos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motoIdFallback: motoFallback || null, dataInicio: dataInicio || null, dataFim: dataFim || null }),
      });
      setResult(await r.json());
    } catch (e: any) { setResult({ ok: false, error: e.message }); }
    setSyncing(false);
  }

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Produtos Bling</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Importar produtos ativos do Bling para o estoque ANB</div>
        </div>
        {connected === false && (
          <a href="/bling" style={{ fontSize: 13, color: 'var(--red)', textDecoration: 'none' }}>⚠ Bling não conectado — Configurar</a>
        )}
      </div>

      <div style={{ padding: 28, maxWidth: 680 }}>

        {/* De/Para configurado */}
        {prefixos.length > 0 ? (
          <div style={{ background: 'var(--green-light)', border: '1px solid #86efac', borderRadius: 9, padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>✓ De/Para configurado — {prefixos.length} prefixo{prefixos.length > 1 ? 's' : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {prefixos.map((p: any, i: number) => {
                  const moto = motos.find((m: any) => String(m.id) === String(p.motoId));
                  return <span key={i} style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', background: 'var(--white)', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 5, color: 'var(--green)' }}>{p.prefixo} → {moto ? `${moto.modelo}` : `ID ${p.motoId}`}</span>;
                })}
              </div>
            </div>
            <a href="/bling/config-produtos" style={{ fontSize: 12, color: 'var(--green)', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 12 }}>✏ Editar</a>
          </div>
        ) : (
          <div style={{ background: 'var(--amber-light)', border: '1px solid #fcd34d', borderRadius: 9, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: 'var(--amber)' }}>
            ⚠ De/Para não configurado — <a href="/bling/config-produtos" style={{ color: 'var(--amber)', fontWeight: 600 }}>Configure agora</a> para que os produtos sejam vinculados à moto correta.
          </div>
        )}

        <div style={s.card}>
          <div style={s.h3}>📦 Importar Produtos Ativos</div>
          <p style={s.p}>
            Importa produtos com situação <strong>Ativo</strong> do Bling. O SKU de cada produto é verificado
            contra o de/para para determinar a moto. Produtos já importados são ignorados — pode rodar quantas vezes quiser.
          </p>

          {/* Filtro por data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Data de criação — início (opcional)</label>
              <input style={{ ...s.input, width: '100%' }} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Data de criação — fim (opcional)</label>
              <input style={{ ...s.input, width: '100%' }} type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>
            Deixe em branco para buscar todos os produtos ativos. Use datas para buscar apenas novos cadastros.
          </div>

          {/* Moto padrão */}
          <div style={{ marginBottom: 20 }}>
            <label style={s.label}>Moto padrão — para SKUs sem prefixo reconhecido (opcional)</label>
            <select style={{ ...s.input, width: '100%', cursor: 'pointer' }} value={motoFallback} onChange={e => setMotoFallback(e.target.value)}>
              <option value="">Ignorar produtos sem prefixo</option>
              {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo}</option>)}
            </select>
          </div>

          <button style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: (!connected || syncing) ? 0.6 : 1 }} onClick={sync} disabled={!connected || syncing}>
            {syncing ? '⏳ Importando...' : '↓ Importar produtos do Bling'}
          </button>
          {!connected && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>Conecte o Bling primeiro em <a href="/bling" style={{ color: 'var(--red)' }}>Configuração</a></div>}
        </div>

        {/* Resultado */}
        {result && (
          <div style={{ ...s.card, background: result.ok ? 'var(--green-light)' : 'var(--red-light)', border: `1px solid ${result.ok ? '#86efac' : '#fca5a5'}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: result.ok ? 'var(--green)' : 'var(--red)', marginBottom: 10 }}>
              {result.ok ? '✓ Importação concluída' : '✗ Erro'}
            </div>
            {result.ok && (
              <div style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 2 }}>
                <div>📦 Total verificado: <strong>{result.total}</strong></div>
                <div>✅ Importados: <strong>{result.created}</strong> novas peças</div>
                <div>⏭ Já existiam: <strong>{result.skipped}</strong></div>
                <div>⚠ SKU sem prefixo: <strong>{result.semMoto}</strong></div>
                {result.semMotoExemplos?.length > 0 && (
                  <div style={{ marginTop: 8, background: 'rgba(0,0,0,.04)', borderRadius: 6, padding: '7px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                    Exemplos: {result.semMotoExemplos.join(' · ')}
                  </div>
                )}
              </div>
            )}
            {!result.ok && <div style={{ fontSize: 13, color: 'var(--red)' }}>{result.error}</div>}
          </div>
        )}
      </div>
    </>
  );
}
