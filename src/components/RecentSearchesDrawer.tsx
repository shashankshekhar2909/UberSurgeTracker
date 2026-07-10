import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, History, MapPin, Trash2, Clock, CloudRain, Sun, TrafficCone } from "lucide-react";
import { User } from "firebase/auth";

interface RecentSearchesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  searchHistory: any[];
  onSelectHistoryItem: (item: any) => void;
  onDeleteHistoryItem: (id: string, e: React.MouseEvent) => void;
  onClearHistory: () => void;
  user: User | null;
}

export default function RecentSearchesDrawer({
  isOpen,
  onClose,
  searchHistory,
  onSelectHistoryItem,
  onDeleteHistoryItem,
  onClearHistory,
  user
}: RecentSearchesDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 cursor-pointer"
            id="recent-searches-backdrop"
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[440px] bg-slate-950 border-l border-slate-900 shadow-2xl z-50 flex flex-col font-sans text-slate-100"
            id="recent-searches-drawer"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-900 flex items-center justify-between bg-slate-950/80 sticky top-0 backdrop-blur-md z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded bg-amber-500/10 text-amber-500">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-200">Recent Searches</h2>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                    {user ? "Cloud Synchronized Log" : "Local Guest Session"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition"
                aria-label="Close Drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {searchHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4 animate-pulse">
                    <History className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-300">No recent searches found</h3>
                  <p className="text-xs text-slate-500 max-w-[260px] mt-1.5 leading-relaxed">
                    Once you request surge forecasts, your route parameters and conditions will automatically appear here for instant replay.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                    <span>{searchHistory.length} Past Queries</span>
                    <button
                      onClick={onClearHistory}
                      className="text-[10px] text-rose-400 hover:text-rose-300 transition font-bold uppercase tracking-wider"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {searchHistory.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          onSelectHistoryItem(item);
                          onClose();
                        }}
                        className="group bg-slate-900/40 border border-slate-900 hover:border-slate-800 hover:bg-slate-900/80 p-3.5 rounded-2xl cursor-pointer transition flex flex-col gap-2.5 relative overflow-hidden"
                      >
                        {/* Interactive glow effect on hover */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Origin */}
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              <span className="text-xs font-semibold text-slate-200 truncate block">
                                {item.pickupAddress ? item.pickupAddress.split(",")[0] : "My Location"}
                              </span>
                            </div>
                            {/* Destination */}
                            {item.dropoffAddress && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-[11px] text-slate-400 truncate block">
                                  {item.dropoffAddress.split(",")[0]}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Surge indicator & Delete Button */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono shadow-sm ${
                              item.currentSurge > 1.8 
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                                : item.currentSurge > 1.2 
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}>
                              {item.currentSurge}x
                            </span>
                            
                            <button
                              onClick={(e) => onDeleteHistoryItem(item.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 bg-slate-950/60 hover:bg-rose-500/10 rounded-lg text-slate-500 hover:text-rose-400 border border-transparent hover:border-rose-500/10 transition duration-150"
                              title="Delete query"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Metas & Conditions footer */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-2 border-t border-slate-900 text-[10px] text-slate-500 font-mono">
                          <span className="flex items-center gap-1">
                            {item.weather === "Clear" ? "☀️" : "🌧️"} {item.weather}
                          </span>
                          <span className="w-[1.5px] h-2 bg-slate-900" />
                          <span className="flex items-center gap-1">
                            🚗 {item.traffic.split(" ")[0]}
                          </span>
                          <span className="w-[1.5px] h-2 bg-slate-900" />
                          <span className="flex items-center gap-1">
                            🕒 {item.timeOfDay.split(" ")[0]}
                          </span>
                          
                          <span className="ml-auto text-[9px] text-slate-600 flex items-center gap-1 font-sans">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Helper Banner */}
            <div className="p-4 bg-slate-950 border-t border-slate-900 text-[11px] text-slate-500 flex items-center gap-2">
              <span className="text-amber-500 text-xs">💡</span>
              <span>Replays match the historic environmental weather, traffic congestion patterns, and surge calculations.</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
