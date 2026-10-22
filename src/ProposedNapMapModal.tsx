import React, { useState, useMemo, useRef } from "react";
import { MapPin, X, Layers, ZoomIn, ZoomOut, RotateCcw, Upload, CheckCircle2, Sparkles, Trash2, Undo2 } from "lucide-react";

export interface MapOverlayLine {
  id: string;
  kind: "cable" | "road" | "polygon" | "hld_route";
  coords: Array<{ lat: number; lon: number }>;
  label?: string;
}

export interface MapPoleItem {
  id: string;
  name: string;
  tag: string;
  lat: number;
  lon: number;
  isProposedNap: boolean;
  isExcludedPropNap?: boolean;
  napIndex?: number; // 0-based index among active proposed NAP poles
  currentLines?: 8 | 16;
  matchedHldName?: string;
  remarks?: string;
}

export interface HldOverlayPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: 8 | 16;
  status: "PROPOSED" | "EXISTING" | "DUMMY" | "OLT";
}

interface ProposedNapMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  poles: MapPoleItem[];
  lines: MapOverlayLine[];
  hldPins: HldOverlayPin[];
  onUpdatePoleLines: (poleId: string, lines: 8 | 16) => void;
  onToggleExcludePole: (poleId: string, exclude: boolean) => void;
  onBatchUpdateLines: (mode: "all8" | "all16" | "first16rest8") => void;
  onLoadHldKmzFile: (file: File) => void;
  onAutoMatchFromHld: () => void;
}

const TILE_ZOOM = 17;

function lonToWorldX(lon: number, zoom = TILE_ZOOM): number {
  return ((lon + 180) / 360) * 256 * Math.pow(2, zoom);
}

function latToWorldY(lat: number, zoom = TILE_ZOOM): number {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 256 * Math.pow(2, zoom);
}

