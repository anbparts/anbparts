'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PrejuizosPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.financeiro.prejuizos.list();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalValor = rows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
  const totalFrete = rows.reduce((sum, row) => sum + (Number(row.frete) || 0), 0);
  const total = totalValor + totalFrete;

  async function reativar(row: any) {
    const label = row.idPeca ? `a peça ${row.idPeca}` : 'este prejuízo';
    if (!confirm(`Remover ${label} do prejuízo e reativar no estoque?`)) return;

    setBusyId(row.id);
    try {
      await api.financeiro.prejuizos.delete(row.id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Prejuízos</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Peças bloqueadas por problema, extravio ou restrição de revenda.</div>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { l: 'Total prejuízos', v: total, c: 'var(--red)', isFmt: true },
            { l: 'Valor peças', v: totalValor, c: 'var(--amber)', isFmt: true },
            { l: 'Frete', v: totalFrete, c: 'var(--gray-600)', isFmt: true },
            { l: 'Ocorrências', v: rows.length, c: 'var(--gray-800)', isFmt: false },
          ].map((card) => (
            <div key={card.l} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--gray-400)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 8 }}>{card.l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.c, letterSpacing: '-0.4px' }}>{card.isFmt ? fmt(card.v as number) : card.v}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>
            Relatório de prejuízos <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>— {rows.length}</span>
          </div>

          {loading ? (
            <div style={{ padding: 28, color: 'var(--gray-400)', fontSize: 13 }}>Carregando...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Data', 'ID Moto', 'SKU Moto', 'ID Peça', 'Peça', 'Motivo', 'Valor peça', 'Frete', 'Total', ''].map((header) => (
                      <th key={header} style={{ padding: '9px 16px', textAlign: ['Valor peça', 'Frete', 'Total'].includes(header) ? 'right' : 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 500, whiteSpace: 'nowrap' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{new Date(row.data).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{row.idMoto ? `#${row.idMoto}` : '-'}</td>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--blue-500)' }}>{row.skuMoto || '-'}</td>
                      <td style={{ padding: '9px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-700)' }}>{row.idPeca || '-'}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-700)', minWidth: 240 }}>{row.descricaoPeca || row.detalhe}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--gray-700)' }}>{row.motivo || '-'}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{fmt(Number(row.valor) || 0)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--gray-600)' }}>{fmt(Number(row.frete) || 0)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{fmt((Number(row.valor) || 0) + (Number(row.frete) || 0))}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => reativar(row)}
                          disabled={busyId === row.id}
                          style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: 'var(--blue-500)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {busyId === row.id ? '...' : row.idPeca ? 'Reativar' : 'Excluir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={10} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                        Nenhum prejuízo registrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
