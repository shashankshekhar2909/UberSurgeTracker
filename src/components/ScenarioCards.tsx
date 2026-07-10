import { Music, CloudRain, GlassWater, Plane, Zap, Clock } from "lucide-react";
import { ScenarioPreset } from "../types";

interface ScenarioCardsProps {
  scenarios: ScenarioPreset[];
  activeScenarioId?: string;
  onSelectScenario: (scenario: ScenarioPreset) => void;
}

// Calculates standard Uber travel time vs recommended public transit travel time
function calculateScenarioETA(scenario: ScenarioPreset) {
  const weather = scenario.weather;
  const traffic = scenario.traffic;
  const localEvent = scenario.localEvent;
  const timeOfDay = scenario.timeOfDay;

  let surge = 1.0;
  if (weather.includes("Rain") || weather.includes("Storm")) {
    surge += 0.3;
  }
  if (traffic.includes("Heavy") || traffic.includes("Gridlock")) {
    surge += 0.4;
  }
  if (timeOfDay.includes("Rush") || timeOfDay.includes("02:00")) {
    surge += 0.3;
  }
  if (localEvent && localEvent !== "None") {
    surge += 0.5;
  }

  surge = Math.min(Math.round(surge * 10) / 10, 3.2);

  // Uber wait time matches fallback/offline calculator
  const uberWait = Math.round(4 + (surge - 1.0) * 15);

  // Uber driving duration based on traffic congestion level
  let driveMultiplier = 1.0;
  if (traffic.includes("Heavy") || traffic.includes("Gridlock")) {
    driveMultiplier = 2.0;
  } else if (traffic.includes("Moderate")) {
    driveMultiplier = 1.4;
  }
  const uberDrive = Math.round(15 * driveMultiplier);
  const uberTotal = uberWait + uberDrive;

  // Transit alternative duration matches backend calculation model
  const transitTotal = Math.round(uberWait + 12);

  const timeSaved = uberTotal - transitTotal;

  return {
    uberWait,
    uberDrive,
    uberTotal,
    transitTotal,
    timeSaved
  };
}

export default function ScenarioCards({ scenarios, activeScenarioId, onSelectScenario }: ScenarioCardsProps) {
  // Helper to map icon names to Lucide icons
  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case "Music":
        return <Music className="w-5 h-5 text-purple-400" />;
      case "CloudRain":
        return <CloudRain className="w-5 h-5 text-blue-400" />;
      case "GlassWater":
        return <GlassWater className="w-5 h-5 text-pink-400" />;
      case "Plane":
        return <Plane className="w-5 h-5 text-amber-400" />;
      default:
        return <Zap className="w-5 h-5 text-teal-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-3 font-sans">
      <div>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Surge Scenario Simulator</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Select a high-congestion event to instantly test surge spikes, hotspot routing recommendations, and wait trends.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scenarios.map((scenario) => {
          const isActive = activeScenarioId === scenario.id;
          const eta = calculateScenarioETA(scenario);

          return (
            <button
              key={scenario.id}
              onClick={() => onSelectScenario(scenario)}
              className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 outline-none ${
                isActive
                  ? "bg-slate-900 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-slate-100"
                  : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-300"
              }`}
            >
              <div className="flex items-start gap-3 w-full">
                <div className="mt-0.5 p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 shrink-0">
                  {renderIcon(scenario.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold font-sans text-slate-100 block truncate">
                    {scenario.title}
                  </span>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                    {scenario.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[9px] font-mono bg-slate-950 px-1.5 py-0.5 rounded text-slate-400">
                      {scenario.weather}
                    </span>
                    <span className="text-[9px] font-mono bg-slate-950 px-1.5 py-0.5 rounded text-slate-400 font-bold text-amber-400">
                      {scenario.traffic}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time Transit vs Uber travel time ETA comparative analysis module */}
              <div className="w-full mt-1.5 pt-2 border-t border-slate-800/60 flex flex-col gap-1 bg-slate-950/30 p-2 rounded-lg">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="text-blue-400">🚗</span> Uber (Wait + Drive):
                  </span>
                  <span className="font-semibold text-slate-300">{eta.uberTotal}m ({eta.uberWait}w + {eta.uberDrive}d)</span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-400">🚇</span> Public Transit:
                  </span>
                  <span className="font-semibold text-slate-300">{eta.transitTotal}m</span>
                </div>
                <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-slate-800/40">
                  <span className="text-slate-400 font-sans flex items-center gap-1 font-semibold">
                    <Clock className="w-3 h-3 text-slate-400" /> ETA Advantage:
                  </span>
                  <span className={`font-bold font-mono text-[10px] px-1.5 py-0.5 rounded ${
                    eta.timeSaved > 0 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                      : eta.timeSaved < 0 
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" 
                        : "bg-slate-800 text-slate-400"
                  }`}>
                    {eta.timeSaved > 0 
                      ? `🚇 Transit is ${eta.timeSaved}m faster` 
                      : eta.timeSaved < 0 
                        ? `🚗 Uber is ${Math.abs(eta.timeSaved)}m faster` 
                        : "Equal travel times"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
