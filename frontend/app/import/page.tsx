'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--gray-400)', marginTop: 2 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

function fmtD(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}

export default function ImportPage() {
  const [log, setLog] = useState<{ msg: string; type: 'info' | 'ok' | 'err' }[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addLog(msg: string, type: 'info' | 'ok' | 'err' = 'info') {
    setLog((prev) => [...prev, { msg, type }]);
  }

  async function postImport(path: string, data: any[]) {
    const response = await fetch(`${BASE}/import/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  }

  async function handleFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLog([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (!(window as any).XLSX) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          await new Promise((resolve) => {
            script.onload = resolve;
            document.head.appendChild(script);
          });
        }

        const XLSX = (window as any).XLSX;
        const workbook = XLSX.read(ev.target!.result, { type: 'binary', cellDates: true });

        addLog('Importando motos...');
        const motosSheet = workbook.Sheets.Motos;
        if (motosSheet) {
          const raw = XLSX.utils.sheet_to_json(motosSheet, { defval: null });
          const motos = raw
            .filter((row: any) => row['ID Moto'] && !isNaN(row['ID Moto']))
            .map((row: any) => ({
              marca: String(row.Marca || '').trim(),
              modelo: String(row.Modelo || '').trim(),
              ano: row.Ano ? Number(row.Ano) : null,
              precoCompra: Number(row['Preço Compra']) || 0,
            }));
          const result = await postImport('motos', motos);
          addLog(`OK Motos: ${result.imported} importadas`, 'ok');
        } else {
          addLog('Aba "Motos" nao encontrada', 'err');
        }

        addLog('Importando pecas...');
        const estoqueSheet = workbook.Sheets.Estoque;
        if (estoqueSheet) {
          const motosDB = await api.motos.list();
          const motoMap: Record<number, number> = {};
          motosDB.forEach((m: any, index: number) => { motoMap[index + 1] = m.id; });
          motosDB.forEach((m: any) => { motoMap[m.id] = m.id; });

          const raw = XLSX.utils.sheet_to_json(estoqueSheet, { defval: null });
          const skuCount: Record<string, number> = {};
          const pecas = raw
            .filter((row: any) => row['ID Peça'])
            .map((row: any) => {
              const skuBase = String(row['ID Peça']);
              const motoIdExcel = Number(row['ID Moto']);
              skuCount[skuBase] = (skuCount[skuBase] || 0) + 1;
              const idPeca = skuCount[skuBase] === 1 ? skuBase : `${skuBase}-${skuCount[skuBase]}`;

              return {
                motoId: motoMap[motoIdExcel] ?? motoIdExcel,
                idPeca,
                descricao: String(row['Descrição Peça'] || ''),
                precoML: Number(row['Preço ML']) || 0,
                valorLiq: Number(row['Valor Líquido']) || 0,
                valorFrete: Number(row['Valor Frete']) || 0,
                valorTaxas: Number(row['Valor Taxas']) || 0,
                disponivel: row['Disponível'] === 'Sim',
                cadastro: fmtD(row.Cadastro) || null,
                dataVenda: fmtD(row['Data Venda']) || null,
              };
            });

          let pecasImported = 0;
          let pecasSkippedInvalidMoto = 0;
          const invalidMotoExamples: string[] = [];
          for (let i = 0; i < pecas.length; i += 200) {
            const batch = pecas.slice(i, i + 200);
            addLog(`Pecas... ${Math.min(i + 200, pecas.length)} / ${pecas.length}`);
            const result = await postImport('pecas', batch);
            pecasImported += result.imported;
            pecasSkippedInvalidMoto += result.skippedInvalidMoto || 0;
            if (Array.isArray(result.invalidMotoSamples)) {
              for (const sample of result.invalidMotoSamples) {
                if (invalidMotoExamples.length >= 5) break;
                invalidMotoExamples.push(`${sample.idPeca} (moto ${sample.motoId})`);
              }
            }
          }

          addLog(`OK Pecas: ${pecasImported} importadas`, 'ok');
          if (pecasSkippedInvalidMoto > 0) {
            addLog(`Pecas ignoradas por moto invalida: ${pecasSkippedInvalidMoto}`, 'err');
            if (invalidMotoExamples.length > 0) addLog(`Exemplos: ${invalidMotoExamples.join(', ')}`, 'err');
          }
        } else {
          addLog('Aba "Estoque" nao encontrada', 'err');
        }

        addLog('Importando despesas...');
        const despesasSheet = workbook.Sheets.Detalhamento;
        if (despesasSheet) {
          const raw = XLSX.utils.sheet_to_json(despesasSheet, { defval: null });
          const rows = raw
            .filter((row: any) => row['Data'] && row['Detalhes'])
            .map((row: any) => ({
              data: fmtD(row['Data']),
              detalhes: String(row['Detalhes'] || ''),
              categoria: String(row['Categoria'] || 'Outros'),
              valor: Number(row['Valor']) || 0,
            }));
          const result = await postImport('despesas', rows);
          addLog(`OK Despesas: ${result.imported} importadas`, 'ok');
        } else {
          addLog('Aba "Detalhamento" nao encontrada', 'err');
        }

        addLog('Importando investimentos...');
        const investimentosSheet = workbook.Sheets.Investimento;
        if (investimentosSheet) {
          const raw = XLSX.utils.sheet_to_json(investimentosSheet, { defval: null });
          const rows = raw
            .filter((row: any) => row['Período'] && row['Detalhes'] && row['Valor'] && ['Bruno', 'Nelson', 'Alex'].includes(String(row['Detalhes']).trim()))
            .map((row: any) => ({
              data: fmtD(row['Período']),
              socio: String(row['Detalhes']).trim(),
              moto: row['ID Moto'] ? String(row['ID Moto']) : null,
              valor: Number(row['Valor']) || 0,
            }));
          const result = await postImport('investimentos', rows);
          addLog(`OK Investimentos: ${result.imported} importados`, 'ok');
        } else {
          addLog('Aba "Investimento" nao encontrada', 'err');
        }

        addLog('Importacao completa!', 'ok');
        setDone(true);
      } catch (err: any) {
        addLog(`Erro: ${err.message}`, 'err');
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  }

  return (
    <>
      <div style={cs.topbar}>
        <div>
          <div style={cs.title}>Importar Excel</div>
          <div style={cs.sub}>Migre os dados base para o banco</div>
        </div>
      </div>
      <div style={{ padding: 28, maxWidth: 620 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Importar planilha ANB</div>
          <p style={{ fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 16 }}>
            Selecione o arquivo <strong>.xlsm</strong>. As abas abaixo sao importadas automaticamente:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { icon: 'M', label: 'Motos', sub: 'Aba "Motos"' },
              { icon: 'E', label: 'Estoque', sub: 'Aba "Estoque"' },
              { icon: 'D', label: 'Despesas', sub: 'Aba "Detalhamento"' },
              { icon: 'I', label: 'Investimentos', sub: 'Aba "Investimento"' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 7, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 16, fontFamily: 'Geist Mono, monospace' }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', fontFamily: 'JetBrains Mono, monospace' }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--amber-light)', border: '1px solid var(--amber-mid)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--amber)', lineHeight: 1.6 }}>
            <strong>Motos e Pecas</strong> nao duplicam. <strong>Despesas e Investimentos</strong> sao substituidos a cada importacao. <strong>Prejuizos</strong> agora sao controlados pela tela de Estoque.
          </div>

          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={handleFile} />
          <button
            style={{ ...cs.btn, background: loading ? 'var(--gray-300)' : 'var(--blue-500)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? 'Importando...' : 'Selecionar arquivo Excel'}
          </button>
        </div>

        {log.length > 0 && (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Log de importacao</div>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {log.map((item, index) => (
                <div key={index} style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: item.type === 'ok' ? 'var(--green)' : item.type === 'err' ? 'var(--red)' : 'var(--gray-500)' }}>
                  {item.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {done && (
          <div style={{ marginTop: 16 }}>
            <a href="/" style={{ ...cs.btn, background: 'var(--green)', color: '#fff', textDecoration: 'none', display: 'inline-flex' }}>
              Ver Dashboard
            </a>
          </div>
        )}
      </div>
    </>
  );
}
