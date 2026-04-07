'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)' },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--gray-800)', letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--gray-400)', marginTop: 2 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Inter, sans-serif' },
};

function fmtD(value: any): string {
  if (!value) return '';
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function normalizeKey(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getRowValue(row: Record<string, any>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(row || {})) {
    if (normalizedAliases.includes(normalizeKey(key))) return value;
  }
  return null;
}

export default function ImportPage() {
  const [log, setLog] = useState<{ msg: string; type: 'info' | 'ok' | 'err' }[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addLog(msg: string, type: 'info' | 'ok' | 'err' = 'info') {
    setLog((prev) => [...prev, { msg, type }]);
  }

  async function handleFile(event: any) {
    const file = event.target.files?.[0];
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

        addLog('Importando despesas...');
        const despesasSheet = workbook.Sheets.Detalhamento;
        if (despesasSheet) {
          const raw = XLSX.utils.sheet_to_json(despesasSheet, { defval: null });
          const rows = raw
            .filter((row: any) => getRowValue(row, ['Data']) && getRowValue(row, ['Detalhes']))
            .map((row: any) => ({
              data: fmtD(getRowValue(row, ['Data'])),
              detalhes: String(getRowValue(row, ['Detalhes']) || '').trim(),
              categoria: String(getRowValue(row, ['Categoria']) || 'Outros').trim(),
              valor: Number(getRowValue(row, ['Valor'])) || 0,
              chavePix: getRowValue(row, ['Chave PIX', 'Chave Pix']) ? String(getRowValue(row, ['Chave PIX', 'Chave Pix'])).trim() : null,
              codigoBarras: getRowValue(row, ['Codigo de Barras']) ? String(getRowValue(row, ['Codigo de Barras'])).trim() : null,
              observacao: getRowValue(row, ['Observacao']) ? String(getRowValue(row, ['Observacao'])).trim() : null,
            }));
          const result = await api.import.despesas(rows);
          addLog(`OK Despesas: ${result.imported} importadas como pagas`, 'ok');
        } else {
          addLog('Aba "Detalhamento" nao encontrada', 'err');
        }

        addLog('Importando investimentos...');
        const investimentosSheet = workbook.Sheets.Investimento;
        if (investimentosSheet) {
          const raw = XLSX.utils.sheet_to_json(investimentosSheet, { defval: null });
          const rows = raw
            .filter((row: any) => getRowValue(row, ['Periodo']) && getRowValue(row, ['Detalhes']))
            .map((row: any) => ({
              data: fmtD(getRowValue(row, ['Periodo'])),
              socio: String(getRowValue(row, ['Detalhes']) || '').trim(),
              tipo: String(getRowValue(row, ['Tipo', 'ID Moto']) || '').trim(),
              moto: getRowValue(row, ['Moto / Item', 'Moto Item', 'Item']) ? String(getRowValue(row, ['Moto / Item', 'Moto Item', 'Item'])).trim() : null,
              valor: Number(getRowValue(row, ['Valor'])) || 0,
            }))
            .filter((row: any) => row.data && row.socio && row.valor);

          const result = await api.import.investimentos(rows);
          addLog(`OK Investimentos: ${result.imported} importados`, 'ok');
        } else {
          addLog('Aba "Investimento" nao encontrada', 'err');
        }

        addLog('Importacao completa!', 'ok');
        setDone(true);
      } catch (error: any) {
        addLog(`Erro: ${error.message}`, 'err');
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
          <div style={cs.sub}>Migre despesas e investimentos base para o banco</div>
        </div>
      </div>
      <div style={{ padding: 28, maxWidth: 620 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 8 }}>Importar planilha ANB</div>
          <p style={{ fontSize: 13.5, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 16 }}>
            Selecione o arquivo <strong>.xlsm</strong>. No momento, somente as abas abaixo sao importadas:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
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
            <strong>Despesas e Investimentos</strong> sao substituidos a cada importacao. Na carga do Excel, todas as <strong>despesas entram como pagas</strong> usando a data do lancamento como data de pagamento.
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
