"use client"

import { useRef, useState, useCallback, useEffect, forwardRef, useMemo } from "react"
import { DatabaseDef, Relation, TablePosition } from "@/lib/db-types"

interface SchemaDiagramProps {
  database: DatabaseDef
  relations: Relation[]
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
  return isMobile
}


function getTableWidth(m: boolean)    { return m ? 160 : 250 }
function getHeaderHeight(m: boolean)  { return m ? 28  : 40  }
function getFieldHeight(m: boolean)   { return m ? 22  : 34  }
function getBadgeColWidth(m: boolean) { return m ? 28  : 46  }

function tableHeight(fieldCount: number, m: boolean) {
  return getHeaderHeight(m) + fieldCount * getFieldHeight(m) + 4
}

type LayoutMode = "auto" | "grid" | "wide"


function gridLayout(
  database: DatabaseDef,
  isMobile: boolean
): Record<string, TablePosition> {
  const tables = database.tables
  const TW     = getTableWidth(isMobile)
  const gapX   = isMobile ? 40 : 90
  const gapY   = isMobile ? 30 : 70
  const startX = 40, startY = 90
  const pos: Record<string, TablePosition> = {}
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)))
  let x = startX, y = startY, rowH = 0
  tables.forEach((t, i) => {
    pos[t.id] = { x, y }
    rowH = Math.max(rowH, tableHeight(t.fields.length, isMobile))
    x += TW + gapX
    if ((i + 1) % cols === 0) { x = startX; y += rowH + gapY; rowH = 0 }
  })
  return pos
}

// ── Wide layout (single row) ──────────────────────────────────────────────────
function wideLayout(
  database: DatabaseDef,
  isMobile: boolean
): Record<string, TablePosition> {
  const tables = database.tables
  const TW     = getTableWidth(isMobile)
  const gapX   = isMobile ? 40 : 90
  const startX = 40, startY = 90
  const pos: Record<string, TablePosition> = {}
  let x = startX
  tables.forEach((t) => { pos[t.id] = { x, y: startY }; x += TW + gapX })
  return pos
}

