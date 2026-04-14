'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const s: any = {
  page: { minHeight: '100vh', background: 'var(--gray-50)', padding: '28px 24px' },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 4 },
  value: { fontSize: 15, color: 'var(--gray-800)', fontWeight: 500 },
  valueMono: { fontSize: 14, color: 'var(--blue-500)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 },
  back: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--gray-500)', cursor: 'pointer', marginBottom: 20, background: 'none', border: 'none', padding: 0, fontFamily: 'Inter, sans-serif' },
  badge: (color: string, bg: string) => ({ display: 'inline-block', fontSize: 12, fontWeight: 600, color, background: bg, padding: '3px 10px', borderRadius: 6 }),
};

function Field({ label, value, mono = false, children }: { label: string; value?: any; mono?: boolean; children?: React.ReactNode }) {
  const display = value != null && value !== '' ? value : '—';
  return (
    <div>
      <label style={s.label}>{label}</label>
      {children || <span style={mono ? s.valueMono : s.value}>{display}</span>}
    </div>
  );
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function fmtMoney(v?: any) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PecaDetalhe() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');
  const [peca, setPeca] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!id) { setErro('ID não informado'); setLoading(false); return; }
    api.pecas.get(Number(id))
      .then(setPeca)
      .catch(() => setErro('Peça não encontrada'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>Carregando...</div>;
  if (erro) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>{erro}</div>;
  if (!peca) return null;

  const disponivel = peca.disponivel && !peca.emPrejuizo;

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => router.back()}>← Voltar ao Estoque</button>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--blue-500)' }}>{peca.idPeca}</span>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)', flex: 1 }}>{peca.descricao}</span>
        {peca.emPrejuizo
          ? <span style={s.badge('#b91c1c', '#fef2f2')}>Prejuízo</span>
          : disponivel
            ? <span style={s.badge('var(--green)', '#f0fdf4')}>Em estoque</span>
            : <span style={s.badge('var(--gray-500)', 'var(--gray-100)')}>Vendida</span>}
      </div>

      {/* Identificação */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 16 }}>Identificação</div>
        <div style={s.grid}>
          <Field label="ID Peça / SKU" value={peca.idPeca} mono />
          <Field label="Moto" value={peca.moto ? `${peca.moto.marca} ${peca.moto.modelo}` : `ID ${peca.motoId}`} />
          <Field label="Descrição" value={peca.descricao} />
          <Field label="Número de Peça" value={peca.numeroPeca} mono />
        </div>
      </div>

      {/* Dimensões e Peso */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 16 }}>Dimensões e Peso</div>
        <div style={s.grid}>
          <Field label="Peso Líquido (kg)" value={peca.pesoLiquido != null ? `${Number(peca.pesoLiquido)} kg` : null} />
          <Field label="Peso Bruto (kg)" value={peca.pesoBruto != null ? `${Number(peca.pesoBruto)} kg` : null} />
          <Field label="Largura (cm)" value={peca.largura != null ? `${Number(peca.largura)} cm` : null} />
          <Field label="Altura (cm)" value={peca.altura != null ? `${Number(peca.altura)} cm` : null} />
          <Field label="Profundidade (cm)" value={peca.profundidade != null ? `${Number(peca.profundidade)} cm` : null} />
        </div>
      </div>

      {/* Localização e Detran */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 16 }}>Localização e Documentação</div>
        <div style={s.grid}>
          <Field label="Localização" value={peca.localizacao} />
          <Field label="Etiqueta Detran">
            {peca.detranEtiqueta
              ? <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: peca.detranBaixada ? 'var(--gray-400)' : 'var(--green)', fontWeight: 600 }}>
                  {peca.detranEtiqueta}
                  {peca.detranBaixada && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)' }}>(Baixada em {fmtDate(peca.detranBaixadaAt)})</span>}
                </span>
              : <span style={s.value}>—</span>}
          </Field>
        </div>
      </div>

      {/* Mercado Livre */}
      {(peca.mercadoLivreLink || peca.mercadoLivreItemId) && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 16 }}>Mercado Livre</div>
          <div style={s.grid}>
            <Field label="Item ID" value={peca.mercadoLivreItemId} mono />
            <Field label="Link do Anúncio">
              {peca.mercadoLivreLink
                ? <a href={peca.mercadoLivreLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--blue-500)', wordBreak: 'break-all' }}>
                    🛒 Ver anúncio no ML
                  </a>
                : <span style={s.value}>—</span>}
            </Field>
          </div>
        </div>
      )}

      {/* Financeiro */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 16 }}>Financeiro</div>
        <div style={s.grid}>
          <Field label="Preço ML" value={fmtMoney(peca.precoML)} />
          <Field label="Frete" value={fmtMoney(peca.valorFrete)} />
          <Field label="Taxa ML" value={fmtMoney(peca.valorTaxas)} />
          <Field label="Valor Líquido"><span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{fmtMoney(peca.valorLiq)}</span></Field>
        </div>
      </div>

      {/* Status de venda */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 16 }}>Status</div>
        <div style={s.grid}>
          <Field label="Cadastro" value={fmtDate(peca.cadastro)} />
          <Field label="Data Venda" value={fmtDate(peca.dataVenda)} />
          <Field label="Pedido Bling" value={peca.blingPedidoNum || peca.blingPedidoId} mono />
          {peca.emPrejuizo && peca.prejuizo && (
            <>
              <Field label="Motivo Prejuízo" value={peca.prejuizo.motivo} />
              <Field label="Valor Prejuízo" value={fmtMoney(peca.prejuizo.valor)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
