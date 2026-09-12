'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canProcessAction } from '@/lib/permissions';

function fmt(value: any) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(value: any) {
  if (!value) return '-';
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const s: any = {
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent' },
  th: { fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '9px 12px', textAlign: 'left' as const, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const },
  td: { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid var(--gray-100)', verticalAlign: 'middle' as const },
};

export default function SucataPage() {
  const { user } = useAuth();
  const canGerarTexto = canProcessAction(user, 'sucata', 'gerar_texto');

  const [aba, setAba] = useState<'pendente' | 'vendida'>('pendente');
  const [loading, setLoading] = useState(true);
  const [pecas, setPecas] = useState<any[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [copiado, setCopiado] = useState(false);

  function load(abaAtual: 'pendente' | 'vendida') {
    setLoading(true);
    api.sucata.list(abaAtual)
      .then((data) => setPecas(Array.isArray(data?.pecas) ? data.pecas : []))
      .catch(() => setPecas([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setSelecionadas(new Set());
    load(aba);
  }, [aba]);

  function toggleSelecionada(id: number) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodas() {
    setSelecionadas((prev) => (prev.size === pecas.length ? new Set() : new Set(pecas.map((p) => p.id))));
  }

  async function copiarTexto() {
    const escolhidas = pecas.filter((p) => selecionadas.has(p.id));
    if (!escolhidas.length) return;
    const texto = escolhidas.map((p) => `${p.idPeca} - ${p.descricao}`).join(' / ');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert('Não foi possível copiar. Selecione e copie manualmente.');
    }
  }

  const totalSelecionado = pecas.filter((p) => selecionadas.has(p.id)).reduce((sum, p) => sum + Number(p.precoML || 0), 0);

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}>Sucata</div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Peças de sucata cadastradas via Pré-Cadastro</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setAba('pendente')}
            style={{ ...s.btn, background: aba === 'pendente' ? 'var(--gray-800)' : 'var(--white)', color: aba === 'pendente' ? '#fff' : 'var(--ink)', borderColor: 'var(--border)' }}
          >
            Sucatas Pendentes
          </button>
          <button
            onClick={() => setAba('vendida')}
            style={{ ...s.btn, background: aba === 'vendida' ? 'var(--gray-800)' : 'var(--white)', color: aba === 'vendida' ? '#fff' : 'var(--ink)', borderColor: 'var(--border)' }}
          >
            Vendidas
          </button>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        {aba === 'pendente' && (
          <div style={{ ...s.card, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              {selecionadas.size} selecionada(s){selecionadas.size > 0 ? ` · ${fmt(totalSelecionado)}` : ''}
            </div>
            {canGerarTexto && (
              <button
                onClick={copiarTexto}
                disabled={!selecionadas.size}
                style={{ ...s.btn, background: 'var(--blue-500)', color: '#fff', opacity: selecionadas.size ? 1 : 0.5 }}
              >
                {copiado ? '✅ Copiado!' : '📋 Copiar texto p/ pedido/NF'}
              </button>
            )}
          </div>
        )}

        <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>Carregando...</div>
          ) : !pecas.length ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              {aba === 'pendente' ? 'Nenhuma sucata pendente.' : 'Nenhuma sucata vendida ainda.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--gray-50)' }}>
                  <tr>
                    {aba === 'pendente' && (
                      <th style={{ ...s.th, width: 36 }}>
                        <input type="checkbox" checked={selecionadas.size === pecas.length} onChange={toggleTodas} style={{ cursor: 'pointer' }} />
                      </th>
                    )}
                    <th style={s.th}>SKU</th>
                    <th style={s.th}>Descrição</th>
                    <th style={s.th}>Moto</th>
                    <th style={s.th}>Valor</th>
                    {aba === 'vendida' && (<>
                      <th style={s.th}>Data Venda</th>
                      <th style={s.th}>Pedido Bling</th>
                    </>)}
                  </tr>
                </thead>
                <tbody>
                  {pecas.map((p) => (
                    <tr key={p.id}>
                      {aba === 'pendente' && (
                        <td style={s.td}>
                          <input type="checkbox" checked={selecionadas.has(p.id)} onChange={() => toggleSelecionada(p.id)} style={{ cursor: 'pointer' }} />
                        </td>
                      )}
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace', fontWeight: 600 }}>{p.idPeca}</td>
                      <td style={s.td}>{p.descricao}</td>
                      <td style={{ ...s.td, color: 'var(--ink-muted)' }}>{p.moto ? `${p.moto.marca} ${p.moto.modelo}` : '-'}</td>
                      <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace' }}>{fmt(p.precoML)}</td>
                      {aba === 'vendida' && (<>
                        <td style={s.td}>{fmtData(p.dataVenda)}</td>
                        <td style={{ ...s.td, fontFamily: 'Geist Mono, monospace' }}>{p.blingPedidoNum || '-'}</td>
                      </>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
