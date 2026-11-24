'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/api-base';
import { compressFotoCapaFile } from '@/lib/image-compression';

// Popup "Detalhes da Peca" (abre ao clicar no SKU). Fica em arquivo proprio para ser usado tambem fora do Estoque
// (ex.: Perguntas do Mercado Livre, em modo somente consulta: sem canEditarPeca nem canTrocarFotoCapa).
function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isPrejuizoPeca(peca: any) {
  return Boolean(peca?.emPrejuizo);
}

const cs: any = {
  topbar: { height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', background: 'var(--white)', borderBottom: '1px solid var(--border)', position: 'sticky' as const, top: 0, zIndex: 50 },
  title: { fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' },
  sub: { fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  sCard: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase' as const, color: 'var(--ink-muted)', whiteSpace: 'nowrap' as const },
  td: { padding: '10px 14px', verticalAlign: 'middle' as const, borderBottom: '1px solid var(--border)', fontSize: 13 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', fontFamily: 'Geist, sans-serif' },
  sel: { background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 11px', fontSize: 13, fontFamily: 'Geist, sans-serif', outline: 'none', height: 32, cursor: 'pointer' },
  fi: { width: '100%', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13.5, fontFamily: 'Geist, sans-serif', outline: 'none', marginTop: 5, color: 'var(--ink)' },
};

// Modal exigido ao salvar uma peca com preco alterado: categoriza o motivo do reajuste
// (desconto ao cliente dispara reversao automatica em 3 dias) + observacao livre pro historico.
export function MotivoPrecoModal({ precoAnterior, precoNovo, onConfirm, onCancel }: any) {
  const [motivo, setMotivo] = useState<'desconto_cliente' | 'reajuste_mercado' | ''>('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fmt = (v: any) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
  const subiu = Number(precoNovo) > Number(precoAnterior);

  async function confirmar() {
    if (!motivo) { alert('Selecione o motivo do reajuste.'); return; }
    setSalvando(true);
    await onConfirm(motivo, observacao.trim());
    setSalvando(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 700 }}>Motivo do reajuste de preço</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 4 }}>
            {fmt(precoAnterior)} → <b style={{ color: subiu ? '#16a34a' : '#dc2626' }}>{subiu ? '↑' : '↓'} {fmt(precoNovo)}</b>
          </div>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
          {[
            { value: 'desconto_cliente', label: 'Desconto ao cliente', desc: 'Se a peça continuar em estoque em 3 dias, o preço volta sozinho ao valor anterior.' },
            { value: 'reajuste_mercado', label: 'Reajuste de mercado', desc: 'Fica só no histórico, sem acompanhamento.' },
          ].map((opt) => (
            <label key={opt.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: motivo === opt.value ? '1px solid var(--blue-500)' : '1px solid var(--border)', background: motivo === opt.value ? '#eff6ff' : 'var(--white)', cursor: 'pointer' }}>
              <input type="radio" name="motivoPreco" checked={motivo === opt.value} onChange={() => setMotivo(opt.value as any)} style={{ marginTop: 2, cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gray-800)' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 4 }}>Observação (opcional)</div>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
              placeholder="Ex: cliente pediu 10% à vista"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} disabled={salvando} style={{ ...cs.btn, background: 'var(--white)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={confirmar} disabled={salvando || !motivo} style={{ ...cs.btn, background: 'var(--ink)', color: 'var(--white)', opacity: !motivo || salvando ? 0.6 : 1 }}>
            {salvando ? 'Salvando...' : 'Confirmar e salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tela de detalhes NOVA (abre ao clicar no SKU): horizontal, abre tudo em leitura/fechado; o botao "Editar" do rodape libera todos os
// campos (inclusive o texto do Bling, se expandido). Edita isolada das telas de edicao do menu "Acoes da peca" (que seguem como estao),
// mas reaproveita exatamente as mesmas regras de gravacao e replicacao delas.
export default function PecaDetalheNovaModal({ open, peca, onClose, onSaved, canEditarPeca = false, canTrocarFotoCapa = false, viewportMode = 'desktop' }: any) {
  const API = API_BASE;
  const isPhone = viewportMode === 'phone';
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState<any>({});
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [tiposOrig, setTiposOrig] = useState<Record<string, string>>({});
  const [infoEtq, setInfoEtq] = useState<Record<string, { tipoEtiqueta: string; editavel: boolean; tipoPeca: string }>>({});
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([]);
  const [armazenagem, setArmazenagem] = useState<{ loading: boolean; endereco: string | null }>({ loading: false, endereco: null });
  const [texto, setTexto] = useState<{ aberto: boolean; loading: boolean; html: string | null; erro: string | null; editado: string | null }>({ aberto: false, loading: false, html: null, erro: null, editado: null });
  const [fotoNome, setFotoNome] = useState('');
  const [fotoArquivo, setFotoArquivo] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [fotoGrande, setFotoGrande] = useState(false);
  const [motivoPendente, setMotivoPendente] = useState<any>(null);
  const [infSkuCopiado, setInfSkuCopiado] = useState(false);
  const [refBlingLoading, setRefBlingLoading] = useState(false);
  const [caixas, setCaixas] = useState<string[]>([]);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const splitEtq = (v: any) => String(v || '').split('/').map((s) => s.trim()).filter(Boolean);
  const formDaPeca = (p: any) => ({
    descricao: String(p.descricao || ''),
    precoML: String(Number(p.precoML || 0)),
    pesoLiquido: p.pesoLiquido != null ? String(p.pesoLiquido) : '',
    largura: p.largura != null ? String(p.largura) : '',
    altura: p.altura != null ? String(p.altura) : '',
    profundidade: p.profundidade != null ? String(p.profundidade) : '',
    localizacao: p.localizacao || '',
    numeroPeca: p.numeroPeca || '',
    numeroMotor: p.numeroMotor || '',
  });

  const emPrejuizo = isPrejuizoPeca(peca);
  const canEdit = Boolean(canEditarPeca) && !emPrejuizo;

  // Abre sempre fechada (leitura) com os dados da peca.
  useEffect(() => {
    if (!open || !peca) return;
    setForm(formDaPeca(peca));
    setEtiquetas(splitEtq(peca.detranEtiqueta));
    setEditando(false);
    setErro('');
    setFotoNome(peca.fotoCapaNome || '');
    setFotoArquivo(peca.fotoCapaArquivo || '');
    setTexto({ aberto: false, loading: false, html: null, erro: null, editado: null });
    setMotivoPendente(null);
    setFotoGrande(false);
    setTipos({});
    setTiposOrig({});
  }, [open, peca?.id]);

  // Tipo de peca de CADA etiqueta (cartela = pela posicao; avulsa = individual). Reconsulta ao digitar etiquetas novas.
  const chaveEtiquetas = etiquetas.map((e) => e.trim()).filter(Boolean).join(',');
  useEffect(() => {
    if (!open || !peca) return;
    if (!chaveEtiquetas) { setInfoEtq({}); return; }
    let cancelado = false;
    const t = setTimeout(() => {
      const qs = editando ? `?etiquetas=${encodeURIComponent(chaveEtiquetas)}` : '';
      fetch(`${API}/etiquetas-detran/${peca.id}/tipos-etiqueta${qs}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (cancelado || !d?.ok) return;
          const info: Record<string, { tipoEtiqueta: string; editavel: boolean; tipoPeca: string }> = {};
          const doServidor: Record<string, string> = {};
          (d.etiquetas || []).forEach((l: any) => {
            info[l.etiqueta] = { tipoEtiqueta: l.tipoEtiqueta, editavel: !!l.editavel, tipoPeca: l.tipoPeca || '' };
            if (l.editavel) doServidor[l.etiqueta] = l.tipoPeca || '';
          });
          setInfoEtq(info);
          setTiposDisponiveis(Array.isArray(d.tiposDisponiveis) ? d.tiposDisponiveis : []);
          setTipos((prev) => {
            const next: Record<string, string> = {};
            Object.keys(doServidor).forEach((etq) => { next[etq] = prev[etq] !== undefined && editando ? prev[etq] : doServidor[etq]; });
            return next;
          });
          if (!editando) setTiposOrig(doServidor);
        })
        .catch(() => {});
    }, editando ? 400 : 0);
    return () => { cancelado = true; clearTimeout(t); };
  }, [open, peca?.id, chaveEtiquetas, editando]);

  // Lista de caixas do sistema (mesma do pre-cadastro) pra escolher na Localizacao; so busca ao entrar em edicao, 1 vez.
  useEffect(() => {
    if (!open || !editando || caixas.length) return;
    let cancelado = false;
    fetch(`${API}/cadastro/opcoes`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (!cancelado) setCaixas(Array.isArray(d?.caixas) ? d.caixas.map((c: any) => String(c)) : []); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [open, editando]);

  // Armazenagem acompanha a Localizacao (inclusive enquanto digita a nova caixa).
  const caixaAtual = String(editando ? form.localizacao : (peca?.localizacao || '')).trim();
  useEffect(() => {
    if (!open || !caixaAtual) { setArmazenagem({ loading: false, endereco: null }); return; }
    let cancelado = false;
    setArmazenagem({ loading: true, endereco: null });
    const t = setTimeout(() => {
      fetch(`${API}/armazenagem/local/${encodeURIComponent(caixaAtual)}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => { if (!cancelado) setArmazenagem({ loading: false, endereco: d?.enderecoCompleto || null }); })
        .catch(() => { if (!cancelado) setArmazenagem({ loading: false, endereco: null }); });
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
  }, [open, caixaAtual]);

  // Editor do texto: grava o HTML inicial uma unica vez ao abrir em modo edicao.
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !editando || !texto.aberto || texto.html === null) return;
    if (document.activeElement !== el) el.innerHTML = texto.editado !== null ? texto.editado : texto.html;
  }, [editando, texto.aberto, texto.html]);

  if (!open || !peca) return null;

  const baseSku = String(peca.idPeca || '').replace(/-\d+$/, '');
  const inp: any = { width: '100%', background: editando ? 'var(--white)' : 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, color: 'var(--gray-800)' };
  const lab: any = { fontSize: 10.5, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 };
  const caixaBloco: any = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' };
  const tituloLen = String(form.descricao || '').trim().length;
  const motoLabel = peca.moto ? `${peca.moto.marca || ''} ${peca.moto.modelo || ''}`.trim() : `Moto #${peca.motoId}`;
  const statusChip = emPrejuizo
    ? { texto: 'Prejuízo', cor: '#b91c1c', fundo: '#fee2e2' }
    : peca.emRevisao
      ? { texto: 'Em Revisão', cor: '#92400e', fundo: '#fffbeb' }
    : !peca.disponivel
      ? { texto: `Vendida${peca.blingPedidoNum ? ` · pedido ${peca.blingPedidoNum}` : ''}`, cor: '#92400e', fundo: '#fef3c7' }
      : peca.etiquetaPendente
        ? { texto: 'Etiqueta pendente', cor: '#92400e', fundo: '#fffbeb' }
        : { texto: 'Em estoque', cor: '#166534', fundo: '#dcfce7' };

  const etiquetasLimpas = etiquetas.map((e) => e.trim()).filter(Boolean);
  const avulsasSemTipo = etiquetasLimpas.filter((e) => {
    const k = e.toUpperCase();
    return (infoEtq[k]?.editavel ?? false) && !String(tipos[k] || '').trim();
  });
  const pendentes: string[] = [];
  if (!String(form.descricao || '').trim()) pendentes.push('Título');
  if (!(Number(form.precoML) > 0)) pendentes.push('Preço de venda');
  if (!(Number(form.pesoLiquido) > 0)) pendentes.push('Peso');
  if (!(Number(form.largura) > 0)) pendentes.push('Largura');
  if (!(Number(form.altura) > 0)) pendentes.push('Altura');
  if (!(Number(form.profundidade) > 0)) pendentes.push('Profundidade');
  if (!String(form.localizacao || '').trim()) pendentes.push('Localização');
  if (!String(form.numeroPeca || '').trim()) pendentes.push('Número da peça');
  avulsasSemTipo.forEach((e) => pendentes.push(`Tipo de peça da etiqueta ${e}`));

  function setCampo(chave: string, valor: string) { setForm((f: any) => ({ ...f, [chave]: valor })); }

  function onPrecoChange(v: string) {
    const permitido = v.replace(/[^0-9%+\-,.]/g, '');
    setCampo('precoML', permitido.trim().startsWith('%') ? permitido : permitido.replace(',', '.'));
  }
  function onPrecoKey(e: any) {
    if (e.key !== 'Enter') return;
    const m = String(form.precoML || '').trim().match(/^%\s*([+-]?)\s*(\d+(?:[.,]\d+)?)$/);
    if (!m) return;
    e.preventDefault();
    const base = Number(peca.precoML || 0);
    const pct = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(pct) || !(base > 0)) return;
    setCampo('precoML', String(Math.round(base * (1 + ((m[1] === '-' ? -1 : 1) * pct) / 100) * 100) / 100));
  }

  function alternarTexto() {
    if (texto.aberto) { setTexto((p) => ({ ...p, aberto: false })); return; }
    if (texto.html !== null) { setTexto((p) => ({ ...p, aberto: true })); return; }
    setTexto((p) => ({ ...p, aberto: true, loading: true, erro: null }));
    fetch(`${API}/cadastro/descricao-peca?sku=${encodeURIComponent(peca.idPeca)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) { setTexto((p) => ({ ...p, loading: false, html: null, erro: d?.error || 'Não encontrado no Bling' })); return; }
        setTexto((p) => ({ ...p, loading: false, html: d.descricaoCurta || '', erro: null }));
      })
      .catch((e) => setTexto((p) => ({ ...p, loading: false, html: null, erro: e?.message || 'Erro ao consultar o Bling' })));
  }
  function formatarTexto(cmd: string) {
    document.execCommand(cmd, false);
    const el = editorRef.current;
    if (el) setTexto((p) => ({ ...p, editado: el.innerHTML }));
  }

  async function copiarInfSku() {
    const loc = peca.localizacao ? `${peca.localizacao}${armazenagem.endereco ? ` ( ${armazenagem.endereco} )` : ''}` : '—';
    try {
      await navigator.clipboard.writeText(`${peca.idPeca} - ${peca.descricao}\nLocalizacao: ${loc}`);
      setInfSkuCopiado(true);
      setTimeout(() => setInfSkuCopiado(false), 1800);
    } catch (e: any) { alert('Erro ao copiar: ' + e.message); }
  }

  // Preenche so os campos fisicos que estao vazios com o que o Bling tem; deixa em edicao pra revisar e salvar.
  async function buscarReferenciaBling() {
    setRefBlingLoading(true);
    try {
      const resp = await fetch(`${API}/cadastro/bling-referencia/${encodeURIComponent(peca.idPeca)}`, { credentials: 'include' });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || d.ok === false) { alert(d.error || 'Erro ao consultar SKU no Bling'); return; }
      const novo = { ...form };
      let mudou = false;
      if (!novo.pesoLiquido && d.peso != null) { novo.pesoLiquido = String(d.peso); mudou = true; }
      if (!novo.largura && d.largura != null) { novo.largura = String(d.largura); mudou = true; }
      if (!novo.altura && d.altura != null) { novo.altura = String(d.altura); mudou = true; }
      if (!novo.profundidade && d.profundidade != null) { novo.profundidade = String(d.profundidade); mudou = true; }
      if (!novo.numeroPeca && d.numeroPeca) { novo.numeroPeca = d.numeroPeca; mudou = true; }
      if (!mudou) { alert('O Bling não tem dados novos para preencher os campos vazios.'); return; }
      setForm(novo);
      setEditando(true);
    } catch (e: any) {
      alert('Erro ao consultar Bling: ' + (e.message || e));
    } finally {
      setRefBlingLoading(false);
    }
  }

  async function trocarFoto(event: any) {
    const file = event.target?.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!canTrocarFotoCapa) { alert('Seu usuario nao tem permissao para trocar foto capa.'); return; }
    try {
      setUploadingFoto(true);
      const image = await compressFotoCapaFile(file);
      const nome = `${String(peca.idPeca || 'foto').toUpperCase()}_Capa.jpg`;
      const atualizada = await api.pecas.uploadFotoCapa(peca.id, { fotoCapaNome: nome, fotoCapaArquivo: image.dataUrl });
      setFotoNome(atualizada?.fotoCapaNome || nome);
      setFotoArquivo(atualizada?.fotoCapaArquivo || image.dataUrl);
      onSaved?.();
    } catch (e: any) {
      alert(`Erro ao importar foto capa: ${e.message || e}`);
    } finally {
      setUploadingFoto(false);
    }
  }

  function iniciarSalvar() {
    setErro('');
    if (!canEdit) return;
    const titulo = String(form.descricao || '').trim();
    if (!titulo) return setErro('Informe o título.');
    if (titulo.length > 60) return setErro(`O título tem ${titulo.length} caracteres — o máximo é 60 (limite do título no Mercado Livre).`);
    const precoStr = String(form.precoML || '').trim();
    if (!precoStr || !Number.isFinite(Number(precoStr))) return setErro('Preço inválido. Se digitou um percentual (ex: %+10), aperte Enter no campo antes de salvar.');
    if (avulsasSemTipo.length) return setErro(`Escolha o Tipo de peça de cada etiqueta avulsa (faltando: ${avulsasSemTipo.join(', ')}).`);
    // Preco mudou: pede o motivo do reajuste antes de gravar (log + reversao automatica de "desconto ao cliente").
    if (Number(precoStr) !== Number(peca.precoML)) {
      setMotivoPendente({ precoAnterior: Number(peca.precoML), precoNovo: Number(precoStr) });
      return;
    }
    void executarSalvar(null, '');
  }

  // Mesmas regras de gravacao/replicacao das edicoes atuais, numa unica gravacao.
  async function executarSalvar(motivo: 'desconto_cliente' | 'reajuste_mercado' | null, observacao: string) {
    setSaving(true);
    setErro('');
    const avisos: string[] = [];
    const post = (url: string, body: any) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const put = (url: string, body: any) => fetch(url, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const novoPreco = Number(form.precoML);
      const precoAntes = Number(peca.precoML || 0);
      const precoMudou = novoPreco !== precoAntes;
      const tituloNovo = String(form.descricao || '').trim();
      const tituloMudou = tituloNovo !== String(peca.descricao || '').trim();
      // Taxa % implicita do preco original, escalada para o novo preco (igual a edicao de Titulo/Preco).
      const taxaRate = precoAntes > 0 ? Number(peca.valorTaxas || 0) / precoAntes : 0;
      const valorTaxas = precoMudou ? roundMoney(novoPreco * taxaRate) : Number(peca.valorTaxas || 0);
      const detranEtiqueta = etiquetasLimpas.join(' / ');
      const num = (v: any) => (v !== '' && v != null ? Number(v) : null);
      const fisicos = {
        largura: num(form.largura), altura: num(form.altura), profundidade: num(form.profundidade),
        pesoLiquido: num(form.pesoLiquido), pesoBruto: num(form.pesoLiquido),
        localizacao: String(form.localizacao || '').trim() || null,
        numeroPeca: String(form.numeroPeca || '').trim() || null,
      };
      const antes = formDaPeca(peca);
      const etiquetaAntes = splitEtq(peca.detranEtiqueta).join(' / ');
      const fisicoMudou = ['pesoLiquido', 'largura', 'altura', 'profundidade', 'localizacao', 'numeroPeca', 'numeroMotor']
        .some((k) => String((form as any)[k] ?? '').trim() !== String((antes as any)[k] ?? '').trim())
        || detranEtiqueta !== etiquetaAntes;

      // 1) Grava a peca.
      const resp = await put(`${API}/pecas/${peca.id}`, {
        motoId: peca.motoId, descricao: tituloNovo, precoML: novoPreco,
        valorFrete: Number(peca.valorFrete || 0), valorTaxas, disponivel: peca.disponivel,
        ...fisicos, detranEtiqueta: detranEtiqueta || null,
        numeroMotor: String(form.numeroMotor || '').trim() || null,
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || 'Erro ao salvar a peça');
      }

      // 2) Demais unidades do mesmo SKU base.
      let variacoes: any[] = [];
      if (fisicoMudou || precoMudou || tituloMudou) {
        try {
          const lista = await (await fetch(`${API}/pecas?sku=${encodeURIComponent(baseSku)}&per=50`, { credentials: 'include' })).json();
          variacoes = (lista?.data || []).filter((p: any) => p.id !== peca.id && (p.idPeca === baseSku || String(p.idPeca).startsWith(`${baseSku}-`)));
        } catch { /* sem variacoes: segue so com a peca aberta */ }
      }

      // 3) Fisicos: Bling + replica (todas as unidades do SKU, inclusive vendidas) — igual "Dimensoes / Localizacao / Etiqueta".
      if (fisicoMudou) {
        try {
          const b = await (await post(`${API}/cadastro/sync-bling-peca`, {
            blingProdutoId: peca.blingProdutoId || null, sku: baseSku,
            largura: fisicos.largura, altura: fisicos.altura, profundidade: fisicos.profundidade,
            pesoLiquido: fisicos.pesoLiquido, pesoBruto: fisicos.pesoBruto, localizacao: fisicos.localizacao, numeroPeca: fisicos.numeroPeca,
            detranEtiqueta: detranEtiqueta || null, concatDetranEtiquetasVariacoes: true,
          })).json();
          if (!b.ok) avisos.push(`Bling (dados físicos): ${b.error || 'falha'}`);
        } catch (e: any) { avisos.push(`Bling (dados físicos): ${e.message}`); }
        for (const v of variacoes) {
          try {
            await put(`${API}/pecas/${v.id}`, {
              motoId: v.motoId, descricao: v.descricao, precoML: Number(v.precoML),
              valorFrete: Number(v.valorFrete), valorTaxas: Number(v.valorTaxas), disponivel: v.disponivel,
              largura: fisicos.largura, altura: fisicos.altura, profundidade: fisicos.profundidade,
              pesoLiquido: fisicos.pesoLiquido, pesoBruto: fisicos.pesoBruto, localizacao: fisicos.localizacao, numeroPeca: fisicos.numeroPeca,
            });
          } catch { /* variacao individual falhou: nao trava */ }
        }
      }

      // 4) Titulo/preco: plataformas + replica so para unidades em estoque + historico — igual "Titulo / Preco".
      if (precoMudou || tituloMudou) {
        const historico: any[] = [];
        if (precoMudou) historico.push({ pecaId: peca.id, sku: peca.idPeca, descricao: tituloNovo, valorAnterior: precoAntes, valorNovo: novoPreco });
        try {
          const s = await (await post(`${API}/cadastro/sync-preco-plataformas`, {
            sku: baseSku, ...(precoMudou ? { precoML: novoPreco } : {}), ...(tituloMudou ? { descricao: tituloNovo } : {}),
          })).json();
          const r = s.resultados || {};
          const nomes: Record<string, string> = { bling: 'Bling', ml: 'Mercado Livre', nuvemshop: 'Nuvemshop', shopee: 'Shopee', magalu: 'Magalu' };
          Object.keys(nomes).forEach((k) => { if (r[k] && !r[k].ok) avisos.push(`${nomes[k]}: ${r[k].error || 'falha'}`); });
        } catch (e: any) { avisos.push(`Plataformas: ${e.message}`); }
        for (const v of variacoes.filter((x) => x.disponivel === true)) {
          if (precoMudou) historico.push({ pecaId: v.id, sku: v.idPeca, descricao: tituloMudou ? tituloNovo : v.descricao, valorAnterior: Number(v.precoML), valorNovo: novoPreco });
          try {
            await put(`${API}/pecas/${v.id}`, {
              motoId: v.motoId, descricao: tituloMudou ? tituloNovo : v.descricao,
              precoML: precoMudou ? novoPreco : Number(v.precoML),
              valorFrete: Number(v.valorFrete), valorTaxas: Number(v.valorTaxas), disponivel: v.disponivel,
            });
          } catch { /* variacao individual falhou: nao trava */ }
        }
        if (historico.length && motivo) {
          try { await post(`${API}/pecas/historico-preco`, { itens: historico, motivo, observacao }); } catch { /* log best-effort */ }
        }
      }

      // 5) Tipo de peca de cada etiqueta avulsa (individual).
      for (const etq of etiquetasLimpas) {
        const k = etq.toUpperCase();
        if (!(infoEtq[k]?.editavel)) continue;
        const novo = String(tipos[k] || '').trim();
        if (!novo || novo === (tiposOrig[k] || '')) continue;
        try {
          const r = await fetch(`${API}/etiquetas-detran/${peca.id}/tipo-peca`, {
            method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipoPeca: novo, etiqueta: k, isPreCadastro: false }),
          });
          if (!r.ok) avisos.push(`Tipo de peça da etiqueta ${k}: falha ao gravar`);
        } catch (e: any) { avisos.push(`Tipo de peça da etiqueta ${k}: ${e.message}`); }
      }

      // 6) Texto do corpo do anuncio (Bling, ML, Nuvemshop, Shopee, Magalu).
      if (texto.editado !== null && texto.html !== null && texto.editado !== texto.html) {
        try {
          const t = await (await post(`${API}/cadastro/atualizar-descricao-peca`, { sku: peca.idPeca, descricaoHtml: texto.editado })).json();
          const r = t.resultados || {};
          const nomes: Record<string, string> = { bling: 'Bling', ml: 'Mercado Livre', nuvemshop: 'Nuvemshop', shopee: 'Shopee', magalu: 'Magalu' };
          Object.keys(nomes).forEach((k) => { if (r[k] && !r[k].ok) avisos.push(`Texto — ${nomes[k]}: ${r[k].error || 'falha'}`); });
          if (t.error) avisos.push(`Texto: ${t.error}`);
        } catch (e: any) { avisos.push(`Texto: ${e.message}`); }
      }

      onSaved?.();
      onClose();
      if (avisos.length) alert(`Salvo no ANB.\n\nAtenção:\n${avisos.join('\n')}`);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar');
    }
    setSaving(false);
  }

  const colunaEsq: any = { flex: isPhone ? '1 1 100%' : '1.15 1 520px', minWidth: 0, display: 'grid', gap: 12, alignContent: 'start' };
  const colunaDir: any = { flex: isPhone ? '1 1 100%' : '0.85 1 340px', minWidth: 0, display: 'grid', gap: 12, alignContent: 'start' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.45)', zIndex: 235, display: 'flex', alignItems: isPhone ? 'stretch' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 14, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: isPhone ? 0 : 16, width: '100%', maxWidth: 1120, boxShadow: '0 12px 32px rgba(0,0,0,.10)', maxHeight: isPhone ? '100dvh' : 'calc(100dvh - 28px)', minHeight: isPhone ? '100dvh' : undefined, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600 }}>Detalhes da Peça</div>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--blue-500)' }}>{peca.idPeca}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: statusChip.fundo, color: statusChip.cor }}>{statusChip.texto}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>{motoLabel}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', cursor: 'pointer', flexShrink: 0 }}>X</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isPhone ? 14 : '16px 22px', display: 'flex', flexDirection: isPhone ? 'column' : 'row', flexWrap: isPhone ? 'nowrap' : 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {/* ---------- coluna esquerda: formulario ---------- */}
          <div style={colunaEsq}>
            {emPrejuizo && <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>Peça marcada como <strong>Prejuízo</strong>: bloqueada para edição pela tela de estoque.</div>}
            {!emPrejuizo && peca.etiquetaPendente && <div style={{ padding: 12, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5 }}>Aguardando nova etiqueta Detran (Etiquetas Detran &gt; Pendências Devolução). A venda fica bloqueada até lá.</div>}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={lab}>Título</div><div style={{ ...lab, color: tituloLen > 60 ? '#b91c1c' : 'var(--gray-400)' }}>{tituloLen}/60</div></div>
              <input style={inp} disabled={!editando} value={form.descricao ?? ''} onChange={(e) => setCampo('descricao', e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div>
                <div style={lab}>Preço de venda (R$)</div>
                <input style={inp} disabled={!editando} value={form.precoML ?? ''} onChange={(e) => onPrecoChange(e.target.value)} onKeyDown={onPrecoKey} placeholder="0.00" />
                {editando && <div style={{ fontSize: 10.5, color: 'var(--gray-400)', marginTop: 3 }}>Atalho: %+10 e Enter aplica +10% sobre o preço salvo.</div>}
              </div>
              <div>
                <div style={lab}>Número da peça</div>
                <input style={inp} disabled={!editando} value={form.numeroPeca ?? ''} onChange={(e) => setCampo('numeroPeca', e.target.value)} placeholder="Código do fabricante" />
              </div>
            </div>

            <div>
              <div style={lab}>Dimensões e peso</div>
              <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                {[{ k: 'pesoLiquido', l: 'Peso (kg)' }, { k: 'largura', l: 'Largura (cm)' }, { k: 'altura', l: 'Altura (cm)' }, { k: 'profundidade', l: 'Prof. (cm)' }].map(({ k, l }) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>{l}</div>
                    <input style={inp} type="number" step="0.01" min="0" disabled={!editando} value={form[k] ?? ''} onChange={(e) => setCampo(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div>
                <div style={lab}>Localização (caixa)</div>
                <input style={inp} list="caixas-detalhe-list" disabled={!editando} value={form.localizacao ?? ''} onChange={(e) => setCampo('localizacao', e.target.value)} placeholder="Nome da caixa" />
                <datalist id="caixas-detalhe-list">{caixas.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <div style={lab}>Armazenagem</div>
                <div style={{ ...inp, background: 'var(--gray-50)', fontFamily: 'Geist Mono, monospace', fontSize: 12, minHeight: 34, display: 'flex', alignItems: 'center' }}>
                  {armazenagem.loading ? 'Consultando...' : (caixaAtual ? (armazenagem.endereco || 'Não configurada') : '—')}
                </div>
              </div>
            </div>

            <div>
              <div style={lab}>Número do motor</div>
              <input style={inp} disabled={!editando} value={form.numeroMotor ?? ''} onChange={(e) => setCampo('numeroMotor', e.target.value)} placeholder="Ex: RC91E0P000245" />
            </div>

            <div style={caixaBloco}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={lab}>Etiquetas Detran</div>
                {editando && <button type="button" onClick={() => setEtiquetas((p) => [...p, ''])} style={{ ...cs.btn, padding: '3px 10px', fontSize: 12, background: '#eff6ff', color: 'var(--blue-500)', borderColor: '#bfdbfe' }}>+ Adicionar etiqueta</button>}
              </div>
              {!etiquetas.length && <div style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>Sem etiqueta.</div>}
              <div style={{ display: 'grid', gap: 8 }}>
                {etiquetas.map((etq, i) => {
                  const k = etq.trim().toUpperCase();
                  const info = k ? infoEtq[k] : undefined;
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'center' }}>
                      <input style={{ ...inp, fontFamily: 'Geist Mono, monospace' }} disabled={!editando} value={etq} onChange={(e) => setEtiquetas((p) => p.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Ex: SP83838383" />
                      {info ? (
                        info.editavel ? (
                          <select style={{ ...inp, cursor: editando ? 'pointer' : 'default' }} disabled={!editando} value={tipos[k] || ''} onChange={(e) => setTipos((p) => ({ ...p, [k]: e.target.value }))}>
                            <option value="">Tipo de peça (avulsa)...</option>
                            {tiposDisponiveis.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--gray-600)' }}><span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 999, padding: '2px 8px', fontWeight: 700, fontSize: 10.5, marginRight: 6 }}>Cartela</span>{info.tipoPeca || ''}</div>
                        )
                      ) : <div />}
                      {editando ? <button type="button" onClick={() => setEtiquetas((p) => p.filter((_, j) => j !== i))} style={{ ...cs.btn, padding: '4px 10px', fontSize: 12, color: '#b91c1c', borderColor: '#fecaca', background: 'var(--white)' }}>Remover</button> : <span />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---------- coluna direita: pendencias, foto capa, texto do Bling ---------- */}
          <div style={colunaDir}>
            {pendentes.length ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>Campos pendentes:</div>
                {pendentes.map((p) => <div key={p} style={{ fontSize: 12.5, color: '#dc2626' }}>✗ {p}</div>)}
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: '#166534' }}>✓ Todos os campos obrigatórios preenchidos</div>
            )}

            <div style={caixaBloco}>
              <input ref={fotoInputRef} type="file" accept="image/*" onChange={trocarFoto} style={{ display: 'none' }} />
              <div style={lab}>Foto capa</div>
              {fotoArquivo ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img src={fotoArquivo} alt={`Foto capa ${peca.idPeca}`} onClick={() => setFotoGrande(true)} title="Clique para ampliar" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{fotoNome || 'foto-capa.jpg'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>Clique na imagem para ampliar.</div>
                  </div>
                </div>
              ) : <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Nenhuma foto importada</div>}
              {canTrocarFotoCapa && <button onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto} style={{ ...cs.btn, marginTop: 10, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)', opacity: uploadingFoto ? 0.7 : 1 }}>{uploadingFoto ? 'Importando...' : (fotoArquivo ? 'Trocar Foto Capa' : 'Importar Foto Capa')}</button>}
            </div>

            <div style={caixaBloco}>
              <button type="button" onClick={alternarTexto} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--blue-500)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                <span style={{ display: 'inline-block', transform: texto.aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                Descrição da peça (corpo do anúncio — Bling)
              </button>
              {texto.aberto && (
                <div style={{ marginTop: 10 }}>
                  {texto.loading ? <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Consultando Bling...</div>
                    : texto.erro ? <div style={{ fontSize: 13, color: '#b91c1c' }}>{texto.erro}</div>
                    : editando ? (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                          {[{ label: 'B', cmd: 'bold', style: { fontWeight: 700 } }, { label: 'I', cmd: 'italic', style: { fontStyle: 'italic' } }, { label: 'U', cmd: 'underline', style: { textDecoration: 'underline' } }].map(({ label, cmd, style }) => (
                            <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); formatarTexto(cmd); }} style={{ ...style, border: '1px solid var(--border)', background: 'var(--white)', borderRadius: 4, padding: '3px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'serif' }}>{label}</button>
                          ))}
                          <span style={{ fontSize: 10.5, color: 'var(--gray-400)', marginLeft: 6 }}>Salva em Bling, ML, Nuvemshop, Shopee e Magalu.</span>
                        </div>
                        <div ref={editorRef} contentEditable suppressContentEditableWarning style={{ padding: 10, minHeight: 200, maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', outline: 'none', fontSize: 13 }}
                          onInput={(e) => { const h = (e.target as HTMLDivElement).innerHTML; setTexto((p) => ({ ...p, editado: h })); }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--gray-800)', maxHeight: 260, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: (texto.editado !== null ? texto.editado : texto.html) || '<span style="color:var(--gray-400)">—</span>' }} />
                    )}
                </div>
              )}
            </div>
          </div>
        </div>

        {erro && <div style={{ padding: '8px 22px', background: '#fef2f2', borderTop: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, flexShrink: 0 }}>{erro}</div>}

        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 22px', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', flexShrink: 0, background: 'var(--white)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={copiarInfSku} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>{infSkuCopiado ? '✅ Copiado!' : '📋 Inf. SKU'}</button>
            {canEdit && <button onClick={buscarReferenciaBling} disabled={refBlingLoading || saving} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)', opacity: refBlingLoading ? 0.7 : 1 }}>{refBlingLoading ? 'Consultando...' : '📥 Referência Bling'}</button>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editando ? (
              <>
                <button onClick={() => { setEditando(false); setForm(formDaPeca(peca)); setEtiquetas(splitEtq(peca.detranEtiqueta)); setTipos(tiposOrig); setTexto((p) => ({ ...p, editado: null })); setErro(''); }} disabled={saving} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Cancelar edição</button>
                <button onClick={iniciarSalvar} disabled={saving} style={{ ...cs.btn, background: 'var(--gray-800)', color: '#fff', opacity: saving ? 0.7 : 1 }}>{saving ? 'Salvando...' : '💾 Salvar e sincronizar'}</button>
              </>
            ) : (
              <>
                {canEdit && <button onClick={() => { setEditando(true); setErro(''); }} style={{ ...cs.btn, background: 'var(--gray-800)', color: '#fff' }}>✏️ Editar</button>}
                <button onClick={onClose} style={{ ...cs.btn, background: 'var(--white)', color: 'var(--ink-soft)', borderColor: 'var(--border-strong)' }}>Fechar</button>
              </>
            )}
          </div>
        </div>
      </div>

      {motivoPendente && (
        // o clique dentro do modal de motivo nao pode subir ate o fundo desta tela (que fecha os detalhes antes de gravar)
        <div onClick={(e) => e.stopPropagation()}>
          <MotivoPrecoModal
            precoAnterior={motivoPendente.precoAnterior}
            precoNovo={motivoPendente.precoNovo}
            onCancel={() => setMotivoPendente(null)}
            onConfirm={async (motivo: 'desconto_cliente' | 'reajuste_mercado', observacao: string) => {
              setMotivoPendente(null);
              await executarSalvar(motivo, observacao);
            }}
          />
        </div>
      )}

      {fotoGrande && fotoArquivo ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,.6)', zIndex: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { e.stopPropagation(); setFotoGrande(false); }}>
          <img src={fotoArquivo} alt={`Foto capa ${peca.idPeca}`} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, background: '#fff' }} />
        </div>
      ) : null}
    </div>
  );
}
