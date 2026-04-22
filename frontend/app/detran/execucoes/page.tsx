'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { detranShell as ds, formatDetranDate, formatDetranFlow, getDetranStatusMeta } from '@/lib/detran-ui';

export default function DetranExecucoesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.detran.execucoes({
          status,
          search,
          limit: 100,
        });
        if (!active) return;
        setItems(response.execucoes || []);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Nao foi possivel carregar as execucoes do Detran.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [status, search]);

  async function handleDelete(id: number) {
    if (!confirm('Excluir esta execucao de teste do modulo Detran?')) return;
    try {
      await api.detran.deleteExecucao(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err.message || 'Nao foi possivel excluir a execucao.');
    }
  }

  return (
    <>
      <div style={{ ...ds.topbar, padding: isPhone ? '0 14px' : ds.topbar.padding }}>
        <div>
          <div style={ds.title}>Execucoes</div>
          <div style={ds.sub}>Historico funcional das rodadas da POC Detran dentro do ANB</div>
        </div>
        <Link href="/detran/peca-avulsa" style={{ ...ds.btn, background: 'var(--blue-500)', color: '#fff' }}>
          Nova execucao
        </Link>
      </div>

      <div style={{ padding: isPhone ? 14 : 28, display: 'grid', gap: 18 }}>
        {error ? <div style={{ ...ds.card, padding: 18, color: 'var(--red)' }}>{error}</div> : null}

        <div style={ds.card}>
          <div style={ds.sectionHead}>
            <div style={ds.sectionTitle}>Filtros</div>
            <div style={ds.sectionSub}>Busque por placa, renavam, cartela, etiqueta ou runId</div>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '220px 1fr', gap: 12 }}>
            <select style={ds.input} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="executando">Executando</option>
              <option value="sucesso">Sucesso</option>
              <option value="erro">Erro</option>
              <option value="cancelada">Cancelada</option>
            </select>
            <input style={ds.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar execucoes..." />
          </div>
        </div>

        <div style={ds.card}>
          <div style={ds.sectionHead}>
            <div style={ds.sectionTitle}>Lista de execucoes</div>
            <div style={ds.sectionSub}>{loading ? 'Carregando...' : `${items.length} execucao(oes) encontradas`}</div>
          </div>

          {isPhone ? (
            <div style={{ padding: 14, display: 'grid', gap: 12 }}>
              {items.map((item) => {
                const statusMeta = getDetranStatusMeta(item.status);
                return (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>{item.runId}</div>
                      <span style={{ ...ds.btn, ...statusMeta, padding: '4px 10px', borderRadius: 999, cursor: 'default' }}>{statusMeta.label}</span>
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 13 }}>
                      <div><strong>Fluxo:</strong> {formatDetranFlow(item.flow)}</div>
                      <div><strong>Veiculo:</strong> {item.placa || item.renavam || item.chassi || '-'}</div>
                      <div><strong>Tipo:</strong> {item.tipoPeca || '-'}</div>
                      <div><strong>Criada:</strong> {formatDetranDate(item.createdAt)}</div>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/detran/logs/${item.id}`} style={{ ...ds.btn, background: 'var(--ink)', color: '#fff' }}>Logs</Link>
                      <button onClick={() => handleDelete(item.id)} style={{ ...ds.btn, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5' }}>Excluir</button>
                    </div>
                  </div>
                );
              })}
              {!loading && !items.length ? <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Nenhuma execucao encontrada.</div> : null}
            </div>
          ) : (
            <div style={ds.tableWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Run ID', 'Fluxo', 'Status', 'Veiculo', 'Tipo Peca', 'Criada em', 'Acoes'].map((head) => (
                      <th key={head} style={ds.th}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const statusMeta = getDetranStatusMeta(item.status);
                    return (
                      <tr key={item.id}>
                        <td style={{ ...ds.td, ...ds.mono, color: 'var(--blue-500)' }}>{item.runId}</td>
                        <td style={ds.td}>{formatDetranFlow(item.flow)}</td>
                        <td style={ds.td}>
                          <span style={{ ...ds.btn, ...statusMeta, padding: '4px 10px', borderRadius: 999, cursor: 'default' }}>{statusMeta.label}</span>
                        </td>
                        <td style={ds.td}>{item.placa || item.renavam || item.chassi || '-'}</td>
                        <td style={ds.td}>{item.tipoPeca || '-'}</td>
                        <td style={ds.td}>{formatDetranDate(item.createdAt)}</td>
                        <td style={ds.td}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Link href={`/detran/logs/${item.id}`} style={{ ...ds.btn, background: 'var(--ink)', color: '#fff', padding: '6px 10px' }}>
                              Logs
                            </Link>
                            <button onClick={() => handleDelete(item.id)} style={{ ...ds.btn, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', padding: '6px 10px' }}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !items.length ? (
                    <tr>
                      <td colSpan={7} style={{ ...ds.td, textAlign: 'center', color: 'var(--ink-muted)', borderBottom: 'none' }}>
                        Nenhuma execucao encontrada.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
