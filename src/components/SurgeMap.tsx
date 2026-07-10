import { useState, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin, Navigation, Info, ExternalLink, Flame, Plus, Minus } from "lucide-react";
import { Hotspot } from "../types";

// Expose API Key from environmental define or vite environment variables
const API_KEY =
  (typeof process !== "undefined" && process.env?.GOOGLE_MAPS_PLATFORM_KEY) ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  "";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "" && !API_KEY.includes("YOUR_API_KEY") && !API_KEY.includes("MY_GOOGLE_MAPS");

interface SurgeMapProps {
  pickupCoords: { lat: number; lng: number };
  pickupAddress: string;
  dropoffCoords?: { lat: number; lng: number };
  dropoffAddress?: string;
  hotspots: Hotspot[];
  onSelectHotspot: (hotspot: Hotspot) => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: (show: boolean) => void;
}

// Custom Heatmap Layer helper component using standard, fully-supported google.maps.Circle overlays
function GoogleHeatmapLayer({ points }: { points: { lat: number; lng: number; weight: number }[] }) {
  const map = useMap();
  const pointsKey = JSON.stringify(points);

  useEffect(() => {
    const g = (window as any).google;
    if (!map || !g || !g.maps) return;

    const circles: any[] = [];

    points.forEach((p) => {
      const layersCount = 10;
      const baseRadius = 260;
      const baseOpacity = 0.045;

      for (let i = 0; i < layersCount; i++) {
        const ratio = (i + 1) / layersCount;
        const radius = baseRadius * (1 - ratio * 0.85);
        const color = ratio > 0.7 ? "#ef4444" : ratio > 0.4 ? "#f59e0b" : "#f43f5e";
        const opacity = baseOpacity * ratio * (p.weight / 8);

        try {
          const circle = new g.maps.Circle({
            strokeWeight: 0,
            fillColor: color,
            fillOpacity: Math.min(0.85, opacity),
            map: map,
            center: { lat: p.lat, lng: p.lng },
            radius: radius,
            clickable: false
          });
          circles.push(circle);
        } catch (err) {
          console.error("Circle render failed:", err);
        }
      }
    });

    return () => {
      circles.forEach((c) => {
        try {
          c.setMap(null);
        } catch (err) {
          // ignore
        }
      });
    };
  }, [map, pointsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// Custom Map Handler to manage centering and auto-fit bounds on pickup/dropoff changes
// without overriding manual user panning and zoom states (uncontrolled behavior).
function MapHandler({
  pickupCoords,
  dropoffCoords,
  recenterTrigger
}: {
  pickupCoords: { lat: number; lng: number };
  dropoffCoords?: { lat: number; lng: number };
  recenterTrigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    const g = (window as any).google;
    if (!map || !g || !g.maps) return;

    if (dropoffCoords) {
      try {
        const bounds = new g.maps.LatLngBounds();
        bounds.extend(pickupCoords);
        bounds.extend(dropoffCoords);
        map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
      } catch (err) {
        console.error("Failed to fit bounds:", err);
      }
    } else {
      map.panTo(pickupCoords);
      map.setZoom(15);
    }
  }, [map, pickupCoords.lat, pickupCoords.lng, dropoffCoords?.lat, dropoffCoords?.lng, recenterTrigger]);

  return null;
}

// Custom Zoom Controls Component overlaying the map
function MapZoomControls() {
  const map = useMap();

  const handleZoomIn = () => {
    if (!map) return;
    try {
      const zoom = map.getZoom();
      if (zoom !== undefined) {
        map.setZoom(zoom + 1);
      }
    } catch (err) {
      console.error("Failed to zoom in:", err);
    }
  };

  const handleZoomOut = () => {
    if (!map) return;
    try {
      const zoom = map.getZoom();
      if (zoom !== undefined) {
        map.setZoom(zoom - 1);
      }
    } catch (err) {
      console.error("Failed to zoom out:", err);
    }
  };

  return (
    <div className="absolute top-[135px] right-4 flex flex-col gap-1.5 z-20">
      <button
        type="button"
        onClick={handleZoomIn}
        className="w-8 h-8 rounded-lg bg-slate-900/95 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer select-none"
        title="Zoom In"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={handleZoomOut}
        className="w-8 h-8 rounded-lg bg-slate-900/95 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer select-none"
        title="Zoom Out"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function SurgeMap({
  pickupCoords,
  pickupAddress,
  dropoffCoords,
  dropoffAddress,
  hotspots,
  onSelectHotspot,
  showHeatmap: propShowHeatmap,
  onToggleHeatmap
}: SurgeMapProps) {
  const [radarAngle, setRadarAngle] = useState(0);
  const [localShowHeatmap, setLocalShowHeatmap] = useState(true);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [forceSimulated, setForceSimulated] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const showHeatmap = propShowHeatmap !== undefined ? propShowHeatmap : localShowHeatmap;
  const toggleHeatmap = () => {
    if (onToggleHeatmap) {
      onToggleHeatmap(!showHeatmap);
    } else {
      setLocalShowHeatmap(!localShowHeatmap);
    }
  };

  // Catch Google Maps API auth failures (like ApiNotActivatedMapError) globally
  useEffect(() => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    const checkForMapErrors = (msg: string) => {
      if (
        msg.includes("ApiNotActivatedMapError") ||
        msg.includes("InvalidKeyMapError") ||
        msg.includes("ApiProjectMapError") ||
        msg.includes("DeletedKeyMapError") ||
        msg.includes("Google Maps JavaScript API error")
      ) {
        console.log("🔄 [Google Maps Auto-Fallback] Detected Maps API issue. Safely switching to Tactical Radar Grid.");
        setMapLoadError(true);
      }
    };

    console.error = (...args: any[]) => {
      const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
      checkForMapErrors(msg);
      originalConsoleError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const msg = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
      checkForMapErrors(msg);
      originalConsoleWarn.apply(console, args);
    };

    const handleAuthFailure = () => {
      console.warn("Google Maps API auth failure (e.g., ApiNotActivatedMapError or Invalid API Key). Switching map to simulated radar mode.");
      setMapLoadError(true);
    };
    (window as any).gm_authFailure = handleAuthFailure;

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      if ((window as any).gm_authFailure === handleAuthFailure) {
        (window as any).gm_authFailure = null;
      }
    };
  }, []);

  // Rotate simulated radar sweep
  useEffect(() => {
    let animationFrameId: number;
    const rotate = () => {
      setRadarAngle((prev) => (prev + 1.2) % 360);
      animationFrameId = requestAnimationFrame(rotate);
    };
    animationFrameId = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Compute heatmap coordinates and weight factors for Google Maps visualization
  const heatmapPoints = [
    // Core center demand hotspot (Pickup location)
    { lat: pickupCoords.lat, lng: pickupCoords.lng, weight: 8 },
    // Surrounding demand surges
    ...hotspots.map((h) => ({
      lat: pickupCoords.lat + h.latOffset,
      lng: pickupCoords.lng + h.lngOffset,
      weight: Math.max(1, Math.round(h.surgeFactor * 3.5))
    }))
  ];

  if (hasValidKey && !mapLoadError && !forceSimulated) {
    return (
      <div className="relative w-full h-[400px] md:h-[480px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl" id="google-map-container">
        <APIProvider 
          apiKey={API_KEY} 
          version="weekly" 
          libraries={["places"]}
          onError={(err) => {
            console.error("Google Maps failed to load, safely falling back to simulated radar map.", err);
            setMapLoadError(true);
          }}
        >
          <Map
            defaultCenter={pickupCoords}
            defaultZoom={15}
            mapId="DEMO_MAP_ID"
            style={{ width: "100%", height: "100%" }}
            internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
            options={{
              styles: [
                { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
                { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
                { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
                { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
                { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#020617" }] }
              ]
            }}
          >
            {/* Custom Map handler to allow uncontrolled manual zoom and panning with bounds fitting on coordinate changes */}
            <MapHandler pickupCoords={pickupCoords} dropoffCoords={dropoffCoords} recenterTrigger={recenterTrigger} />

            {/* Custom precise zoom buttons overlaying the map context */}
            <MapZoomControls />

            {/* Real-time Heatmap Overlay layer conditional rendering */}
            {showHeatmap && <GoogleHeatmapLayer points={heatmapPoints} />}

            {/* Pickup Marker */}
            {pickupAddress && (
              <AdvancedMarker position={pickupCoords} title="Your Pickup Location">
                <div className="flex flex-col items-center">
                  <div className="bg-blue-600/95 border border-blue-400 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-[0_4px_12px_rgba(59,130,246,0.3)] mb-1 whitespace-nowrap flex items-center gap-1">
                    <span>📍</span>
                    <span>Pickup (A)</span>
                  </div>
                  <Pin background="#3b82f6" glyphColor="#ffffff" scale={1.0} />
                </div>
              </AdvancedMarker>
            )}

            {/* Dropoff Marker if available */}
            {dropoffAddress && dropoffCoords && (
              <AdvancedMarker position={dropoffCoords} title="Dropoff Location">
                <div className="flex flex-col items-center">
                  <div className="bg-emerald-600/95 border border-emerald-400 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-[0_4px_12px_rgba(16,185,129,0.3)] mb-1 whitespace-nowrap flex items-center gap-1">
                    <span>🏁</span>
                    <span>Dropoff (B)</span>
                  </div>
                  <Pin background="#10b981" glyphColor="#ffffff" scale={1.0} />
                </div>
              </AdvancedMarker>
            )}
          </Map>
        </APIProvider>

        {/* Floating Google Maps Active indicator */}
        <div className="absolute bottom-3 left-3 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-emerald-400 font-mono shadow-md z-10">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>LIVE GOOGLE MAP ACTIVE</span>
        </div>

        {/* Live Map Legend */}
        <div className="absolute bottom-4 right-4 bg-slate-900/95 border border-slate-800 rounded-lg px-3 py-1.5 flex flex-col gap-1.5 text-[10px] font-mono text-slate-400 shadow-lg z-10 backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white/10" />
            <span>Active Pickup (A)</span>
          </div>
          {dropoffCoords && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/10" />
              <span>Dropoff Destination (B)</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white/10" />
            <span>High Surge (&gt;1.5x)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white/10" />
            <span>Mod Surge (1.3x-1.5x)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/10" />
            <span>Low Surge (&lt;1.3x)</span>
          </div>
        </div>

        {/* Dynamic Fallback Switch Panel (For ApiNotActivatedMapError / Offline use) */}
        <div className="absolute top-4 left-4 bg-slate-900/95 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 backdrop-blur-md shadow-lg z-20 max-w-[240px] font-sans">
          <span className="text-[10px] text-slate-400 leading-normal">
            If map appears blank, gray, or shows API activation/quota errors:
          </span>
          <button
            onClick={() => setForceSimulated(true)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Navigation className="w-3 h-3 rotate-45" />
            <span>Switch to Offline Radar Grid</span>
          </button>
        </div>

        {/* Floating Map Toggle Panel */}
        <div className="absolute top-4 right-4 bg-slate-900/95 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 backdrop-blur-md shadow-lg z-20 w-48 font-sans">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">Heatmap Layer</span>
            <button
              onClick={toggleHeatmap}
              className={`px-2 py-1 rounded-md border flex items-center gap-1 text-[10px] font-bold transition-all ${
                showHeatmap
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Flame className={`w-3 h-3 ${showHeatmap ? "animate-pulse fill-amber-400/10" : ""}`} />
              <span>{showHeatmap ? "ON" : "OFF"}</span>
            </button>
          </div>
          <div className="h-[1px] bg-slate-800/80 my-1" />
          <button
            onClick={() => setRecenterTrigger((prev) => prev + 1)}
            className="w-full bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg py-1 text-[10px] font-extrabold border border-slate-800 hover:border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm select-none"
          >
            <span>🎯 Recenter & Fit View</span>
          </button>
        </div>
      </div>
    );
  }

  // Calculate relative coordinate offset for dropoff destination on fallback map
  const xDropoffOffsetPx = dropoffCoords ? (dropoffCoords.lng - pickupCoords.lng) * 50000 : 0;
  const yDropoffOffsetPx = dropoffCoords ? -(dropoffCoords.lat - pickupCoords.lat) * 50000 : 0;

  // Render Premium Custom Vector Demand Radar Grid when API key is missing
  return (
    <div className="relative w-full h-[400px] md:h-[480px] rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 shadow-xl flex flex-col items-center justify-center font-sans">
      
      {/* Dynamic Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #334155 1px, transparent 1px),
            linear-gradient(to bottom, #334155 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          backgroundPosition: 'center center'
        }}
      />

      {/* Heatmap intensity overlay elements (Visualized as glowing radial thermal gradients) */}
      {showHeatmap && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {/* Pickup location central high surge heat signature */}
          <div 
            className="absolute w-[240px] h-[240px] rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.22)_0%,rgba(244,63,94,0.08)_45%,transparent_75%)] animate-pulse"
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />

          {/* Hotspots heat signatures */}
          {hotspots.map((hotspot, idx) => {
            const xOffsetPx = hotspot.lngOffset * 50000;
            const yOffsetPx = -hotspot.latOffset * 50000;
            const isHighSurge = hotspot.surgeFactor > 1.5;
            const heatColor = isHighSurge 
              ? "rgba(244,63,94,0.25)" 
              : hotspot.surgeFactor > 1.2 
              ? "rgba(245,158,11,0.2)" 
              : "rgba(16,185,129,0.14)";

            const scaleRadius = Math.round(110 + hotspot.surgeFactor * 50);

            return (
              <div 
                key={`heat-${idx}`}
                className="absolute rounded-full transition-transform"
                style={{
                  left: `calc(50% + ${xOffsetPx}px)`,
                  top: `calc(50% + ${yOffsetPx}px)`,
                  width: `${scaleRadius}px`,
                  height: `${scaleRadius}px`,
                  transform: 'translate(-50%, -50%)',
                  background: `radial-gradient(circle, ${heatColor} 0%, rgba(15,23,42,0) 70%)`
                }}
              />
            );
          })}
        </div>
      )}

      {/* Radar Circular Grid rings */}
      <div className="absolute w-[360px] h-[360px] border border-slate-800/60 rounded-full flex items-center justify-center pointer-events-none">
        <div className="w-[280px] h-[280px] border border-slate-800/40 rounded-full flex items-center justify-center">
          <div className="w-[200px] h-[200px] border border-slate-800/30 rounded-full flex items-center justify-center">
            <div className="w-[120px] h-[120px] border border-slate-800/20 rounded-full flex items-center justify-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_#3b82f6]" />
            </div>
          </div>
        </div>
      </div>

      {/* Axis crosshairs */}
      <div className="absolute w-[380px] h-[1px] bg-slate-800/40 pointer-events-none" />
      <div className="absolute h-[380px] w-[1px] bg-slate-800/40 pointer-events-none" />

      {/* Radar Sweep Arc */}
      <div 
        className="absolute w-[180px] h-[180px] origin-bottom-right opacity-30 pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          marginTop: '-180px',
          marginLeft: '-180px',
          background: 'conic-gradient(from 0deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0) 60%)',
          transform: `rotate(${radarAngle}deg)`,
          borderRadius: '100% 0 0 0'
        }}
      />

      {/* Pickup Marker (Center) */}
      {pickupAddress && (
        <div className="absolute flex flex-col items-center gap-1 z-10 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-9 h-9 bg-blue-500/20 border-2 border-blue-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <MapPin className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-[10px] font-mono text-blue-300 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded backdrop-blur-sm max-w-[140px] truncate text-center">
            Pickup Location
          </span>
        </div>
      )}

      {/* Dropoff Marker if available */}
      {dropoffAddress && dropoffCoords && (
        <div 
          className="absolute flex flex-col items-center gap-1 z-10 transition-transform duration-300 animate-in fade-in zoom-in-95 duration-200"
          style={{
            transform: `translate(${xDropoffOffsetPx}px, ${yDropoffOffsetPx}px)`
          }}
        >
          <div className="w-9 h-9 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)]">
            <span className="text-xs">🏁</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-300 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded backdrop-blur-sm max-w-[140px] truncate text-center">
            Dropoff Destination
          </span>
        </div>
      )}

      {/* Floating Instructions Banner */}
      <div className="absolute top-4 left-4 right-4 bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5 backdrop-blur-md shadow-lg z-20 max-w-[420px]">
        <div className="flex items-start gap-2.5">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <span className="font-semibold text-slate-100 block">Surge Demand Vector Grid Active</span>
            <p className="text-slate-400 mt-0.5">
              Please enter a destination address to compute real-time surge pricing, wait times, and recommended alternate travel modes.
            </p>
          </div>
        </div>

        <div className="h-[1px] bg-slate-800" />

        {/* Real-time interactive Heatmap control switch */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Demand Thermal Heatmap:</span>
          </span>
          <button
            onClick={toggleHeatmap}
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 text-[10px] font-bold transition-all ${
              showHeatmap
                ? "bg-amber-500/15 border-amber-500/30 text-amber-400 font-bold"
                : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
            }`}
          >
            <span>{showHeatmap ? "ENABLED" : "DISABLED"}</span>
          </button>
        </div>

        <div className="h-[1px] bg-slate-800" />

        {hasValidKey ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Google Maps key configured:</span>
            <button 
              onClick={() => setForceSimulated(false)}
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5 font-bold transition cursor-pointer bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded"
            >
              <span>Enable Google Map</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium">To activate real Google Maps:</span>
            <a 
              href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-semibold transition"
            >
              <span>Get API Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Static grid legend */}
      <div className="absolute bottom-4 right-4 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 flex flex-col gap-1.5 text-[10px] font-mono text-slate-400 shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white/10" />
          <span>Active Pickup</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/10" />
          <span>Low Surge (&lt;1.3x)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white/10" />
          <span>Mod Surge (1.3x-1.5x)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white/10" />
          <span>High Surge (&gt;1.5x)</span>
        </div>
      </div>
    </div>
  );
}

