'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card:   { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, marginBottom: 20 },
  h3:     { fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, marginBottom: 6, letterSpacing: '-0.3px' },
  p:      { fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.7, marginBottom: 14 },
  label:  { fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)', display: 'block', marginBottom: 5 },
  input:  { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px', fontSize: 14, fontFamily: 'Geist, sans-serif', outline: 'none', color: 'var(--ink)' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  step:   { display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 },
  stepN:  { width: 28, height: 28, borderRadius: '50%', background: 'var(--ink)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0, marginTop: 1 },
  stepT:  { fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7 },
  badge:  { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500 },
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

export default function BlingPage() {
  const [config, setConfig]             = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [clientId, setClientId]         = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving]             = useState(false);
  const [connStatus, setConnStatus]     = useState<any>(null);
  const [syncing, setSyncing]           = useState(false);
  const [syncResult, setSyncResult]     = useState<any>(null);
  const [motos, setMotos]               = useState<any[]>([]);
  const [motoFallback, setMotoFallback] = useState('');
  const [dataInicio, setDataInicio]     = useState('');
  const [dataFim, setDataFim]           = useState('');
  const [prefixos, setPrefixos]         = useState<{prefixo: string; motoId: string}[]>([{ prefixo: '', motoId: '' }]);
  const [savingPrefs, setSavingPrefs]   = useState(false);

  useEffect(() => {
    load();
    if (window.location.search.includes('connected=true'))
      window.history.replaceState({}, '', '/bling');
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [cfg, mts, prefs] = await Promise.all([
        fetch(`${API}/bling/config`).then(r => r.json()),
        api.motos.list().catch(() => []),
        fetch(`${API}/bling/prefixos`).then(r => r.json()).catch(() => []),
      ]);
      setConfig(cfg);
      setMotos(mts);
      setPrefixos(prefs.length ? prefs : [{ prefixo: '', motoId: '' }]);
    } catch { setConfig(null); }
    setLoading(false);
  }

  async function saveCredentials() {
    if (!clientId || !clientSecret) return;
    setSaving(true);
    try {
      await fetch(`${API}/bling/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) });
      setClientId(''); setClientSecret('');
      await load();
    } catch { alert('Erro ao salvar credenciais'); }
    setSaving(false);
  }

  async function savePrefixos() {
    const validos = prefixos.filter(p => p.prefixo && p.motoId);
    if (!validos.length) { alert('Adicione pelo menos um prefixo válido com moto selecionada'); return; }
    setSavingPrefs(true);
    try {
      await fetch(`${API}/bling/prefixos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixos: validos }) });
      await load();
    } catch { alert('Erro ao salvar de/para'); }
    setSavingPrefs(false);
  }

  function addPrefixo() { setPrefixos(p => [...p, { prefixo: '', motoId: '' }]); }
  function removePrefixo(i: number) { setPrefixos(p => p.filter((_, idx) => idx !== i)); }
  function updatePrefixo(i: number, field: string, val: string) {
    setPrefixos(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  async function connectBling() {
    const r = await fetch(`${API}/bling/auth-url`);
    const d = await r.json();
    if (d.url) window.location.href = d.url;
    else alert(d.error || 'Erro ao gerar URL');
  }

  async function testConn() {
    setConnStatus({ loading: true });
    try {
      const r = await fetch(`${API}/bling/status`);
      setConnStatus(await r.json());
    } catch { setConnStatus({ ok: false, error: 'Sem resposta do servidor' }); }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Bling?')) return;
    await fetch(`${API}/bling/disconnect`, { method: 'DELETE' });
    setConnStatus(null); await load();
  }

  async function syncProdutos() {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await fetch(`${API}/bling/sync/produtos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motoIdFallback: motoFallback || null }) });
      setSyncResult({ type: 'produtos', ...await r.json() });
    } catch (e: any) { setSyncResult({ type: 'produtos', ok: false, error: e.message }); }
    setSyncing(false);
  }

  async function syncVendas() {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await fetch(`${API}/bling/sync/vendas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataInicio, dataFim }) });
      setSyncResult({ type: 'vendas', ...await r.json() });
    } catch (e: any) { setSyncResult({ type: 'vendas', ok: false, error: e.message }); }
    setSyncing(false);
  }

  if (loading) return (
    <>
      <div style={s.topbar}><div><div style={s.title}>Integração Bling</div></div></div>
      <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
    </>
  );

  const connected = config?.hasTokens;

  return (
    <>
      <div style={s.topbar}>
        <div><div style={s.title}>Integração Bling</div><div style={s.sub}>Sincronize produtos e vendas com o Bling ERP</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {connected
            ? <span style={{ ...s.badge, background: 'var(--sage-light)', color: 'var(--sage)', border: '1px solid var(--sage-mid)' }}>✓ Bling conectado</span>
            : config?.clientId
              ? <span style={{ ...s.badge, background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid var(--amber-mid)' }}>⚠ Aguardando autorização</span>
              : <span style={{ ...s.badge, background: 'var(--gray-100)', color: 'var(--ink-muted)', border: '1px solid var(--border)' }}>○ Não configurado</span>
          }
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 780 }}>

        {/* PASSO A PASSO */}
        <div style={s.card}>
          <div style={s.h3}>📋 Como configurar a API do Bling</div>
          <p style={s.p}>A API do Bling usa OAuth 2.0. Crie um aplicativo no painel do Bling:</p>
          {[
            { n: 1, t: <>No Bling acesse <strong>⚙ Preferências → Todas as Configurações → Cadastro de Aplicativos → + CRIAR NOVO</strong></> },
            { n: 2, t: <>Preencha: Nome: <strong>ANB Parts</strong> · URL de Redirecionamento: <code style={{ background: 'var(--gray-100)', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontFamily: 'Geist Mono, monospace' }}>{API}/bling/callback</code></> },
            { n: 3, t: <>Em <strong>Escopos</strong> marque: Produtos (leitura) e Pedidos de Venda (leitura). Salve.</> },
            { n: 4, t: <>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong> gerados e cole abaixo.</> },
          ].map(({ n, t }) => (
            <div key={n} style={s.step}><div style={s.stepN}>{n}</div><div style={s.stepT}>{t}</div></div>
          ))}
        </div>

        {/* CREDENCIAIS */}
        <div style={s.card}>
          <div style={s.h3}>🔑 Credenciais do Aplicativo</div>
          {config?.clientId && (
            <div style={{ background: 'var(--sage-light)', border: '1px solid var(--sage-mid)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--sage)' }}>
              ✓ Client ID configurado: <strong>{config.clientId}</strong>
              {config.connectedAt && <span style={{ marginLeft: 8, color: 'var(--ink-muted)', fontSize: 12 }}>· Conectado em {new Date(config.connectedAt).toLocaleDateString('pt-BR')}</span>}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div><label style={s.label}>Client ID</label><input style={s.input} autoComplete="off" placeholder="Cole aqui o Client ID" value={clientId} onChange={e => setClientId(e.target.value)} /></div>
            <div><label style={s.label}>Client Secret</label><input style={s.input} type="password" autoComplete="new-password" placeholder="Cole aqui o Client Secret" value={clientSecret} onChange={e => setClientSecret(e.target.value)} /></div>
          </div>
          <button style={{ ...s.btn, background: 'var(--ink)', color: 'var(--white)' }} onClick={saveCredentials} disabled={saving || !clientId || !clientSecret}>
            {saving ? 'Salvando...' : '💾 Salvar credenciais'}
          </button>
        </div>

        {/* AUTORIZAÇÃO */}
        {config?.clientId && (
          <div style={s.card}>
            <div style={s.h3}>🔗 Autorização OAuth</div>
            <p style={s.p}>Clique em <strong>Conectar com Bling</strong> para autorizar. Você será redirecionado ao Bling e voltará automaticamente.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!connected
                ? <button style={{ ...s.btn, background: '#FF6900', color: '#fff' }} onClick={connectBling}>🔗 Conectar com Bling</button>
                : <>
                    <button style={{ ...s.btn, background: 'var(--sage-light)', color: 'var(--sage)', border: '1px solid var(--sage-mid)' }} onClick={testConn}>{connStatus?.loading ? '⏳ Testando...' : '✓ Testar conexão'}</button>
                    <button style={{ ...s.btn, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #f5c6c6' }} onClick={disconnect}>Desconectar</button>
                  </>
              }
            </div>
            {connStatus && !connStatus.loading && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: connStatus.ok ? 'var(--sage-light)' : 'var(--red-light)', border: `1px solid ${connStatus.ok ? 'var(--sage-mid)' : '#f5c6c6'}`, borderRadius: 8, fontSize: 13, color: connStatus.ok ? 'var(--sage)' : 'var(--red)' }}>
                {connStatus.ok ? `✓ Conectado — Empresa: ${connStatus.empresa}` : `✗ Erro: ${connStatus.error}`}
              </div>
            )}
          </div>
        )}

        {/* DE/PARA */}
        <div style={s.card}>
          <div style={s.h3}>🗺 De/Para — Prefixo do SKU → Moto</div>
          <p style={s.p}>
            Configure qual <strong>prefixo do SKU</strong> no Bling corresponde a qual moto no ANB.
            Na importação, o sistema lê o SKU de cada produto e vincula automaticamente à moto correta.
          </p>

          {/* Exemplo visual */}
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 12 }}>Como funciona</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: 8, alignItems: 'center' }}>
              {[
                { label: 'SKU no Bling', val: <><strong style={{ color: '#FF6900' }}>CR-</strong>042</>, mono: true },
                '→',
                { label: 'Prefixo mapeado', val: <><strong style={{ color: '#FF6900' }}>CR-</strong> = Crosser</>, mono: true },
                '→',
                { label: 'Peça criada em', val: 'YAMAHA CROSSER', mono: false },
              ].map((item, i) =>
                item === '→'
                  ? <div key={i} style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: 18 }}>→</div>
                  : <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginBottom: 4, fontFamily: 'Geist Mono, monospace', letterSpacing: '.3px' }}>{(item as any).label}</div>
                      <div style={{ fontSize: 13, fontFamily: (item as any).mono ? 'Geist Mono, monospace' : 'Geist, sans-serif', fontWeight: 500, color: 'var(--ink-soft)' }}>{(item as any).val}</div>
                    </div>
              )}
            </div>
          </div>

          {/* Tabela de mapeamento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Prefixo do SKU</div>
            <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--ink-muted)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Moto no ANB</div>
            <div />
          </div>

          {prefixos.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, marginBottom: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...s.input, fontFamily: 'Geist Mono, monospace', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.5px', paddingRight: 42 }}
                  placeholder="Ex: CR-"
                  value={item.prefixo}
                  onChange={e => updatePrefixo(i, 'prefixo', e.target.value.toUpperCase())}
                />
                <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'Geist Mono, monospace', background: 'var(--gray-100)', padding: '1px 5px', borderRadius: 3 }}>SKU</span>
              </div>
              <select
                style={{ ...s.input, cursor: 'pointer', fontSize: 13 }}
                value={item.motoId}
                onChange={e => updatePrefixo(i, 'motoId', e.target.value)}
              >
                <option value="">Selecione a moto...</option>
                {motos.map((m: any) => (
                  <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo} {m.ano ? `(${m.ano})` : ''}</option>
                ))}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.prefixo && item.motoId && <span style={{ color: 'var(--sage)', fontSize: 16 }}>✓</span>}
                <button onClick={() => removePrefixo(i)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remover">✕</button>
              </div>
            </div>
          ))}

          <button onClick={addPrefixo} style={{ ...s.btn, background: 'var(--gray-50)', color: 'var(--ink-soft)', border: '1px dashed var(--border)', width: '100%', justifyContent: 'center', marginBottom: 16 }}>
            + Adicionar prefixo
          </button>

          {/* Preview do salvo */}
          {config?.prefixos?.length > 0 && (
            <div style={{ background: 'var(--sage-light)', border: '1px solid var(--sage-mid)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--sage)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 10 }}>✓ De/Para salvo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {config.prefixos.map((p: any, i: number) => {
                  const moto = motos.find((m: any) => String(m.id) === String(p.motoId));
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--white)', border: '1px solid var(--sage-mid)', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
                      <code style={{ fontFamily: 'Geist Mono, monospace', background: 'rgba(61,107,94,.15)', padding: '2px 8px', borderRadius: 4, color: 'var(--sage)', fontWeight: 700 }}>{p.prefixo}</code>
                      <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>→</span>
                      <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>{moto ? `${moto.marca} ${moto.modelo}` : `Moto ID ${p.motoId}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button style={{ ...s.btn, background: 'var(--ink)', color: 'var(--white)' }} onClick={savePrefixos} disabled={savingPrefs || !prefixos.some(p => p.prefixo && p.motoId)}>
            {savingPrefs ? 'Salvando...' : '💾 Salvar de/para'}
          </button>
        </div>

        {/* SINCRONIZAÇÃO — só mostra se conectado */}
        {connected && (
          <>
            {/* PRODUTOS */}
            <div style={s.card}>
              <div style={s.h3}>📦 Importar Produtos Ativos do Bling</div>
              <p style={s.p}>
                Importa todos os produtos <strong>Ativos</strong> do Bling usando o de/para acima para identificar a moto.
                Produtos já importados são ignorados — pode rodar quantas vezes quiser.
              </p>
              <div style={{ marginBottom: 16 }}>
                <label style={s.label}>Moto padrão — para SKUs sem prefixo reconhecido (opcional)</label>
                <select style={{ ...s.input, cursor: 'pointer', fontSize: 13 }} value={motoFallback} onChange={e => setMotoFallback(e.target.value)}>
                  <option value="">Ignorar produtos sem prefixo</option>
                  {motos.map((m: any) => <option key={m.id} value={m.id}>ID {m.id} — {m.marca} {m.modelo}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 5 }}>Produtos cujo SKU não bate nenhum prefixo serão ignorados (ou enviados para essa moto)</div>
              </div>
              <button style={{ ...s.btn, background: '#FF6900', color: '#fff' }} onClick={syncProdutos} disabled={syncing}>
                {syncing ? '⏳ Importando...' : '↓ Importar produtos do Bling'}
              </button>
            </div>

            {/* VENDAS */}
            <div style={s.card}>
              <div style={s.h3}>💰 Sincronizar Vendas do Bling</div>
              <p style={s.p}>Busca pedidos <strong>concluídos</strong> no Bling e marca as peças como vendidas no ANB. Filtre por período para sincronizações parciais.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={s.label}>Data início (opcional)</label><input style={s.input} type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></div>
                <div><label style={s.label}>Data fim (opcional)</label><input style={s.input} type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div>
              </div>
              <button style={{ ...s.btn, background: 'var(--sage)', color: '#fff' }} onClick={syncVendas} disabled={syncing}>
                {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar vendas'}
              </button>
            </div>

            {/* RESULTADO */}
            {syncResult && (
              <div style={{ ...s.card, background: syncResult.ok ? 'var(--sage-light)' : 'var(--red-light)', border: `1px solid ${syncResult.ok ? 'var(--sage-mid)' : '#f5c6c6'}` }}>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, color: syncResult.ok ? 'var(--sage)' : 'var(--red)', marginBottom: 10 }}>
                  {syncResult.ok ? '✓ Concluído' : '✗ Erro'}
                </div>
                {syncResult.ok && syncResult.type === 'produtos' && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 2 }}>
                    <div>📦 Total verificado: <strong>{syncResult.total}</strong></div>
                    <div>✅ Importados: <strong>{syncResult.created}</strong> novas peças</div>
                    <div>⏭ Já existiam: <strong>{syncResult.skipped}</strong></div>
                    <div>⚠ SKU sem prefixo: <strong>{syncResult.semMoto}</strong></div>
                    {syncResult.semMotoExemplos?.length > 0 && (
                      <div style={{ marginTop: 8, background: 'rgba(0,0,0,.04)', borderRadius: 6, padding: '8px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11 }}>
                        Exemplos: {syncResult.semMotoExemplos.join(' · ')}
                      </div>
                    )}
                  </div>
                )}
                {syncResult.ok && syncResult.type === 'vendas' && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 2 }}>
                    <div>✅ Peças baixadas: <strong>{syncResult.baixadas}</strong></div>
                    <div>⚠ Não encontradas no ANB: <strong>{syncResult.naoEncontradas}</strong></div>
                  </div>
                )}
                {!syncResult.ok && <div style={{ fontSize: 13, color: 'var(--red)' }}>{syncResult.error}</div>}
              </div>
            )}
          </>
        )}

        {/* DICAS */}
        <div style={{ ...s.card, background: 'var(--gray-50)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 2 }}>
            <strong style={{ color: 'var(--ink-soft)' }}>💡 Boas práticas para SKUs no Bling</strong><br/>
            • Prefixo curto e consistente por moto: <code style={{ fontFamily: 'Geist Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>CR-</code> Crosser · <code style={{ fontFamily: 'Geist Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>HD-</code> Harley · <code style={{ fontFamily: 'Geist Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-</code> BMWs<br/>
            • Prefixos mais longos têm prioridade — <code style={{ fontFamily: 'Geist Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-GS-</code> vence <code style={{ fontFamily: 'Geist Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>BMW-</code><br/>
            • Pode rodar a importação quantas vezes quiser — duplicatas são ignoradas<br/>
            • URL de callback no Bling: <code style={{ fontFamily: 'Geist Mono, monospace', background: 'var(--gray-200)', padding: '0 4px', borderRadius: 3 }}>{API}/bling/callback</code>
          </div>
        </div>

      </div>
    </>
  );
}
