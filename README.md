# Uber Surge Demand Tracker

AI-powered ride-hailing surge tracker. Forecasts surge multipliers, fares, and wait times for a pickup/dropoff route, and recommends whether to book now, wait, walk to a cheaper hotspot, or take transit instead.

## Features

- **Surge forecasting** — Gemini-powered analysis of a route (weather, traffic, time of day, local events) producing a real-time surge multiplier, estimated fare, and wait time.
- **60-minute forecast trend** — projected surge/demand over the next hour so you know whether to book now or wait.
- **Nearby hotspots** — lower-surge pickup points a short walk away, with distance and direction.
- **Transit alternative** — cost/duration/comfort comparison against public transit.
- **Live surge simulation** — surge multiplier drifts in real time with configurable alert thresholds (audio + push notification).
- **Scenario presets** — quick-test citywide surge conditions (e.g. concerts, storms, rush hour) without waiting for live data.
- **Saved routes** — sign in with Google (Firebase Auth) to save and revisit frequent routes, backed by Firestore.
- **Interactive map** — Google Maps visualization of pickup, dropoff, and nearby hotspots.

## Tech Stack

- React 19 + Vite + TypeScript
- Express server (`server.ts`) proxying Gemini API calls
- `@google/genai` (Gemini) for surge analysis
- Firebase (Auth + Firestore) for saved routes
- `@vis.gl/react-google-maps` for map rendering
- Tailwind CSS, Recharts, lucide-react, motion

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values:
   - `GEMINI_API_KEY` — your Gemini API key
   - `GOOGLE_MAPS_PLATFORM_KEY` — Google Maps Platform key
   - `FIREBASE_*` — your Firebase project config (see Firebase console → Project settings)
3. Run the app:
   `npm run dev`

## Build

```
npm run build
npm run start
```

## Security

Never commit real API keys or `firebase-applet-config.json` — both are gitignored. Use `.env.local` for local secrets.
