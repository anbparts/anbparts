'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function Field({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
  const display = value != null && value !== '' && value !== 'null' ? String(value) : '—';
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: display === '—' ? 'var(--gray-300)' : 'var(--gray-800)', fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit' }}>{display}</div>
    </div>
  );
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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--gray-400)', fontSize: 14 }}>
      Carregando...
    </div>
  );

  if (erro) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--red)', fontSize: 14 }}>
      {erro}
    </div>
  );

  if (!peca) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', padding: '28px 24px' }}>
      <button
        onClick={() => router.back()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--gray-500)', cursor: 'pointer', marginBottom: 20, background: 'none', border: 'none', padding: 0, fontFamily: 'Inter, sans-serif' }}
      >
        ← Voltar
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--blue-500)', background: 'rgba(59,130,246,.08)', padding: '4px 12px', borderRadius: 7 }}>{peca.idPeca}</span>
        <span style={{ fontSize: 15, color: 'var(--gray-600)' }}>{peca.descricao}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field label="Peso Líquido (kg)" value={peca.pesoLiquido != null ? `${Number(peca.pesoLiquido)} kg` : null} />
        <Field label="Peso Bruto (kg)"   value={peca.pesoBruto   != null ? `${Number(peca.pesoBruto)} kg`   : null} />
        <Field label="Largura (cm)"      value={peca.largura      != null ? `${Number(peca.largura)} cm`      : null} />
        <Field label="Altura (cm)"       value={peca.altura       != null ? `${Number(peca.altura)} cm`       : null} />
        <Field label="Profundidade (cm)" value={peca.profundidade != null ? `${Number(peca.profundidade)} cm` : null} />
        <Field label="Localização"       value={peca.localizacao} />
        <Field label="Número de Peça"    value={peca.numeroPeca} mono />
        <Field label="Etiqueta Detran"   value={peca.detranEtiqueta} mono />
      </div>
    </div>
  );
}
