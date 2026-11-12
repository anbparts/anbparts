'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

type Conexao = {
  chave: string;
  nome: string;
  status: 'ok' | 'erro' | 'nao_configurado';
  detalhe: string;
  aviso?: string;
  telaConfig: string;
  verificadoEm: string;
  caiuEm?: string | null;
};

type ChaveCfg = 'tentativas' | 'intervaloSeg' | 'reavisoHoras';
const LIMITES_PADRAO: Record<ChaveCfg, [number, number]> = { tentativas: [1, 10], intervaloSeg: [10, 120], reavisoHoras: [1, 168] };
const CAMPOS_CFG: { chave: ChaveCfg; rotulo: string; ajuda: string }[] = [
  { chave: 'tentativas', rotulo: 'Tentativas antes de avisar', ajuda: 'Quantas vezes seguidas precisa falhar' },
  { chave: 'intervaloSeg', rotulo: 'Intervalo entre tentativas (segundos)', ajuda: 'Espera entre uma tentativa e outra' },
  { chave: 'reavisoHoras', rotulo: 'Repetir o aviso a cada (horas)', ajuda: 'Se continuar caída, reenvia o e-mail' },
];

const s: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' as const, border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

const VISUAL: Record<Conexao['status'], { rotulo: string; fundo: string; cor: string; borda: string }> = {
  ok: { rotulo: 'Conectado', fundo: 'var(--green-light)', cor: 'var(--green)', borda: '#86efac' },
  erro: { rotulo: 'Com problema', fundo: 'var(--red-light)', cor: 'var(--red)', borda: '#fca5a5' },
  nao_configurado: { rotulo: 'Não configurado', fundo: 'var(--gray-100)', cor: 'var(--gray-500)', borda: 'var(--border)' },
};

