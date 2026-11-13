'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { CategoriaDespesa, GrupoDespesa } from '@/lib/despesa-categorias';

// Gestao do catalogo de categorias: em qual grupo do DRE cada categoria entra e se e' fixa ou variavel.
// Qualquer mudanca aqui reflete no DRE na hora (o DRE le este mesmo catalogo).
export default function CategoriasModal({ categorias, grupos, onClose, onChanged }: {
  categorias: CategoriaDespesa[];
  grupos: GrupoDespesa[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [novoNome, setNovoNome] = useState('');
  const [novoGrupo, setNovoGrupo] = useState('adm');
  const [novoTipo, setNovoTipo] = useState<'fixa' | 'variavel'>('fixa');
  const [salvando, setSalvando] = useState('');
  const [erro, setErro] = useState('');

  const campo: any = { border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', fontSize: 13, background: 'var(--white)', color: 'var(--gray-800)', fontFamily: 'inherit' };

  async function atualizar(nome: string, dados: { grupo?: string; tipo?: string; ativa?: boolean }) {
    setSalvando(nome);
    setErro('');
    try {
      await api.financeiro.categoriasDespesa.update({ nome, ...dados });
      await onChanged();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar a categoria');
    }
    setSalvando('');
  }

  async function adicionar() {
    if (!novoNome.trim()) { setErro('Informe o nome da categoria.'); return; }
    setSalvando('__novo');
    setErro('');
    try {
      await api.financeiro.categoriasDespesa.create({ nome: novoNome.trim(), grupo: novoGrupo, tipo: novoTipo });
      setNovoNome('');
      await onChanged();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao criar a categoria');
    }
    setSalvando('');
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 12, width: '100%', maxWidth: 940, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)' }}>Categorias de despesa</div>
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.5 }}>
              O <b>grupo</b> define onde a categoria aparece no DRE. <b>Fixa</b> ou <b>variável</b> alimenta a análise de custos e a margem de contribuição. As mudanças valem para todas as despesas da categoria, inclusive as antigas.
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--gray-600)', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', display: 'grid', gap: 18 }}>
          {erro && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', border: '1px solid #fca5a5', fontSize: 13 }}>{erro}</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
            <input style={{ ...campo, flex: '1 1 220px' }} placeholder="Nova categoria (ex.: Descarte Ambiental)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            <select style={campo} value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)}>
              {grupos.map((g) => <option key={g.valor} value={g.valor}>{g.rotulo}</option>)}
            </select>
            <select style={campo} value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as 'fixa' | 'variavel')}>
              <option value="fixa">Fixa</option>
              <option value="variavel">Variável</option>
            </select>
            <button type="button" onClick={adicionar} disabled={salvando === '__novo'} style={{ ...campo, background: 'var(--ink)', color: '#fff', border: '1px solid transparent', cursor: 'pointer', fontWeight: 600 }}>
              {salvando === '__novo' ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>

          {grupos.map((g) => {
            const itens = categorias.filter((c) => c.grupo === g.valor);
            if (!itens.length) return null;
            return (
              <div key={g.valor}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)' }}>{g.rotulo}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 6 }}>{g.ajuda}</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {itens.map((c, i) => (
                    <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid var(--gray-100)' : 'none', flexWrap: 'wrap', opacity: c.ativa ? 1 : 0.55 }}>
                      <div style={{ flex: '1 1 240px', minWidth: 200 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>{c.nome}</span>
                        {c.legado ? <span style={{ marginLeft: 8, fontSize: 10.5, padding: '1px 7px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>antiga</span> : null}
                        <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>{c.qtdDespesas ? `${c.qtdDespesas} despesa(s)` : 'sem despesas'}</div>
                      </div>
                      <select style={campo} value={c.grupo} disabled={salvando === c.nome} onChange={(e) => atualizar(c.nome, { grupo: e.target.value })}>
                        {grupos.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
                      </select>
                      <select style={campo} value={c.tipo} disabled={salvando === c.nome} onChange={(e) => atualizar(c.nome, { tipo: e.target.value })}>
                        <option value="fixa">Fixa</option>
                        <option value="variavel">Variável</option>
                      </select>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--gray-600)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={c.ativa} disabled={salvando === c.nome} onChange={(e) => atualizar(c.nome, { ativa: e.target.checked })} />
                        Ativa
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.6 }}>
            Comissões de Marketplaces e Fretes de Envio já entram no DRE automaticamente pelas vendas. Lance aqui só o que não vem pelos pedidos: o valor lançado se soma à mesma linha do DRE. Categorias “antigas” seguem funcionando, mas o ideal é reclassificar as despesas para as novas (use “Reclassificar selecionadas” na lista).
          </div>
        </div>
      </div>
    </div>
  );
}
