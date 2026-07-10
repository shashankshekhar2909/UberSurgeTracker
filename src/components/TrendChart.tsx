import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import { Clock, TrendingDown, Calendar, BarChart3 } from "lucide-react";
import { ForecastInterval } from "../types";

interface TrendChartProps {
  data: ForecastInterval[];
  weather?: string;
  traffic?: string;
  localEvent?: string;
  timeOfDay?: string;
  comparisonData?: ForecastInterval[];
  comparisonWeather?: string;
  comparisonTraffic?: string;
  comparisonLocalEvent?: string;
  comparisonTimeOfDay?: string;
}

export default function TrendChart({ 
  data, 
  weather = "Clear", 
  traffic = "Moderate", 
  localEvent = "None", 
  timeOfDay = "Midday (13:00)",
  comparisonData,
  comparisonWeather,
  comparisonTraffic,
  comparisonLocalEvent,
  comparisonTimeOfDay
}: TrendChartProps) {
  const [chartMode, setChartMode] = useState<"60m" | "24h">("60m");
  const [activeHoverData, setActiveHoverData] = useState<any | null>(null);

  if (!data || data.length === 0) return null;

  const handleModeChange = (mode: "60m" | "24h") => {
    setChartMode(mode);
    setActiveHoverData(null);
  };

  const hasComparison = !!comparisonData;

  // 1. Format 60-min data labels for display (and merge comparison)
  const formattedData = data.map((item, idx) => {
    const compItem = comparisonData && comparisonData[idx];
    return {
      ...item,
      timeLabel: item.timeOffsetMinutes === 0 ? "Now" : `+${item.timeOffsetMinutes}m`,
      surgeFactorA: item.surgeFactor,
      surgeFactorB: compItem ? compItem.surgeFactor : undefined,
      estimatedWaitMinutesA: item.estimatedWaitMinutes,
      estimatedWaitMinutesB: compItem ? compItem.estimatedWaitMinutes : undefined,
    };
  });

  // Find minimum surge factor to highlight optimal wait duration in 60m mode
  const minSurgeObj = [...data].reduce((prev, current) => 
    (prev.surgeFactor < current.surgeFactor) ? prev : current
  );

  const bestWaitTime = minSurgeObj.timeOffsetMinutes;
  const bestSurge = minSurgeObj.surgeFactor;

  // 2. Generate 24-hour historical peak pattern curve
  const getActiveHour = (timeStr: string): number => {
    if (timeStr.includes("08:00")) return 8;
    if (timeStr.includes("13:00")) return 13;
    if (timeStr.includes("17:30")) return 17;
    if (timeStr.includes("23:00")) return 23;
    if (timeStr.includes("02:00")) return 2;
    return new Date().getHours();
  };

  const activeHour = getActiveHour(timeOfDay);

  const generate24hHistoricalTrend = (wVal: string, tVal: string, eVal: string) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    return hours.map((h) => {
      // Base hourly surge demand baseline profile
      let baseSurge = 1.0;
      if (h >= 7 && h <= 9) {
        baseSurge = 1.6; // Morning rush hour
      } else if (h >= 12 && h <= 13) {
        baseSurge = 1.25; // Midday lunch run
      } else if (h >= 17 && h <= 19) {
        baseSurge = 1.75; // Evening peak rush hour
      } else if (h >= 22 || h <= 2) {
        baseSurge = h === 2 ? 1.45 : (h === 23 || h === 0) ? 1.3 : 1.15;
      } else if (h >= 3 && h <= 5) {
        baseSurge = 1.0; // Deep sleep off-peak hours
      } else {
        baseSurge = 1.1; // Daylight standard off-peak
      }

      // Weather modifier profile
      let weatherModifier = 0;
      if (wVal.includes("Rain") || wVal.includes("Storm")) {
        weatherModifier = 0.25;
      } else if (wVal.includes("Snow") || wVal.includes("Slush")) {
        weatherModifier = 0.35;
      } else if (wVal.includes("Fog") || wVal.includes("Overcast")) {
        weatherModifier = 0.08;
      }

      // Traffic modifier profile
      let trafficModifier = 0;
      if (tVal.includes("Heavy") || tVal.includes("Gridlock")) {
        trafficModifier = 0.35;
      } else if (tVal.includes("Moderate")) {
        trafficModifier = 0.15;
      }

      // Special Event peak hours localized surge impact
      let eventModifier = 0;
      if (eVal && eVal !== "None") {
        if (eVal.includes("Concert") || eVal.includes("Game")) {
          if (h >= 20 && h <= 23) {
            eventModifier = h === 22 ? 0.8 : h === 21 ? 0.4 : 0.5;
          }
        } else if (eVal.includes("Airport")) {
          if ((h >= 11 && h <= 14) || (h >= 17 && h <= 20)) {
            eventModifier = 0.45;
          }
        } else if (eVal.includes("Metro")) {
          if ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) {
            eventModifier = 0.75;
          }
        }
      }

      // Calculate smooth curves
      const historicalAverage = Math.min(3.2, Math.max(1.0, Math.round((baseSurge + weatherModifier * 0.4 + trafficModifier * 0.4 + eventModifier * 0.2) * 10) / 10));
      const todaysSurge = Math.min(3.5, Math.max(1.0, Math.round((baseSurge + weatherModifier + trafficModifier + eventModifier) * 10) / 10));

      const period = h >= 12 ? "PM" : "AM";
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      const hourLabel = `${displayHour}${period}`;

      return {
        hour: h,
        hourLabel,
        historicalAverage,
        todaysSurge,
      };
    });
  };

  const historical24hDataA = generate24hHistoricalTrend(weather, traffic, localEvent);
  const historical24hDataB = hasComparison && comparisonWeather && comparisonTraffic && comparisonLocalEvent
    ? generate24hHistoricalTrend(comparisonWeather, comparisonTraffic, comparisonLocalEvent)
    : [];

  const historical24hData = historical24hDataA.map((item, idx) => {
    const compItem = historical24hDataB[idx];
    return {
      ...item,
      todaysSurgeA: item.todaysSurge,
      todaysSurgeB: compItem ? compItem.todaysSurge : undefined,
    };
  });

  // Custom tooltips styling for 60m decay mode
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg shadow-xl font-sans text-xs">
          <p className="font-semibold text-slate-100 mb-1">{p.timeLabel}</p>
          {hasComparison ? (
            <>
              <p className="text-amber-400 flex items-center justify-between gap-4 font-medium">
                <span>Scenario A Surge:</span>
                <span className="font-bold">{p.surgeFactorA}x</span>
              </p>
              <p className="text-purple-400 flex items-center justify-between gap-4 font-medium mt-0.5">
                <span>Scenario B Surge:</span>
                <span className="font-bold">{p.surgeFactorB}x</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-400 flex items-center gap-1 font-medium">
                <span>Surge Multiplier:</span>
                <span className="font-bold">{payload[0].value}x</span>
              </p>
              <p className="text-sky-400 flex items-center gap-1 font-medium mt-0.5">
                <span>Est. Wait Time:</span>
                <span className="font-bold">{payload[1]?.value} mins</span>
              </p>
              <p className="text-slate-400 text-[10px] mt-1 border-t border-slate-800 pt-1">
                Demand: {p.demandLevel}
              </p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom tooltips styling for 24h mode
  const Custom24hTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const isCurrentHour = item.hour === activeHour;
      return (
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg shadow-xl font-sans text-xs">
          <p className="font-semibold text-slate-100 mb-1 flex items-center gap-1.5">
            <span>{item.hourLabel} Trend</span>
            {isCurrentHour && (
              <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-500/30 font-bold uppercase tracking-wide">
                Current
              </span>
            )}
          </p>
          {hasComparison ? (
            <>
              <p className="text-amber-400 flex items-center justify-between gap-4 font-medium">
                <span>Scenario A Forecast:</span>
                <span className="font-bold">{item.todaysSurgeA}x</span>
              </p>
              <p className="text-purple-400 flex items-center justify-between gap-4 font-medium mt-0.5">
                <span>Scenario B Forecast:</span>
                <span className="font-bold">{item.todaysSurgeB}x</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-400 flex items-center justify-between gap-4 font-medium">
                <span>Today's Forecast:</span>
                <span className="font-bold">{item.todaysSurge}x</span>
              </p>
              <p className="text-slate-400 flex items-center justify-between gap-4 font-medium mt-0.5">
                <span>24h Historical Avg:</span>
                <span className="font-bold text-slate-300">{item.historicalAverage}x</span>
              </p>
              <p className="text-slate-500 text-[10px] mt-1 border-t border-slate-850 pt-1 leading-normal font-mono">
                {item.todaysSurge > item.historicalAverage 
                  ? "⚠️ Above average rush conditions" 
                  : "✔️ Standard baseline pattern"}
              </p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 md:p-6 shadow-md flex flex-col gap-4 font-sans" id="trend-chart-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-200 inline-flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-emerald-400" />
            <span>Demand & Surge Curve Analysis</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {chartMode === "60m" 
              ? "Forecasted pricing and wait-time decay based on simulated city grid metrics."
              : "24-hour historical baseline compared with today's predictable peak patterns."}
          </p>
        </div>

        {/* Chart Mode Toggle */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto shrink-0">
          <button
            onClick={() => handleModeChange("60m")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              chartMode === "60m"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>60m Cool-off</span>
          </button>
          <button
            onClick={() => handleModeChange("24h")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              chartMode === "24h"
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>24h Peak Overlay</span>
          </button>
        </div>
      </div>

      {/* Info context block depending on chart mode */}
      {chartMode === "60m" ? (
        bestWaitTime > 0 && bestSurge < data[0].surgeFactor ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium self-start">
            <Clock className="w-4 h-4" />
            <span>Optimal Book Window: <strong>In {bestWaitTime} mins</strong> ({bestSurge}x)</span>
          </div>
        ) : (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium self-start">
            <Clock className="w-4 h-4" />
            <span>Steady Demand: Price is constant</span>
          </div>
        )
      ) : (
        <div className="bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs px-3 py-1.5 rounded-lg flex flex-wrap items-center gap-2 font-medium self-start">
          <Calendar className="w-4 h-4 text-purple-400" />
          <span>Daily peaks identified at: <strong className="text-white">08:00 AM</strong> & <strong className="text-white">05:30 PM</strong>. Highlight shows simulated active window.</span>
        </div>
      )}

      {/* Real-time Interactive Tooltip Inspector Panel */}
      <div className="min-h-[52px] flex flex-col justify-center">
        {activeHoverData ? (
          <div className="bg-slate-950/70 backdrop-blur-sm border border-amber-500/25 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-slate-400 text-xs font-medium">Inspecting point:</span>
              <span className="text-white font-bold text-xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {chartMode === "60m" ? activeHoverData.timeLabel : activeHoverData.hourLabel}
              </span>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-mono">
              {chartMode === "60m" ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Surge:</span>
                    <strong className="text-amber-400 font-bold">{activeHoverData.surgeFactor}x</strong>
                  </div>
                  <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
                    <span className="text-slate-400">Est. Wait:</span>
                    <strong className="text-sky-400 font-bold">{activeHoverData.estimatedWaitMinutes}m</strong>
                  </div>
                  <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
                    <span className="text-slate-400">Level:</span>
                    <strong className={`${
                      activeHoverData.demandLevel === "Critical" || activeHoverData.demandLevel === "High"
                        ? "text-rose-400"
                        : "text-emerald-400"
                    } font-bold`}>{activeHoverData.demandLevel}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Today's Forecast:</span>
                    <strong className="text-amber-400 font-bold">{activeHoverData.todaysSurge}x</strong>
                  </div>
                  <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
                    <span className="text-slate-400">24h History Avg:</span>
                    <strong className="text-slate-300 font-bold">{activeHoverData.historicalAverage}x</strong>
                  </div>
                  <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4 hidden sm:block">
                    <span className="text-slate-500">Status:</span>
                    <strong className={activeHoverData.todaysSurge > activeHoverData.historicalAverage ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {activeHoverData.todaysSurge > activeHoverData.historicalAverage ? "Congested" : "Normal"}
                    </strong>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic text-center py-2.5 border border-dashed border-slate-800/60 rounded-xl bg-slate-900/10">
            💡 Hover over different points on the chart below to inspect specific real-time surge multipliers and details.
          </div>
        )}
      </div>

      {/* Chart container */}
      <div className="w-full h-[240px] md:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === "60m" ? (
            <LineChart
              data={formattedData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              onMouseMove={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  setActiveHoverData(e.activePayload[0].payload);
                }
              }}
              onMouseLeave={() => {
                setActiveHoverData(null);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} />
              <XAxis 
                dataKey="timeLabel" 
                stroke="#64748b" 
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              {/* Primary Y-Axis (Surge Multiplier) */}
              <YAxis 
                yAxisId="left"
                stroke="#64748b" 
                fontSize={10}
                domain={[1.0, (dataMax: number) => Math.max(2.0, Math.ceil(dataMax * 1.2 * 10) / 10)]}
                tickFormatter={(v) => `${v}x`}
                tickLine={false}
                axisLine={false}
              />
              {/* Secondary Y-Axis (Wait Time) */}
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#64748b" 
                fontSize={10}
                domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax * 1.2))]}
                tickFormatter={(v) => `${v}m`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconSize={8}
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey={hasComparison ? "surgeFactorA" : "surgeFactor"}
                name={hasComparison ? "Scenario A Surge" : "Surge Multiplier"}
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 1 }}
                activeDot={{ r: 6 }}
              />
              {hasComparison ? (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="surgeFactorB"
                  name="Scenario B Surge"
                  stroke="#a855f7"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                />
              ) : (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="estimatedWaitMinutes"
                  name="Est. Wait Time (Mins)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          ) : (
            <AreaChart
              data={historical24hData}
              margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
              onMouseMove={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  setActiveHoverData(e.activePayload[0].payload);
                }
              }}
              onMouseLeave={() => {
                setActiveHoverData(null);
              }}
            >
              <defs>
                <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e293b" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#1e293b" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis 
                dataKey="hourLabel" 
                stroke="#64748b" 
                fontSize={9}
                tickLine={false}
                axisLine={false}
                interval={1} // Shows every alternate hour for readability
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10}
                domain={[1.0, 3.2]}
                tickFormatter={(v) => `${v}x`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<Custom24hTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconSize={8}
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              />
              {/* Historical baseline area */}
              <Area
                type="monotone"
                dataKey="historicalAverage"
                name="24h Historical Average"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="3 3"
                fillOpacity={1}
                fill="url(#colorAvg)"
              />
              {/* Today's forecast surge peak overlay */}
              <Area
                type="monotone"
                dataKey={hasComparison ? "todaysSurgeA" : "todaysSurge"}
                name={hasComparison ? "Scenario A Forecast" : "Today's Surge Profile"}
                stroke="#f59e0b"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorToday)"
              />
              {hasComparison && (
                <Area
                  type="monotone"
                  dataKey="todaysSurgeB"
                  name="Scenario B Forecast"
                  stroke="#a855f7"
                  strokeWidth={3}
                  fillOpacity={0.15}
                  fill="#a855f7"
                />
              )}
              {/* Draw vertical line highlighting the active time window hour */}
              <ReferenceLine
                x={historical24hData[activeHour]?.hourLabel}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="3 3"
                label={{
                  value: "Active Window",
                  position: "top",
                  fill: "#60a5fa",
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