// ── Auto layout: 4-phase crossing-minimising force-directed ──────────────────
function autoLayout(
  database: DatabaseDef,
  relations: Relation[],
  isMobile: boolean
): Record<string, TablePosition> {
  const tables  = database.tables
  const TW      = getTableWidth(isMobile)
  const startX  = 40
  const startY  = 90
  const pos: Record<string, TablePosition> = {}
  if (tables.length === 0) return pos
  if (tables.length === 1) { pos[tables[0].id] = { x: startX, y: startY }; return pos }

  const n    = tables.length
  const avgH = tables.reduce((s, t) => s + tableHeight(t.fields.length, isMobile), 0) / n


  type Edge = { a: number; b: number }
  const edges: Edge[]  = []
  const adjSet         = new Set<string>()
  const parentsOf      = new Map<number, Set<number>>()
  const childrenOf     = new Map<number, Set<number>>()
  tables.forEach((_, i) => { parentsOf.set(i, new Set()); childrenOf.set(i, new Set()) })
  relations.forEach((r) => {
    const fi = tables.findIndex(t => t.id === r.fromTableId)
    const ti = tables.findIndex(t => t.id === r.toTableId)
    if (fi === -1 || ti === -1) return
    const key = fi < ti ? `${fi}-${ti}` : `${ti}-${fi}`
    if (adjSet.has(key)) return
    adjSet.add(key); edges.push({ a: fi, b: ti })
    parentsOf.get(fi)?.add(ti)
    childrenOf.get(ti)?.add(fi)
  })


  const layer = new Array(n).fill(0)
  const roots = tables.map((_, i) => i).filter(i => (parentsOf.get(i)?.size ?? 0) === 0)
  const bfsQ  = roots.length > 0 ? [...roots] : [0]
  while (bfsQ.length > 0) {
    const cur = bfsQ.shift()!
    childrenOf.get(cur)?.forEach(ch => {
      layer[ch] = Math.max(layer[ch], layer[cur] + 1)
      bfsQ.push(ch)
    })
  }
  const maxLayer = Math.max(...layer)
  const byLayer: number[][] = Array.from({ length: maxLayer + 1 }, () => [])
  tables.forEach((_, i) => byLayer[layer[i]].push(i))


  const layerSpacingY = isMobile ? 240 : 320
  const tableSpacingX = isMobile ? 230 : 380
  const px = new Array(n).fill(0)
  const py = new Array(n).fill(0)
  byLayer.forEach((nodes, li) => {
    const rowW = nodes.length * tableSpacingX
    nodes.forEach((ni, xi) => {
      px[ni] = -rowW / 2 + xi * tableSpacingX + tableSpacingX / 2
      py[ni] = li * layerSpacingY
    })
  })


  const vx     = new Array(n).fill(0)
  const vy     = new Array(n).fill(0)

  const boxW   = TW      + (isMobile ? 80 : 160)
  const boxH   = avgH    + (isMobile ? 70 : 130)
  const k_rep  = isMobile ? 20000 : 55000
  const k_spr  = 0.018
  const k_hier = 0.040   
  const ideal  = isMobile ? 280 : 420 
  const ITERS  = 380

  for (let iter = 0; iter < ITERS; iter++) {
    const cool = 1 - iter / ITERS
    const fx   = new Array(n).fill(0)
    const fy2  = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[i]-px[j], dy = py[i]-py[j]
        const ex = Math.max(0, Math.abs(dx) - boxW/2)
        const ey = Math.max(0, Math.abs(dy) - boxH/2)
        const d2 = Math.max(1, ex*ex + ey*ey)
        const f  = k_rep / d2
        const len = Math.sqrt(dx*dx + dy*dy) || 1
        fx[i] += f*dx/len;  fy2[i] += f*dy/len
        fx[j] -= f*dx/len;  fy2[j] -= f*dy/len
      }
    }


    edges.forEach(({ a, b }) => {
      const dx = px[b]-px[a], dy = py[b]-py[a]
      const dist = Math.sqrt(dx*dx + dy*dy) || 1
      const f = k_spr * (dist - ideal)
      fx[a] += f*dx/dist;  fy2[a] += f*dy/dist
      fx[b] -= f*dx/dist;  fy2[b] -= f*dy/dist
    })


    edges.forEach(({ a, b }) => {

      const desiredGap = layerSpacingY * 0.55
      const actualGap  = py[a] - py[b]
      const err = desiredGap - actualGap
      fy2[a] += k_hier * err
      fy2[b] -= k_hier * err
    })


    byLayer.forEach((nodes) => {
      for (let ii = 0; ii < nodes.length; ii++) {
        for (let jj = ii + 1; jj < nodes.length; jj++) {
          const i = nodes[ii], j = nodes[jj]
          const dx = px[i] - px[j]
          if (Math.abs(dx) < tableSpacingX * 0.8) {
            const f = 0.006 * (tableSpacingX * 0.8 - Math.abs(dx))
            fx[i] += f * Math.sign(dx || 1)
            fx[j] -= f * Math.sign(dx || 1)
          }
        }
      }
    })

    const maxD = (isMobile ? 70 : 130) * cool
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i] + fx[i]) * 0.52
      vy[i] = (vy[i] + fy2[i]) * 0.52
      const spd = Math.sqrt(vx[i]*vx[i] + vy[i]*vy[i]) || 1
      const cap = Math.min(spd, maxD)
      px[i] += vx[i]/spd * cap
      py[i] += vy[i]/spd * cap
    }
  }

  function segsCross(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number
  ): boolean {
    const c2d = (ux: number, uy: number, vx: number, vy: number) => ux*vy - uy*vx
    const d1 = c2d(dx-cx, dy-cy, ax-cx, ay-cy)
    const d2 = c2d(dx-cx, dy-cy, bx-cx, by-cy)
    const d3 = c2d(bx-ax, by-ay, cx-ax, cy-ay)
    const d4 = c2d(bx-ax, by-ay, dx-ax, dy-ay)
    return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))
  }
  function countCrossings(): number {
    let c = 0
    for (let i = 0; i < edges.length; i++) {
      for (let j = i+1; j < edges.length; j++) {
        const { a:a1, b:b1 } = edges[i], { a:a2, b:b2 } = edges[j]
        if (a1===a2||a1===b2||b1===a2||b1===b2) continue
        if (segsCross(px[a1],py[a1],px[b1],py[b1], px[a2],py[a2],px[b2],py[b2])) c++
      }
    }
    return c
  }
  let improved = true, passes = 0
  while (improved && passes < 30) {
    improved = false; passes++
    const before = countCrossings()
    outer: for (let i = 0; i < n; i++) {
      for (let j = i+1; j < n; j++) {
        ;[px[i],px[j]]=[px[j],px[i]];[py[i],py[j]]=[py[j],py[i]]
        if (countCrossings() < before) { improved = true; break outer }
        ;[px[i],px[j]]=[px[j],px[i]];[py[i],py[j]]=[py[j],py[i]]
      }
    }
  }

  const padX = isMobile ? 28 : 55, padY = isMobile ? 22 : 40
  for (let pass = 0; pass < 16; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i+1; j < n; j++) {
        const hi = tableHeight(tables[i].fields.length, isMobile)
        const hj = tableHeight(tables[j].fields.length, isMobile)
        const ox = TW + padX       - Math.abs(px[i]-px[j])
        const oy = (hi+hj)/2+padY  - Math.abs(py[i]-py[j])
        if (ox > 0 && oy > 0) {
          if (ox < oy) { const s=px[i]<px[j]?-1:1; px[i]+=s*ox/2; px[j]-=s*ox/2 }
          else         { const s=py[i]<py[j]?-1:1; py[i]+=s*oy/2; py[j]-=s*oy/2 }
        }
      }
    }
  }

  const minX = Math.min(...px), minY = Math.min(...py)
  tables.forEach((t, i) => {
    pos[t.id] = {
      x: Math.round(px[i]-minX+startX),
      y: Math.round(py[i]-minY+startY),
    }
  })
  return pos
}

