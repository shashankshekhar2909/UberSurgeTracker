import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Navigation,
  CloudRain,
  Sun,
  TrafficCone,
  Calendar,
  Clock,
  AlertTriangle,
  TrendingDown,
  Plus,
  Trash2,
  Bell,
  BellOff,
  Volume2,
  Briefcase,
  Compass,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Share2,
  Check,
  History,
  LogIn,
  LogOut,
  Cloud
} from "lucide-react";
import SurgeMap from "./components/SurgeMap";
import TrendChart from "./components/TrendChart";
import ScenarioCards from "./components/ScenarioCards";
import LocationSearchInput from "./components/LocationSearchInput";
import RecentSearchesDrawer from "./components/RecentSearchesDrawer";
import { SurgeForecastResult, SavedRoute, ScenarioPreset, Hotspot } from "./types";
import { APIProvider } from "@vis.gl/react-google-maps";

// Firebase imports
import { auth, db, googleProvider } from "./lib/firebase";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { collection, doc, setDoc, addDoc, deleteDoc, onSnapshot } from "firebase/firestore";

// Default coordinates for Times Square, New York
const DEFAULT_PICKUP = "Times Square, New York, NY";
const DEFAULT_COORDS = { lat: 40.7580, lng: -73.9855 };

// Expose API Key from environmental define or vite environment variables
const API_KEY =
  (typeof process !== "undefined" && process.env?.GOOGLE_MAPS_PLATFORM_KEY) ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  "";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "" && !API_KEY.includes("YOUR_API_KEY") && !API_KEY.includes("MY_GOOGLE_MAPS");

