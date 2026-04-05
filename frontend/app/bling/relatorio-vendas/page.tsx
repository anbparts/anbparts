'use client';
import { useState, type FormEvent } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const s: any = {
  topbar: {
    height: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  },
  card: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--gray-500)',
    display: 'block',
    marginBottom: 4,
  },
  input: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    padding: '7px 11px',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    color: 'var(--gray-800)',
    width: '100%',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 18px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid transparent',
    fontFamily: 'Inter, sans-serif',
  },
};

type ReportItem = {
  id: number;
  idPeca: string;
  descricao: string;
  dataVenda: string;
  pedidoId: string | null;
  pedidoNum: string;
  motoId: number | null;
  moto: string | null;
  precoML: number;
  valorTaxas: number;
  valorFrete: number;
  valorLiq: number;
};

type PedidoGroup = {
  pedidoNum: string;
  pedidoId: string | null;
  dataVenda: string;
  quantidadeItens: number;
  subtotalPrecoML: number;
  subtotalTaxas: number;
  subtotalFrete: number;
  subtotalValorLiq: number;
  itens: ReportItem[];
};

type TotaisGerais = {
  totalPedidos: number;
  totalItens: number;
  precoML: number;
  valorTaxas: number;
  valorFrete: number;
  valorLiq: number;
};

type RelatorioResponse = {
  ok: boolean;
  filtros: {
    dataDe: string;
    dataAte: string;
    pedido: string;
    idPeca: string;
  };
  totaisGerais: TotaisGerais;
  pedidos: PedidoGroup[];
};

function fmtMoney(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(value: string) {
  if (!value) return '-';

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export default function RelatorioVendasPage() {
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [pedido, setPedido] = useState('');
  const [idPeca, setIdPeca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioResponse | null>(null);

  async function buscarRelatorio() {
    setBuscando(true);
    try {
      const params = new URLSearchParams();
      if (dataDe) params.set('dataDe', dataDe);
      if (dataAte) params.set('dataAte', dataAte);
      if (pedido.trim()) params.set('pedido', pedido.trim());
      if (idPeca.trim()) params.set('idPeca', idPeca.trim().toUpperCase());

      const response = await fetch(`${API}/bling/relatorio-vendas?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        alert(data.error || 'Erro ao consultar relatorio');
        return;
      }

      setRelatorio(data);
      setBuscou(true);
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
    setBuscando(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!buscando) buscarRelatorio();
  }

  function limparFiltros() {
    setDataDe('');
    setDataAte('');
    setPedido('');
    setIdPeca('');
    setRelatorio(null);
    setBuscou(false);
  }

  const totais = relatorio?.totaisGerais || {
    totalPedidos: 0,
    totalItens: 0,
    precoML: 0,
    valorTaxas: 0,
    valorFrete: 0,
    valorLiq: 0,
  };

  return (
    <>
      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' }}>Relatorio de Vendas</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Consulte as vendas registradas no sistema com subtotais por pedido Bling.</div>
        </div>
        {buscou && relatorio && (
          <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <span>{totais.totalPedidos} pedidos</span>
            <span>{totais.totalItens} itens</span>
            <span style={{ color: 'var(--green)' }}>{fmtMoney(totais.valorLiq)} liquido</span>
          </div>
        )}
      </div>

      <div style={{ padding: 28 }}>
        <form style={s.card} onSubmit={handleSubmit}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 14 }}>Filtros do relatorio</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Data da venda - de</label>
              <input style={s.input} type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Data da venda - ate</label>
              <input style={s.input} type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Pedido Bling</label>
              <input style={s.input} value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex: 448" />
            </div>
            <div>
              <label style={s.label}>ID Peca</label>
              <input style={s.input} value={idPeca} onChange={(e) => setIdPeca(e.target.value)} placeholder="Ex: BM01_0001" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" style={{ ...s.btn, background: '#FF6900', color: '#fff', opacity: buscando ? 0.7 : 1 }} disabled={buscando}>
              {buscando ? 'Buscando...' : 'Buscar relatorio'}
            </button>
            <button type="button" style={{ ...s.btn, background: 'var(--white)', color: 'var(--gray-700)', borderColor: 'var(--border)' }} onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>
        </form>

        {relatorio && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Pedidos', value: String(totais.totalPedidos), color: 'var(--gray-800)' },
              { label: 'Itens', value: String(totais.totalItens), color: 'var(--gray-800)' },
              { label: 'Preco ML', value: fmtMoney(totais.precoML), color: 'var(--blue-500)' },
              { label: 'Taxas', value: fmtMoney(totais.valorTaxas), color: 'var(--amber)' },
              { label: 'Frete', value: fmtMoney(totais.valorFrete), color: 'var(--gray-700)' },
              { label: 'Receita liquida', value: fmtMoney(totais.valorLiq), color: 'var(--green)' },
            ].map((card) => (
              <div key={card.label} style={{ ...s.card, padding: 18, marginBottom: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
        )}

        {buscou && relatorio && relatorio.pedidos.length === 0 && (
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>Nenhuma venda integrada encontrada</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Ajuste os filtros e tente novamente.</div>
          </div>
        )}

        {relatorio?.pedidos.map((pedidoGroup) => (
          <div key={pedidoGroup.pedidoNum} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Pedido #{pedidoGroup.pedidoNum}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                  {pedidoGroup.quantidadeItens} item(ns) - Data da venda: {fmtDate(pedidoGroup.dataVenda)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Subtotal do pedido</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(pedidoGroup.subtotalValorLiq)}</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                    {['ID Peca', 'Moto', 'Descricao', 'Data venda', 'Preco ML', 'Taxas', 'Frete', 'Valor liq.'].map((head) => (
                      <th key={head} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pedidoGroup.itens.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--blue-500)', fontWeight: 600, whiteSpace: 'nowrap' }}>{item.idPeca}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{item.moto || '-'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)' }}>{item.descricao}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtDate(item.dataVenda)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-800)', whiteSpace: 'nowrap' }}>{fmtMoney(item.precoML)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtMoney(item.valorTaxas)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(item.valorFrete)}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(item.valorLiq)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <td colSpan={4} style={{ padding: '11px 12px', fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Subtotal do pedido #{pedidoGroup.pedidoNum}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalPrecoML)}</td>
                    <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalTaxas)}</td>
                    <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalFrete)}</td>
                    <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{fmtMoney(pedidoGroup.subtotalValorLiq)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {relatorio && relatorio.pedidos.length > 0 && (
          <div style={{ ...s.card, background: 'linear-gradient(135deg, rgba(25,135,84,.06), rgba(25,135,84,.02))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Total geral do relatorio</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                  {totais.totalPedidos} pedido(s) - {totais.totalItens} item(ns) integrados
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>Preco ML: <strong>{fmtMoney(totais.precoML)}</strong></div>
                <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>Taxas: <strong>{fmtMoney(totais.valorTaxas)}</strong></div>
                <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>Frete: <strong>{fmtMoney(totais.valorFrete)}</strong></div>
                <div style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700 }}>Liquido: {fmtMoney(totais.valorLiq)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
