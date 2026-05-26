'use client';
import { useRef, useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { API_BASE } from '@/lib/api-base';

const API = API_BASE;

// ─── Constantes visuais ───────────────────────────────────────────────────────

const RACK_W = 1.2;
const RACK_D = 0.6;
const LEVEL_H = 0.36;
const LEVEL_GAP = 0.06;
const POST = 0.07;
const AREA_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];
const CORNER_HANDLE = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

type Detalhe3D = { id: number; nome: string; totalCaixas: number };
type Rack3D = {
  id: number; nome: string; areaId: number;
  posX: number | null; posZ: number | null;
  detalhes: Detalhe3D[];
};
type Area3D = {
  id: number; nome: string; color: string;
  posX: number | null; posZ: number | null;
  largura: number | null; profundidade: number | null;
  posicoes: Rack3D[];
};
type SelInfo = {
  rackId: number; rackNome: string;
  areaNome: string; areaColor: string;
  detalheId: number; detalheNome: string;
  totalCaixas: number;
};

// ─── Context para compartilhar ref do OrbitControls ───────────────────────────

const OrbitCtx = createContext<React.MutableRefObject<any>>({ current: null } as any);

// ─── Auto-layout: posiciona racks sem coordenadas salvas ──────────────────────

function buildPosMap(areas: Area3D[]): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  let offsetZ = 0;
  for (const area of areas) {
    const count = area.posicoes.length;
    const rowW = count * (RACK_W + 1.0);
    let rackX = -(rowW / 2) + RACK_W / 2;
    for (const rack of area.posicoes) {
      if (rack.posX !== null && rack.posZ !== null) {
        map.set(rack.id, [rack.posX, rack.posZ]);
      } else {
        map.set(rack.id, [rackX, offsetZ]);
        rackX += RACK_W + 1.0;
      }
    }
    offsetZ -= Math.max(3, Math.ceil(count / 5) * 3) + 2;
  }
  return map;
}

// ─── Auto-layout: posiciona áreas englobando seus racks ──────────────────────

type AreaLayout = { x: number; z: number; w: number; d: number };