export function ProposedNapMapModal({
  isOpen,
  onClose,
  fileName,
  poles,
  lines,
  hldPins,
  onUpdatePoleLines,
  onToggleExcludePole,
  onBatchUpdateLines,
  onLoadHldKmzFile,
  onAutoMatchFromHld,
}: ProposedNapMapModalProps) {
  const [selectedPoleId, setSelectedPoleId] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<"satellite" | "street" | "dark">("satellite");
  const [showAllPoles, setShowAllPoles] = useState(true);
  const [showHldPins, setShowHldPins] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const proposedNapPoles = useMemo(
    () => poles.filter((p) => p.isProposedNap && !p.isExcludedPropNap),
    [poles],
  );

  const excludedNapPoles = useMemo(
    () => poles.filter((p) => p.isExcludedPropNap),
    [poles],
  );

  const activePole = useMemo(
    () =>
      proposedNapPoles.find((p) => p.id === selectedPoleId) ||
      excludedNapPoles.find((p) => p.id === selectedPoleId) ||
      proposedNapPoles[0] ||
      null,
    [proposedNapPoles, excludedNapPoles, selectedPoleId],
  );

  // Compute world pixel bounds at TILE_ZOOM = 17
  const mapBounds = useMemo(() => {
    const pts: Array<{ lat: number; lon: number }> = [];
    poles.forEach((p) => pts.push({ lat: p.lat, lon: p.lon }));
    lines.forEach((l) => l.coords.forEach((c) => pts.push(c)));
    hldPins.forEach((h) => pts.push({ lat: h.lat, lon: h.lon }));

    if (!pts.length) {
      const cx = lonToWorldX(125.507);
      const cy = latToWorldY(7.015);
      return { minX: cx - 512, maxX: cx + 512, minY: cy - 384, maxY: cy + 384, cx, cy, spanX: 1024, spanY: 768 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const wx = lonToWorldX(p.lon);
      const wy = latToWorldY(p.lat);
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }

    const padX = Math.max((maxX - minX) * 0.18, 180);
    const padY = Math.max((maxY - minY) * 0.18, 140);
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 320);
    const spanY = Math.max(maxY - minY, 240);

    return { minX, maxX, minY, maxY, cx, cy, spanX, spanY };
  }, [poles, lines, hldPins]);

  // Compute slippy tiles covering the expanded bounds
  const tiles = useMemo(() => {
    const padTiles = 2;
    const minTx = Math.floor(mapBounds.minX / 256) - padTiles;
    const maxTx = Math.floor(mapBounds.maxX / 256) + padTiles;
    const minTy = Math.floor(mapBounds.minY / 256) - padTiles;
    const maxTy = Math.floor(mapBounds.maxY / 256) + padTiles;

    const list: Array<{ tx: number; ty: number; x: number; y: number; url: string }> = [];
    if ((maxTx - minTx + 1) * (maxTy - minTy + 1) > 144) {
      return list;
    }
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      for (let ty = minTy; ty <= maxTy; ty += 1) {
        const url =
          mapStyle === "satellite"
            ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${ty}/${tx}`
            : `https://tile.openstreetmap.org/${TILE_ZOOM}/${tx}/${ty}.png`;
        list.push({
          tx,
          ty,
          x: tx * 256 - mapBounds.cx,
          y: ty * 256 - mapBounds.cy,
          url,
        });
      }
    }
    return list;
  }, [mapBounds, mapStyle]);

  if (!isOpen) return null;

  const viewW = 900;
  const viewH = 620;
  const baseScale = Math.min(viewW / mapBounds.spanX, viewH / mapBounds.spanY);
  const effectiveScale = baseScale * zoomScale;

  function toLocal(lat: number, lon: number) {
    return {
      x: lonToWorldX(lon) - mapBounds.cx,
      y: latToWorldY(lat) - mapBounds.cy,
    };
  }

  function focusOnPole(pole: MapPoleItem) {
    setSelectedPoleId(pole.id);
    const local = toLocal(pole.lat, pole.lon);
    const nextZoom = Math.max(zoomScale, 1.85);
    setZoomScale(nextZoom);
    setPanOffset({
      x: -local.x * baseScale * nextZoom,
      y: -local.y * baseScale * nextZoom,
    });
  }

  function resetView() {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }

  const count8L = proposedNapPoles.filter((p) => p.currentLines !== 16).length;
  const count16L = proposedNapPoles.filter((p) => p.currentLines === 16).length;

  return (
    <div
      className="modalOverlay"
      style={{ zIndex: 9999, background: "rgba(10, 15, 28, 0.78)", backdropFilter: "blur(5px)" }}
      onClick={onClose}
    >
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1360px, 96vw)",
          maxWidth: "1360px",
          height: "min(850px, 92vh)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          borderRadius: "14px",
          border: "1px solid var(--border-soft)",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-soft)",
            background: "var(--bg-panel)",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "9px",
                background: "rgba(37, 99, 235, 0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2563eb",
              }}
            >
              <MapPin size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-main)" }}>
                Proposed NAP Location Map & Line Capacity Selector
              </h2>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {fileName} • Set <strong>8-Lines (10 Lots)</strong>, <strong>16-Lines (16 Lots)</strong>, or{" "}
                <strong>Delete / Exclude Dummy NAPs</strong>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Optional HLD.kmz Reference Loader */}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(37, 99, 235, 0.4)",
                background: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              title="Load your HLD.kmz file to overlay HLD NAP names on the map and auto-match 8-Lines vs 16-Lines (and auto-exclude Dummy NAPs)!"
            >
              <Upload size={14} />
              <span>{hldPins.length > 0 ? `HLD Overlay (${hldPins.length} NAPs)` : "Load HLD.kmz Reference"}</span>
              <input
                type="file"
                accept=".kmz,.kml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLoadHldKmzFile(f);
                  e.target.value = "";
                }}
              />
            </label>

            {hldPins.length > 0 && (
              <button
                type="button"
                onClick={onAutoMatchFromHld}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "8px",
                  border: "1px solid rgba(21, 128, 61, 0.45)",
                  background: "rgba(21, 128, 61, 0.14)",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                title="Automatically match each Proposed NAP pole to the nearest HLD NAP pin (and auto-exclude Dummy NAPs)"
              >
                <Sparkles size={14} />
                <span>Auto-Match Lines from HLD</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "none",
                background: "#15803d",
                color: "#fff",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <CheckCircle2 size={15} />
              <span>Done & Apply ({proposedNapPoles.length} Active NAPs)</span>
            </button>

            <button
              type="button"
              className="modalCloseButton"
              onClick={onClose}
              aria-label="Close map modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Body: Map Canvas (Left) + Interactive Pole List (Right) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 410px", flex: 1, minHeight: 0 }}>
          {/* Left: Interactive Satellite / Route Map */}
          <div
            style={{
              position: "relative",
              background: "#0f172a",
              overflow: "hidden",
              userSelect: "none",
              cursor: isDragging ? "grabbing" : "grab",
            }}
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
              setZoomScale((z) => Math.max(0.5, Math.min(10, z * factor)));
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              setIsDragging(true);
              dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                panX: panOffset.x,
                panY: panOffset.y,
              };
            }}
            onMouseMove={(e) => {
              if (!isDragging || !dragStartRef.current) return;
              setPanOffset({
                x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
                y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
              });
            }}
            onMouseUp={() => {
              setIsDragging(false);
              dragStartRef.current = null;
            }}
            onMouseLeave={() => {
              setIsDragging(false);
              dragStartRef.current = null;
            }}
          >
            {/* Top-left Map Controls */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                zIndex: 10,
                display: "flex",
                gap: "6px",
                flexWrap: "wrap",
                background: "rgba(15, 23, 42, 0.86)",
                padding: "6px 8px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(6px)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(["satellite", "street", "dark"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMapStyle(mode)}
                  style={{
                    padding: "4px 9px",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: mapStyle === mode ? "1px solid #38bdf8" : "1px solid transparent",
                    background: mapStyle === mode ? "rgba(56, 189, 248, 0.2)" : "transparent",
                    color: mapStyle === mode ? "#38bdf8" : "#cbd5e1",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {mode === "satellite" ? "🛰️ Satellite" : mode === "street" ? "🗺️ Street Map" : "📐 Dark CAD"}
                </button>
              ))}
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11.5px",
                  color: "#e2e8f0",
                  padding: "0 6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={showAllPoles}
                  onChange={(e) => setShowAllPoles(e.target.checked)}
                />
                <span>All Poles</span>
              </label>
              {hldPins.length > 0 && (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11.5px",
                    color: "#fde047",
                    padding: "0 6px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showHldPins}
                    onChange={(e) => setShowHldPins(e.target.checked)}
                  />
                  <span>HLD Pins</span>
                </label>
              )}
            </div>

            {/* Top-right Zoom Controls */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                background: "rgba(15, 23, 42, 0.86)",
                padding: "6px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.min(10, z * 1.3))}
                title="Zoom In"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8fafc",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.max(0.5, z / 1.3))}
                title="Zoom Out"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8fafc",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={resetView}
                title="Reset Full Site View"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "#f8fafc",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>

            {/* Compass North Indicator */}
            <div
              style={{
                position: "absolute",
                bottom: "14px",
                left: "14px",
                zIndex: 10,
                background: "rgba(15, 23, 42, 0.86)",
                padding: "7px 11px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#e2e8f0",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span>⬆️ <strong>N</strong> (Up is North)</span>
              <span>•</span>
              <span style={{ color: "#4ade80" }}>🟢 8-Lines: {count8L}</span>
              <span>•</span>
              <span style={{ color: "#38bdf8" }}>🔵 16-Lines: {count16L}</span>
              {excludedNapPoles.length > 0 && (
                <>
                  <span>•</span>
                  <span style={{ color: "#f87171" }}>🚫 Excluded/Dummy: {excludedNapPoles.length}</span>
                </>
              )}
            </div>

            {/* Selected Pole Floating Quick-Bar on Map */}
            {activePole && (
              <div
                style={{
                  position: "absolute",
                  bottom: "14px",
                  right: "14px",
                  zIndex: 10,
                  background: "rgba(15, 23, 42, 0.94)",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(56, 189, 248, 0.45)",
                  color: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.45)",
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        background: activePole.isExcludedPropNap ? "#64748b" : "#ef4444",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: "11px",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {activePole.isExcludedPropNap ? "EXCLUDED" : `#${(activePole.napIndex ?? 0) + 1}`}
                    </span>
                    <strong style={{ fontSize: "13px" }}>{activePole.name || activePole.tag}</strong>
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    {activePole.lat.toFixed(6)}, {activePole.lon.toFixed(6)}
                    {activePole.matchedHldName ? ` • HLD: ${activePole.matchedHldName}` : ""}
                  </div>
                </div>
                {activePole.isExcludedPropNap ? (
                  <button
                    type="button"
                    onClick={() => onToggleExcludePole(activePole.id, false)}
                    style={{
                      padding: "6px 11px",
                      borderRadius: "7px",
                      border: "1px solid #38bdf8",
                      background: "rgba(56, 189, 248, 0.2)",
                      color: "#38bdf8",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <Undo2 size={14} />
                    <span>Restore Prop NAP</span>
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => onUpdatePoleLines(activePole.id, 8)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "7px",
                        border: activePole.currentLines !== 16 ? "2px solid #22c55e" : "1px solid rgba(255,255,255,0.2)",
                        background: activePole.currentLines !== 16 ? "rgba(34, 197, 94, 0.25)" : "rgba(255,255,255,0.06)",
                        color: activePole.currentLines !== 16 ? "#4ade80" : "#cbd5e1",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      8-Lines (10 Lots)
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePoleLines(activePole.id, 16)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "7px",
                        border: activePole.currentLines === 16 ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.2)",
                        background: activePole.currentLines === 16 ? "rgba(56, 189, 248, 0.25)" : "rgba(255,255,255,0.06)",
                        color: activePole.currentLines === 16 ? "#38bdf8" : "#cbd5e1",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      16-Lines (16 Lots)
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleExcludePole(activePole.id, true)}
                      title="Delete / Exclude this pole from Proposed NAPs (e.g. Dummy NAP — do not generate RES lot boxes)"
                      style={{
                        padding: "6px 9px",
                        borderRadius: "7px",
                        border: "1px solid rgba(239, 68, 68, 0.55)",
                        background: "rgba(239, 68, 68, 0.2)",
                        color: "#fca5a5",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Exclude (Dummy)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SVG Map Viewport */}
            <svg
              viewBox={`${-viewW / 2} ${-viewH / 2} ${viewW} ${viewH}`}
              style={{ width: "100%", height: "100%", display: "block" }}
            >
              <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${effectiveScale})`}>
                {/* 1. Satellite / Street Slippy Map Tiles */}
                {mapStyle !== "dark" &&
                  tiles.map((t) => (
                    <image
                      key={`${mapStyle}-${t.tx}-${t.ty}`}
                      href={t.url}
                      x={t.x}
                      y={t.y}
                      width={256.4}
                      height={256.4}
                      preserveAspectRatio="none"
                      style={{ opacity: mapStyle === "satellite" ? 0.88 : 0.82 }}
                    />
                  ))}

                {/* 2. Roads & Polygons & Cable Routes */}
                {lines.map((line) => {
                  if (line.coords.length < 2) return null;
                  const pts = line.coords
                    .map((c) => {
                      const p = toLocal(c.lat, c.lon);
                      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
                    })
                    .join(" ");
                  const isCable = line.kind === "cable" || line.kind === "hld_route";
                  const isRoad = line.kind === "road";
                  return (
                    <polyline
                      key={line.id}
                      points={pts}
                      fill={line.kind === "polygon" ? "rgba(239, 68, 68, 0.12)" : "none"}
                      stroke={
                        isCable
                          ? "#ef4444"
                          : isRoad
                            ? "rgba(250, 204, 21, 0.65)"
                            : "rgba(248, 113, 113, 0.8)"
                      }
                      strokeWidth={(isCable ? 3.2 : isRoad ? 1.8 : 1.5) / effectiveScale}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}

                {/* 3. Regular Survey Poles */}
                {showAllPoles &&
                  poles
                    .filter((p) => !p.isProposedNap && !p.isExcludedPropNap)
                    .map((pole) => {
                      const pos = toLocal(pole.lat, pole.lon);
                      return (
                        <circle
                          key={pole.id}
                          cx={pos.x}
                          cy={pos.y}
                          r={3.2 / effectiveScale}
                          fill="#f8fafc"
                          stroke="#0f172a"
                          strokeWidth={1.1 / effectiveScale}
                          opacity={0.75}
                        >
                          <title>{`${pole.name || pole.tag} (${pole.lat.toFixed(6)}, ${pole.lon.toFixed(6)})`}</title>
                        </circle>
                      );
                    })}

                {/* 4. Optional HLD Reference Pins (from HLD.kmz) */}
                {showHldPins &&
                  hldPins.map((hld) => {
                    const pos = toLocal(hld.lat, hld.lon);
                    const inv = 1 / effectiveScale;
                    const color =
                      hld.status === "EXISTING"
                        ? "#60a5fa"
                        : hld.status === "DUMMY"
                          ? "#4ade80"
                          : "#fde047";
                    return (
                      <g key={hld.id} transform={`translate(${pos.x}, ${pos.y}) scale(${inv})`}>
                        <circle r={6} fill={color} stroke="#0f172a" strokeWidth={1.8} />
                        <text
                          x={9}
                          y={4}
                          fill="#fef08a"
                          stroke="#0f172a"
                          strokeWidth={3}
                          paintOrder="stroke"
                          fontSize="11"
                          fontWeight="700"
                        >
                          {hld.name}
                        </text>
                      </g>
                    );
                  })}

                {/* 4b. Excluded / Dummy NAP Poles (dimmed gray marker on map, clickable to restore) */}
                {excludedNapPoles.map((pole) => {
                  const pos = toLocal(pole.lat, pole.lon);
                  const inv = 1 / effectiveScale;
                  const isSelected = activePole?.id === pole.id;
                  return (
                    <g
                      key={pole.id}
                      transform={`translate(${pos.x}, ${pos.y}) scale(${inv})`}
                      style={{ cursor: "pointer", opacity: 0.75 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPoleId(pole.id);
                      }}
                    >
                      <circle r={7} fill="#475569" stroke={isSelected ? "#f87171" : "#cbd5e1"} strokeWidth={2} />
                      <line x1={-4} y1={-4} x2={4} y2={4} stroke="#fca5a5" strokeWidth={2} />
                      <line x1={4} y1={-4} x2={-4} y2={4} stroke="#fca5a5" strokeWidth={2} />
                      <text
                        x={10}
                        y={4}
                        fill="#cbd5e1"
                        stroke="#0f172a"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize="10.5"
                        fontWeight="700"
                      >
                        {pole.name || pole.tag} (Excluded/Dummy)
                      </text>
                    </g>
                  );
                })}

                {/* 5. Active Proposed NAP Poles (Prominent Interactive Pins with Number & 8L/16L Badge) */}
                {proposedNapPoles.map((pole) => {
                  const pos = toLocal(pole.lat, pole.lon);
                  const inv = 1 / effectiveScale;
                  const isSelected = activePole?.id === pole.id;
                  const is16 = pole.currentLines === 16;
                  const badgeColor = is16 ? "#0284c7" : "#16a34a";
                  const pinFill = is16 ? "#38bdf8" : "#4ade80";
                  const numLabel = `#${(pole.napIndex ?? 0) + 1}`;

                  return (
                    <g
                      key={pole.id}
                      transform={`translate(${pos.x}, ${pos.y}) scale(${inv})`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPoleId(pole.id);
                      }}
                    >
                      {isSelected && (
                        <>
                          <circle
                            r={24}
                            fill={is16 ? "rgba(56, 189, 248, 0.22)" : "rgba(74, 222, 128, 0.22)"}
                            stroke={pinFill}
                            strokeWidth={2}
                          />
                          <circle r={15} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="3 3" />
                        </>
                      )}

                      <circle r={4.5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />

                      <path
                        d="M 0 -4 C -6 -12 -12 -17 -12 -24 A 12 12 0 1 1 12 -24 C 12 -17 6 -12 0 -4 Z"
                        fill={badgeColor}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? 2.5 : 1.8}
                      />
                      <text
                        x={0}
                        y={-20}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10.5"
                        fontWeight="800"
                      >
                        {numLabel}
                      </text>

                      <g transform="translate(15, -28)">
                        <rect
                          x={0}
                          y={-10}
                          rx={5}
                          ry={5}
                          width={Math.max(108, (pole.matchedHldName || pole.name || pole.tag).length * 6.5 + 48)}
                          height={20}
                          fill="rgba(15, 23, 42, 0.9)"
                          stroke={isSelected ? pinFill : "rgba(255,255,255,0.3)"}
                          strokeWidth={isSelected ? 1.8 : 1}
                        />
                        <text x={6} y={4} fill="#ffffff" fontSize="11" fontWeight="700">
                          {pole.matchedHldName || pole.name || pole.tag}
                        </text>
                        <text
                          x={Math.max(108, (pole.matchedHldName || pole.name || pole.tag).length * 6.5 + 48) - 6}
                          y={4}
                          textAnchor="end"
                          fill={pinFill}
                          fontSize="10.5"
                          fontWeight="800"
                        >
                          {is16 ? "16L" : "8L"}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Right: Interactive Proposed NAP Pole List & Batch Controls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-panel)",
              borderLeft: "1px solid var(--border-soft)",
              minHeight: 0,
            }}
          >
            {/* Quick Batch Presets */}
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-soft)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: "12.5px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Layers size={15} color="#2563eb" />
                  <span>Quick Batch Presets</span>
                </strong>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {proposedNapPoles.length} Active NAPs
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => onBatchUpdateLines("all8")}
                  style={{
                    padding: "6px 6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-main)",
                    cursor: "pointer",
                  }}
                >
                  All 8-Lines
                </button>
                <button
                  type="button"
                  onClick={() => onBatchUpdateLines("all16")}
                  style={{
                    padding: "6px 6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid var(--border-soft)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-main)",
                    cursor: "pointer",
                  }}
                >
                  All 16-Lines
                </button>
                <button
                  type="button"
                  onClick={() => onBatchUpdateLines("first16rest8")}
                  style={{
                    padding: "6px 6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid rgba(37, 99, 235, 0.35)",
                    background: "rgba(37, 99, 235, 0.1)",
                    color: "#2563eb",
                    cursor: "pointer",
                  }}
                >
                  #1=16L • Rest=8L
                </button>
              </div>
            </div>

            {/* Scrollable Pole Cards */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {proposedNapPoles.map((pole) => {
                const isSelected = activePole?.id === pole.id;
                const is16 = pole.currentLines === 16;
                const numLabel = `#${(pole.napIndex ?? 0) + 1}`;
                return (
                  <div
                    key={pole.id}
                    onClick={() => focusOnPole(pole)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: isSelected
                        ? "2px solid #2563eb"
                        : "1px solid var(--border-soft)",
                      background: isSelected
                        ? "rgba(37, 99, 235, 0.08)"
                        : "var(--bg-elevated)",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                        <span
                          style={{
                            padding: "2px 7px",
                            borderRadius: "5px",
                            background: is16 ? "#0284c7" : "#16a34a",
                            color: "#ffffff",
                            fontWeight: 800,
                            fontSize: "11.5px",
                            flexShrink: 0,
                          }}
                        >
                          {numLabel}
                        </span>
                        <strong
                          style={{
                            fontSize: "13px",
                            color: "var(--text-main)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {pole.name || pole.tag}
                        </strong>
                        {pole.name && pole.name !== pole.tag && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>
                            ({pole.tag})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleExcludePole(pole.id, true);
                        }}
                        title="Delete / Exclude this pole from Proposed NAPs (e.g. Dummy NAP — no RES lot boxes)"
                        style={{
                          padding: "3px 7px",
                          fontSize: "11px",
                          fontWeight: 700,
                          borderRadius: "5px",
                          border: "1px solid rgba(220, 38, 38, 0.35)",
                          background: "rgba(220, 38, 38, 0.1)",
                          color: "#dc2626",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          flexShrink: 0,
                        }}
                      >
                        <Trash2 size={12} />
                        <span>Exclude</span>
                      </button>
                    </div>

                    {pole.matchedHldName && (
                      <div
                        style={{
                          fontSize: "11.5px",
                          padding: "3px 8px",
                          borderRadius: "5px",
                          background: "rgba(234, 179, 8, 0.14)",
                          color: "#ca8a04",
                          fontWeight: 700,
                        }}
                      >
                        📌 Matched HLD NAP: {pole.matchedHldName}
                      </div>
                    )}

                    <div
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPoleId(pole.id);
                          onUpdatePoleLines(pole.id, 8);
                        }}
                        style={{
                          padding: "7px 8px",
                          borderRadius: "7px",
                          fontSize: "12px",
                          fontWeight: !is16 ? 800 : 500,
                          border: !is16 ? "2px solid #16a34a" : "1px solid var(--border-soft)",
                          background: !is16 ? "rgba(22, 163, 74, 0.15)" : "var(--bg-panel)",
                          color: !is16 ? "#15803d" : "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        8-Lines (10 Lots)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPoleId(pole.id);
                          onUpdatePoleLines(pole.id, 16);
                        }}
                        style={{
                          padding: "7px 8px",
                          borderRadius: "7px",
                          fontSize: "12px",
                          fontWeight: is16 ? 800 : 500,
                          border: is16 ? "2px solid #0284c7" : "1px solid var(--border-soft)",
                          background: is16 ? "rgba(2, 132, 199, 0.15)" : "var(--bg-panel)",
                          color: is16 ? "#0284c7" : "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        16-Lines (16 Lots)
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Excluded / Dummy NAPs Section (with Restore button) */}
              {excludedNapPoles.length > 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    paddingTop: "10px",
                    borderTop: "1px dashed var(--border-soft)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <strong style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    🚫 Excluded / Dummy NAPs ({excludedNapPoles.length}) — No Lot Boxes
                  </strong>
                  {excludedNapPoles.map((pole) => (
                    <div
                      key={pole.id}
                      onClick={() => focusOnPole(pole)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-soft)",
                        background: "var(--bg-panel)",
                        opacity: 0.85,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "line-through" }}>
                          {pole.name || pole.tag}
                        </strong>
                        {pole.matchedHldName && (
                          <div style={{ fontSize: "10.5px", color: "#dc2626", fontWeight: 600 }}>
                            {pole.matchedHldName}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleExcludePole(pole.id, false);
                        }}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          borderRadius: "6px",
                          border: "1px solid var(--border-soft)",
                          background: "var(--bg-elevated)",
                          color: "#2563eb",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          flexShrink: 0,
                        }}
                      >
                        <Undo2 size={12} />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