function fmt(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function MonitorConexoesPage() {
  const [conexoes, setConexoes] = useState<Conexao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [verificadoEm, setVerificadoEm] = useState('');

  async function verificar() {
    setCarregando(true);
    setErro('');
    try {
      const resp = await fetch(`${API}/monitor-conexoes`, { credentials: 'include' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Erro ao verificar as conexões');
      setConexoes(data.conexoes || []);
      setVerificadoEm(data.verificadoEm || '');
    } catch (e: any) {
      setErro(e.message || 'Erro ao verificar as conexões');
    }
    setCarregando(false);
  }

  useEffect(() => { verificar(); }, []);

  // ---- regras dos alertas por e-mail ----
  const [cfg, setCfg] = useState<Record<ChaveCfg, string>>({ tentativas: '5', intervaloSeg: '60', reavisoHoras: '24' });
  const [limites, setLimites] = useState<Record<ChaveCfg, [number, number]>>(LIMITES_PADRAO);
  const [cfgSalva, setCfgSalva] = useState<Record<ChaveCfg, string> | null>(null);
  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [msgCfg, setMsgCfg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  function aplicarCfg(c: any, l?: any) {
    const novo = { tentativas: String(c.tentativas), intervaloSeg: String(c.intervaloSeg), reavisoHoras: String(c.reavisoHoras) };
    setCfg(novo);
    setCfgSalva(novo);
    if (l) setLimites({ tentativas: l.tentativas, intervaloSeg: l.intervaloSeg, reavisoHoras: l.reavisoHoras });
  }

  useEffect(() => {
    fetch(`${API}/monitor-conexoes/config`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok && d.config) aplicarCfg(d.config, d.limites); })
      .catch(() => { /* usa os valores padrao na tela */ });
  }, []);

  async function salvarCfg() {
    setSalvandoCfg(true);
    setMsgCfg(null);
    try {
      const resp = await fetch(`${API}/monitor-conexoes/config`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tentativas: Number(cfg.tentativas), intervaloSeg: Number(cfg.intervaloSeg), reavisoHoras: Number(cfg.reavisoHoras) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Erro ao salvar');
      aplicarCfg(data.config, data.limites);
      setMsgCfg({ tipo: 'ok', texto: 'Configuração salva.' });
    } catch (e: any) {
      setMsgCfg({ tipo: 'erro', texto: e.message || 'Erro ao salvar' });
    }
    setSalvandoCfg(false);
  }

  const cfgAlterada = !!cfgSalva && (Object.keys(cfg) as ChaveCfg[]).some((k) => cfg[k] !== cfgSalva[k]);
  const nTent = Math.max(1, Number(cfg.tentativas) || 1);
  const intSeg = Math.max(0, Number(cfg.intervaloSeg) || 0);
  const esperaSeg = (nTent - 1) * intSeg;
  const esperaTxt = nTent <= 1 ? 'na hora, na primeira falha' : `cerca de ${esperaSeg >= 120 ? `${Math.round(esperaSeg / 60)} minutos` : `${esperaSeg} segundos`} depois da queda`;

  const comProblema = conexoes.filter((c) => c.status === 'erro').length;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Monitor de Conexões</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            Testa cada integração agora. Se alguma cair de verdade, você recebe um e-mail (verificação automática a cada 30 minutos; regras no fim da página).
          </div>
        </div>
        <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff', opacity: carregando ? 0.6 : 1 }} onClick={verificar} disabled={carregando}>
          {carregando ? 'Verificando...' : 'Testar todas'}
        </button>
      </div>

      <div style={{ padding: 28, display: 'grid', gap: 14, maxWidth: 860 }}>
        {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div>}

        {!carregando && conexoes.length > 0 && (
          <div style={{ fontSize: 13, color: comProblema ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
            {comProblema ? `${comProblema} conexão(ões) com problema` : 'Todas as conexões configuradas estão funcionando'}
            {verificadoEm ? <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}> · verificado em {fmt(verificadoEm)}</span> : null}
          </div>
        )}

        <div style={s.card}>
          {carregando && !conexoes.length ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--gray-500)' }}>Testando as conexões, pode levar alguns segundos...</div>
          ) : conexoes.map((c, i) => {
            const v = VISUAL[c.status];
            return (
              <div key={c.chave} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap', opacity: carregando ? 0.6 : 1 }}>
                <div style={{ minWidth: 170, fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>{c.nome}</div>
                <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: v.fundo, color: v.cor, border: `1px solid ${v.borda}`, whiteSpace: 'nowrap' }}>{v.rotulo}</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 12.5, color: c.status === 'erro' ? 'var(--red)' : 'var(--gray-500)', wordBreak: 'break-word' }}>{c.detalhe}</div>
                  {c.status === 'erro' && c.caiuEm ? <div style={{ fontSize: 11.5, color: 'var(--gray-400)', marginTop: 2 }}>Com problema desde {fmt(c.caiuEm)}</div> : null}
                  {c.aviso ? <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 2 }}>! {c.aviso}</div> : null}
                </div>
                <a href={c.telaConfig} style={{ ...s.btn, padding: '5px 12px', fontSize: 12, textDecoration: 'none', background: c.status === 'ok' ? 'var(--white)' : '#ffe8cc', color: c.status === 'ok' ? 'var(--gray-600)' : '#9a3412', borderColor: c.status === 'ok' ? 'var(--border)' : '#fdba74' }}>
                  {c.status === 'ok' ? 'Abrir config.' : c.status === 'erro' ? 'Reconectar' : 'Configurar'}
                </a>
              </div>
            );
          })}
        </div>

        <div style={{ ...s.card, padding: 18, overflow: 'visible' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>Alertas por e-mail</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.5 }}>
            Quando uma conexão falha, o sistema testa de novo antes de mandar o e-mail. Se alguma tentativa passar, é tratado como falha passageira e nenhum e-mail é enviado.
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            {CAMPOS_CFG.map((c) => (
              <label key={c.chave} style={{ display: 'grid', gap: 5, flex: '1 1 190px', minWidth: 170 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)' }}>{c.rotulo}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={limites[c.chave][0]}
                  max={limites[c.chave][1]}
                  value={cfg[c.chave]}
                  onChange={(e) => { setCfg((prev) => ({ ...prev, [c.chave]: e.target.value })); setMsgCfg(null); }}
                  style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 14, fontFamily: 'Inter, sans-serif', background: 'var(--white)', color: 'var(--gray-800)' }}
                />
                <span style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{c.ajuda} (de {limites[c.chave][0]} a {limites[c.chave][1]})</span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--gray-100)', fontSize: 12.5, color: 'var(--gray-600)', lineHeight: 1.5 }}>
            Com essa configuração, o e-mail chega {esperaTxt}
            {nTent > 1 ? `, depois de ${nTent} tentativas seguidas com erro` : ''}. Se a conexão continuar caída, o lembrete se repete a cada {Number(cfg.reavisoHoras) || 24} hora(s).
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <button style={{ ...s.btn, background: 'var(--ink)', color: '#fff', opacity: salvandoCfg || !cfgAlterada ? 0.6 : 1 }} onClick={salvarCfg} disabled={salvandoCfg || !cfgAlterada}>
              {salvandoCfg ? 'Salvando...' : 'Salvar configuração'}
            </button>
            {msgCfg ? <span style={{ fontSize: 12.5, fontWeight: 600, color: msgCfg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msgCfg.texto}</span> : null}
          </div>
        </div>
      </div>
    </>
  );
}