function buildAreaLayout(areas: Area3D[], posMap: Map<number, [number, number]>): Map<number, AreaLayout> {
  const map = new Map<number, AreaLayout>();

  for (const area of areas) {
    if (area.posX !== null && area.posZ !== null) {
      // Posição salva no DB
      map.set(area.id, {
        x: area.posX,
        z: area.posZ,
        w: area.largura  ?? Math.max(6, area.posicoes.length * 2.5),
        d: area.profundidade ?? 5,
      });
    } else {
      // Calcular automaticamente a partir dos racks
      const rackPos = area.posicoes
        .map(r => posMap.get(r.id))
        .filter(Boolean) as [number, number][];

      if (rackPos.length === 0) {
        map.set(area.id, { x: 0, z: 0, w: 6, d: 5 });
      } else {
        const xs = rackPos.map(p => p[0]);
        const zs = rackPos.map(p => p[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs);
        const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const w = Math.max(6, maxX - minX + RACK_W + 3);
        const d = Math.max(5, maxZ - minZ + RACK_D + 4);
        map.set(area.id, { x: cx, z: cz, w, d });
      }
    }
  }
  return map;
}

// ─── Zona de área (retângulo no chão, arrastável + redimensionável) ────────────

function AreaZone({ area, layout, onMoved, onResized }: {
  area: Area3D;
  layout: AreaLayout;
  onMoved:  (id: number, x: number, z: number) => void;
  onResized: (id: number, w: number, d: number) => void;
}) {
  const groupRef     = useRef<THREE.Group>(null!);
  const floorRef     = useRef<THREE.Mesh>(null!);
  const cornerRefs   = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const { camera, gl, raycaster } = useThree();
  const orbitRef = useContext(OrbitCtx);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  // React state para controlar JSX após soltar (corner positions, floor scale via prop)
  const [size, setSize] = useState({ w: layout.w, d: layout.d });
  const sizeRef = useRef({ w: layout.w, d: layout.d });

  const draggingMode = useRef<null | 'move' | 'r0' | 'r1' | 'r2' | 'r3'>(null);
  const dragStart    = useRef({ ptX: 0, ptZ: 0, grpX: 0, grpZ: 0, w: 0, d: 0 });

  // Posição inicial via ref (sem re-render)
  useEffect(() => {
    if (groupRef.current) groupRef.current.position.set(layout.x, 0, layout.z);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza floor scale e corner positions imperativamente durante drag
  const applySizeImperative = (w: number, d: number) => {
    if (floorRef.current) floorRef.current.scale.set(w, 1, d);
    const corners: [number, number][] = [[-w / 2, -d / 2], [+w / 2, -d / 2], [-w / 2, +d / 2], [+w / 2, +d / 2]];
    corners.forEach(([cx, cz], i) => {
      const ref = cornerRefs.current[i];
      if (ref) { ref.position.x = cx; ref.position.z = cz; }
    });
  };

  const handlePointerDown = (mode: NonNullable<typeof draggingMode.current>) => (e: any) => {
    e.stopPropagation();
    draggingMode.current = mode;
    if (orbitRef.current) orbitRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.nativeEvent.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.nativeEvent.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, camera);
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(floorPlane, pt);

    dragStart.current = {
      ptX:  pt.x,   ptZ:  pt.z,
      grpX: groupRef.current?.position.x ?? layout.x,
      grpZ: groupRef.current?.position.z ?? layout.z,
      w:    sizeRef.current.w,
      d:    sizeRef.current.d,
    };
  };

  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (e: PointerEvent) => {
      if (!draggingMode.current) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        -((e.clientY - rect.top)  / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const pt = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(floorPlane, pt)) return;

      const dx = pt.x - dragStart.current.ptX;
      const dz = pt.z - dragStart.current.ptZ;

      if (draggingMode.current === 'move') {
        if (groupRef.current) {
          groupRef.current.position.x = Math.round((dragStart.current.grpX + dx) * 2) / 2;
          groupRef.current.position.z = Math.round((dragStart.current.grpZ + dz) * 2) / 2;
        }
      } else {
        // Resize por canto: r0=tl, r1=tr, r2=bl, r3=br
        const ci = parseInt(draggingMode.current[1]);
        // tl/bl (0,2): arrastar esquerda aumenta largura → xFactor=-2
        // tr/br (1,3): arrastar direita aumenta largura  → xFactor=+2
        // tl/tr (0,1): arrastar cima  aumenta prof       → zFactor=-2
        // bl/br (2,3): arrastar baixo aumenta prof       → zFactor=+2
        const xFactor = (ci === 0 || ci === 2) ? -2 : 2;
        const zFactor = (ci === 0 || ci === 1) ? -2 : 2;
        const newW = Math.max(2, Math.round((dragStart.current.w + dx * xFactor) * 2) / 2);
        const newD = Math.max(2, Math.round((dragStart.current.d + dz * zFactor) * 2) / 2);
        sizeRef.current = { w: newW, d: newD };
        applySizeImperative(newW, newD);
      }
    };

    const onUp = async () => {
      if (!draggingMode.current) return;
      const mode = draggingMode.current;
      draggingMode.current = null;
      if (orbitRef.current) orbitRef.current.enabled = true;

      if (mode === 'move') {
        const x = groupRef.current?.position.x ?? layout.x;
        const z = groupRef.current?.position.z ?? layout.z;
        onMoved(area.id, x, z);
        try {
          await fetch(`${API}/armazenagem/areas/${area.id}`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ posX: x, posZ: z }),
          });
        } catch {}
      } else {
        const { w, d } = sizeRef.current;
        setSize({ w, d }); // sincroniza estado React → re-render com novo scale/positions
        onResized(area.id, w, d);
        try {
          await fetch(`${API}/armazenagem/areas/${area.id}`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ largura: w, profundidade: d }),
          });
        } catch {}
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup',   onUp);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup',   onUp);
    };
  }, [camera, floorPlane, gl, raycaster, orbitRef, area.id, layout.x, layout.z, onMoved, onResized]);

  // Corner positions derivadas de size (estado React)
  const corners: [[number, number], string][] = [
    [[-size.w / 2, -size.d / 2], 'tl'],
    [[+size.w / 2, -size.d / 2], 'tr'],
    [[-size.w / 2, +size.d / 2], 'bl'],
    [[+size.w / 2, +size.d / 2], 'br'],
  ];

  return (
    <group ref={groupRef}>
      {/* Chão semi-transparente — scale controlado via React prop; atualizado imperativamente durante drag */}
      <mesh
        ref={floorRef}
        position={[0, -0.025, 0]}
        scale={[size.w, 1, size.d]}
        onPointerDown={handlePointerDown('move')}
      >
        <boxGeometry args={[1, 0.04, 1]} />
        <meshStandardMaterial color={area.color} opacity={0.14} transparent depthWrite={false} />
      </mesh>

      {/* Nome da área no chão */}
      <Html position={[0, 0.06, 0]} center distanceFactor={18} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontSize: 14, fontWeight: 900,
          color: area.color,
          textShadow: '0 1px 6px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.8)',
          userSelect: 'none',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {area.nome}
        </div>
      </Html>

      {/* Handles de canto para redimensionar */}
      {corners.map(([[cx, cz], name], i) => (
        <group
          key={name}
          ref={(el) => { cornerRefs.current[i] = el; }}
          position={[cx, 0, cz]}
          onPointerDown={handlePointerDown(`r${i}` as 'r0' | 'r1' | 'r2' | 'r3')}
        >
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[CORNER_HANDLE, 0.08, CORNER_HANDLE]} />
            <meshStandardMaterial color={area.color} opacity={0.85} transparent />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Rack 3D draggável ────────────────────────────────────────────────────────

function RackModel({ rack, initX, initZ, areaNome, areaColor, selected, onSelect, onMoved }: {
  rack: Rack3D;
  initX: number;
  initZ: number;
  areaNome: string;
  areaColor: string;
  selected: SelInfo | null;
  onSelect: (s: SelInfo) => void;
  onMoved: (id: number, x: number, z: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const { camera, gl, raycaster } = useThree();
  const orbitRef = useContext(OrbitCtx);
  const dragging = useRef(false);
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const totalH = Math.max(1, rack.detalhes.length) * (LEVEL_H + LEVEL_GAP) + LEVEL_GAP;
  const isRackSel = selected?.rackId === rack.id;

  useEffect(() => {
    if (groupRef.current) groupRef.current.position.set(initX, 0, initZ);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: any) => {
    e.stopPropagation();
    dragging.current = true;
    if (orbitRef.current) orbitRef.current.enabled = false;
    try { gl.domElement.setPointerCapture(e.nativeEvent.pointerId); } catch {}
  };

  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !groupRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, pt)) {
        groupRef.current.position.x = Math.round(pt.x * 2) / 2;
        groupRef.current.position.z = Math.round(pt.z * 2) / 2;
      }
    };

    const onUp = async () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (orbitRef.current) orbitRef.current.enabled = true;
      const x = groupRef.current?.position.x ?? 0;
      const z = groupRef.current?.position.z ?? 0;
      onMoved(rack.id, x, z);
      try {
        await fetch(`${API}/armazenagem/posicoes/${rack.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posX: x, posZ: z }),
        });
      } catch {}
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [camera, floorPlane, gl, raycaster, orbitRef, rack.id, onMoved]);

  const postColor = isRackSel ? '#b45309' : '#334155';
  const postPositions: [number, number][] = [
    [ RACK_W / 2 - POST / 2,  RACK_D / 2 - POST / 2],
    [-RACK_W / 2 + POST / 2,  RACK_D / 2 - POST / 2],
    [ RACK_W / 2 - POST / 2, -RACK_D / 2 + POST / 2],
    [-RACK_W / 2 + POST / 2, -RACK_D / 2 + POST / 2],
  ];

  return (
    <group ref={groupRef} onPointerDown={onPointerDown}>

      {/* Label flutuante */}
      <Html position={[0, totalH + 0.45, 0]} center distanceFactor={12}>
        <div style={{
          background: '#fff',
          border: `2px solid ${areaColor}`,
          borderRadius: 7,
          padding: '3px 10px',
          fontSize: 11,
          fontWeight: 800,
          color: '#0f172a',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0,0,0,.25)',
          cursor: 'grab',
          userSelect: 'none',
          pointerEvents: 'none',
        }}>
          {rack.nome}
          <span style={{ fontWeight: 400, color: '#64748b', fontSize: 10, marginLeft: 6 }}>{areaNome}</span>
        </div>
      </Html>

      {/* Postes */}
      {postPositions.map(([px, pz], i) => (
        <mesh key={i} position={[px, totalH / 2, pz]}>
          <boxGeometry args={[POST, totalH + 0.04, POST]} />
          <meshStandardMaterial color={postColor} roughness={0.6} />
        </mesh>
      ))}

      {/* Prateleiras */}
      {rack.detalhes.map((det, i) => {
        const y = LEVEL_GAP + i * (LEVEL_H + LEVEL_GAP) + LEVEL_H / 2;
        const hasBoxes = det.totalCaixas > 0;
        const isDetSel = selected?.detalheId === det.id;
        const color = isDetSel ? '#f59e0b' : hasBoxes ? '#3b82f6' : '#e2e8f0';

        return (
          <group key={det.id}>
            <mesh
              position={[0, y, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({
                  rackId: rack.id, rackNome: rack.nome,
                  areaNome, areaColor,
                  detalheId: det.id, detalheNome: det.nome,
                  totalCaixas: det.totalCaixas,
                });
              }}
            >
              <boxGeometry args={[RACK_W - POST * 2 - 0.04, LEVEL_H, RACK_D - POST * 2 - 0.04]} />
              <meshStandardMaterial color={color} roughness={0.65} />
            </mesh>

            <Html position={[0, y, RACK_D / 2 + 0.02]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
              <div style={{
                fontSize: 8, fontWeight: 700, color: '#0f172a',
                background: 'rgba(255,255,255,.9)', borderRadius: 3,
                padding: '1px 5px', whiteSpace: 'nowrap',
              }}>
                {det.nome}{det.totalCaixas > 0 ? ` · ${det.totalCaixas}cx` : ''}
              </div>
            </Html>
          </group>
        );
      })}

      {/* Base */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[RACK_W + 0.1, 0.03, RACK_D + 0.1]} />
        <meshStandardMaterial color={areaColor} opacity={0.35} transparent />
      </mesh>
    </group>
  );
}

// ─── Cena 3D ──────────────────────────────────────────────────────────────────

function Scene({ areas, selected, onSelect, posMap, areaLayout, onRackMoved, onAreaMoved, onAreaResized }: {
  areas: Area3D[];
  selected: SelInfo | null;
  onSelect: (s: SelInfo) => void;
  posMap: Map<number, [number, number]>;
  areaLayout: Map<number, AreaLayout>;
  onRackMoved:  (id: number, x: number, z: number) => void;
  onAreaMoved:  (id: number, x: number, z: number) => void;
  onAreaResized: (id: number, w: number, d: number) => void;
}) {
  const orbitRef = useRef<any>(null);

  return (
    <OrbitCtx.Provider value={orbitRef}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[15, 25, 15]} intensity={0.85} castShadow />
      <directionalLight position={[-10, 15, -10]} intensity={0.3} />
      <Grid
        args={[80, 80]}
        position={[0, -0.005, 0]}
        cellSize={1}
        cellColor="#2d3748"
        sectionSize={5}
        sectionColor="#3d4f66"
        fadeDistance={60}
        infiniteGrid
      />
      <OrbitControls
        ref={orbitRef}
        makeDefault
        minDistance={3}
        maxDistance={60}
        target={[0, 1, 0]}
      />

      {/* Zonas de área no chão (abaixo dos racks) */}
      {areas.map(area => {
        const layout = areaLayout.get(area.id);
        if (!layout) return null;
        return (
          <AreaZone
            key={`zone-${area.id}`}
            area={area}
            layout={layout}
            onMoved={onAreaMoved}
            onResized={onAreaResized}
          />
        );
      })}

      {/* Racks */}
      {areas.flatMap(area =>
        area.posicoes.map(rack => {
          const [ix, iz] = posMap.get(rack.id) ?? [0, 0];
          return (
            <RackModel
              key={rack.id}
              rack={rack}
              initX={ix}
              initZ={iz}
              areaNome={area.nome}
              areaColor={area.color}
              selected={selected}
              onSelect={onSelect}
              onMoved={onRackMoved}
            />
          );
        })
      )}
    </OrbitCtx.Provider>
  );
}

// ─── Componente principal (exportado) ─────────────────────────────────────────

export default function Warehouse3DView({
  areas: rawAreas,
  onClose,
}: {
  areas: Array<{
    id: number; nome: string;
    posX: number | null; posZ: number | null;
    largura: number | null; profundidade: number | null;
    posicoes: Rack3D[];
  }>;
  onClose: () => void;
}) {
  const areas: Area3D[] = rawAreas.map((a, i) => ({
    ...a,
    color: AREA_COLORS[i % AREA_COLORS.length],
  }));

  const [posMap,     setPosMap]     = useState(() => buildPosMap(areas));
  const [areaLayout, setAreaLayout] = useState(() => buildAreaLayout(areas, buildPosMap(areas)));
  const [selected,   setSelected]   = useState<SelInfo | null>(null);

  const onRackMoved = useCallback((id: number, x: number, z: number) => {
    setPosMap(prev => { const next = new Map(prev); next.set(id, [x, z]); return next; });
  }, []);

  const onAreaMoved = useCallback((id: number, x: number, z: number) => {
    setAreaLayout(prev => {
      const next = new Map(prev);
      const cur = prev.get(id);
      if (cur) next.set(id, { ...cur, x, z });
      return next;
    });
  }, []);

  const onAreaResized = useCallback((id: number, w: number, d: number) => {
    setAreaLayout(prev => {
      const next = new Map(prev);
      const cur = prev.get(id);
      if (cur) next.set(id, { ...cur, w, d });
      return next;
    });
  }, []);

  const totalRacks = areas.reduce((s, a) => s + a.posicoes.length, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#0f172a', display: 'flex', flexDirection: 'column' }}>

      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', background: 'rgba(255,255,255,.04)', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>🏭 Vista 3D — Armazenagem</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
            {areas.length} espaço(s) · {totalRacks} rack(s) · Arraste espaços e racks para reposicionar · Cantos dos espaços para redimensionar
          </div>
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {([['#e2e8f0', 'Vazio'], ['#3b82f6', 'Com caixas'], ['#f59e0b', 'Selecionado']] as [string, string][]).map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 13, height: 13, borderRadius: 3, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{label}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.07)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
        >
          ✕ Fechar
        </button>
      </div>

      {/* Canvas 3D */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          camera={{ position: [0, 14, 16], fov: 48 }}
          style={{ background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' }}
        >
          <Scene
            areas={areas}
            selected={selected}
            onSelect={setSelected}
            posMap={posMap}
            areaLayout={areaLayout}
            onRackMoved={onRackMoved}
            onAreaMoved={onAreaMoved}
            onAreaResized={onAreaResized}
          />
        </Canvas>

        {/* Painel de detalhe selecionado */}
        {selected && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(15,23,42,.93)', border: `1px solid ${selected.areaColor}`,
            borderRadius: 14, padding: '14px 24px', color: '#fff',
            display: 'flex', alignItems: 'center', gap: 20,
            backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
            minWidth: 300,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 }}>
                {selected.areaNome} › {selected.rackNome}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{selected.detalheNome}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: selected.totalCaixas > 0 ? '#60a5fa' : 'rgba(255,255,255,.35)' }}>
                {selected.totalCaixas > 0 ? `${selected.totalCaixas} caixa(s) alocada(s)` : 'Nenhuma caixa alocada'}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
            >
              Fechar
            </button>
          </div>
        )}

        {/* Legenda de áreas (canto inferior esquerdo) */}
        <div style={{ position: 'absolute', bottom: 24, left: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {areas.map(area => (
            <div key={area.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(15,23,42,.82)', borderRadius: 8,
              padding: '6px 12px', border: `1px solid ${area.color}50`,
            }}>
              <div style={{ width: 11, height: 11, borderRadius: 3, background: area.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{area.nome}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                {area.posicoes.length} rack{area.posicoes.length !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
