export type RecommendationType = "BOOK_NOW" | "WAIT_SHORT" | "WALK_NEARBY" | "USE_TRANSIT";

export interface Hotspot {
  name: string;
  distanceMeters: number;
  direction: string;
  surgeFactor: number;
  waitTimeMinutes: number;
  latOffset: number;
  lngOffset: number;
}

export interface ForecastInterval {
  timeOffsetMinutes: number;
  surgeFactor: number;
  estimatedWaitMinutes: number;
  demandLevel: string;
}

export interface TransitAlternative {
  name: string;
  durationMinutes: number;
  cost: number;
  comfortScore: number;
}

export interface SurgeForecastResult {
  currentSurge: number;
  surgeExplanation: string;
  baseFare: number;
  estimatedSurgeFare: number;
  waitTimeNowMinutes: number;
  recommendationType: RecommendationType;
  recommendationTitle: string;
  recommendationText: string;
  hotspotsNearby: Hotspot[];
  forecastTrend: ForecastInterval[];
  transitAlternative: TransitAlternative;
  isSimulated?: boolean;
  errorMessage?: string;
}

export interface SavedRoute {
  id: string;
  name: string;
  pickupAddress: string;
  pickupCoords: { lat: number; lng: number };
  dropoffAddress: string;
  dropoffCoords: { lat: number; lng: number };
}

export interface ScenarioPreset {
  id: string;
  title: string;
  description: string;
  weather: string;
  traffic: string;
  timeOfDay: string;
  localEvent: string;
  icon: string;
}
