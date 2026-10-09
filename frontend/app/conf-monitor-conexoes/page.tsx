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

  const comProblema = conexoes.filter((c) => c.status === 'erro').length;

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)' }}>Monitor de Conexões</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            Testa cada integração agora. Se alguma cair, você recebe um e-mail (verificação automática a cada 30 minutos).
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
      </div>
    </>
  );
}
