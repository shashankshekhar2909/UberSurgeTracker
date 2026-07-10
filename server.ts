import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini SDK to prevent startup crashes if GEMINI_API_KEY is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined. Please configure it in your AI Studio Secrets panel.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Quick pre-packaged simulated scenarios for citywide surge testing
const ACTIVE_SCENARIOS = [
  {
    id: "concert",
    title: "Stadium Concert Exit",
    description: "A major stadium show of 70,000 attendees just concluded. Public transport is overflowing and ride requests are in extreme demand.",
    weather: "Clear Night",
    traffic: "Heavy Gridlock",
    timeOfDay: "Late Night (23:00)",
    localEvent: "Stadium Concert",
    icon: "Music"
  },
  {
    id: "rush_rain",
    title: "Heavy Downpour Morning Rush",
    description: "Peak work transit times combined with a sudden flash thunderstorm. Everyone is seeking shelter and avoiding walking.",
    weather: "Heavy Rain",
    traffic: "Heavy Gridlock",
    timeOfDay: "Morning Rush (08:00)",
    localEvent: "None",
    icon: "CloudRain"
  },
  {
    id: "friday_night",
    title: "Friday Bar Crawl Peak",
    description: "It is 2:00 AM on a Saturday morning. Downtown entertainment districts are packed with club goers looking to head home.",
    weather: "Chilly",
    traffic: "Moderate",
    timeOfDay: "Late Night Weekend (02:00)",
    localEvent: "Friday Night Out",
    icon: "GlassWater"
  },
  {
    id: "airport_congestion",
    title: "Airport Terminal Flight Delays",
    description: "Three large international flights landed simultaneously during a ground crew strike, leading to an hour-long taxi queue.",
    weather: "Overcast",
    traffic: "Light",
    timeOfDay: "Midday (13:00)",
    localEvent: "Airport Congestion",
    icon: "Plane"
  }
];

// Helper to calculate high-fidelity simulated surge when Gemini is not available
function calculateFallbackSurge(weather: string, traffic: string, timeOfDay: string, localEvent: string) {
  let surge = 1.0;
  let explanation = "Simulated standard demand conditions.";

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

  // Cap surge at a realistic maximum of 3.2x
  surge = Math.min(Math.round(surge * 10) / 10, 3.2);

  if (surge > 1.8) {
    explanation = `High surge detected (${surge}x) due to compounding factors: ${localEvent !== "None" ? localEvent : "active peak hours"}, heavy ${traffic.toLowerCase()} traffic, and ${weather.toLowerCase()} conditions.`;
  } else if (surge > 1.2) {
    explanation = `Moderate surge detected (${surge}x) driven by ${traffic.toLowerCase()} traffic and current ${weather.toLowerCase()} conditions.`;
  } else {
    explanation = "Standard pricing is active. Driver supply matches ride request volume perfectly.";
  }

  const baseFare = 15.0;
  const estimatedSurgeFare = Math.round(baseFare * surge * 100) / 100;
  const waitTimeNowMinutes = Math.round(4 + (surge - 1.0) * 15);

  let recommendationType = "BOOK_NOW";
  let recommendationTitle = "Safe to book now";
  let recommendationText = "Surge rates are low or standard. You should book your ride now to avoid any upcoming shifts in driver availability.";

  if (surge > 1.8) {
    recommendationType = "WAIT_OR_WALK";
    recommendationTitle = "Walk to lower-surge zone";
    recommendationText = "Surge pricing is heavily concentrated here. Walking 300 meters away from this high-density hotspot will lower the surge multiplier to ~1.2x and shave 8 minutes off your wait time.";
  } else if (surge > 1.3) {
    recommendationType = "WAIT_SHORT";
    recommendationTitle = "Wait 10-15 minutes";
    recommendationText = "A short wait is advised. Demand is currently peaking but will cool off shortly as drivers complete current trips in this sector.";
  }

  const hotspotsNearby = [
    {
      name: "Nearby Hotspot (Avenue Point)",
      distanceMeters: 350,
      direction: "North-West",
      surgeFactor: Math.max(1.0, Math.round((surge - 0.4) * 10) / 10),
      waitTimeMinutes: Math.max(3, waitTimeNowMinutes - 6),
      latOffset: 0.0018,
      lngOffset: -0.0012
    },
    {
      name: "Nearby Transit Hub (Broad St)",
      distanceMeters: 550,
      direction: "South-East",
      surgeFactor: Math.max(1.0, Math.round((surge - 0.6) * 10) / 10),
      waitTimeMinutes: Math.max(2, waitTimeNowMinutes - 8),
      latOffset: -0.0025,
      lngOffset: 0.0022
    }
  ];

  // Forecast trend over 60 mins
  const forecastTrend = [];
  for (let i = 0; i <= 60; i += 10) {
    // Diminish surge factor over time towards 1.0
    const factor = Math.max(1.0, Math.round((surge - (i / 60) * (surge - 1.0)) * 10) / 10);
    const wait = Math.max(3, Math.round(waitTimeNowMinutes - (i / 60) * (waitTimeNowMinutes - 3)));
    let dLevel = "Low";
    if (factor > 1.8) dLevel = "Critical";
    else if (factor > 1.3) dLevel = "High";
    else if (factor > 1.1) dLevel = "Moderate";

    forecastTrend.push({
      timeOffsetMinutes: i,
      surgeFactor: factor,
      estimatedWaitMinutes: wait,
      demandLevel: dLevel
    });
  }

  return {
    currentSurge: surge,
    surgeExplanation: explanation,
    baseFare,
    estimatedSurgeFare,
    waitTimeNowMinutes,
    recommendationType,
    recommendationTitle,
    recommendationText,
    hotspotsNearby,
    forecastTrend,
    transitAlternative: {
      name: "Red Line Metro / Subway Transit",
      durationMinutes: Math.round(waitTimeNowMinutes + 12),
      cost: 2.75,
      comfortScore: 7
    },
    isSimulated: true
  };
}

