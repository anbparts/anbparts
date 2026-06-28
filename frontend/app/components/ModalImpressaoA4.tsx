'use client';

import { useState, type CSSProperties } from 'react';
import { printSkuLabelsA4, type SkuEtiquetaPrintItem } from '@/lib/estoque-label-print';

// Modal compartilhado de impressão A4 (folha de 21 etiquetas: 3 colunas x 7 linhas).
// O usuário clica na célula onde quer começar (folha nova = C1 L1, ou reaproveita uma sobra).
// Preenche coluna a coluna; o excedente vai para folhas adicionais.
export default function ModalImpressaoA4({
  etiquetas,
  onClose,
}: {
  etiquetas: SkuEtiquetaPrintItem[];
  onClose: () => void;
}) {
  const [start, setStart] = useState(0);
  const [imprimindo, setImprimindo] = useState(false);

  const total = etiquetas.length;
  const cabemNaPrimeira = 21 - start;
  const sobra = Math.max(0, total - cabemNaPrimeira);
  const folhas = total === 0 ? 0 : 1 + Math.ceil(sobra / 21);

  const pos = (om: number) => `C${Math.floor(om / 7) + 1} L${(om % 7) + 1}`;

  // Células em ordem visual (linha a linha) para o grid; cada uma sabe seu índice coluna-a-coluna (om).
  const cells: number[] = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) cells.push(col * 7 + row);

  async function imprimir() {
    if (!total) return;
    setImprimindo(true);
    try {
      await printSkuLabelsA4(etiquetas, start);
      onClose();
    } catch (e: any) {
      alert(e?.message || 'Erro ao gerar etiquetas A4.');
    }
    setImprimindo(false);
  }

  const cellBase: CSSProperties = {
    height: 52, borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2, padding: 3, fontFamily: 'Inter, sans-serif',
    border: '1px dashed var(--border)', background: 'transparent', textAlign: 'center', overflow: 'hidden',
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(2,6,23,.28)', border: '1px solid var(--border)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-800)' }}>Impressão A4 — 21 etiquetas/folha</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Clique na célula onde começar (folha nova ou reaproveitando sobra)</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--gray-500)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--gray-100)', border: '1px solid var(--border)' }} />já usada</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#eff6ff', border: '1px solid #93c5fd' }} />vai imprimir</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'transparent', border: '1px dashed var(--border)' }} />vazia</span>
            </div>
            <button onClick={() => setStart(0)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: start === 0 ? 'var(--gray-800)' : 'var(--white)', color: start === 0 ? '#fff' : 'var(--gray-700)' }}>
              📄 Folha nova
            </button>
          </div>

          <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 12 }}>
            <b style={{ color: 'var(--gray-800)' }}>{total} etiqueta(s)</b> · começa em <b style={{ color: 'var(--blue-600)' }}>{pos(start)}</b>
            {sobra > 0 && <> · <span style={{ color: '#c2410c' }}>{sobra} vão para outra folha</span></>}
            {folhas > 1 && <> · <b>{folhas} folhas</b></>}
          </div>

          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', textAlign: 'center', marginBottom: 8 }}>A4 · 3 colunas × 7 linhas · preenche coluna a coluna</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {cells.map((om) => {
                const rel = om - start;
                const usada = om < start;
                const filled = !usada && rel < total;
                const st: CSSProperties = usada
                  ? { ...cellBase, background: 'var(--gray-100)', borderStyle: 'solid', borderColor: 'var(--border)' }
                  : filled
                    ? { ...cellBase, background: '#eff6ff', border: '1px solid #93c5fd' }
                    : cellBase;
                return (
                  <button key={om} onClick={() => setStart(om)} style={st} title={`Começar em ${pos(om)}`}>
                    {usada ? (
                      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>usada</span>
                    ) : filled ? (
                      <>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-600)', fontFamily: 'Geist Mono, monospace', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etiquetas[rel].sku}</span>
                        <span style={{ fontSize: 10, color: '#2563eb', opacity: .7 }}>{pos(om)}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--gray-300)' }}>{pos(om)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-600)' }}>Cancelar</button>
          <button onClick={imprimir} disabled={imprimindo || !total}
            style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#16a34a', color: '#fff', opacity: (imprimindo || !total) ? .7 : 1 }}>
            {imprimindo ? 'Gerando...' : `🖨️ Imprimir ${folhas > 1 ? `${folhas} folhas` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
