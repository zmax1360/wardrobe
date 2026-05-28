import React, { useCallback, useEffect, useMemo, useState } from "react";

import { COLORS } from "../constants/colors";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";
import { compareCleanItemsByPriorityCPW } from "../utils/wardrobeFinance";
import { runAgent } from "../agents/agentOrchestrator";

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
  };

  const planOutfit = async (occasionOverride = null) => {
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
  "primary_outfit": {
    "name": "short evocative title",
    "items": ["exact names from wardrobe list"],
    "why": "one line"
  },
  "alternate_outfit": null
}

Set alternate_outfit to a second option only if clearly useful; otherwise null.`;

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
      if (parsed) {
        const primaryText = [parsed.name, ...parsed.items, parsed.why].join(" ");
        const altText = parsed.alternate
          ? [parsed.alternate.name, ...parsed.alternate.items, parsed.alternate.why].join(" ")
          : "";
        setMatchedItems(matchOutfitItems(primaryText + altText, cleanItems));
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
            padding: "12px 24px",
            borderRadius: 8,
            border: "none",
            background:
              loading ||
              wardrobe.length === 0 ||
              cleanItems.length === 0 ||
              (mode === "everyday" && !occasion.trim() && !autoplan) ||
              (mode === "event" && (upcomingSorted.length === 0 || !selectedEventId))
                ? COLORS.border
                : COLORS.primary,
            color: "#FFFFFF",
            fontWeight: 600,
            cursor:
              loading ||
              wardrobe.length === 0 ||
              cleanItems.length === 0 ||
              (mode === "everyday" && !occasion.trim() && !autoplan) ||
              (mode === "event" && (upcomingSorted.length === 0 || !selectedEventId))
                ? "default"
                : "pointer",
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
            <>
              <div style={mergeStyles(ui.panel, { padding: "20px 22px", marginBottom: plannerPlan.alternate ? 14 : 16 })}>
                <div style={type.meta}>Main outfit</div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "1.35rem",
                    fontWeight: 600,
                    marginTop: 6,
                    marginBottom: 12,
                    color: COLORS.text,
                  }}
                >
                  {plannerPlan.name}
                </div>
                {plannerPlan.items.length > 0 ? (
                  <ul style={{ margin: "0 0 12px", paddingLeft: 18, color: COLORS.text, fontSize: "0.9rem", lineHeight: 1.5 }}>
                    {plannerPlan.items.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {plannerPlan.why ? (
                  <div style={{ fontSize: "0.88rem", color: COLORS.textMuted, lineHeight: 1.55 }}>{plannerPlan.why}</div>
                ) : null}
                {matchedItems.filter((it) =>
                  plannerPlan.items.some((label) => String(label).toLowerCase().includes(it.name.toLowerCase()))
                ).length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                    {matchedItems
                      .filter((it) =>
                        plannerPlan.items.some((label) =>
                          String(label).toLowerCase().includes(it.name.toLowerCase())
                        )
                      )
                      .map((item) => (
                        <div
                          key={item.id}
                          style={{
                            width: 56,
                            height: 68,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: `1px solid ${COLORS.border}`,
                            background: COLORS.surface2,
                          }}
                        >
                          {item.imagePreview ? (
                            <img src={item.imagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                              👗
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
              {plannerPlan.alternate ? (
                <div style={mergeStyles(ui.panel, { padding: "18px 20px", marginBottom: 16, opacity: 0.95 })}>
                  <div style={type.meta}>Alternative</div>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: "1.15rem",
                      fontWeight: 600,
                      marginTop: 6,
                      marginBottom: 10,
                      color: COLORS.text,
                    }}
                  >
                    {plannerPlan.alternate.name || "Option B"}
                  </div>
                  {plannerPlan.alternate.items.length > 0 ? (
                    <ul style={{ margin: "0 0 10px", paddingLeft: 18, color: COLORS.text, fontSize: "0.88rem", lineHeight: 1.45 }}>
                      {plannerPlan.alternate.items.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {plannerPlan.alternate.why ? (
                    <div style={{ fontSize: "0.85rem", color: COLORS.textMuted, lineHeight: 1.5 }}>{plannerPlan.alternate.why}</div>
                  ) : null}
                </div>
              ) : null}
            </>
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
          <button
            type="button"
            onClick={resetPlan}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface,
              color: COLORS.text,
              cursor: "pointer",
              fontWeight: 600,
              transition: baseTransition,
            }}
          >
            Plan another
          </button>
        </div>
      )}
    </div>
  );
}