function getInitialPositions(
  database: DatabaseDef,
  relations: Relation[],
  isMobile: boolean,
  mode: LayoutMode = "auto"
): Record<string, TablePosition> {
  if (mode === "grid") return gridLayout(database, isMobile)
  if (mode === "wide") return wideLayout(database, isMobile)
  return autoLayout(database, relations, isMobile)
}

function getFieldAnchor(
  tablePos: TablePosition,
  fieldIndex: number,
  side: "left" | "right",
  isMobile: boolean
): { x: number; y: number } {
  const TW = getTableWidth(isMobile)
  const HH = getHeaderHeight(isMobile)
  const FH = getFieldHeight(isMobile)
  return {
    x: side === "left" ? tablePos.x : tablePos.x + TW,
    y: tablePos.y + HH + fieldIndex * FH + FH / 2,
  }
}

export const SchemaDiagram = forwardRef<SVGSVGElement, SchemaDiagramProps>(
  ({ database, relations }, externalRef) => {
  const svgRef   = useRef<SVGSVGElement>(null)
  const isMobile = useIsMobile()

  // Live dimensions — always match the current screen
  const TW  = getTableWidth(isMobile)
  const HH  = getHeaderHeight(isMobile)
  const FH  = getFieldHeight(isMobile)
  const BCW = getBadgeColWidth(isMobile)
  const CHAR_W = isMobile ? 6.2 : 8.5  

  // ── Export helpers ────────────────────────────────────────────────────────
  function downloadSVG() {
    if (!svgRef.current) return
    const src  = new XMLSerializer().serializeToString(svgRef.current)
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement("a"), { href: url, download: `${database?.name || "diagram"}.svg` }).click()
    URL.revokeObjectURL(url)
  }

  function downloadPNG() {
    if (!svgRef.current) return
    const svgStr  = new XMLSerializer().serializeToString(svgRef.current)
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" })
    const url     = URL.createObjectURL(svgBlob)
    const img     = new Image()
    img.onload = () => {
      const scale  = 4
      const canvas = document.createElement("canvas")
      canvas.width  = img.width  * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext("2d")
      ctx?.scale(scale, scale)
      ctx?.drawImage(img, 0, 0)
      Object.assign(document.createElement("a"), { href: canvas.toDataURL("image/png"), download: `${database?.name || "diagram"}.png`  }).click()
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  useEffect(() => {
    ;(window as any).downloadDiagramSVG = downloadSVG
    ;(window as any).downloadDiagramPNG = downloadPNG
  }, [])

  // ── State ─────────────────────────────────────────────────────────────────
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto")
  const [positions, setPositions] = useState<Record<string, TablePosition>>(() =>
    getInitialPositions(database, relations, false)
  )
  const [dragging, setDragging] = useState<{
    tableId: string; offsetX: number; offsetY: number
  } | null>(null)
  const [svgSize, setSvgSize] = useState({ width: 1200, height: 800 })

  useEffect(() => {
    ;(window as any).__diagramSetLayout = (mode: LayoutMode) => {
      setLayoutMode(mode)
      setPositions(getInitialPositions(database, relations, isMobile, mode))
    }
  }, [database, relations, isMobile])

  // Re-layout when screen flips between mobile ↔ desktop
  const prevIsMobile = useRef<boolean | null>(null)
  useEffect(() => {
    if (prevIsMobile.current === isMobile) return
    prevIsMobile.current = isMobile
    setPositions(getInitialPositions(database, relations, isMobile, layoutMode))
  }, [isMobile, database])

  // Add positions for newly added tables without disturbing existing ones
  useEffect(() => {
    setPositions((prev) => {
      const cols     = Math.ceil(Math.sqrt(database.tables.length))
      const spacingX = TW + (isMobile ? 30 : 80)
      const spacingY = isMobile ? 140 : 250
      const next: Record<string, TablePosition> = {}
      database.tables.forEach((table, i) => {
        next[table.id] = prev[table.id] ?? {
          x: 40 + (i % cols)          * spacingX,
          y: 40 + Math.floor(i / cols) * spacingY,
        }
      })
      return next
    })
  }, [database, TW, isMobile])

  // Dynamic SVG canvas size
  useEffect(() => {
    let maxX = 800, maxY = 600
    database.tables.forEach((table) => {
      const pos = positions[table.id]
      if (pos) {
        maxX = Math.max(maxX, pos.x + TW  + 60)
        maxY = Math.max(maxY, pos.y + HH + table.fields.length * FH + 60)
      }
    })
    setSvgSize({ width: maxX, height: maxY })
  }, [positions, database, TW, HH, FH])

  const handleMouseDown = useCallback((e: React.MouseEvent, tableId: string) => {
    const svg = svgRef.current; if (!svg) return
    const CTM = svg.getScreenCTM(); if (!CTM) return
    const pt  = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const sp  = pt.matrixTransform(CTM.inverse())
    const pos = positions[tableId]
    setDragging({ tableId, offsetX: sp.x - pos.x, offsetY: sp.y - pos.y })
  }, [positions])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const svg = svgRef.current; if (!svg) return
    const CTM = svg.getScreenCTM(); if (!CTM) return
    const pt  = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const sp  = pt.matrixTransform(CTM.inverse())
    setPositions((prev) => ({
      ...prev,
      [dragging.tableId]: {
        x: Math.max(0, sp.x - dragging.offsetX),
        y: Math.max(0, sp.y - dragging.offsetY),
      },
    }))
  }, [dragging])

  const handleMouseUp = useCallback(() => setDragging(null), [])

  // ── Touch drag (mobile) ───────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent, tableId: string) => {
    if (e.touches.length !== 1) return
    e.stopPropagation()
    const touch = e.touches[0]
    const svg   = svgRef.current; if (!svg) return
    const CTM   = svg.getScreenCTM(); if (!CTM) return
    const pt    = svg.createSVGPoint()
    pt.x = touch.clientX; pt.y = touch.clientY
    const sp  = pt.matrixTransform(CTM.inverse())
    const pos = positions[tableId]
    setDragging({ tableId, offsetX: sp.x - pos.x, offsetY: sp.y - pos.y })
  }, [positions])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return
    e.preventDefault()  
    e.stopPropagation()
    const touch = e.touches[0]
    const svg   = svgRef.current; if (!svg) return
    const CTM   = svg.getScreenCTM(); if (!CTM) return
    const pt    = svg.createSVGPoint()
    pt.x = touch.clientX; pt.y = touch.clientY
    const sp = pt.matrixTransform(CTM.inverse())
    setPositions((prev) => ({
      ...prev,
      [dragging.tableId]: {
        x: Math.max(0, sp.x - dragging.offsetX),
        y: Math.max(0, sp.y - dragging.offsetY),
      },
    }))
  }, [dragging])

  const handleTouchEnd = useCallback(() => setDragging(null), [])

  const foreignKeys = useMemo(() => {
    const s = new Set<string>()
    database.tables.forEach((table) => {
      table.fields.forEach((field) => {
        if (field.isForeignKey && field.referencesTableId && field.referencesFieldId)
          s.add(`${table.id}-${field.id}`)
      })
    })
    return s
  }, [database])

  
  return (
    <div
      className="w-full h-full overflow-auto bg-background rounded-lg"
      style={{ touchAction: dragging ? "none" : "pan-x pan-y" }}
    >
      <svg
        ref={externalRef ?? svgRef}
        width={svgSize.width}
        height={svgSize.height}
        className="min-w-full min-h-full"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{ cursor: dragging ? "grabbing" : "default", touchAction: dragging ? "none" : "pan-x pan-y" }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#40c9a2" />
          </marker>
          <filter id="tableShadow" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.3" />
          </filter>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#ffffff08" strokeWidth="0.5" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* ── Relations ── */}
        {relations.map((rel, idx) => {
          const fromTable = database.tables.find((t) => t.id === rel.fromTableId)
          const toTable   = database.tables.find((t) => t.id === rel.toTableId)
          if (!fromTable || !toTable) return null
          const fromFIdx = fromTable.fields.findIndex((f) => f.id === rel.fromFieldId)
          const toFIdx   = toTable.fields.findIndex((f) => f.id === rel.toFieldId)
          if (fromFIdx === -1 || toFIdx === -1) return null
          const fromPos = positions[rel.fromTableId]
          const toPos   = positions[rel.toTableId]
          if (!fromPos || !toPos) return null

          const fromCX  = fromPos.x + TW / 2
          const toCX    = toPos.x   + TW / 2
          const fromSide = fromCX < toCX ? "right" : "left"
          const toSide   = fromCX < toCX ? "left"  : "right"
          const fA = getFieldAnchor(fromPos, fromFIdx, fromSide, isMobile)
          const tA = getFieldAnchor(toPos,   toFIdx,   toSide,   isMobile)
          const dx = Math.abs(tA.x - fA.x)
          const co = Math.max(50, dx * 0.4)
          const cp1x = fromSide === "right" ? fA.x + co : fA.x - co
          const cp2x = toSide   === "right" ? tA.x + co : tA.x - co
          const path = `M ${fA.x} ${fA.y} C ${cp1x} ${fA.y} ${cp2x} ${tA.y} ${tA.x} ${tA.y}`
          const cFX = fromSide === "right" ? fA.x + 14 : fA.x - 14
          const cTX = toSide   === "right" ? tA.x + 14 : tA.x - 14

          return (
            <g key={`rel-${idx}`}>
              <path d={path} fill="none" stroke="#40c9a2" strokeWidth="2" strokeDasharray="6 3" opacity="0.7" />
              <circle cx={fA.x} cy={fA.y} r="4" fill="#40c9a2" />
              <circle cx={tA.x} cy={tA.y} r="4" fill="#40c9a2" />
              {rel.cardinalityFrom && (
                <g>
                  <rect x={cFX - 14} y={fA.y - 24} width="28" height="20" rx="5" fill="#0d1117" stroke="#40c9a2" strokeWidth="1.5" />
                  <text x={cFX} y={fA.y - 11} textAnchor="middle" fill="#40c9a2" fontSize="13" fontFamily="monospace" fontWeight="bold">{rel.cardinalityFrom}</text>
                </g>
              )}
              {rel.cardinalityTo && (
                <g>
                  <rect x={cTX - 14} y={tA.y - 24} width="28" height="20" rx="5" fill="#0d1117" stroke="#40c9a2" strokeWidth="1.5" />
                  <text x={cTX} y={tA.y - 11} textAnchor="middle" fill="#40c9a2" fontSize="13" fontFamily="monospace" fontWeight="bold">{rel.cardinalityTo}</text>
                </g>
              )}
            </g>
          )
        })}

        {/* ── Tables ── */}
        {database.tables.map((table) => {
          const pos = positions[table.id]
          if (!pos) return null
          const tableH = HH + table.fields.length * FH + 4

          return (
            <g
              key={table.id}
              onMouseDown={(e) => handleMouseDown(e, table.id)}
              onTouchStart={(e) => handleTouchStart(e, table.id)}
              style={{ cursor: dragging?.tableId === table.id ? "grabbing" : "grab", touchAction: "none", userSelect: "none" }}
            >
              {/* Background */}
              <rect x={pos.x} y={pos.y} width={TW} height={tableH} rx="8" fill="#1a2332" stroke="#2a3a4e" strokeWidth="1.5" filter="url(#tableShadow)" />
              {/* Header */}
              <rect x={pos.x} y={pos.y} width={TW} height={HH} rx="8" fill="#40c9a2" />
              <rect x={pos.x} y={pos.y + HH - 8} width={TW} height={8} fill="#40c9a2" />
              {/* Table name */}
              <text
                x={pos.x + TW / 2} y={pos.y + HH / 2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                fill="#0d1117" fontSize={isMobile ? 11 : 15} fontWeight="bold"
                fontFamily="var(--font-inter), sans-serif"
              >
                {table.name}
              </text>

              {/* Fields */}
              {table.fields.map((field, fIdx) => {
                const fy          = pos.y + HH + fIdx * FH
                const isFK        = foreignKeys.has(`${table.id}-${field.id}`)
                const isPK        = field.isPrimaryKey
                const isBoth      = isPK && isFK
                const rawName     = field.name
                const badgeLabel  = isBoth ? "PK FK" : isPK ? "PK" : isFK ? "FK" : ""
                const badgeX      = pos.x + 12
                const nameStartX  = pos.x + 12 + BCW

                return (
                  <g key={field.id}>
                    <rect x={pos.x + 1} y={fy} width={TW - 2} height={FH} fill={fIdx % 2 === 0 ? "#1a233200" : "#ffffff05"} />
                    {fIdx > 0 && <line x1={pos.x + 10} y1={fy} x2={pos.x + TW - 10} y2={fy} stroke="#2a3a4e" strokeWidth="0.5" />}

                    {badgeLabel && (
                      <text x={badgeX} y={fy + FH / 2 + 1} dominantBaseline="middle"
                        fill={isFK ? "#e5a435" : "#40c9a2"}
                        fontSize={isMobile ? 8 : 11} fontWeight="bold" fontFamily="monospace"
                      >{badgeLabel}</text>
                    )}

                    <text x={nameStartX} y={fy + FH / 2 + 1} dominantBaseline="middle" textAnchor="start"
                      fill={isFK ? "#e5a435" : "#c9d1d9"}
                      fontSize={isMobile ? 10 : 14}
                      fontFamily="var(--font-jetbrains), monospace"
                      fontWeight={isPK ? "bold" : "normal"}
                    >{rawName}</text>

                    {isFK && (
                      <text x={nameStartX + rawName.length * CHAR_W + 6} y={fy + FH / 2 + 1}
                        dominantBaseline="middle" fill="#e5a435"
                        fontSize={isMobile ? 10 : 14}
                        fontFamily="var(--font-jetbrains), monospace" fontWeight="bold"
                      >#</text>
                    )}

                    {isPK && (
                      <line
                        x1={nameStartX}
                        y1={fy + FH / 2 + (isMobile ? 9 : 12)}
                        x2={nameStartX + rawName.length * CHAR_W + 2}
                        y2={fy + FH / 2 + (isMobile ? 9 : 12)}
                        stroke={isBoth ? "#f0b429" : "#40c9a2"} strokeWidth="3"
                      />
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* DB name watermark */}
        <text x="20" y="24" fill="#40c9a2" fontSize="12" fontFamily="monospace" opacity="0.5">
          {database.name}
        </text>
      </svg>
    </div>
  )
})
