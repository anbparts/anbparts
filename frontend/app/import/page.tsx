'use client';
import { useState, useRef } from 'react';
import { api } from '@/lib/api';

declare const XLSX: any;

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' },
  title:  { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
};

export default function ImportPage() {
  const [status, setStatus]   = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setStatus('Lendo arquivo Excel...'); setDone(false);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // Load XLSX dynamically
        if (typeof XLSX === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          await new Promise(r => { script.onload = r; document.head.appendChild(script); });
        }

        const wb = (window as any).XLSX.read(ev.target!.result, { type: 'binary', cellDates: true });

        // Parse motos
        setStatus('Importando motos...');
        const motosSheet = wb.Sheets['Motos'];
        let motosImported = 0;
        if (motosSheet) {
          const raw = (window as any).XLSX.utils.sheet_to_json(motosSheet, { defval: null });
          const motos = raw
            .filter((r: any) => r['ID Moto'] && !isNaN(r['ID Moto']))
            .map((r: any) => ({
              marca:       String(r['Marca'] || '').trim(),
              modelo:      String(r['Modelo'] || '').trim(),
              ano:         r['Ano'] ? Number(r['Ano']) : null,
              precoCompra: Number(r['Preço Compra']) || 0,
            }));
          if (motos.length) {
            const res = await api.import.motos(motos);
            motosImported = res.imported;
          }
        }

        // Parse pecas
        setStatus('Importando peças (pode demorar)...');
        const estoqueSheet = wb.Sheets['Estoque'];
        let pecasImported = 0;
        if (estoqueSheet) {
          // get moto list to map by sequence
          const motosDB = await api.motos.list();
          const motoMap: Record<number, number> = {};
          motosDB.forEach((m: any, i: number) => { motoMap[i + 1] = m.id; });

          const raw = (window as any).XLSX.utils.sheet_to_json(estoqueSheet, { defval: null });
          const pecas = raw
            .filter((r: any) => r['ID Peça'])
            .map((r: any) => ({
              motoId:     motoMap[Number(r['ID Moto'])] || 1,
              idPeca:     String(r['ID Peça']),
              descricao:  String(r['Descrição Peça'] || ''),
              precoML:    Number(r['Preço ML']) || 0,
              valorLiq:   Number(r['Valor Líquido']) || 0,
              valorFrete: Number(r['Valor Frete']) || 0,
              valorTaxas: Number(r['Valor Taxas']) || 0,
              disponivel: r['Disponível'] === 'Sim',
              cadastro:   r['Cadastro'] instanceof Date ? r['Cadastro'].toISOString().split('T')[0] : null,
              dataVenda:  r['Data Venda'] instanceof Date ? r['Data Venda'].toISOString().split('T')[0] : null,
            }));

          // import in batches of 200
          for (let i = 0; i < pecas.length; i += 200) {
            const batch = pecas.slice(i, i + 200);
            setStatus(`Importando peças... ${i + batch.length} / ${pecas.length}`);
            const res = await api.import.pecas(batch);
            pecasImported += res.imported;
          }
        }

        setStatus(`✅ Importação concluída! ${motosImported} motos e ${pecasImported} peças importadas.`);
        setDone(true);
      } catch (err: any) {
        setStatus(`❌ Erro: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  }

  return (
    <>
      <div style={cs.topbar}>
        <div><div style={cs.title}>Importar Excel</div><div style={cs.sub}>Migre seus dados do Excel para o banco de dados</div></div>
      </div>
      <div style={{ padding: 28, maxWidth: 560 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Importar planilha ANB</div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            Selecione o arquivo <strong style={{ color: 'var(--ink-soft)' }}>.xlsx / .xlsm</strong> com as abas <strong style={{ color: 'var(--ink-soft)' }}>Motos</strong> e <strong style={{ color: 'var(--ink-soft)' }}>Estoque</strong>. Os dados serão importados para o banco de dados.
          </p>

          <div style={{ background: 'var(--amber-light)', border: '1px solid var(--amber-mid)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--amber)' }}>
            ⚠ Execute a importação apenas uma vez. Para reimportar, as duplicatas serão ignoradas (upsert por ID de peça).
          </div>

          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={handleFile} />

          <button
            style={{ ...cs.btn, background: loading ? 'var(--gray-300)' : 'var(--ink)', color: 'var(--white)', cursor: loading ? 'not-allowed' : 'pointer' }}
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? '⏳ Importando...' : '📥 Selecionar arquivo Excel'}
          </button>

          {status && (
            <div style={{ marginTop: 18, padding: '12px 16px', background: done ? 'var(--sage-light)' : 'var(--gray-50)', border: `1px solid ${done ? 'var(--sage-mid)' : 'var(--border)'}`, borderRadius: 8, fontSize: 13, fontFamily: 'Geist Mono, monospace', color: done ? 'var(--sage)' : 'var(--ink-muted)' }}>
              {status}
            </div>
          )}

          {done && (
            <div style={{ marginTop: 12 }}>
              <a href="/" style={{ ...cs.btn, background: 'var(--sage)', color: 'var(--white)', textDecoration: 'none', display: 'inline-flex' }}>
                → Ver Dashboard
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