// Helper to sanitize Gemini API error logs to avoid dumping raw JSON structure to console
function sanitizeGeminiErrorLog(err: any): string {
  const errMsg = err?.message || String(err);
  if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
    return "Gemini API Quota Limit Exceeded (429 Resource Exhausted). Directing to high-fidelity offline simulation.";
  }
  try {
    const parsed = JSON.parse(errMsg);
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch (e) {
    // Treat as plain text
  }
  return errMsg.slice(0, 150);
}

// Endpoint to fetch active scenarios
app.get("/api/surge/scenarios", (req, res) => {
  res.json({ scenarios: ACTIVE_SCENARIOS });
});

// Primary Endpoint: Post search parameters to compute real-time surge demand predictions
app.post("/api/surge/forecast", async (req, res) => {
  const { pickupAddress, pickupCoords, dropoffAddress, dropoffCoords, weather, traffic, timeOfDay, localEvent } = req.body;

  const activeWeather = weather || "Clear";
  const activeTraffic = traffic || "Light";
  const activeTime = timeOfDay || "Midday (13:00)";
  const activeEvent = localEvent || "None";

  // Check if we have an active Gemini API key
  const hasKey = !!process.env.GEMINI_API_KEY;

  if (!hasKey) {
    // Generate simulated high-fidelity response instantly
    const result = calculateFallbackSurge(activeWeather, activeTraffic, activeTime, activeEvent);
    return res.json(result);
  }

  try {
    const ai = getGeminiClient();

    const prompt = `You are an advanced Uber Surge Demand Forecaster and Cab Wait-time optimizer.
Analyze the following travel scenario and output a JSON object indicating the real-time surge multiplier, detailed waiting recommendation strategies, lower-surge walking hotspot offsets, and a 60-minute forecast trend.

SCENARIO METADATA:
- Pickup Address: "${pickupAddress || "Selected Location on Map"}"
- Dropoff Address: "${dropoffAddress || "Not Selected"}"
- Weather: "${activeWeather}"
- Traffic Congestion: "${activeTraffic}"
- Time of Day: "${activeTime}"
- Active Local Event: "${activeEvent}"

YOUR GOAL:
Calculate an intelligent, realistic ride-hailing surge scenario. Base fares are normally $12.00 to $18.00 depending on location, weather, and peak periods. Surge multiplier ranges from 1.0x (normal price) to 3.5x (extreme supply shock). Wait times range from 2 minutes (supply abundant) to 30 minutes (supply starved).

You MUST return a JSON object with the exact fields specified in this schema. DO NOT wrap with anything other than the JSON itself.

RESPONSE SCHEMA (Return ONLY raw valid JSON):
{
  "currentSurge": number (e.g. 1.6, must be a float between 1.0 and 3.5),
  "surgeExplanation": "A short, 1-2 sentence professional explanation of current surge mechanics (e.g., 'Heavy rain paired with peak evening rush hour is causing a 40% surge in ride demand downtown.')",
  "baseFare": number (e.g. 15.50),
  "estimatedSurgeFare": number (calculated as baseFare * currentSurge),
  "waitTimeNowMinutes": number (estimated current wait time for a cab at this spot, in minutes),
  "recommendationType": "BOOK_NOW" | "WAIT_SHORT" | "WALK_NEARBY" | "USE_TRANSIT" (based on what saves the most time and money),
  "recommendationTitle": "Short, catchy title of advice",
  "recommendationText": "Detailed, specific advice guiding the user on how to avoid the surge. If recommendation is WALK_NEARBY, explain exactly why walking 3-5 minutes nearby drops the surge. If recommendation is WAIT_SHORT, explain when the peak will drop.",
  "hotspotsNearby": [
    {
      "name": "Specific street intersection or building 200-500 meters away with less demand",
      "distanceMeters": number (e.g., 280),
      "direction": "Compass direction (e.g., North, East)",
      "surgeFactor": number (e.g. 1.1),
      "waitTimeMinutes": number (e.g. 4),
      "latOffset": number (float offset between -0.003 and 0.003, used to plot on maps relative to user pickup),
      "lngOffset": number (float offset between -0.003 and 0.003, used to plot on maps relative to user pickup)
    },
    {
      "name": "Another secondary pickup spot or transit terminal with lower surge",
      "distanceMeters": number (e.g. 450),
      "direction": "Compass direction",
      "surgeFactor": number (e.g. 1.2),
      "waitTimeMinutes": number (e.g. 5),
      "latOffset": number (float offset),
      "lngOffset": number (float offset)
    }
  ],
  "forecastTrend": [
    { "timeOffsetMinutes": 0, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" },
    { "timeOffsetMinutes": 10, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" },
    { "timeOffsetMinutes": 20, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" },
    { "timeOffsetMinutes": 30, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" },
    { "timeOffsetMinutes": 40, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" },
    { "timeOffsetMinutes": 50, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" },
    { "timeOffsetMinutes": 60, "surgeFactor": number, "estimatedWaitMinutes": number, "demandLevel": "Low" | "Moderate" | "High" | "Critical" }
  ],
  "transitAlternative": {
    "name": "Exact local subway line or bus route (e.g., 'Green Line Express Train')",
    "durationMinutes": number,
    "cost": number,
    "comfortScore": number (1 to 10 scale)
  }
}`;

    let response;
    let attempts = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.4,
          }
        });
        break; // Successfully got the response, break retry loop
      } catch (err: any) {
        lastError = err;
        console.log(`[Gemini Request] Safe retry info (attempt ${attempt}): ${sanitizeGeminiErrorLog(err)}`);
        if (attempt < attempts) {
          const delayMs = attempt * 1200; // Exponential-ish backoff
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (!response) {
      throw lastError;
    }

    const text = response.text || "";
    const parsedData = JSON.parse(text.trim());
    parsedData.isSimulated = false;
    res.json(parsedData);

  } catch (error: any) {
    const cleanMsg = sanitizeGeminiErrorLog(error);
    console.log(`[Gemini Engine] Engaged offline fallback: ${cleanMsg}`);
    // Graceful fallback to simulated results on error
    const fallback = calculateFallbackSurge(activeWeather, activeTraffic, activeTime, activeEvent);
    fallback.isSimulated = true;
    (fallback as any).errorMessage = cleanMsg;
    res.json(fallback);
  }
});

// Configure Vite or Static Files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Uber Surge Demand Tracker server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