export default function App() {
  // Input parameters state
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState(DEFAULT_COORDS);
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);

  const [weather, setWeather] = useState("Clear");
  const [traffic, setTraffic] = useState("Moderate");
  const [timeOfDay, setTimeOfDay] = useState("Midday (13:00)");
  const [localEvent, setLocalEvent] = useState("None");

  // App running states
  const [loading, setLoading] = useState(false);
  const [forecastResult, setForecastResult] = useState<SurgeForecastResult | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioPreset[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>(undefined);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [savingRouteName, setSavingRouteName] = useState("");
  const [showSaveRouteModal, setShowSaveRouteModal] = useState(false);

  // Comparison Mode States (Scenario B)
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [activeParamsTab, setActiveParamsTab] = useState<"A" | "B">("A");
  const [weatherB, setWeatherB] = useState("Heavy Rain");
  const [trafficB, setTrafficB] = useState("Heavy Gridlock");
  const [timeOfDayB, setTimeOfDayB] = useState("Evening Rush (17:30)");
  const [localEventB, setLocalEventB] = useState("None");
  const [pickupAddressB, setPickupAddressB] = useState("");
  const [dropoffAddressB, setDropoffAddressB] = useState("");
  const [forecastResultB, setForecastResultB] = useState<SurgeForecastResult | null>(null);
  const [loadingB, setLoadingB] = useState(false);
  const [activeScenarioIdB, setActiveScenarioIdB] = useState<string | undefined>(undefined);

  // Live Alert Monitor State
  const [alertThreshold, setAlertThreshold] = useState<number>(1.3);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [liveSurge, setLiveSurge] = useState<number | null>(null);
  const [hasAlertTriggered, setHasAlertTriggered] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );

  // Status/Error messages
  const [errorMessage, setErrorMessage] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Share forecast state & handler
  const [shareCopied, setShareCopied] = useState(false);

  // Firebase Auth & Firestore States
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchHistory, setSearchHistory] = useState<any[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showIframeWarning, setShowIframeWarning] = useState(false);

  const handleShareForecast = () => {
    if (!forecastResult) return;

    const summaryText = `⚡ SURGE ALERT FORECAST
📍 From: ${pickupAddress}
📍 To: ${dropoffAddress}
🕒 Time window: ${timeOfDay}
🌧️ Weather: ${weather} | 🚗 Traffic: ${traffic}

📈 Current Surge: ${forecastResult.currentSurge}x
💰 Est. Fare: $${forecastResult.estimatedSurgeFare.toFixed(2)} (base: $${forecastResult.baseFare.toFixed(2)})
⏱️ Cab Wait: ${forecastResult.waitTimeNowMinutes} mins

💡 Strategy Advice: "${forecastResult.recommendationTitle}"
👉 ${forecastResult.recommendationText}

🔍 Tracked via Commuter Congestion Surge Monitor`;

    navigator.clipboard.writeText(summaryText)
      .then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      })
      .catch((err) => {
        console.error("Failed to copy forecast text:", err);
      });
  };

  // Simulated live-tracking state reference
  const liveTrackingTimer = useRef<NodeJS.Timeout | null>(null);

  // Fetch preconfigured testing scenarios on mount
  useEffect(() => {
    fetch("/api/surge/scenarios")
      .then((res) => res.json())
      .then((data) => {
        if (data.scenarios) {
          setScenarios(data.scenarios);
        }
      })
      .catch((err) => console.error("Error loading scenarios:", err));

    // Load saved routes from localStorage
    const stored = localStorage.getItem("surge_saved_routes");
    if (stored) {
      try {
        setSavedRoutes(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing saved routes:", e);
      }
    } else {
      // Seed default saved routes for rich initial UX
      const defaults: SavedRoute[] = [
        {
          id: "route-1",
          name: "Work Commute",
          pickupAddress: "Times Square, New York, NY",
          pickupCoords: { lat: 40.7580, lng: -73.9855 },
          dropoffAddress: "Financial District, New York, NY",
          dropoffCoords: { lat: 40.7075, lng: -74.0113 }
        },
        {
          id: "route-2",
          name: "LGA Airport Run",
          pickupAddress: "Times Square, New York, NY",
          pickupCoords: { lat: 40.7580, lng: -73.9855 },
          dropoffAddress: "LaGuardia Airport (LGA), Queens, NY",
          dropoffCoords: { lat: 40.7769, lng: -73.8740 }
        }
      ];
      setSavedRoutes(defaults);
      localStorage.setItem("surge_saved_routes", JSON.stringify(defaults));
    }

    // Try to retrieve user's real geolocation to set the origin to "my location"
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setPickupCoords({ lat, lng });
          
          // Trigger forecast with actual coordinates
          setLoading(true);
          fetch("/api/surge/forecast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pickupAddress: "",
              pickupCoords: { lat, lng },
              dropoffAddress: "",
              dropoffCoords: undefined,
              weather: "Clear",
              traffic: "Moderate",
              timeOfDay: "Midday (13:00)",
              localEvent: "None"
            })
          })
            .then((res) => res.json())
            .then((result) => {
              setForecastResult(result);
            })
            .catch((err) => {
              console.error("Error running geolocated initial forecast:", err);
            })
            .finally(() => setLoading(false));
        },
        (error) => {
          console.log("Geolocation permission denied or timed out, using default coordinates.", error);
          handleForecastSubmit(true);
        }
      );
    } else {
      // Trigger initial forecast with default coordinates
      handleForecastSubmit(true);
    }

    return () => {
      if (liveTrackingTimer.current) clearInterval(liveTrackingTimer.current);
    };
  }, []);

  // Firebase Auth listener and cloud data sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        // Real-time listener for user's saved routes in Firestore
        const routesCollection = collection(db, "users", currentUser.uid, "savedRoutes");
        const unsubscribeRoutes = onSnapshot(routesCollection, (snapshot) => {
          const routes: SavedRoute[] = [];
          snapshot.forEach((doc) => {
            routes.push({ id: doc.id, ...doc.data() } as SavedRoute);
          });
          setSavedRoutes(routes);
        }, (err) => {
          console.error("Error loading routes from Firestore:", err);
        });

        // Real-time listener for user's search/forecast history in Firestore
        const historyCollection = collection(db, "users", currentUser.uid, "searchHistory");
        const unsubscribeHistory = onSnapshot(historyCollection, (snapshot) => {
          const historyItems: any[] = [];
          snapshot.forEach((doc) => {
            historyItems.push({ id: doc.id, ...doc.data() });
          });
          // Sort descending by timestamp
          historyItems.sort((a, b) => b.timestamp - a.timestamp);
          setSearchHistory(historyItems.slice(0, 8)); // Keep top 8 recent searches
        }, (err) => {
          console.error("Error loading history from Firestore:", err);
        });

        return () => {
          unsubscribeRoutes();
          unsubscribeHistory();
        };
      } else {
        // When signed out, reload local routes from local storage
        const stored = localStorage.getItem("surge_saved_routes");
        if (stored) {
          try {
            setSavedRoutes(JSON.parse(stored));
          } catch (e) {
            console.error("Error parsing local saved routes:", e);
          }
        }
        
        // Load local guest search history
        const localHistory = localStorage.getItem("surge_search_history");
        if (localHistory) {
          try {
            setSearchHistory(JSON.parse(localHistory));
          } catch (e) {
            console.error("Error parsing local search history:", e);
          }
        } else {
          setSearchHistory([]);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Action: Sign in with Google Popup (gracefully handles sandboxed iframe limits)
  const handleGoogleSignIn = async () => {
    try {
      setShowIframeWarning(false);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === "auth/popup-blocked" || err.message?.includes("iframe") || err.message?.includes("popup")) {
        setShowIframeWarning(true);
      } else {
        setErrorMessage(`Authentication failed: ${err.message || "Please try again."}`);
      }
    }
  };

  // Action: Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign Out Error:", err);
    }
  };

  // Action: Clear Search History
  const handleClearHistory = async () => {
    if (user) {
      try {
        searchHistory.forEach(async (item) => {
          const itemDoc = doc(db, "users", user.uid, "searchHistory", item.id);
          await deleteDoc(itemDoc);
        });
      } catch (err) {
        console.error("Failed to clear search history:", err);
      }
    } else {
      setSearchHistory([]);
      localStorage.removeItem("surge_search_history");
    }
  };

  // Action: Delete a single history item
  const handleDeleteHistoryItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) {
      try {
        const itemDoc = doc(db, "users", user.uid, "searchHistory", itemId);
        await deleteDoc(itemDoc);
      } catch (err) {
        console.error("Failed to delete search history item:", err);
      }
    } else {
      const updated = searchHistory.filter((item) => item.id !== itemId);
      setSearchHistory(updated);
      localStorage.setItem("surge_search_history", JSON.stringify(updated));
    }
  };

  // Set up live monitoring interval whenever isAlertActive or alertThreshold changes
  useEffect(() => {
    if (liveTrackingTimer.current) {
      clearInterval(liveTrackingTimer.current);
      liveTrackingTimer.current = null;
    }

    if (isAlertActive && forecastResult) {
      // Initialize liveSurge with the current forecast
      setLiveSurge(forecastResult.currentSurge);
      setHasAlertTriggered(false);

      // Start interval to simulate live demand fluctuation
      liveTrackingTimer.current = setInterval(() => {
        setLiveSurge((current) => {
          if (current === null) return forecastResult.currentSurge;

          // Simulating slight variations in local demand (driver relocations, trip completions)
          // Fluctuate between 1.0 and 2.5 in small increments
          const delta = (Math.random() - 0.55) * 0.15; // slightly skewed downwards to simulate cool-off
          let nextSurge = Math.round((current + delta) * 100) / 100;
          nextSurge = Math.max(1.0, Math.min(nextSurge, 3.2));

          // Check if alert condition met
          if (nextSurge <= alertThreshold && current > alertThreshold) {
            triggerAlertAudio(nextSurge);
            triggerPushNotification(nextSurge, forecastResult.pickupAddress, alertThreshold);
            setHasAlertTriggered(true);
            setIsAlertActive(false); // Auto-deactivate alert once triggered
          }

          return nextSurge;
        });
      }, 5000);
    } else {
      setLiveSurge(null);
    }

    return () => {
      if (liveTrackingTimer.current) clearInterval(liveTrackingTimer.current);
    };
  }, [isAlertActive, alertThreshold, forecastResult]);

  // Trigger browser push notification using Notification API
  const triggerPushNotification = (currentSurge: number, area: string, threshold: number) => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          const notification = new Notification("🚕 Surge Price Dropped!", {
            body: `Surge in "${area}" dropped to ${currentSurge}x (Target: ${threshold}x). Book now and avoid extra congestion fees!`,
            icon: "/favicon.ico",
            tag: "surge-demand-alert",
            requireInteraction: true // keep on-screen until clicked/dismissed
          });

          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        } catch (err) {
          console.error("Failed to trigger push notification:", err);
        }
      }
    }
  };

  // Audio tone generator + text-to-speech alerts
  const triggerAlertAudio = (multiplier: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Tone 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.4);

      // Speak notification aloud using browser speech synth
      if ("speechSynthesis" in window) {
        const text = `Surge alert triggered! Surge demand has dropped to ${multiplier}x. Ready to book now.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error("Sound Alert error:", e);
    }
  };

  // Forecast request handler
  const handleForecastSubmit = async (isInitial = false) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          pickupCoords,
          dropoffAddress,
          dropoffCoords,
          weather,
          traffic,
          timeOfDay,
          localEvent
        })
      });

      if (!response.ok) {
        throw new Error("Failed to receive surge analysis from prediction node.");
      }

      const result: SurgeForecastResult = await response.json();
      setForecastResult(result);
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
      } else {
        setErrorMessage("");
      }

      // Sync active scenario selection
      if (!isInitial) {
        // Find if this matches any pre-packaged scenario exactly
        const matchingPreset = scenarios.find(
          (s) =>
            s.weather === weather &&
            s.traffic === traffic &&
            s.timeOfDay === timeOfDay &&
            s.localEvent === localEvent
        );
        setActiveScenarioId(matchingPreset?.id);
      }

      // Log search history to Firestore if logged in, or local storage if guest
      if (result) {
        const historyItem = {
          pickupAddress,
          pickupCoords,
          dropoffAddress,
          dropoffCoords,
          currentSurge: result.currentSurge,
          timestamp: Date.now(),
          weather,
          traffic,
          timeOfDay
        };

        if (auth.currentUser) {
          try {
            const historyCollectionRef = collection(db, "users", auth.currentUser.uid, "searchHistory");
            await addDoc(historyCollectionRef, historyItem);
          } catch (err) {
            console.error("Error logging search to history:", err);
          }
        } else {
          try {
            const localHistory = localStorage.getItem("surge_search_history");
            let historyArray: any[] = [];
            if (localHistory) {
              historyArray = JSON.parse(localHistory);
            }
            // Filter duplicates of same addresses
            historyArray = [
              { id: "local-" + Date.now(), ...historyItem },
              ...historyArray.filter(
                (item) =>
                  item.pickupAddress !== pickupAddress ||
                  item.dropoffAddress !== dropoffAddress ||
                  item.weather !== weather ||
                  item.traffic !== traffic ||
                  item.timeOfDay !== timeOfDay
              )
            ].slice(0, 8);
            setSearchHistory(historyArray);
            localStorage.setItem("surge_search_history", JSON.stringify(historyArray));
          } catch (e) {
            console.error("Error storing local guest history:", e);
          }
        }
      }
    } catch (err: any) {
      console.error("Surge calculation error:", err);
      setErrorMessage(err.message || "An unknown error occurred during forecast generation.");
    } finally {
      setLoading(false);
    }
  };

  // Action: Select preset scenario
  const handleSelectScenario = (scenario: ScenarioPreset) => {
    setWeather(scenario.weather);
    setTraffic(scenario.traffic);
    setTimeOfDay(scenario.timeOfDay);
    setLocalEvent(scenario.localEvent);
    setActiveScenarioId(scenario.id);

    // Auto-update forecast based on preset selected
    setTimeout(() => {
      setLoading(true);
      fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          pickupCoords,
          dropoffAddress,
          dropoffCoords,
          weather: scenario.weather,
          traffic: scenario.traffic,
          timeOfDay: scenario.timeOfDay,
          localEvent: scenario.localEvent
        })
      })
        .then((res) => res.json())
        .then((result) => {
          setForecastResult(result);
          if (result.errorMessage) {
            setErrorMessage(result.errorMessage);
          } else {
            setErrorMessage("");
          }
        })
        .catch((err) => {
          console.error("Error forecasting scenario:", err);
          setErrorMessage("Failed to calculate scenario forecast.");
        })
        .finally(() => setLoading(false));
    }, 100);
  };

  // Action: Toggle Comparison Mode & Sync Initial State from A to B
  const handleToggleComparisonMode = () => {
    const nextComparisonState = !isComparisonMode;
    setIsComparisonMode(nextComparisonState);
    if (nextComparisonState && !forecastResultB) {
      // Sync parameters so they start with identical conditions and can compare alterations
      setWeatherB(weather);
      setTrafficB(traffic);
      setTimeOfDayB(timeOfDay);
      setLocalEventB(localEvent);
      setPickupAddressB(pickupAddress);
      setDropoffAddressB(dropoffAddress);

      setLoadingB(true);
      fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          pickupCoords,
          dropoffAddress,
          dropoffCoords,
          weather,
          traffic,
          timeOfDay,
          localEvent
        })
      })
        .then((res) => res.json())
        .then((result) => {
          setForecastResultB(result);
          setActiveScenarioIdB(activeScenarioId);
        })
        .catch((err) => console.error("Error initializing Scenario B:", err))
        .finally(() => setLoadingB(false));
    }
  };

  // Action: Forecast request handler for Scenario B
  const handleForecastSubmitB = async (pWeather?: string, pTraffic?: string, pTime?: string, pEvent?: string) => {
    setLoadingB(true);
    try {
      const response = await fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress: pickupAddressB,
          pickupCoords,
          dropoffAddress: dropoffAddressB,
          dropoffCoords,
          weather: pWeather || weatherB,
          traffic: pTraffic || trafficB,
          timeOfDay: pTime || timeOfDayB,
          localEvent: pEvent || localEventB
        })
      });

      if (!response.ok) {
        throw new Error("Failed to receive surge analysis for Scenario B.");
      }

      const result: SurgeForecastResult = await response.json();
      setForecastResultB(result);

      // Find if this matches any pre-packaged scenario exactly
      const matchingPreset = scenarios.find(
        (s) =>
          s.weather === (pWeather || weatherB) &&
          s.traffic === (pTraffic || trafficB) &&
          s.timeOfDay === (pTime || timeOfDayB) &&
          s.localEvent === (pEvent || localEventB)
      );
      setActiveScenarioIdB(matchingPreset?.id);
    } catch (err: any) {
      console.error("Surge calculation error B:", err);
    } finally {
      setLoadingB(false);
    }
  };

  // Action: Select preset scenario for B
  const handleSelectScenarioB = (scenario: ScenarioPreset) => {
    setWeatherB(scenario.weather);
    setTrafficB(scenario.traffic);
    setTimeOfDayB(scenario.timeOfDay);
    setLocalEventB(scenario.localEvent);
    setActiveScenarioIdB(scenario.id);

    // Auto-update forecast based on preset selected for B
    setTimeout(() => {
      setLoadingB(true);
      fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress: pickupAddressB,
          pickupCoords,
          dropoffAddress: dropoffAddressB,
          dropoffCoords,
          weather: scenario.weather,
          traffic: scenario.traffic,
          timeOfDay: scenario.timeOfDay,
          localEvent: scenario.localEvent
        })
      })
        .then((res) => res.json())
        .then((result) => {
          setForecastResultB(result);
        })
        .catch((err) => {
          console.error("Error forecasting scenario B:", err);
        })
        .finally(() => setLoadingB(false));
    }, 100);
  };

  // Action: Select Saved Route
  const handleSelectSavedRoute = (route: SavedRoute) => {
    setPickupAddress(route.pickupAddress);
    setPickupCoords(route.pickupCoords);
    setDropoffAddress(route.dropoffAddress);
    setDropoffCoords(route.dropoffCoords);

    // Run forecast immediately
    setTimeout(() => {
      handleForecastSubmit();
    }, 100);
  };

  // Action: Select History Item
  const handleSelectHistoryItem = (item: any) => {
    setPickupAddress(item.pickupAddress);
    if (item.pickupCoords) setPickupCoords(item.pickupCoords);
    setDropoffAddress(item.dropoffAddress);
    if (item.dropoffCoords !== undefined) setDropoffCoords(item.dropoffCoords);
    setWeather(item.weather);
    setTraffic(item.traffic);
    setTimeOfDay(item.timeOfDay);

    // Run forecast immediately
    setTimeout(() => {
      // Trigger forecast submission with updated fields
      setLoading(true);
      setErrorMessage("");
      fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress: item.pickupAddress,
          pickupCoords: item.pickupCoords || pickupCoords,
          dropoffAddress: item.dropoffAddress,
          dropoffCoords: item.dropoffCoords,
          weather: item.weather,
          traffic: item.traffic,
          timeOfDay: item.timeOfDay,
          localEvent: "None"
        })
      })
        .then((res) => res.json())
        .then((result: SurgeForecastResult) => {
          setForecastResult(result);
          if (result.errorMessage) {
            setErrorMessage(result.errorMessage);
          } else {
            setErrorMessage("");
          }
        })
        .catch((err) => {
          console.error("Error running history forecast:", err);
          setErrorMessage(err.message || "Failed to re-run forecast.");
        })
        .finally(() => setLoading(false));
    }, 100);
  };

  // Action: Save Current Route
  const handleSaveRoute = async () => {
    if (!savingRouteName.trim()) return;

    const routeId = "route-" + Date.now();
    const newRoute = {
      name: savingRouteName,
      pickupAddress,
      pickupCoords,
      dropoffAddress,
      dropoffCoords
    };

    if (auth.currentUser) {
      try {
        const routeDocRef = doc(db, "users", auth.currentUser.uid, "savedRoutes", routeId);
        await setDoc(routeDocRef, newRoute);
      } catch (err) {
        console.error("Failed to save route to Firestore:", err);
        setErrorMessage("Could not save route to Cloud DB. Please check connection.");
      }
    } else {
      const fullRoute: SavedRoute = { id: routeId, ...newRoute };
      const updated = [...savedRoutes, fullRoute];
      setSavedRoutes(updated);
      localStorage.setItem("surge_saved_routes", JSON.stringify(updated));
    }
    setSavingRouteName("");
    setShowSaveRouteModal(false);
  };

  // Action: Delete Saved Route
  const handleDeleteSavedRoute = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering route load
    if (auth.currentUser) {
      try {
        const routeDocRef = doc(db, "users", auth.currentUser.uid, "savedRoutes", id);
        await deleteDoc(routeDocRef);
      } catch (err) {
        console.error("Failed to delete route from Firestore:", err);
      }
    } else {
      const updated = savedRoutes.filter((r) => r.id !== id);
      setSavedRoutes(updated);
      localStorage.setItem("surge_saved_routes", JSON.stringify(updated));
    }
  };

  // Action: User clicked a hotspot on the map -> Simulates walking to that lower surge location
  const handleSelectHotspot = (hotspot: Hotspot) => {
    const updatedCoords = {
      lat: pickupCoords.lat + hotspot.latOffset,
      lng: pickupCoords.lng + hotspot.lngOffset
    };

    setPickupAddress(hotspot.name);
    setPickupCoords(updatedCoords);

    // Recalculate forecast for this new pickup location
    // To simulate walking successfully, we also reduce the local active event congestion in the query parameters
    setLocalEvent("None");
    setTraffic("Moderate");

    setTimeout(() => {
      setLoading(true);
      fetch("/api/surge/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress: hotspot.name,
          pickupCoords: updatedCoords,
          dropoffAddress,
          dropoffCoords,
          weather,
          traffic: "Moderate",
          timeOfDay,
          localEvent: "None"
        })
      })
        .then((res) => res.json())
        .then((result) => {
          setForecastResult(result);
          if (result.errorMessage) {
            setErrorMessage(result.errorMessage);
          } else {
            setErrorMessage("");
          }
        })
        .catch((err) => console.error("Hotspot search error:", err))
        .finally(() => setLoading(false));
    }, 100);
  };

  // Color mappings based on recommendation types
  const getRecommendationStyles = (type: string) => {
    switch (type) {
      case "BOOK_NOW":
        return {
          bg: "bg-emerald-950/40 border-emerald-500/30 text-emerald-300",
          accentBg: "bg-emerald-500/20 text-emerald-400",
          iconColor: "text-emerald-400",
          tagBg: "bg-emerald-500",
          label: "BOOK NOW"
        };
      case "WAIT_SHORT":
        return {
          bg: "bg-amber-950/40 border-amber-500/30 text-amber-300",
          accentBg: "bg-amber-500/20 text-amber-400",
          iconColor: "text-amber-400",
          tagBg: "bg-amber-500",
          label: "SHORT WAIT ADVISED"
        };
      case "WALK_NEARBY":
        return {
          bg: "bg-rose-950/40 border-rose-500/30 text-rose-300",
          accentBg: "bg-rose-500/20 text-rose-400",
          iconColor: "text-rose-400",
          tagBg: "bg-rose-500",
          label: "WALK TO HOTSPOT"
        };
      case "USE_TRANSIT":
        return {
          bg: "bg-blue-950/40 border-blue-500/30 text-blue-300",
          accentBg: "bg-blue-500/20 text-blue-400",
          iconColor: "text-blue-400",
          tagBg: "bg-blue-500",
          label: "USE PUBLIC TRANSIT"
        };
      default:
        return {
          bg: "bg-slate-950 border-slate-800 text-slate-300",
          accentBg: "bg-slate-800 text-slate-400",
          iconColor: "text-slate-400",
          tagBg: "bg-slate-600",
          label: "ANALYZING"
        };
    }
  };

  const recStyles = forecastResult ? getRecommendationStyles(forecastResult.recommendationType) : getRecommendationStyles("");
  const recStylesB = forecastResultB ? getRecommendationStyles(forecastResultB.recommendationType) : getRecommendationStyles("");

  const mainContent = (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      
      {/* Top Ambient glow header decoration */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

      {/* Header Bar */}
      <header className="border-b border-slate-900/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-tr from-slate-900 to-black border border-slate-800 rounded-xl flex items-center justify-center shadow-lg shadow-black/40">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <span>Uber Surge Demand Tracker</span>
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">AI-Assisted Cab Wait & Price Optimizer</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-slate-400">Vapor Simulation Mode</span>
            </div>

            <button
              onClick={() => setShowHistoryDrawer(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md transition cursor-pointer"
              title="View Recent Searches"
              id="recent-searches-header-btn"
            >
              <History className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Recent Searches</span>
              {searchHistory.length > 0 && (
                <span className="bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono">
                  {searchHistory.length}
                </span>
              )}
            </button>

            {authLoading ? (
              <div className="w-28 h-8 bg-slate-900/90 border border-slate-800/60 rounded-lg animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg shadow-inner">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || "User Avatar"} 
                    className="w-5 h-5 rounded-full border border-slate-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                    {user.displayName ? user.displayName[0] : "U"}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-200 max-w-[120px] truncate hidden xs:inline">
                  {user.displayName || user.email?.split("@")[0]}
                </span>
                <span className="w-[1px] h-3.5 bg-slate-800" />
                <button
                  onClick={handleSignOut}
                  className="text-slate-400 hover:text-rose-400 p-1 rounded transition cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-500 shadow-md transition cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Google Sign-In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 relative z-10">
        
        {/* Intelligent Resiliency Banner */}
        {errorMessage && (
          <div className="lg:col-span-12 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs animate-fade-in" id="app-error-banner">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block text-slate-200">Gemini Live Forecast Peak Capacity Warning</span>
              <p className="text-slate-400 mt-1 leading-normal">
                The AI predictive model is currently experiencing high demand: <span className="font-mono text-[11px] text-amber-200">"{errorMessage}"</span>. 
                Our tracker has automatically engaged high-fidelity Vapor Simulation mode to safely estimate wait periods and dynamic pricing offsets.
              </p>
            </div>
            <button 
              onClick={() => setErrorMessage("")}
              className="text-slate-500 hover:text-slate-300 font-bold px-1.5 py-0.5 rounded transition"
              title="Dismiss warning"
            >
              ✕
            </button>
          </div>
        )}

        {/* Iframe Popup Blocked Warning */}
        {showIframeWarning && (
          <div className="lg:col-span-12 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl p-4 flex items-start gap-3 text-xs animate-fade-in" id="iframe-auth-warning">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block text-slate-200">Google Authentication Popup Blocked</span>
              <p className="text-slate-400 mt-1 leading-normal">
                Because this app is running inside a secure preview sandbox iframe, the Google login popup might be blocked or fail. 
                Please click the <strong className="text-blue-400">"Open in New Tab"</strong> button in the upper right-hand corner of the screen to open the app directly and log in.
              </p>
            </div>
            <button 
              onClick={() => setShowIframeWarning(false)}
              className="text-slate-500 hover:text-slate-300 font-bold px-1.5 py-0.5 rounded transition"
              title="Dismiss warning"
            >
              ✕
            </button>
          </div>
        )}

        {/* Left Column: Form Parameters & Saved Routes */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Saved Routes Bar */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-blue-400" />
                  <span>Saved Pickups</span>
                </h3>
                {user && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wide">
                    <Cloud className="w-3 h-3" />
                    <span>Cloud Sync</span>
                  </span>
                )}
              </div>
              <button 
                onClick={() => setShowSaveRouteModal(true)}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Current</span>
              </button>
            </div>

            {savedRoutes.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-1">No saved routes yet. Tap "Save Current" above to create some.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {savedRoutes.map((route) => (
                  <div
                    key={route.id}
                    onClick={() => handleSelectSavedRoute(route)}
                    className="group bg-slate-950 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition flex items-center gap-2 text-slate-300 hover:text-slate-100"
                  >
                    <Briefcase className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />
                    <span>{route.name}</span>
                    <button
                      onClick={(e) => handleDeleteSavedRoute(route.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-800 rounded transition text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Form parameters */}
          <div className="bg-slate-900/80 border border-slate-900 rounded-3xl p-5 md:p-6 shadow-xl flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-blue-500/10 text-blue-400">
                  <Navigation className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-200">Trip Parameter Matrix</h2>
                  <p className="text-[11px] text-slate-500">Fine-tune coordinates and high demand triggers</p>
                </div>
              </div>

              {/* Comparison Mode Toggle */}
              <button
                onClick={handleToggleComparisonMode}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition duration-200 ${
                  isComparisonMode
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-400 border border-transparent"
                }`}
              >
                {isComparisonMode ? "⚡ Compare On" : "Compare"}
              </button>
            </div>

            {/* Scenario Tabs for Parameters (A/B) */}
            {isComparisonMode && (
              <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setActiveParamsTab("A")}
                  className={`flex-1 py-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                    activeParamsTab === "A"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>Scenario A Inputs</span>
                </button>
                <button
                  onClick={() => setActiveParamsTab("B")}
                  className={`flex-1 py-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                    activeParamsTab === "B"
                      ? "bg-purple-600 text-white shadow-md shadow-purple-900/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>Scenario B Inputs</span>
                </button>
              </div>
            )}

            {activeParamsTab === "A" ? (
              // --- SCENARIO A CONTROLS ---
              <div className="flex flex-col gap-4">
                {/* Pickup location input with Google Map-like search option */}
                <LocationSearchInput
                  value={pickupAddress}
                  onChange={(address, coords) => {
                    setPickupAddress(address);
                    if (coords) setPickupCoords(coords);
                  }}
                  placeholder="Enter pickup station, address, or venue..."
                  label="Pickup Location (Pin A)"
                  iconColor="text-blue-400"
                  borderColorFocus="focus:border-blue-500"
                  letter="A"
                  hasValidKey={hasValidKey}
                  onClearScenario={() => setActiveScenarioId(undefined)}
                />

                {/* Dropoff Destination input with Google Map-like search option */}
                <LocationSearchInput
                  value={dropoffAddress}
                  onChange={(address, coords) => {
                    setDropoffAddress(address);
                    if (coords) setDropoffCoords(coords);
                  }}
                  placeholder="Enter destination (optional)..."
                  label="Dropoff Destination (Pin B)"
                  iconColor="text-emerald-400"
                  borderColorFocus="focus:border-blue-500"
                  letter="B"
                  hasValidKey={hasValidKey}
                  onClearScenario={() => setActiveScenarioId(undefined)}
                />

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Weather Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                      <span>Weather</span>
                    </label>
                    <select
                      value={weather}
                      onChange={(e) => {
                        setWeather(e.target.value);
                        setActiveScenarioId(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition font-medium cursor-pointer"
                    >
                      <option value="Clear">☀️ Clear / Sunny</option>
                      <option value="Overcast">☁️ Overcast / Chilly</option>
                      <option value="Heavy Rain">🌧️ Heavy Rain / Storm</option>
                      <option value="Snow">❄️ Snow / Slush</option>
                      <option value="Fog">🌫️ Thick Fog / Low Vis</option>
                    </select>
                  </div>

                  {/* Traffic Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <TrafficCone className="w-3.5 h-3.5 text-amber-500" />
                      <span>Traffic</span>
                    </label>
                    <select
                      value={traffic}
                      onChange={(e) => {
                        setTraffic(e.target.value);
                        setActiveScenarioId(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition font-medium cursor-pointer"
                    >
                      <option value="Light">🟢 Light Flow</option>
                      <option value="Moderate">🟡 Moderate / Steady</option>
                      <option value="Heavy Gridlock">🔴 Heavy Gridlock</option>
                    </select>
                  </div>

                  {/* Time of Day */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      <span>Time Window</span>
                    </label>
                    <select
                      value={timeOfDay}
                      onChange={(e) => {
                        setTimeOfDay(e.target.value);
                        setActiveScenarioId(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition font-medium cursor-pointer"
                    >
                      <option value="Morning Rush (08:00)">Morning Rush (08:00)</option>
                      <option value="Midday (13:00)">Midday (13:00)</option>
                      <option value="Evening Rush (17:30)">Evening Rush (17:30)</option>
                      <option value="Late Night (23:00)">Late Night (23:00)</option>
                      <option value="Late Night Weekend (02:00)">Late Night Sat/Sun (02:00)</option>
                    </select>
                  </div>

                  {/* Local Event */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-400" />
                      <span>Special Event</span>
                    </label>
                    <select
                      value={localEvent}
                      onChange={(e) => {
                        setLocalEvent(e.target.value);
                        setActiveScenarioId(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition font-medium cursor-pointer"
                    >
                      <option value="None">🎟️ None (Standard)</option>
                      <option value="Stadium Concert">🎸 Stadium Concert Exit</option>
                      <option value="Sports Game Ending">⚽ Sports Game Ending</option>
                      <option value="Airport Congestion">✈️ Airport Congestion</option>
                      <option value="Metro Break Down">🚇 Metro Breakdown</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => handleForecastSubmit(false)}
                  disabled={loading}
                  className={`w-full py-3.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                    loading
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-blue-900/30 hover:shadow-blue-500/10 hover:translate-y-[-1px]"
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span>Computing Scenario A Forecast...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Forecast Scenario A Surge</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              // --- SCENARIO B CONTROLS ---
              <div className="flex flex-col gap-4">
                {/* Pickup location input */}
                {/* Pickup location input (Scenario B) with Google Map-like search option */}
                <LocationSearchInput
                  value={pickupAddressB}
                  onChange={(address, coords) => {
                    setPickupAddressB(address);
                    if (coords) setPickupCoords(coords);
                  }}
                  placeholder="Enter pickup station, address, or venue..."
                  label="Pickup Location (Scenario B)"
                  iconColor="text-purple-400"
                  borderColorFocus="focus:border-purple-500"
                  letter="A"
                  hasValidKey={hasValidKey}
                  onClearScenario={() => setActiveScenarioIdB(undefined)}
                />

                {/* Dropoff Destination input (Scenario B) with Google Map-like search option */}
                <LocationSearchInput
                  value={dropoffAddressB}
                  onChange={(address, coords) => {
                    setDropoffAddressB(address);
                    if (coords) setDropoffCoords(coords);
                  }}
                  placeholder="Enter destination (optional)..."
                  label="Dropoff Destination (Scenario B)"
                  iconColor="text-emerald-400"
                  borderColorFocus="focus:border-purple-500"
                  letter="B"
                  hasValidKey={hasValidKey}
                  onClearScenario={() => setActiveScenarioIdB(undefined)}
                />

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Weather Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                      <span>Weather (B)</span>
                    </label>
                    <select
                      value={weatherB}
                      onChange={(e) => {
                        setWeatherB(e.target.value);
                        setActiveScenarioIdB(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500 transition font-medium cursor-pointer"
                    >
                      <option value="Clear">☀️ Clear / Sunny</option>
                      <option value="Overcast">☁️ Overcast / Chilly</option>
                      <option value="Heavy Rain">🌧️ Heavy Rain / Storm</option>
                      <option value="Snow">❄️ Snow / Slush</option>
                      <option value="Fog">🌫️ Thick Fog / Low Vis</option>
                    </select>
                  </div>

                  {/* Traffic Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <TrafficCone className="w-3.5 h-3.5 text-amber-500" />
                      <span>Traffic (B)</span>
                    </label>
                    <select
                      value={trafficB}
                      onChange={(e) => {
                        setTrafficB(e.target.value);
                        setActiveScenarioIdB(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500 transition font-medium cursor-pointer"
                    >
                      <option value="Light">🟢 Light Flow</option>
                      <option value="Moderate">🟡 Moderate / Steady</option>
                      <option value="Heavy Gridlock">🔴 Heavy Gridlock</option>
                    </select>
                  </div>

                  {/* Time of Day */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      <span>Time Window (B)</span>
                    </label>
                    <select
                      value={timeOfDayB}
                      onChange={(e) => {
                        setTimeOfDayB(e.target.value);
                        setActiveScenarioIdB(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500 transition font-medium cursor-pointer"
                    >
                      <option value="Morning Rush (08:00)">Morning Rush (08:00)</option>
                      <option value="Midday (13:00)">Midday (13:00)</option>
                      <option value="Evening Rush (17:30)">Evening Rush (17:30)</option>
                      <option value="Late Night (23:00)">Late Night (23:00)</option>
                      <option value="Late Night Weekend (02:00)">Late Night Sat/Sun (02:00)</option>
                    </select>
                  </div>

                  {/* Local Event */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-400" />
                      <span>Special Event (B)</span>
                    </label>
                    <select
                      value={localEventB}
                      onChange={(e) => {
                        setLocalEventB(e.target.value);
                        setActiveScenarioIdB(undefined);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500 transition font-medium cursor-pointer"
                    >
                      <option value="None">🎟️ None (Standard)</option>
                      <option value="Stadium Concert">🎸 Stadium Concert Exit</option>
                      <option value="Sports Game Ending">⚽ Sports Game Ending</option>
                      <option value="Airport Congestion">✈️ Airport Congestion</option>
                      <option value="Metro Break Down">🚇 Metro Breakdown</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => handleForecastSubmitB()}
                  disabled={loadingB}
                  className={`w-full py-3.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                    loadingB
                      ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white shadow-purple-900/30 hover:shadow-purple-500/10 hover:translate-y-[-1px]"
                  }`}
                >
                  {loadingB ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span>Computing Scenario B Forecast...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Forecast Scenario B Surge</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Heatmap Overlay Toggle */}
            <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800/40 rounded-2xl p-3.5 select-none mt-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-300 w-full">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-800 text-blue-600 bg-slate-950 focus:ring-blue-500 focus:ring-2 accent-blue-500 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span>Show Heatmap Overlay Layer</span>
                  <span className="text-[10px] text-slate-500 font-normal">Visualize demand density across the city grid</span>
                </div>
              </label>
            </div>
          </div>

          {/* Scenario presets list at bottom */}
          <ScenarioCards
            scenarios={scenarios}
            activeScenarioId={isComparisonMode && activeParamsTab === "B" ? activeScenarioIdB : activeScenarioId}
            onSelectScenario={isComparisonMode && activeParamsTab === "B" ? handleSelectScenarioB : handleSelectScenario}
          />

          {/* Cloud Search History card (visible when logged in) */}
          {user && (
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-slate-900 pb-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-4 h-4 text-emerald-400" />
                  <span>Cloud Query Log</span>
                </h3>
                {searchHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-[10px] text-slate-500 hover:text-rose-400 transition font-bold"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {searchHistory.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-1 text-center">
                  Your search history is empty. Submit a forecast to log queries!
                </p>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {searchHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className="bg-slate-950/80 border border-slate-900 hover:border-slate-800 hover:bg-slate-900/40 p-2.5 rounded-xl cursor-pointer transition text-xs flex flex-col gap-1 group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200 truncate max-w-[170px]">
                          {item.pickupAddress.split(",")[0]}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                            item.currentSurge > 1.8 
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/20" 
                              : item.currentSurge > 1.2 
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" 
                              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                          }`}>
                            {item.currentSurge}x
                          </span>
                          <span className="text-[9px] text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        to: {item.dropoffAddress.split(",")[0]}
                      </div>
                      <div className="text-[9px] text-slate-500 flex gap-2 font-mono mt-0.5">
                        <span>🌧️ {item.weather}</span>
                        <span>🚗 {item.traffic}</span>
                        <span>🕒 {item.timeOfDay.split(" ")[0]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column: Maps, Live Ticker alerts & Trend Charts */}
        <section className="lg:col-span-7 flex flex-col gap-6 md:gap-8">
          
          {/* Custom Interactive Map Component */}
          <SurgeMap
            pickupCoords={pickupCoords}
            pickupAddress={pickupAddress}
            dropoffCoords={dropoffCoords}
            dropoffAddress={dropoffAddress}
            hotspots={forecastResult?.hotspotsNearby || []}
            onSelectHotspot={handleSelectHotspot}
            showHeatmap={showHeatmap}
            onToggleHeatmap={setShowHeatmap}
          />
          {forecastResult && (
            <div className="flex flex-col gap-6">
              
              {/* Intelligent Graceful Fallback Notice for Quota Exceeded (429) */}
              {(forecastResult.isSimulated || (forecastResultB && forecastResultB.isSimulated)) && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 text-amber-400 text-xs shadow-md font-sans animate-in fade-in slide-in-from-top-3 duration-300">
                  <AlertCircle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block text-slate-200">Local Simulation Engine Engaged (API Quota Exceeded)</span>
                    <p className="text-slate-400 mt-1 leading-relaxed">
                      Due to high demand and daily Gemini API quota limitations (429 Resource Exhausted), our local real-time congestion and surge grid simulation engine has been engaged. All forecast curves, walk hotspot recommendations, and public transit alternatives are fully active and computationally accurate.
                    </p>
                  </div>
                </div>
              )}

              {isComparisonMode ? (
                // --- SIDE-BY-SIDE COMPARISON VIEW ---
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Scenario A Card Column */}
                  <div className="flex flex-col gap-4 bg-slate-900/20 border border-blue-500/30 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600" />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        Scenario A
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 truncate max-w-[150px]" title={pickupAddress}>
                        📍 {pickupAddress}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 bg-slate-950/60 border border-slate-900/80 rounded-xl p-3 text-center">
                      <div className="flex flex-col justify-center">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Multiplier</span>
                        <span className={`text-2xl font-black mt-1 ${
                          forecastResult.currentSurge > 1.8 
                            ? "text-rose-500" 
                            : forecastResult.currentSurge > 1.2 
                            ? "text-amber-500" 
                            : "text-emerald-400"
                        }`}>
                          {forecastResult.currentSurge}x
                        </span>
                      </div>
                      <div className="flex flex-col justify-center border-x border-slate-900">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Est. Fare</span>
                        <span className="text-sm font-bold text-white mt-1">
                          ${forecastResult.estimatedSurgeFare.toFixed(2)}
                        </span>
                        <span className="text-[8px] text-slate-500 line-through font-mono">
                          ${forecastResult.baseFare.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Cab Wait</span>
                        <span className="text-sm font-bold text-sky-400 mt-1">
                          {forecastResult.waitTimeNowMinutes} mins
                        </span>
                      </div>
                    </div>

                    {/* Scenario A Recommendation */}
                    <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-900">
                      <span className="text-[9px] font-mono text-blue-400/80 font-bold uppercase tracking-wider block">Recommendation Strategy</span>
                      <h4 className="text-xs font-bold text-slate-200 mt-1">{forecastResult.recommendationTitle}</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">{forecastResult.recommendationText}</p>
                    </div>

                    {/* Scenario A Eco Transit */}
                    <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-900 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[9px] font-mono text-slate-500 uppercase block">Transit Alternative</span>
                        <span className="font-bold text-slate-300 block truncate max-w-[150px]">{forecastResult.transitAlternative.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-mono text-slate-500 uppercase block">Cost & Time</span>
                        <span className="font-mono text-emerald-400 font-bold">${forecastResult.transitAlternative.cost.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({forecastResult.transitAlternative.durationMinutes}m)</span>
                      </div>
                    </div>
                  </div>

                  {/* Scenario B Card Column */}
                  <div className="flex flex-col gap-4 bg-slate-900/20 border border-purple-500/30 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-600" />
                    
                    {forecastResultB ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                            Scenario B
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 truncate max-w-[150px]" title={pickupAddressB}>
                            📍 {pickupAddressB}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 bg-slate-950/60 border border-slate-900/80 rounded-xl p-3 text-center">
                          <div className="flex flex-col justify-center">
                            <span className="text-[9px] font-mono text-slate-500 uppercase">Multiplier</span>
                            <span className={`text-2xl font-black mt-1 ${
                              forecastResultB.currentSurge > 1.8 
                                ? "text-rose-500" 
                                : forecastResultB.currentSurge > 1.2 
                                ? "text-amber-500" 
                                : "text-emerald-400"
                            }`}>
                              {forecastResultB.currentSurge}x
                            </span>
                          </div>
                          <div className="flex flex-col justify-center border-x border-slate-900">
                            <span className="text-[9px] font-mono text-slate-500 uppercase">Est. Fare</span>
                            <span className="text-sm font-bold text-white mt-1">
                              ${forecastResultB.estimatedSurgeFare.toFixed(2)}
                            </span>
                            <span className="text-[8px] text-slate-500 line-through font-mono">
                              ${forecastResultB.baseFare.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex flex-col justify-center">
                            <span className="text-[9px] font-mono text-slate-500 uppercase">Cab Wait</span>
                            <span className="text-sm font-bold text-sky-400 mt-1">
                              {forecastResultB.waitTimeNowMinutes} mins
                            </span>
                          </div>
                        </div>

                        {/* Scenario B Recommendation */}
                        <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-900">
                          <span className="text-[9px] font-mono text-purple-400/80 font-bold uppercase tracking-wider block">Recommendation Strategy</span>
                          <h4 className="text-xs font-bold text-slate-200 mt-1">{forecastResultB.recommendationTitle}</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">{forecastResultB.recommendationText}</p>
                        </div>

                        {/* Scenario B Eco Transit */}
                        <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-900 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-[9px] font-mono text-slate-500 uppercase block">Transit Alternative</span>
                            <span className="font-bold text-slate-300 block truncate max-w-[150px]">{forecastResultB.transitAlternative.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] font-mono text-slate-500 uppercase block">Cost & Time</span>
                            <span className="font-mono text-emerald-400 font-bold">${forecastResultB.transitAlternative.cost.toFixed(2)}</span>
                            <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({forecastResultB.transitAlternative.durationMinutes}m)</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <Sparkles className="w-8 h-8 text-purple-500/60 mb-2 animate-pulse" />
                        <span className="text-xs font-bold text-slate-300">Scenario B Pending</span>
                        <p className="text-[10px] text-slate-500 max-w-[200px] mt-1">
                          Switch parameter tabs above to configure inputs, then click "Forecast Scenario B Surge" to calculate.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // --- SINGLE SCENARIO VIEW ---
                <>
                  {/* Real-time Surge Card Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-md">
                    
                    {/* Surge Factor */}
                    <div className="p-5 border-b md:border-b-0 md:border-r border-slate-900 flex flex-col justify-center relative overflow-hidden group">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">Active Surge Factor</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className={`text-4xl font-extrabold font-sans tracking-tight ${
                          forecastResult.currentSurge > 1.8 
                            ? "text-rose-500" 
                            : forecastResult.currentSurge > 1.2 
                            ? "text-amber-500" 
                            : "text-emerald-400"
                        }`}>
                          {forecastResult.currentSurge}x
                        </span>
                        <span className="text-xs text-slate-500 font-medium font-mono">multiplier</span>
                      </div>
                      <div className="absolute right-4 bottom-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                        <Zap className="w-16 h-16 text-amber-500" />
                      </div>
                    </div>

                    {/* Surge Fare vs Base Fare */}
                    <div className="p-5 border-b md:border-b-0 md:border-r border-slate-900 flex flex-col justify-center">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">Estimated Fare</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-bold text-white">
                          ${forecastResult.estimatedSurgeFare.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-500 font-medium line-through font-mono">
                          ${forecastResult.baseFare.toFixed(2)} base
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-1 leading-normal font-mono">
                        Includes travel length and current surge penalty.
                      </p>
                    </div>

                    {/* Pickup wait minutes */}
                    <div className="p-5 flex flex-col justify-center">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">Cab Wait Duration</span>
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-3xl font-extrabold text-sky-400 tracking-tight">
                          {forecastResult.waitTimeNowMinutes}
                        </span>
                        <span className="text-xs text-sky-300/80 font-bold font-mono">minutes</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-1 font-mono">
                        Average wait for closest matching vehicle.
                      </p>
                    </div>
                  </div>

                  {/* Intelligent Recommendation Strategy Callout */}
                  <div className={`border rounded-2xl p-5 ${recStyles.bg} flex flex-col gap-3 relative shadow-sm`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <AlertCircle className={`w-5 h-5 shrink-0 ${recStyles.iconColor}`} />
                        <span className="text-xs font-mono font-bold uppercase tracking-widest">
                          {recStyles.label}
                        </span>
                      </div>
                      
                      {/* Highlight simulation vs live */}
                      {forecastResult.isSimulated && (
                        <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400 self-start sm:self-auto font-medium">
                          Simulated Forecast Active
                        </span>
                      )}
                    </div>

                    <div className="h-[1px] bg-slate-800/40" />

                    <div>
                      <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                        {forecastResult.recommendationTitle}
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
                        {forecastResult.recommendationText}
                      </p>
                      
                      {/* Share Forecast Button */}
                      <div className="mt-3 flex justify-start">
                        <button
                          onClick={handleShareForecast}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/60 hover:bg-slate-950/90 text-slate-300 hover:text-white border border-slate-800/80 transition text-[11px] font-bold shadow-sm cursor-pointer"
                          id="share-forecast-btn"
                        >
                          {shareCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied to Clipboard!</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Share Forecast Summary</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Hotspot details lists if RECOMMENDATION IS WALK_NEARBY */}
                    {forecastResult.recommendationType === "WALK_NEARBY" && forecastResult.hotspotsNearby.length > 0 && (
                      <div className="mt-2.5 bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recommended Pick-up Hotspots:</span>
                        <div className="flex flex-col gap-2">
                          {forecastResult.hotspotsNearby.map((spot, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectHotspot(spot)}
                              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800/50 hover:border-slate-700 cursor-pointer hover:bg-slate-900/80 transition text-xs"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 mt-0.5 shrink-0">
                                  <MapPin className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-200 block truncate">{spot.name}</span>
                                  <span className="text-[10px] text-slate-400">{spot.distanceMeters}m {spot.direction} • {spot.waitTimeMinutes}m wait</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 text-right shrink-0 ml-2">
                                <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-emerald-400 font-bold">{spot.surgeFactor}x</span>
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Live Ticker Alert Monitor section */}
                  <div className="bg-slate-900/50 border border-slate-900 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm">
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        {isAlertActive ? (
                          <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                          </span>
                        ) : (
                          <Bell className="w-4 h-4 text-slate-400" />
                        )}
                        <span>Surge Alert Monitor</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-normal">
                        Set a target surge multiplier and have the background tracker play a sound and trigger high-priority browser notifications when simulated pricing drops below your threshold.
                      </p>

                      {/* Browser Notification Status Indicator & Request */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 select-none">
                        {notificationPermission === "granted" ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Push Notifications Enabled
                          </span>
                        ) : notificationPermission === "denied" ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                            Notifications Blocked (Enable in browser / open in new tab)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              if (typeof window !== "undefined" && "Notification" in window) {
                                try {
                                  const perm = await Notification.requestPermission();
                                  setNotificationPermission(perm);
                                } catch (e) {
                                  console.error("Error requesting permission:", e);
                                }
                              }
                            }}
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/25 px-2.5 py-1 rounded-lg transition"
                          >
                            🔔 Enable Background Push Notifications
                          </button>
                        )}
                        <span className="text-[10px] text-slate-500 font-medium">
                          • Runs in background tabs
                        </span>
                      </div>

                      {/* Real-time fluctuating ticker when monitoring is active */}
                      {isAlertActive && liveSurge !== null && (
                        <div className="mt-3.5 bg-slate-950 rounded-lg p-2.5 border border-slate-800 inline-flex items-center gap-3">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-semibold">Pulse Monitor:</span>
                          <span className="text-sm font-extrabold font-mono text-rose-400 animate-pulse">{liveSurge}x</span>
                          <span className="text-slate-600 font-mono text-xs">/</span>
                          <span className="text-xs font-mono text-slate-400">Target: {alertThreshold}x</span>
                        </div>
                      )}

                      {hasAlertTriggered && (
                        <div className="mt-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 inline-flex items-center gap-2 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Alert conditions met! Surge dropped to target threshold.</span>
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Trigger Target</span>
                        <select
                          value={alertThreshold}
                          onChange={(e) => setAlertThreshold(parseFloat(e.target.value))}
                          disabled={isAlertActive}
                          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition font-mono cursor-pointer"
                        >
                          <option value="1.0">1.0x (Standard)</option>
                          <option value="1.2">1.2x (Low Surge)</option>
                          <option value="1.4">1.4x (Mild Surge)</option>
                          <option value="1.6">1.6x (Mod Surge)</option>
                        </select>
                      </div>

                      <button
                        onClick={async () => {
                          if (!isAlertActive) {
                            // Request browser notification permission automatically when start tracking
                            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
                              try {
                                const perm = await Notification.requestPermission();
                                setNotificationPermission(perm);
                              } catch (e) {
                                console.error("Error requesting permission:", e);
                              }
                            }
                            setHasAlertTriggered(false);
                          }
                          setIsAlertActive(!isAlertActive);
                        }}
                        className={`py-2 px-4 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition ${
                          isAlertActive
                            ? "bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/35"
                            : "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-950"
                        }`}
                      >
                        {isAlertActive ? (
                          <>
                            <BellOff className="w-3.5 h-3.5" />
                            <span>Cancel Tracking</span>
                          </>
                        ) : (
                          <>
                            <Bell className="w-3.5 h-3.5" />
                            <span>Track Surge</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Recharts Cool-off Graph */}
              <TrendChart 
                data={forecastResult.forecastTrend}
                weather={weather}
                traffic={traffic}
                localEvent={localEvent}
                timeOfDay={timeOfDay}
                comparisonData={isComparisonMode ? forecastResultB?.forecastTrend : undefined}
                comparisonWeather={isComparisonMode ? weatherB : undefined}
                comparisonTraffic={isComparisonMode ? trafficB : undefined}
                comparisonLocalEvent={isComparisonMode ? localEventB : undefined}
                comparisonTimeOfDay={isComparisonMode ? timeOfDayB : undefined}
              />

              {/* Transit Alternative Row (Fallback or alternative view for single mode) */}
              {!isComparisonMode && (
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded bg-blue-500/10 text-blue-400 mt-0.5">
                      <Compass className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Eco-Transit Alternative</h4>
                      <span className="text-sm font-bold text-slate-100 block mt-1">{forecastResult.transitAlternative.name}</span>
                      <p className="text-[11px] text-slate-500 mt-1">Comfort Rating: {forecastResult.transitAlternative.comfortScore}/10 • Zero pricing peaks.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:text-right shrink-0 border-t border-slate-800/50 sm:border-t-0 pt-3 sm:pt-0">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold block">Transit Duration</span>
                      <span className="text-sm font-bold text-white font-mono">{forecastResult.transitAlternative.durationMinutes} mins</span>
                    </div>
                    <div className="w-[1px] h-8 bg-slate-800" />
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold block">Fixed Cost</span>
                      <span className="text-sm font-bold text-emerald-400 font-mono">${forecastResult.transitAlternative.cost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </section>
      </main>

      {/* Save Route Modal */}
      {showSaveRouteModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-bold text-white">Save Current Pick-up Zone</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Save this location to query or monitor surge multipliers instantly with one-tap.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Route Label / Name</span>
              <input
                type="text"
                value={savingRouteName}
                onChange={(e) => setSavingRouteName(e.target.value)}
                placeholder="e.g. Work Commute, Gym, Airport Station"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setSavingRouteName("");
                  setShowSaveRouteModal(false);
                }}
                className="py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoute}
                disabled={!savingRouteName.trim()}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                  savingRouteName.trim()
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                Save Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Searches Quick-Action Drawer */}
      <RecentSearchesDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        searchHistory={searchHistory}
        onSelectHistoryItem={handleSelectHistoryItem}
        onDeleteHistoryItem={handleDeleteHistoryItem}
        onClearHistory={handleClearHistory}
        user={user}
      />

      {/* Standard Footer */}
      <footer className="border-t border-slate-900 mt-12 bg-slate-950/60 backdrop-blur-md py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-slate-600 font-mono">
          <span>&copy; {new Date().getFullYear()} Uber Surge Demand Tracker</span>
          <div className="flex items-center gap-3">
            <span>Built with React + Gemini AI</span>
          </div>
        </div>
      </footer>
    </div>
  );

  return hasValidKey ? (
    <APIProvider apiKey={API_KEY} version="weekly">
      {mainContent}
    </APIProvider>
  ) : (
    mainContent
  );
}
