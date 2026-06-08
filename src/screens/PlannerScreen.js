import React, { useCallback, useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";
import { compareCleanItemsByPriorityCPW } from "../utils/wardrobeFinance";
import { runAgent } from "../agents/agentOrchestrator";
import { OutfitConfirmScreen } from "../components/OutfitConfirmScreen";

export function PlannerScreen({
  profile,
  wardrobe,
  events,
  setActiveNav,
  autoplan = false,
  onAutoPlanConsumed,
  baseTransition,
  agentInsights,
  todayYmdLocal,
  buildProfileSummary,
  buildCleanWardrobeList,
  formatDisplayDate,
  daysRelativeLabel,
  parsePlannerResponse,
  plannerHistory = [],
  recordSession,
  recordChoice,
  updateItem,
}) {
  const [mode, setMode] = useState("everyday");
  const [occasion, setOccasion] = useState("");
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [plannerPlan, setPlannerPlan] = useState(null);
  const [error, setError] = useState("");
  const [matchedItems, setMatchedItems] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [chosenIdx, setChosenIdx] = useState(null);
  const [confirmingOutfit, setConfirmingOutfit] = useState(null);
  const [activeOutfitIdx, setActiveOutfitIdx] = useState(0);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      if (!navigator.geolocation) {
        setWeatherError("Geolocation is not supported in this browser.");
        setWeatherLoading(false);
        return;
      }

      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          timeout: 15000,
          maximumAge: 300000,
          enableHighAccuracy: false,
        })
      );
      const { latitude, longitude } = pos.coords;

      let city = "near you";
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "FashionOS/1.0 (local wardrobe app)",
            },
          }
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          city =
            geoData.address?.city ||
            geoData.address?.town ||
            geoData.address?.village ||
            geoData.address?.suburb ||
            geoData.address?.municipality ||
            city;
        }
      } catch {
        /* Nominatim often blocks browser CORS; weather still works without a place name */
      }

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m&temperature_unit=celsius`
      );
      if (!weatherRes.ok) throw new Error("weather http");
      const weatherData = await weatherRes.json();
      const current = weatherData.current;
      if (!current || current.temperature_2m == null) throw new Error("no weather");

      const weatherCodes = {
        0: "clear sky",
        1: "mainly clear",
        2: "partly cloudy",
        3: "overcast",
        45: "foggy",
        48: "icy fog",
        51: "light drizzle",
        53: "drizzle",
        55: "heavy drizzle",
        61: "light rain",
        63: "rain",
        65: "heavy rain",
        71: "light snow",
        73: "snow",
        75: "heavy snow",
        80: "rain showers",
        81: "heavy showers",
        82: "violent showers",
        95: "thunderstorm",
      };

      const condition = weatherCodes[current.weathercode] || "mixed conditions";
      const temp = Math.round(current.temperature_2m);

      setWeather({
        city,
        temp,
        condition,
        summary: `${temp}°C, ${condition} in ${city}`,
      });
    } catch (e) {
      const code = e && typeof e.code === "number" ? e.code : null;
      if (code === 1) {
        setWeatherError(
          "Location access denied. In your browser, allow location for this site (lock icon in the address bar), then tap Refresh."
        );
      } else if (code === 2) {
        setWeatherError("Location unavailable. Turn on device location services and try Refresh.");
      } else if (code === 3) {
        setWeatherError("Location timed out. Tap Refresh or move to an area with a clearer signal.");
      } else {
        setWeatherError("Could not load weather. Check your connection and tap Refresh.");
      }
    }
    setWeatherLoading(false);
  }, []);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  const today = todayYmdLocal();
  const upcomingSorted = useMemo(() => {
    return [...events]
      .filter((e) => e && typeof e.date === "string" && e.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [events, today]);

  const selectedEvent = useMemo(
    () => upcomingSorted.find((e) => e.id === selectedEventId) || null,
    [upcomingSorted, selectedEventId]
  );

  const cleanItems = useMemo(() => {
    const clean = wardrobe.filter((it) => it.laundryStatus === "clean");
    return [...clean].sort(compareCleanItemsByPriorityCPW);
  }, [wardrobe]);

  const plannerAgentInsightsBlock = useMemo(() => {
    const a = agentInsights || {};
    const fi = Array.isArray(a.frequentIssues) ? a.frequentIssues : [];
    const ps = Array.isArray(a.preferredStyles) ? a.preferredStyles : [];
    const av = Array.isArray(a.avoidedItems) ? a.avoidedItems : [];
    return [
      fi.length ? `Repeated issues:\n${fi.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
      ps.length ? `Preferred styles: ${ps.join(", ")}` : "",
      av.length ? `Avoid: ${av.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n") || "(none yet)";
  }, [agentInsights]);

  const resetPlan = () => {
    setResult("");
    setPlannerPlan(null);
    setError("");
    setMatchedItems([]);
    setConfirmingOutfit(null);
  };

  const planOutfit = async (occasionOverride = null) => {
    setChosenIdx(null);
    setCurrentSessionId(null);
    setConfirmingOutfit(null);
    setError("");
    setResult("");
    if (wardrobe.length === 0) {
      setError("Add clothes to your wardrobe first");
      return;
    }
    if (wardrobe.length > 0 && cleanItems.length === 0) {
      setError("All your clothes are dirty or in the wash!");
      return;
    }
    const occasionValue = occasionOverride || occasion.trim();
    if (mode === "everyday" && !occasionValue) {
      setError("Describe the occasion or context.");
      return;
    }
    if (mode === "event" && !selectedEvent) {
      setError("Select an upcoming event.");
      return;
    }

    const profileSummary = buildProfileSummary(profile);
    const wardrobeItems = buildCleanWardrobeList(cleanItems);
    const weatherBlock = weather ? weather.summary : "Unknown — assume mild, layer-friendly conditions.";
    const eventsBlock = upcomingSorted.length
      ? upcomingSorted
          .slice(0, 12)
          .map(
            (e) =>
              `- ${e.title} (${e.date}) · ${e.occasionType} · ${e.dressCode}${e.location ? ` · ${e.location}` : ""}`
          )
          .join("\n")
      : "(no upcoming events)";

    let occasionText = "";
    if (mode === "everyday") {
      occasionText = occasionValue;
    } else if (selectedEvent) {
      occasionText = `Event "${selectedEvent.title}" on ${formatDisplayDate(selectedEvent.date)} (${daysRelativeLabel(selectedEvent.date)}). Occasion: ${selectedEvent.occasionType}. Dress code: ${selectedEvent.dressCode}.`;
      if (selectedEvent.location) occasionText += ` Location: ${selectedEvent.location}.`;
      if (selectedEvent.notes) occasionText += ` Notes: ${selectedEvent.notes}`;
      occasionText += " The outfit must respect the stated dress code.";
    }

    const system = `You are a personal fashion stylist. Suggest ONE outfit from the wardrobe list below.

WEATHER: ${weatherBlock}

TEMPERATURE RULES — follow these strictly, they override style preferences:
- Below 5°C: heavy coat or parka required. Sweater or thermal underneath.
- 5–10°C: jacket or coat required. Layering expected.
- 10–15°C: light jacket, blazer, or cardigan appropriate but optional.
- 16–20°C: no jacket needed. A single light layer (cardigan, thin long-sleeve) is fine but not required. Do NOT suggest structured blazers, wool coats, or heavy outerwear.
- 21–25°C: lightweight clothing only. T-shirts, light tops, chinos, summer dresses.
- Above 25°C: minimal layers. Shorts, linen, breathable fabrics. No jackets.

OCCASION: ${occasionText}

USER PROFILE:
${profileSummary}

WARDROBE (clean pieces only — use exact names from this list):
${wardrobeItems}

UPCOMING EVENTS:
${eventsBlock}

AGENT INSIGHTS:
${plannerAgentInsightsBlock}

Rules:
- Pick items whose combined warmth matches the temperature rules above.
- Prefer items with high cost-per-wear (expensive, under-worn pieces come first in the list).
- Use exact item names from the wardrobe list — do not invent names.
- Do NOT suggest a blazer, coat, or jacket if temperature is above 16°C unless the occasion explicitly requires formal dress.

Respond with ONLY valid JSON (no markdown):
{
  "outfits": [
    {
      "name": "short evocative title",
      "items": ["exact names from wardrobe list"],
      "why": "one line"
    },
    {
      "name": "short evocative title",
      "items": ["exact names from wardrobe list"],
      "why": "one line"
    },
    {
      "name": "short evocative title",
      "items": ["exact names from wardrobe list"],
      "why": "one line"
    }
  ]
}

Always return exactly 3 outfits. Each must be meaningfully different — vary the mood, formality, or layering. All items must be exact names from the wardrobe list.`;

    const user = "Return the JSON outfit plan now.";

    setLoading(true);
    try {
      const text = await runAgent({
        agentName: "Planner Agent",
        task: "Plan outfit",
        systemPrompt: system,
        userPrompt: user,
      });
      setResult(text);
      const parsed = parsePlannerResponse(text);
      setPlannerPlan(parsed);
      const weatherText = weather ? weather.summary : "";
      if (parsed?.outfits?.length && recordSession) {
        const sessionId = await recordSession({
          weather: weatherText,
          occasion: occasionText,
          outfits: parsed.outfits.map((o) => ({
            name: o.name,
            items: o.items,
          })),
        });
        setCurrentSessionId(sessionId);
        setChosenIdx(null);
      }
      if (parsed?.outfits?.length) {
        const allText = parsed.outfits
          .map((o) => [o.name, ...o.items, o.why].join(" "))
          .join(" ");
        setMatchedItems(matchOutfitItems(allText, cleanItems));
      } else {
        setMatchedItems(matchOutfitItems(text, cleanItems));
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoplan && !loading) {
      const hour = new Date().getHours();
      let smartOccasion = "";

      if (hour >= 5 && hour < 9) {
        smartOccasion = "morning commute";
      } else if (hour >= 9 && hour < 12) {
        smartOccasion = "casual workday";
      } else if (hour >= 12 && hour < 14) {
        smartOccasion = "lunch outing";
      } else if (hour >= 14 && hour < 17) {
        smartOccasion = "afternoon errands";
      } else if (hour >= 17 && hour < 20) {
        smartOccasion = "casual evening out";
      } else {
        smartOccasion = "relaxed evening";
      }

      setOccasion(smartOccasion);

      const timer = setTimeout(() => {
        void planOutfit(smartOccasion);
        onAutoPlanConsumed?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoplan]);

  function matchOutfitItems(responseText, wardrobe) {
    return wardrobe.filter((item) =>
      responseText.toLowerCase().includes(item.name.toLowerCase())
    );
  }

  const pill = (id, label) => {
    const on = mode === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setMode(id);
          resetPlan();
        }}
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
          background: on ? COLORS.primarySoft : COLORS.surface2,
          color: on ? COLORS.text : COLORS.textMuted,
          cursor: "pointer",
          fontSize: "0.85rem",
          transition: baseTransition,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.75rem",
          fontWeight: 600,
          margin: "0 0 8px",
        }}
      >
        Planner
      </h2>
      <p style={{ color: COLORS.textMuted, margin: "0 0 20px", fontSize: "0.9rem" }}>
        One main look, optional alternative — uses weather, events, wardrobe, and your insights.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {pill("everyday", "Everyday")}
        {pill("event", "For an Event")}
      </div>

      {wardrobe.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 16 }}>Add clothes to your wardrobe first</p>
      )}
      {wardrobe.length > 0 && cleanItems.length === 0 && (
        <p style={{ color: COLORS.textMuted, marginBottom: 16 }}>All your clothes are dirty or in the wash!</p>
      )}

      {mode === "everyday" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: COLORS.surface2,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: COLORS.textMuted,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Current Weather
              </div>
              {weatherLoading && (
                <div style={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>Detecting location...</div>
              )}
              {weather && !weatherLoading && (
                <div
                  style={{
                    color: COLORS.text,
                    fontSize: "0.95rem",
                    fontWeight: 500,
                  }}
                >
                  {weather.summary}
                </div>
              )}
              {weatherError && (
                <div style={{ color: "#e8a0a0", fontSize: "0.8rem" }}>{weatherError}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void fetchWeather()}
              disabled={weatherLoading}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "6px 12px",
                cursor: weatherLoading ? "default" : "pointer",
                color: COLORS.textMuted,
                fontSize: "0.75rem",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              ↻ Refresh
            </button>
          </div>
          <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 }}>
            Occasion / context
          </label>
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            placeholder="e.g. casual Friday, grocery run, gym session"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
              color: COLORS.text,
              marginBottom: 16,
            }}
          />
        </div>
      )}

      {mode === "event" && (
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 24,
            border: `1px solid ${COLORS.border}`,
            marginBottom: 20,
          }}
        >
          {upcomingSorted.length === 0 ? (
            <p style={{ color: COLORS.textMuted, margin: 0, lineHeight: 1.6 }}>
              No upcoming events. Add one in the Calendar first.{" "}
              <button
                type="button"
                onClick={() => setActiveNav("calendar")}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: COLORS.primary,
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "inherit",
                }}
              >
                Open Calendar
              </button>
            </p>
          ) : (
            <>
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.75rem", marginBottom: 6 }}>
                Upcoming event
              </label>
              <select
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  resetPlan();
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                  marginBottom: 16,
                  cursor: "pointer",
                }}
              >
                <option value="">Select an event…</option>
                {upcomingSorted.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {ev.date}
                  </option>
                ))}
              </select>
              {selectedEvent && (
                <div
                  style={{
                    background: COLORS.surface2,
                    borderRadius: 10,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: "0.88rem",
                    color: COLORS.textMuted,
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ color: COLORS.text, fontWeight: 600, marginBottom: 8 }}>{selectedEvent.title}</div>
                  <div>
                    {formatDisplayDate(selectedEvent.date)} · {daysRelativeLabel(selectedEvent.date)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {selectedEvent.occasionType} · {selectedEvent.dressCode}
                  </div>
                  {selectedEvent.location ? <div style={{ marginTop: 6 }}>📍 {selectedEvent.location}</div> : null}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!result && (
        <button
          type="button"
          onClick={planOutfit}
          disabled={
            loading ||
            wardrobe.length === 0 ||
            cleanItems.length === 0 ||
            (mode === "everyday" && !occasion.trim() && !autoplan) ||
            (mode === "event" && (upcomingSorted.length === 0 || !selectedEventId))
          }
          style={{
            width: "100%",
            borderRadius: "var(--radius-full)",
            padding: "12px 24px",
            border: "none",
            background: "var(--color-amber)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            marginBottom: 20,
            transition: baseTransition,
          }}
        >
          {loading ? "Planning…" : "Plan my outfit"}
        </button>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: `3px solid ${COLORS.border}`,
              borderTopColor: COLORS.primary,
              borderRadius: "50%",
              animation: "fosSpin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes fosSpin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ color: COLORS.textMuted }}>Stylist is thinking…</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: COLORS.primarySoft,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            marginBottom: 16,
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 8 }}>
          {plannerPlan ? (
            confirmingOutfit ? (
              <OutfitConfirmScreen
                outfit={confirmingOutfit}
                wardrobe={wardrobe}
                updateItem={updateItem}
                onConfirm={() => {
                  setConfirmingOutfit(null);
                  setPlannerPlan(null);
                  setActiveOutfitIdx(0);
                  setChosenIdx(null);
                  setCurrentSessionId(null);
                  setTimeout(() => setActiveNav("dashboard"), 300);
                }}
                onChangeMyMind={() => {
                  setConfirmingOutfit(null);
                  setChosenIdx(null);
                }}
              />
            ) : (
            <div style={{ width: "100%", maxWidth: "100%" }}>
            <div
              className="planner-outfits-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              {(plannerPlan.outfits || []).map((outfit, idx) => (
                <div
                  key={idx}
                  style={mergeStyles(ui.panel, { padding: "20px 22px" })}
                >
                  <div style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: COLORS.textMuted,
                    marginBottom: 6,
                  }}>
                    {idx === 0 ? "Main outfit" : idx === 1 ? "Alternative" : "Third option"}
                  </div>
                  <div style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "var(--text-xl)",
                    fontWeight: 700,
                    color: COLORS.text,
                    marginBottom: 10,
                    lineHeight: 1.2,
                  }}>
                    {outfit.name}
                  </div>
                  {outfit.items.length > 0 && (
                    <ul style={{ margin: "0 0 10px", padding: "0 0 0 16px", lineHeight: 1.7 }}>
                      {outfit.items.map((line, i) => (
                        <li key={i} style={{ fontSize: "var(--text-sm)", color: COLORS.text }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {outfit.why && (
                    <div style={{ fontSize: "0.88rem", color: COLORS.textMuted, lineHeight: 1.55 }}>
                      {outfit.why}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingOutfit({ ...outfit, idx });
                      if (recordChoice && currentSessionId) {
                        recordChoice(currentSessionId, idx, outfit.name);
                      }
                    }}
                    style={{
                      marginTop: 14,
                      width: "100%",
                      padding: "10px 16px",
                      borderRadius: "var(--radius-full)",
                      border: chosenIdx === idx
                        ? "none"
                        : "1px solid var(--color-border)",
                      background: chosenIdx === idx
                        ? "var(--color-amber)"
                        : "transparent",
                      color: chosenIdx === idx ? "#fff" : "var(--color-text-primary)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {chosenIdx === idx ? "✓ Wearing this today" : "I'll wear this"}
                  </button>
                  {(() => {
                    const previewItems = cleanItems.filter((it) =>
                      outfit.items.some((label) =>
                        String(label).toLowerCase().includes(it.name.toLowerCase()) ||
                        it.name.toLowerCase().includes(String(label).toLowerCase())
                      )
                    ).filter((it) => it.imagePreview).slice(0, 4);
                    if (!previewItems.length) return null;
                    return (
                      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                        {previewItems.map((it) => (
                          <img
                            key={it.id}
                            src={it.imagePreview}
                            alt={it.name}
                            style={{
                              width: 52,
                              height: 52,
                              objectFit: "cover",
                              borderRadius: 8,
                              border: "1px solid var(--color-border)",
                            }}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>

            {/* Mobile dot indicators */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: 6,
              marginTop: 10,
            }}>
              {(plannerPlan.outfits || []).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: idx === 0 ? COLORS.primary : COLORS.border,
                    transition: "background 0.2s",
                  }}
                />
              ))}
            </div>

            <div style={{ width: "100%", marginTop: 12 }}>
              <button
                type="button"
                onClick={resetPlan}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-full)",
                  padding: "12px 24px",
                  border: "1.5px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-text-primary)",
                  fontWeight: 600,
                  fontSize: "var(--text-sm)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Plan another
              </button>
            </div>
            </div>
            )
          ) : (
            <div
              style={{
                background: COLORS.surface2,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                whiteSpace: "pre-wrap",
                fontSize: "0.9rem",
                lineHeight: 1.6,
                color: COLORS.text,
                marginBottom: 16,
              }}
            >
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
