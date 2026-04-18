'use client';

import { API_BASE } from './api-base';

export type CaixaEtiquetaPrintItem = {
  caixa: string;
};

export type SkuEtiquetaPrintItem = {
  motoLabel: string;
  sku: string;
  descricao: string;
};

function normalizeFilterText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function formatEtiquetaMotoLabel(peca: any) {
  // Se a moto tiver uma abreviação definida, usa ela diretamente
  if (peca?.moto?.etiquetaSkuLabel) {
    return String(peca.moto.etiquetaSkuLabel).trim().toUpperCase();
  }

  const marca = String(peca?.moto?.marca || '').trim();
  const modelo = String(peca?.moto?.modelo || '').trim();
  const motoCompleta = [marca, modelo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const motoNormalizada = normalizeFilterText(motoCompleta);

  if (motoNormalizada.startsWith('harley davidson')) {
    const restante = motoCompleta.replace(/^\s*harley\s+davidson\b\s*/i, '').trim();
    return ['HD', restante].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase() || 'HD';
  }

  return motoCompleta.toUpperCase() || '-';
}

async function openLabelPdf(endpoint: string, body: object) {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Erro ao gerar etiquetas.' }));
    throw new Error(err.error || 'Erro ao gerar etiquetas.');
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
}

export async function printCaixaLabels(items: CaixaEtiquetaPrintItem[]) {
  const sanitized = items
    .map((i) => ({ caixa: String(i.caixa || '').trim() }))
    .filter((i) => i.caixa);

  if (!sanitized.length) throw new Error('Nenhuma caixa valida informada.');

  await openLabelPdf('/etiquetas/caixa', { items: sanitized });
}

export async function printSkuLabels(items: SkuEtiquetaPrintItem[]) {
  const sanitized = items
    .map((i) => ({
      motoLabel: String(i.motoLabel || '').trim(),
      sku:       String(i.sku || '').trim().toUpperCase(),
      descricao: String(i.descricao || '').trim(),
    }))
    .filter((i) => i.sku);

  if (!sanitized.length) throw new Error('Nenhum SKU valido informado.');

  await openLabelPdf('/etiquetas/sku', { items: sanitized });
}
