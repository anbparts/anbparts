'use client';
import { useState, useRef } from 'react';
import { api } from '@/lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' },
  title:  { fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' },
  sub:    { fontSize: 12, color: 'var(--gray-400)', marginTop: 2 },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

function fmtD(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}

export default function ImportPage() {
  const [log, setLog]         = useState<{msg: string; type: 'info'|'ok'|'err'}[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addLog(msg: string, type: 'info'|'ok'|'err' = 'info') {
    setLog(prev => [...prev, { msg, type }]);
  }

  async function postImport(path: string, data: any[]) {
    const r = await fetch(`${BASE}/import/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
    return r.json();
  }

  async function handleFile(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setLog([]); setDone(false);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (!(window as any).XLSX) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          await new Promise(r => { script.onload = r; document.head.appendChild(script); });
        }
        const XLSX = (window as any).XLSX;
        const wb = XLSX.read(ev.target!.result, { type: 'binary', cellDates: true });

        // ── 1. MOTOS ──────────────────────────────────────────────────────
        addLog('Importando motos...');
        const motosSheet = wb.Sheets['Motos'];
        if (motosSheet) {
          const raw = XLSX.utils.sheet_to_json(motosSheet, { defval: null });
          const motos = raw
            .filter((r: any) => r['ID Moto'] && !isNaN(r['ID Moto']))
            .map((r: any) => ({
              marca:       String(r['Marca'] || '').trim(),
              modelo:      String(r['Modelo'] || '').trim(),
              ano:         r['Ano'] ? Number(r['Ano']) : null,
              precoCompra: Number(r['Preço Compra']) || 0,
            }));
          const res = await postImport('motos', motos);
          addLog(`✓ Motos: ${res.imported} importadas`, 'ok');
        } else addLog('⚠ Aba "Motos" não encontrada', 'err');

        // ── 2. ESTOQUE ────────────────────────────────────────────────────
        addLog('Importando peças...');
        const estoqueSheet = wb.Sheets['Estoque'];
        if (estoqueSheet) {
          const motosDB = await api.motos.list();
          // Mapeia ID do Excel → ID real no banco pela ordem de cadastro
          const motoMap: Record<number, number> = {};
          motosDB.forEach((m: any, i: number) => { motoMap[i + 1] = m.id; });
          // Também mapeia direto pelo ID real (caso IDs do Excel já sejam os IDs do banco)
          motosDB.forEach((m: any) => { motoMap[m.id] = m.id; });

          const raw = XLSX.utils.sheet_to_json(estoqueSheet, { defval: null });
          // Gera ID único por linha: PN0111 (1ª), PN0111-2 (2ª), PN0111-3 (3ª)...
          const skuCount: Record<string, number> = {};
          const pecas = raw
            .filter((r: any) => r['ID Peça'])
            .map((r: any) => {
              const skuBase = String(r['ID Peça']);
              const motoIdExcel = Number(r['ID Moto']);
              skuCount[skuBase] = (skuCount[skuBase] || 0) + 1;
              const idPeca = skuCount[skuBase] === 1 ? skuBase : `${skuBase}-${skuCount[skuBase]}`;
              return {
                motoId:     motoMap[motoIdExcel] ?? motoIdExcel,
                idPeca,
                descricao:  String(r['Descrição Peça'] || ''),
                precoML:    Number(r['Preço ML'])      || 0,
                valorLiq:   Number(r['Valor Líquido']) || 0,
                valorFrete: Number(r['Valor Frete'])   || 0,
                valorTaxas: Number(r['Valor Taxas'])   || 0,
                disponivel: r['Disponível'] === 'Sim',
                cadastro:   fmtD(r['Cadastro'])   || null,
                dataVenda:  fmtD(r['Data Venda']) || null,
              };
            });

          let pecasImported = 0;
          let pecasSkippedInvalidMoto = 0;
          const invalidMotoExamples: string[] = [];
          for (let i = 0; i < pecas.length; i += 200) {
            const batch = pecas.slice(i, i + 200);
            addLog(`Peças... ${Math.min(i + 200, pecas.length)} / ${pecas.length}`);
            const res = await postImport('pecas', batch);
            pecasImported += res.imported;
            pecasSkippedInvalidMoto += res.skippedInvalidMoto || 0;
            if (Array.isArray(res.invalidMotoSamples)) {
              for (const sample of res.invalidMotoSamples) {
                if (invalidMotoExamples.length >= 5) break;
                invalidMotoExamples.push(`${sample.idPeca} (moto ${sample.motoId})`);
              }
            }
          }
          addLog(`✓ Peças: ${pecasImported} importadas`, 'ok');
          if (pecasSkippedInvalidMoto > 0) {
            addLog(`⚠ Peças ignoradas por moto inválida: ${pecasSkippedInvalidMoto}`, 'err');
            if (invalidMotoExamples.length > 0) {
              addLog(`Exemplos: ${invalidMotoExamples.join(', ')}`, 'err');
            }
          }
        } else addLog('⚠ Aba "Estoque" não encontrada', 'err');

        // ── 3. DESPESAS ───────────────────────────────────────────────────
        addLog('Importando despesas...');
        const detSheet = wb.Sheets['Detalhamento'];
        if (detSheet) {
          const raw = XLSX.utils.sheet_to_json(detSheet, { defval: null });
          const rows = raw
            .filter((r: any) => r['Data'] && r['Detalhes'])
            .map((r: any) => ({
              data:      fmtD(r['Data']),
              detalhes:  String(r['Detalhes'] || ''),
              categoria: String(r['Categoria'] || 'Outros'),
              valor:     Number(r['Valor']) || 0,
            }));
          const res = await postImport('despesas', rows);
          addLog(`✓ Despesas: ${res.imported} importadas`, 'ok');
        } else addLog('⚠ Aba "Detalhamento" não encontrada', 'err');

        // ── 4. PREJUÍZOS ──────────────────────────────────────────────────
        addLog('Importando prejuízos...');
        const prejSheet = wb.Sheets['Prejuízos'];
        if (prejSheet) {
          const raw = XLSX.utils.sheet_to_json(prejSheet, { defval: null });
          const rows = raw
            .filter((r: any) => r['Data'] && r['Detalhamento'])
            .map((r: any) => ({
              data:    fmtD(r['Data']),
              detalhe: String(r['Detalhamento'] || ''),
              valor:   Number(r['Valor']) || 0,
              frete:   Number(r['Frete'])  || 0,
            }));
          const res = await postImport('prejuizos', rows);
          addLog(`✓ Prejuízos: ${res.imported} importados`, 'ok');
        } else addLog('⚠ Aba "Prejuízos" não encontrada', 'err');

        // ── 5. INVESTIMENTOS ──────────────────────────────────────────────
        addLog('Importando investimentos...');
        const invSheet = wb.Sheets['Investimento'];
        if (invSheet) {
          const raw = XLSX.utils.sheet_to_json(invSheet, { defval: null });
          const rows = raw
            .filter((r: any) => r['Período'] && r['Detalhes'] && r['Valor'] &&
              ['Bruno', 'Nelson', 'Alex'].includes(String(r['Detalhes']).trim()))
            .map((r: any) => ({
              data:  fmtD(r['Período']),
              socio: String(r['Detalhes']).trim(),
              moto:  r['ID Moto'] ? String(r['ID Moto']) : null,
              valor: Number(r['Valor']) || 0,
            }));
          const res = await postImport('investimentos', rows);
          addLog(`✓ Investimentos: ${res.imported} importados`, 'ok');
        } else addLog('⚠ Aba "Investimento" não encontrada', 'err');

        addLog('🎉 Importação completa!', 'ok');
        setDone(true);
      } catch (err: any) {
        addLog(`❌ Erro: ${err.message}`, 'err');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  }

  return (
    <>
      <div style={cs.topbar}>
        <div><div style={cs.title}>Importar Excel</div><div style={cs.sub}>Migre todos os dados para o banco de dados</div></div>
      </div>
      <div style={{ padding: 28, maxWidth: 620 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Importar planilha ANB</div>
          <p style={{ fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 16 }}>
            Selecione o arquivo <strong>.xlsm</strong> — todas as abas são importadas automaticamente:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { icon: '🏍', label: 'Motos',        sub: 'Aba "Motos"' },
              { icon: '📦', label: 'Estoque',       sub: 'Aba "Estoque"' },
              { icon: '🧾', label: 'Despesas',      sub: 'Aba "Detalhamento"' },
              { icon: '⚠️', label: 'Prejuízos',     sub: 'Aba "Prejuízos"' },
              { icon: '💼', label: 'Investimentos', sub: 'Aba "Investimento"' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 7, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, monospace' }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--amber-light)', border: '1px solid var(--amber-mid)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--amber)', lineHeight: 1.6 }}>
            ⚠ <strong>Motos e Peças</strong> não duplicam — pode reimportar. <strong>Despesas, Prejuízos e Investimentos</strong> são substituídos a cada importação.
          </div>

          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={handleFile} />
          <button
            style={{ ...cs.btn, background: loading ? 'var(--gray-300)' : 'var(--blue-500)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? '⏳ Importando...' : '📥 Selecionar arquivo Excel'}
          </button>
        </div>

        {log.length > 0 && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Log de importação</div>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: l.type === 'ok' ? 'var(--green)' : l.type === 'err' ? 'var(--red)' : 'var(--gray-500)' }}>
                  {l.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {done && (
          <div style={{ marginTop: 16 }}>
            <a href="/" style={{ ...cs.btn, background: 'var(--green)', color: '#fff', textDecoration: 'none', display: 'inline-flex' }}>
              → Ver Dashboard
            </a>
          </div>
        )}
      </div>
    </>
  );
}
