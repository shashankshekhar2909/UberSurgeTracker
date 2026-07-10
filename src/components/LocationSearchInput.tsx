import React, { useState, useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin, Search } from "lucide-react";

interface LocationSearchInputProps {
  value: string;
  onChange: (address: string, coords?: { lat: number; lng: number }) => void;
  placeholder: string;
  label: string;
  iconColor: string;
  borderColorFocus: string;
  letter: "A" | "B";
  hasValidKey: boolean;
  onClearScenario?: () => void;
}

const SIMULATED_PLACES = [
  { name: "Times Square, New York, NY", lat: 40.7580, lng: -73.9855 },
  { name: "LaGuardia Airport (LGA), Queens, NY", lat: 40.7769, lng: -73.8740 },
  { name: "JFK International Airport, Queens, NY", lat: 40.6413, lng: -73.7781 },
  { name: "Grand Central Terminal, New York, NY", lat: 40.7527, lng: -73.9772 },
  { name: "Penn Station, New York, NY", lat: 40.7505, lng: -73.9935 },
  { name: "Empire State Building, New York, NY", lat: 40.7484, lng: -73.9857 },
  { name: "Central Park, New York, NY", lat: 40.7850, lng: -73.9683 },
  { name: "Brooklyn Bridge, New York, NY", lat: 40.7061, lng: -73.9969 },
  { name: "Wall Street, New York, NY", lat: 40.7069, lng: -74.0113 },
  { name: "The High Line, New York, NY", lat: 40.7480, lng: -74.0048 },
];

export default function LocationSearchInput({
  value,
  onChange,
  placeholder,
  label,
  iconColor,
  borderColorFocus,
  letter,
  hasValidKey,
  onClearScenario
}: LocationSearchInputProps) {
  const [localInput, setLocalInput] = useState(value);
  const [showSimulatedSuggestions, setShowSimulatedSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Google Maps Places Autocomplete setup
  const placesLib = useMapsLibrary("places");
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  // Sync external value changes to local input state
  useEffect(() => {
    setLocalInput(value);
  }, [value]);

  // Handle Autocomplete binding when places library loads and input exists
  useEffect(() => {
    if (!hasValidKey || !placesLib || !inputRef.current) return;

    try {
      const options = {
        fields: ["geometry", "name", "formatted_address"],
        // Bias results towards New York metropolitan area
        bounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(40.4773, -74.2590),
          new google.maps.LatLng(40.9176, -73.7004)
        )
      };

      const ac = new placesLib.Autocomplete(inputRef.current, options);
      setAutocomplete(ac);

      return () => {
        // Clean up listeners from Google Maps namespace
        google.maps.event.clearInstanceListeners(ac);
      };
    } catch (err) {
      console.error("Failed to bind Google Maps Autocomplete widget:", err);
    }
  }, [placesLib, hasValidKey]);

  // Handle Autocomplete selection events
  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place && place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || place.name || "";
        
        setLocalInput(address);
        onChange(address, { lat, lng });
        if (onClearScenario) onClearScenario();
      }
    });

    return () => {
      listener.remove();
    };
  }, [autocomplete, onChange, onClearScenario]);

  // Close simulated suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSimulatedSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter local simulated places based on typed text
  const filteredSimulated = localInput
    ? SIMULATED_PLACES.filter((p) =>
        p.name.toLowerCase().includes(localInput.toLowerCase())
      )
    : SIMULATED_PLACES;

  const handleSimulatedSelect = (place: typeof SIMULATED_PLACES[0]) => {
    setLocalInput(place.name);
    onChange(place.name, { lat: place.lat, lng: place.lng });
    if (onClearScenario) onClearScenario();
    setShowSimulatedSuggestions(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalInput(val);
    
    // When typed manually (and not chosen via Autocomplete yet), let parent know the text changed
    // If we have a valid key, Google's Autocomplete will handle coordinate resolving.
    // If not, we still update text; if they click a simulation suggestion, coordinates get updated.
    onChange(val);
    if (onClearScenario) onClearScenario();
  };

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef} id={`search-container-${letter}`}>
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 select-none">
        <MapPin className={`w-3.5 h-3.5 ${iconColor}`} />
        <span>{label}</span>
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={localInput}
          onChange={handleInputChange}
          onFocus={() => {
            if (!hasValidKey) {
              setShowSimulatedSuggestions(true);
            }
          }}
          placeholder={placeholder}
          className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium ${borderColorFocus}`}
        />
        
        {/* Subtle search icon decoration inside input */}
        <div className="absolute right-3.5 top-3 text-slate-500 pointer-events-none flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-slate-500/60" />
          <span className="text-[10px] font-mono text-slate-600 font-bold">{letter}</span>
        </div>

        {/* Fallback Simulated/Mock Suggestions List (rendered when Google Maps key is missing) */}
        {!hasValidKey && showSimulatedSuggestions && filteredSimulated.length > 0 && (
          <div className="absolute left-0 right-0 mt-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-800/40 backdrop-blur-md">
            <div className="bg-slate-950/60 px-3.5 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Popular Demand Presets (Simulated)</span>
              <span className="text-blue-400 font-mono text-[9px] lowercase font-normal">tap to select</span>
            </div>
            {filteredSimulated.map((place, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSimulatedSelect(place)}
                className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800/80 active:bg-slate-800 flex items-center gap-2.5 transition"
              >
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold block truncate text-slate-200">{place.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    Lat: {place.lat.toFixed(4)}, Lng: {place.lng.toFixed(4)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
