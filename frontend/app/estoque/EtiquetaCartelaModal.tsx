'use client';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

const DETRAN_TIPOS = [
  'Balança', 'Banco', 'Bengala direita', 'Bengala esquerda', 'Bloco do motor',
  'Cabeçote', 'Carburador', 'Carenagem direita', 'Carenagem esquerda',
  'Carenagem frontal', 'Carenagem traseira', 'Estribo', 'Farol',
  'Guidão / semi-guidão', 'Lanterna', 'Mesa', 'Módulo de injeção/CDI',
  'Motor de arranque', 'Painel', 'Para-lama dianteiro', 'Para-lama traseiro',
  'Pedaleira direita', 'Pedaleira esquerda', 'Retrovisor direito',
  'Retrovisor esquerdo', 'Roda dianteira', 'Roda traseira', 'Tanque',
  'Cardã', 'Cavalete lateral', 'Corpo de injeção', 'Diferencial',
  'Escapamento', 'Radiador',
];

const STATUS_OPTS = ['', 'Inexistente', 'Sucata', 'Reutilizavel'] as const;
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Inexistente:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  Sucata:       { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  Reutilizavel: { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
};

function normalizeDetranEtiquetaValue(value: unknown) {
  const text = String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
  return text || '';
}

function splitDetranEtiquetas(value: unknown) {
  return String(value ?? '')
    .split('/')
    .map((item) => normalizeDetranEtiquetaValue(item))
    .filter(Boolean);
}

function parseEtiquetaPosicao(value: unknown) {
  const etiqueta = normalizeDetranEtiquetaValue(value);
  const match = etiqueta.match(/^(.*?)(\d{3})$/);
  if (!match) return null;

  const posicao = Number(match[2]);
  if (!Number.isInteger(posicao) || posicao < 1 || posicao > 34) return null;

  return {
    etiqueta,
    prefixo: match[1] || '',
    posicao,
  };
}

function normalizeStatusValue(value: unknown): PosicaoState['status'] {
  if (value === 'Inexistente' || value === 'Sucata' || value === 'Reutilizavel') return value;
  return '';
}

type PosicaoState = {
  status: '' | 'Inexistente' | 'Sucata' | 'Reutilizavel';
  skuId: string; // idPeca
  skuDescricao: string;
  skuDisponivel: boolean | null;
};

type Props = {
  motoId: number;
  motoLabel: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function EtiquetaCartelaModal({ motoId, motoLabel, onClose, onSaved }: Props) {
  const [cartelaId, setCartelaId] = useState('');
  const [posicoes, setPosicoes] = useState<PosicaoState[]>(
    DETRAN_TIPOS.map(() => ({ status: '', skuId: '', skuDescricao: '', skuDisponivel: null }))
  );
  const [saving, setSaving] = useState(false);
  const [loadingExistentes, setLoadingExistentes] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState<number | null>(null);
  const [skusRemovidos, setSkusRemovidos] = useState<Record<number, string>>({});
  const [buscaTexto, setBuscaTexto] = useState('');
  const [buscaResultados, setBuscaResultados] = useState<any[]>([]);
  const [buscandoPecas, setBuscandoPecas] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Carrega posições salvas da moto ao abrir
  useEffect(() => {
    carregarExistentes();
  }, []);

  async function carregarExistentes() {
    setLoadingExistentes(true);
    try {
      const novasPosicoes = DETRAN_TIPOS.map(() => ({ status: '' as const, skuId: '', skuDescricao: '', skuDisponivel: null }));
      let prefixoEncontrado = '';
      setSkusRemovidos({});

      // 1. Carrega da tabela MotoDetranPosicao (histórico completo incluindo Inexistente)
      const respCartela = await fetch(`${API}/motos/${motoId}/detran-cartela`, { credentials: 'include' });
      const dataCartela = await respCartela.json();
      const posicoesSalvas: any[] = dataCartela.posicoes || [];

      if (posicoesSalvas.length > 0) {
        for (const pos of posicoesSalvas) {
          const idx = pos.posicao - 1;
          if (idx < 0 || idx >= 34) continue;
          const etiquetaInfo = parseEtiquetaPosicao(pos.etiqueta);
          if (etiquetaInfo && !prefixoEncontrado) {
            prefixoEncontrado = etiquetaInfo.prefixo;
          }
          novasPosicoes[idx] = {
            status: normalizeStatusValue(pos.status),
            skuId: pos.idPeca || '',
            skuDescricao: '', // vamos buscar abaixo
            skuDisponivel: null,
          };
        }
      }

      // 2. Complementa com dados das peças (descrição e disponível) + fallback para motos sem histórico
      const respPecas = await fetch(`${API}/pecas?motoId=${motoId}&per=500&page=1`, { credentials: 'include' });
      const dataPecas = await respPecas.json();
      const pecas: any[] = dataPecas.data || [];
      const pecaByIdPeca: Record<string, any> = {};
      for (const p of pecas) pecaByIdPeca[p.idPeca] = p;

      // Preenche descrição/disponível nos que têm SKU
      for (let i = 0; i < novasPosicoes.length; i++) {
        const pos = novasPosicoes[i];
        if (pos.skuId && pecaByIdPeca[pos.skuId]) {
          novasPosicoes[i] = {
            ...pos,
            skuDescricao: pecaByIdPeca[pos.skuId].descricao || '',
            skuDisponivel: pecaByIdPeca[pos.skuId].disponivel,
          };
        }
      }

      // Fallback: se não tem histórico, tenta inferir pelo detranEtiqueta das peças
      for (const peca of pecas) {
        const etiquetas = splitDetranEtiquetas(peca.detranEtiqueta);
        if (!etiquetas.length) continue;

        for (const etiquetaAtual of etiquetas) {
          const etiquetaInfo = parseEtiquetaPosicao(etiquetaAtual);
          if (!etiquetaInfo) continue;

          const idx = etiquetaInfo.posicao - 1;
          const atual = novasPosicoes[idx];

          if (atual.skuId && atual.skuId !== peca.idPeca) continue;
          if (!atual.skuId && atual.status) continue;

          novasPosicoes[idx] = {
            status: atual.status || normalizeStatusValue(peca.detranStatus),
            skuId: atual.skuId || peca.idPeca,
            skuDescricao: atual.skuDescricao || peca.descricao || '',
            skuDisponivel: atual.skuDisponivel ?? peca.disponivel,
          };

          if (!prefixoEncontrado) prefixoEncontrado = etiquetaInfo.prefixo;
        }
      }

      if (prefixoEncontrado) setCartelaId(prefixoEncontrado);
      setPosicoes(novasPosicoes);
    } catch (e) {
      console.error('Erro ao carregar existentes:', e);
    }
    setLoadingExistentes(false);
  }

  // Quando cartela ID muda, atualiza o prefixo das etiquetas
  function handleCartelaChange(val: string) {
    setCartelaId(val.toUpperCase());
  }

  function gerarEtiqueta(posicao: number): string {
    if (!cartelaId) return '';
    return `${cartelaId}${String(posicao).padStart(3, '0')}`;
  }

  // Busca peças da moto
  useEffect(() => {
    if (buscaAberta === null) return;
    const timer = setTimeout(async () => {
      if (!buscaTexto.trim() && buscaTexto.length === 0) {
        // Carrega todas as peças da moto
        await buscarPecas('');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [buscaAberta]);

  useEffect(() => {
    if (buscaAberta === null) return;
    const timer = setTimeout(() => buscarPecas(buscaTexto), 300);
    return () => clearTimeout(timer);
  }, [buscaTexto]);

  async function buscarPecas(texto: string) {
    setBuscandoPecas(true);
    try {
      const params = new URLSearchParams({ motoId: String(motoId), per: '100', page: '1' });
      if (texto.trim()) params.set('search', texto.trim());
      const resp = await fetch(`${API}/pecas?${params}`, { credentials: 'include' });
      const data = await resp.json();
      setBuscaResultados(data.data || []);
    } catch { setBuscaResultados([]); }
    setBuscandoPecas(false);
  }

  function abrirBusca(idx: number) {
    setBuscaAberta(idx);
    setBuscaTexto('');
    setBuscaResultados([]);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function selecionarSku(idx: number, peca: any) {
    setPosicoes(prev => prev.map((p, i) => i === idx ? {
      ...p,
      skuId: peca.idPeca,
      skuDescricao: peca.descricao || '',
      skuDisponivel: peca.disponivel,
    } : p));
    setBuscaAberta(null);
  }

  function setStatus(idx: number, status: PosicaoState['status']) {
    setPosicoes(prev => prev.map((p, i) => i === idx ? { ...p, status } : p));
  }

  function limparPosicao(idx: number) {
    const skuAtual = posicoes[idx].skuId;
    if (skuAtual) {
      setSkusRemovidos(prev => ({ ...prev, [idx]: skuAtual }));
    }
    setPosicoes(prev => prev.map((p, i) => i === idx ? { status: '', skuId: '', skuDescricao: '', skuDisponivel: null } : p));
  }

  async function salvar() {
    setSaving(true);
    try {
      // Monta TODAS as posições com status ou SKU (incluindo Inexistente sem SKU)
      const posicoesParaSalvar = posicoes
        .map((p, idx) => ({
          posicao: idx + 1,
          tipo: DETRAN_TIPOS[idx],
          status: p.status || null,
          idPeca: p.skuId || null,
          etiqueta: p.skuId ? gerarEtiqueta(idx + 1) : null,
        }))
        .filter(item => item.status || item.idPeca);

      // Adiciona posições onde o SKU foi removido (para limpar etiqueta no ANB e Bling)
      for (const [idxStr, idPecaRemovido] of Object.entries(skusRemovidos)) {
        const idx = Number(idxStr);
        // Só adiciona se a posição atual não tem mais SKU
        if (!posicoes[idx].skuId) {
          posicoesParaSalvar.push({
            posicao: idx + 1,
            tipo: DETRAN_TIPOS[idx],
            status: posicoes[idx].status || null,
            idPeca: idPecaRemovido, // manda o SKU antigo para zerar
            etiqueta: null, // etiqueta null = limpar
          });
        }
      }

      if (!posicoesParaSalvar.length) {
        alert('Nenhuma posição com status, SKU ou remoção para salvar.');
        setSaving(false);
        return;
      }

      const resp = await fetch(`${API}/motos/${motoId}/detran-cartela`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posicoes: posicoesParaSalvar }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar');

      const comSku = posicoesParaSalvar.filter(p => p.idPeca && p.etiqueta).length;
      const semSku = posicoesParaSalvar.filter(p => !p.etiqueta).length;
      const removidos = Object.keys(skusRemovidos).length;
      alert(`✓ Salvo! ${comSku} peça(s) atualizada(s) no Bling${semSku > 0 ? ` · ${semSku} Inexistente(s) registrado(s)` : ''}${removidos > 0 ? ` · ${removidos} etiqueta(s) removida(s)` : ''}.`);

      onSaved();
      onClose();
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    }
    setSaving(false);
  }

  const preenchidas = posicoes.filter(p => p.skuId).length;
  const comStatus = posicoes.filter(p => p.status).length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.5)', zIndex: 400, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div style={{ background: 'var(--white)', width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,.12)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gray-800)' }}>Cartela de Etiquetas Detran</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{motoLabel} · {preenchidas} de 34 posições vinculadas · {comStatus} com status</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
        </div>

        {/* Cartela ID */}
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', background: '#f8fafc', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, maxWidth: 380 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, display: 'block' }}>
                ID da Cartela (prefixo)
              </label>
              <input
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist Mono, monospace', outline: 'none', letterSpacing: '.04em' }}
                value={cartelaId}
                onChange={e => handleCartelaChange(e.target.value)}
                placeholder="Ex: SP22102017701"
              />
            </div>
            {cartelaId && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 18 }}>
                Ex: <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--gray-800)', fontWeight: 600 }}>{cartelaId}001</span> até <span style={{ fontFamily: 'Geist Mono, monospace', color: 'var(--gray-800)', fontWeight: 600 }}>{cartelaId}034</span>
              </div>
            )}
            {loadingExistentes && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 18 }}>Carregando dados existentes...</div>}
          </div>
        </div>

        {/* Tabela das 34 posições */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--gray-50)', zIndex: 10 }}>
              <tr>
                <th style={{ padding: '8px 10px', textAlign: 'center', width: 40, fontSize: 11, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>TIPO DE PEÇA</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>ETIQUETA</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>STATUS</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>SKU VINCULADO</th>
                <th style={{ padding: '8px 4px', width: 60, borderBottom: '1px solid var(--border)' }}></th>
              </tr>
            </thead>
            <tbody>
              {DETRAN_TIPOS.map((tipo, idx) => {
                const pos = posicoes[idx];
                const etiqueta = gerarEtiqueta(idx + 1);
                const statusCor = pos.status ? STATUS_COLORS[pos.status] : null;
                const isOpen = buscaAberta === idx;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)', background: pos.skuId ? '#fafffe' : 'var(--white)' }}>
                    {/* Posição */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--gray-400)', fontWeight: 600 }}>
                      {String(idx + 1).padStart(2, '0')}
                    </td>

                    {/* Tipo */}
                    <td style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--gray-800)', whiteSpace: 'nowrap' }}>
                      {tipo}
                    </td>

                    {/* Etiqueta gerada */}
                    <td style={{ padding: '8px 10px', fontFamily: 'Geist Mono, monospace', fontSize: 11, color: etiqueta ? 'var(--gray-600)' : 'var(--gray-300)' }}>
                      {etiqueta || '—'}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {STATUS_OPTS.slice(1).map(opt => (
                          <button key={opt} onClick={() => setStatus(idx, pos.status === opt ? '' : opt as any)}
                            style={{
                              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              border: `1px solid ${pos.status === opt ? STATUS_COLORS[opt].border : 'var(--border)'}`,
                              background: pos.status === opt ? STATUS_COLORS[opt].bg : 'var(--white)',
                              color: pos.status === opt ? STATUS_COLORS[opt].color : 'var(--gray-500)',
                            }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </td>

                    {/* SKU */}
                    <td style={{ padding: '6px 8px', minWidth: 200 }}>
                      {isOpen ? (
                        <div style={{ position: 'relative' }}>
                          <input
                            ref={searchRef}
                            autoFocus
                            style={{ width: '100%', border: '1px solid var(--blue-500)', borderRadius: 6, padding: '5px 9px', fontSize: 12, outline: 'none' }}
                            placeholder="Buscar por descrição..."
                            value={buscaTexto}
                            onChange={e => setBuscaTexto(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setBuscaAberta(null); }}
                          />
                          {/* Dropdown resultados */}
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                            {buscandoPecas ? (
                              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-400)' }}>Buscando...</div>
                            ) : buscaResultados.length === 0 ? (
                              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray-400)' }}>Nenhuma peça encontrada</div>
                            ) : buscaResultados.map((peca: any) => (
                              <div key={peca.id} onClick={() => selecionarSku(idx, peca)}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'var(--white)')}>
                                <div>
                                  <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 600, color: 'var(--blue-500)' }}>{peca.idPeca}</div>
                                  <div style={{ fontSize: 11, color: 'var(--gray-600)', marginTop: 1 }}>{peca.descricao}</div>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: peca.disponivel ? '#f0fdf4' : '#fef2f2', color: peca.disponivel ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
                                  {peca.disponivel ? 'Estoque' : 'Vendida'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : pos.skuId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => abrirBusca(idx)}>
                          <div style={{ cursor: 'pointer' }}>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 600, color: 'var(--blue-500)' }}>{pos.skuId}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.skuDescricao}</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4, background: pos.skuDisponivel ? '#f0fdf4' : '#fef2f2', color: pos.skuDisponivel ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
                            {pos.skuDisponivel ? 'Est.' : 'Vend.'}
                          </span>
                        </div>
                      ) : (
                        <button onClick={() => abrirBusca(idx)}
                          style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--gray-400)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          🔍 Vincular SKU
                        </button>
                      )}
                    </td>

                    {/* Limpar */}
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      {(pos.skuId || pos.status) && (
                        <button onClick={() => limparPosicao(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', fontSize: 14, padding: 4 }}
                          title="Limpar posição">
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'var(--white)' }}>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
            {preenchidas} SKU(s) vinculados · {comStatus} com status definido
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{ padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--gray-600)', fontFamily: 'Inter, sans-serif' }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={saving || (!preenchidas && !comStatus && Object.keys(skusRemovidos).length === 0)}
              style={{ padding: '8px 22px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#1d4ed8', color: '#fff', fontFamily: 'Inter, sans-serif', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : Object.keys(skusRemovidos).length > 0 && !preenchidas ? `Remover ${Object.keys(skusRemovidos).length} etiqueta(s)` : `Salvar ${preenchidas} peça(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
