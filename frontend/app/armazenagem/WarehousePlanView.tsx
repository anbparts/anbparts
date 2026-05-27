'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

// ─── Constantes ───────────────────────────────────────────────────────────────
const SCALE   = 50;     // pixels por metro
const CANVAS_W = 5000;
const CANVAS_H = 4000;
const OX = 2200;        // pixel do centro do canvas (origem do eixo X)
const OY = 1800;        // pixel do centro do canvas (origem do eixo Z)
const GRID = 25;        // snap grid = 0.5 m
const HANDLE = 8;       // tamanho do handle de canto em px
const MIN_W  = 100;
const MIN_H  = 70;
const AREA_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#ec4899'];

// ─── Types ────────────────────────────────────────────────────────────────────
type RackInfo = { id: number; nome: string };
type AreaRaw  = {
  id: number; nome: string;
  posX: number|null; posZ: number|null;
  largura: number|null; profundidade: number|null;
  posicoes: RackInfo[];
};
type Area = AreaRaw & { color: string };
type Rect = { x: number; y: number; w: number; h: number };

type DragState =
  | { type: 'pan';    startMx: number; startMy: number; startPx: number; startPy: number }
  | { type: 'move';   id: number; startMx: number; startMy: number; startX: number; startY: number }
  | { type: 'resize'; id: number; corner: 'tl'|'tr'|'bl'|'br'; startMx: number; startMy: number; startX: number; startY: number; startW: number; startH: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const snapPx = (v: number) => Math.round(v / GRID) * GRID;
const toCanvasPx = (m: number, origin: number) => snapPx(origin + m * SCALE);
const toMeters   = (px: number, origin: number) => (px - origin) / SCALE;

function buildLayouts(areas: Area[]): Map<number, Rect> {
  const map = new Map<number, Rect>();
  const cols = Math.max(1, Math.ceil(Math.sqrt(areas.length)));
  const PAD = 70;
  const DEF_W = Math.round(300 / GRID) * GRID;
  const DEF_H = Math.round(180 / GRID) * GRID;
  let col = 0, row = 0;

  for (const area of areas) {
    const w = area.largura      ? snapPx(area.largura      * SCALE) : DEF_W;
    const h = area.profundidade ? snapPx(area.profundidade * SCALE) : DEF_H;

    if (area.posX !== null && area.posZ !== null) {
      map.set(area.id, { x: toCanvasPx(area.posX, OX), y: toCanvasPx(area.posZ, OY), w, h });
    } else {
      const totalCols = Math.min(cols, areas.length);
      const startX = OX - ((totalCols - 1) * (DEF_W + PAD)) / 2;
      map.set(area.id, {
        x: snapPx(startX + col * (DEF_W + PAD)),
        y: snapPx(OY - 200 + row * (DEF_H + PAD)),
        w, h,
      });
      col++;
      if (col >= cols) { col = 0; row++; }
    }
  }
  return map;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function WarehousePlanView({
  areas: rawAreas,
  onClose,
}: {
  areas: AreaRaw[];
  onClose: () => void;
}) {
  const areas: Area[] = rawAreas.map((a, i) => ({ ...a, color: AREA_COLORS[i % AREA_COLORS.length] }));

  const viewportRef = useRef<HTMLDivElement>(null);
  const [layouts, setLayouts] = useState(() => buildLayouts(areas));
  const [pan, setPan]         = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [panning, setPanning]   = useState(false);

  // Ref sempre atualizado com o layout atual (evita closure stale no effect)
  const layoutsRef = useRef(layouts);
  useEffect(() => { layoutsRef.current = layouts; }, [layouts]);

  const drag = useRef<DragState | null>(null);

  // Centraliza o canvas na abertura
  useEffect(() => {
    if (viewportRef.current) {
      const { clientWidth: vw, clientHeight: vh } = viewportRef.current;
      setPan({ x: vw / 2 - OX, y: vh / 2 - OY });
    }
  }, []);

  // Handlers globais de mouse (move + up)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;

      if (d.type === 'pan') {
        setPan({ x: d.startPx + e.clientX - d.startMx, y: d.startPy + e.clientY - d.startMy });

      } else if (d.type === 'move') {
        const dx = e.clientX - d.startMx;
        const dy = e.clientY - d.startMy;
        setLayouts(prev => {
          const next = new Map(prev);
          const cur = prev.get(d.id)!;
          next.set(d.id, { ...cur, x: snapPx(d.startX + dx), y: snapPx(d.startY + dy) });
          return next;
        });

      } else if (d.type === 'resize') {
        const dx = e.clientX - d.startMx;
        const dy = e.clientY - d.startMy;
        setLayouts(prev => {
          const next = new Map(prev);
          let { x, y, w, h } = { x: d.startX, y: d.startY, w: d.startW, h: d.startH };
          if (d.corner === 'br') { w = Math.max(MIN_W, snapPx(d.startW + dx)); h = Math.max(MIN_H, snapPx(d.startH + dy)); }
          if (d.corner === 'bl') { x = snapPx(d.startX + dx); w = Math.max(MIN_W, snapPx(d.startW - dx)); h = Math.max(MIN_H, snapPx(d.startH + dy)); }
          if (d.corner === 'tr') { w = Math.max(MIN_W, snapPx(d.startW + dx)); y = snapPx(d.startY + dy); h = Math.max(MIN_H, snapPx(d.startH - dy)); }
          if (d.corner === 'tl') { x = snapPx(d.startX + dx); w = Math.max(MIN_W, snapPx(d.startW - dx)); y = snapPx(d.startY + dy); h = Math.max(MIN_H, snapPx(d.startH - dy)); }
          next.set(d.id, { x, y, w, h });
          return next;
        });
      }
    };

    const onUp = async () => {
      const d = drag.current;
      drag.current = null;
      setPanning(false);
      if (!d || d.type === 'pan') return;

      const rect = layoutsRef.current.get(d.id);
      if (!rect) return;

      try {
        await fetch(`${API}/armazenagem/areas/${d.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            posX: parseFloat(toMeters(rect.x, OX).toFixed(3)),
            posZ: parseFloat(toMeters(rect.y, OY).toFixed(3)),
            largura:      parseFloat((rect.w / SCALE).toFixed(3)),
            profundidade: parseFloat((rect.h / SCALE).toFixed(3)),
          }),
        });
      } catch {}
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  const startPan = useCallback((e: React.MouseEvent) => {
    drag.current = { type: 'pan', startMx: e.clientX, startMy: e.clientY, startPx: pan.x, startPy: pan.y };
    setPanning(true);
  }, [pan]);

  const startMove = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelected(id);
    const r = layoutsRef.current.get(id)!;
    drag.current = { type: 'move', id, startMx: e.clientX, startMy: e.clientY, startX: r.x, startY: r.y };
  }, []);

  const startResize = useCallback((e: React.MouseEvent, id: number, corner: 'tl'|'tr'|'bl'|'br') => {
    e.stopPropagation();
    const r = layoutsRef.current.get(id)!;
    drag.current = { type: 'resize', id, corner, startMx: e.clientX, startMy: e.clientY, startX: r.x, startY: r.y, startW: r.w, startH: r.h };
  }, []);

  const resetLayouts = useCallback(() => {
    // Reseta posições para auto-layout
    const reset = rawAreas.map(a => ({ ...a, posX: null, posZ: null, largura: null, profundidade: null, color: '' })) as Area[];
    setLayouts(buildLayouts(reset.map((a, i) => ({ ...a, color: AREA_COLORS[i % AREA_COLORS.length] }))));
  }, [rawAreas]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Topbar ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', background: '#1e293b', borderBottom: '1px solid #334155', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>🗺️ Planta Baixa — Armazenagem</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
            Arraste os espaços · Cantos para redimensionar · Arraste o fundo para navegar
          </div>
        </div>

        {/* Legenda de áreas */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {areas.map(area => (
            <div key={area.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0f172a', borderRadius: 7, padding: '4px 10px', border: `1px solid ${area.color}50` }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: area.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{area.nome}</span>
            </div>
          ))}
        </div>

        <button
          onClick={resetLayouts}
          title="Reorganizar automaticamente"
          style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
        >
          ↺ Reorganizar
        </button>

        <button
          onClick={onClose}
          style={{ padding: '6px 16px', borderRadius: 7, border: '1px solid #475569', background: '#334155', color: '#f1f5f9', cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
        >
          ✕ Fechar
        </button>
      </div>

      {/* ── Viewport ──────────────────────────────────────────────────────────── */}
      <div
        ref={viewportRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#0f172a', cursor: panning ? 'grabbing' : 'grab' }}
        onMouseDown={startPan}
      >
        {/* Canvas (chão do galpão) */}
        <div
          style={{
            position: 'absolute',
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            background: '#f1f5f9',
            backgroundImage: `
              linear-gradient(to right, rgba(100,116,139,.15) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(100,116,139,.15) 1px, transparent 1px),
              linear-gradient(to right, rgba(100,116,139,.07) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(100,116,139,.07) 1px, transparent 1px)
            `,
            backgroundSize: `${GRID * 4}px ${GRID * 4}px, ${GRID * 4}px ${GRID * 4}px, ${GRID}px ${GRID}px, ${GRID}px ${GRID}px`,
          }}
        >
          {/* Linhas de eixo */}
          <div style={{ position:'absolute', left: OX, top: 0, width: 1, height: CANVAS_H, background: 'rgba(100,116,139,.25)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', left: 0, top: OY, width: CANVAS_W, height: 1, background: 'rgba(100,116,139,.25)', pointerEvents:'none' }} />

          {/* ── Áreas ─────────────────────────────────────────────────────────── */}
          {areas.map(area => {
            const rect = layouts.get(area.id);
            if (!rect) return null;
            const isSel = selected === area.id;

            return (
              <div
                key={area.id}
                style={{
                  position: 'absolute',
                  left: rect.x, top: rect.y,
                  width: rect.w, height: rect.h,
                  background: `${area.color}14`,
                  border: `2px solid ${isSel ? area.color : area.color + '70'}`,
                  borderRadius: 10,
                  cursor: 'move',
                  boxSizing: 'border-box',
                  userSelect: 'none',
                  boxShadow: isSel ? `0 0 0 3px ${area.color}30, 0 4px 20px ${area.color}20` : '0 2px 8px rgba(0,0,0,.07)',
                  transition: 'box-shadow .15s',
                  overflow: 'hidden',
                }}
                onMouseDown={(e) => startMove(e, area.id)}
                onClick={() => setSelected(area.id)}
              >
                {/* Cabeçalho */}
                <div style={{
                  padding: '7px 12px',
                  background: `${area.color}22`,
                  borderBottom: `1px solid ${area.color}30`,
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: area.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, fontSize: 12, color: area.color, letterSpacing: '.8px', textTransform: 'uppercase' }}>
                    {area.nome}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {(rect.w / SCALE).toFixed(1)}m × {(rect.h / SCALE).toFixed(1)}m
                  </span>
                </div>

                {/* Chips de racks */}
                <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start', overflow: 'hidden' }}>
                  {area.posicoes.map(rack => (
                    <div key={rack.id} style={{
                      padding: '2px 7px', borderRadius: 4,
                      fontSize: 10, fontWeight: 700,
                      background: `${area.color}20`,
                      border: `1px solid ${area.color}40`,
                      color: '#334155',
                      whiteSpace: 'nowrap',
                    }}>
                      {rack.nome}
                    </div>
                  ))}
                  {area.posicoes.length === 0 && (
                    <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Sem racks</span>
                  )}
                </div>

                {/* Handles de canto */}
                {(['tl','tr','bl','br'] as const).map(corner => (
                  <div
                    key={corner}
                    onMouseDown={(e) => startResize(e, area.id, corner)}
                    style={{
                      position: 'absolute',
                      width: HANDLE * 2, height: HANDLE * 2,
                      background: area.color,
                      borderRadius: 3,
                      zIndex: 5,
                      cursor: (corner === 'tl' || corner === 'br') ? 'nwse-resize' : 'nesw-resize',
                      ...(corner === 'tl' ? { left:  -HANDLE, top:    -HANDLE } :
                          corner === 'tr' ? { right: -HANDLE, top:    -HANDLE } :
                          corner === 'bl' ? { left:  -HANDLE, bottom: -HANDLE } :
                                            { right: -HANDLE, bottom: -HANDLE }),
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Rodapé informativo */}
        <div style={{
          position: 'absolute', bottom: 16, right: 20,
          background: 'rgba(15,23,42,.9)', color: '#64748b',
          fontSize: 11, padding: '6px 14px', borderRadius: 8,
          backdropFilter: 'blur(8px)', border: '1px solid #1e293b',
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          <span>Grade 0,5 m</span>
          <span>·</span>
          <span>{areas.length} espaço{areas.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{rawAreas.reduce((s, a) => s + a.posicoes.length, 0)} rack{rawAreas.reduce((s,a)=>s+a.posicoes.length,0)!==1?'s':''}</span>
        </div>
      </div>
    </div>
  );
}
