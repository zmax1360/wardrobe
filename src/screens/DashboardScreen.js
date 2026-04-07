import React, { useCallback, useEffect, useMemo, useState } from "react";

import { getCostPerWear, getPurchasePriceNum, getWearCount } from "../utils/wardrobeFinance";

function dashboardAgentStatusLine(agentActivity) {
  if (!agentActivity) return "Agent Status: Idle";
  if (agentActivity.status === "running") return "Agent Status: Running";
  const n = Array.isArray(agentActivity.history) ? agentActivity.history.length : 0;
  if (n === 0) return "Agent Status: Idle";
  if (n === 1) return "Agent Status: 1 task complete";
  return `Agent Status: ${n} tasks complete`;
}

function useDashboardKpis(wardrobe) {
  return useMemo(() => {
    const totalWardrobeValue = wardrobe.reduce((sum, it) => sum + getPurchasePriceNum(it), 0);
    const priced = wardrobe.filter((it) => getPurchasePriceNum(it) > 0);
    const avgCPW =
      priced.length > 0 ? priced.reduce((sum, it) => sum + getCostPerWear(it), 0) / priced.length : 0;
    const wornPriced = priced.filter((it) => getWearCount(it) > 0).length;
    const efficiencyPct = priced.length ? Math.round((wornPriced / priced.length) * 100) : null;

    return { totalWardrobeValue, avgCPW, efficiencyPct, pricedCount: priced.length };
  }, [wardrobe]);
}

function useLocalWeather() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!navigator.geolocation) {
        setError("Geolocation is not supported.");
        setLoading(false);
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

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=celsius`
      );
      if (!weatherRes.ok) throw new Error("weather");
      const weatherData = await weatherRes.json();
      const current = weatherData.current;
      if (!current || current.temperature_2m == null) throw new Error("no data");

      const weatherCodes = {
        0: "clear",
        1: "mainly clear",
        2: "partly cloudy",
        3: "overcast",
        45: "foggy",
        51: "light drizzle",
        61: "light rain",
        63: "rain",
        71: "snow",
        80: "showers",
        95: "thunderstorm",
      };
      const condition = weatherCodes[current.weathercode] || "mixed conditions";
      const temp = Math.round(current.temperature_2m);
      setWeather({ temp, condition });
    } catch (e) {
      const code = e && typeof e.code === "number" ? e.code : null;
      if (code === 1) setError("Allow location to tailor picks to weather.");
      else setError("Could not load weather.");
      setWeather(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { weather, loading, error, refresh };
}

function pickWearSuggestion(wardrobe, weather) {
  if (!wardrobe.length) return null;
  const clean = wardrobe.filter((it) => it.laundryStatus === "clean");
  const pool = clean.length ? clean : wardrobe;
  let list = [...pool].sort((a, b) => getWearCount(a) - getWearCount(b));

  if (weather && typeof weather.temp === "number") {
    const cat = (it) => String(it.category || "").toLowerCase();
    if (weather.temp < 11) {
      const outer = list.filter((it) => cat(it).includes("outer"));
      if (outer.length) list = outer.sort((a, b) => getWearCount(a) - getWearCount(b));
    } else if (weather.temp > 24) {
      const light = list.filter((it) => /top|dress|shirt|tee|tank|skirt|short/i.test(cat(it) + (it.name || "")));
      if (light.length) list = light.sort((a, b) => getWearCount(a) - getWearCount(b));
    }
  }

  return list[0] || null;
}

export function DashboardScreen({ wardrobe, setActiveNav, agentActivity }) {
  const kpis = useDashboardKpis(wardrobe);
  const { weather, loading: weatherLoading, error: weatherError, refresh } = useLocalWeather();
  const suggestion = useMemo(() => pickWearSuggestion(wardrobe, weather), [wardrobe, weather]);

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page-title">The Daily Brief.</h1>
      <p className="dashboard-page-lede">Your wardrobe at a glance — value, efficiency, and one guided move.</p>
      <p className="dashboard-agent-status" role="status">
        {dashboardAgentStatusLine(agentActivity)}
      </p>

      <div className="dashboard-kpi-row">
        <div className="dashboard-kpi">
          <div className="dashboard-kpi-label">Total wardrobe value</div>
          <div className="dashboard-kpi-value">${kpis.totalWardrobeValue.toFixed(0)}</div>
        </div>
        <div className="dashboard-kpi">
          <div className="dashboard-kpi-label">Avg. CPW</div>
          <div className="dashboard-kpi-value">{kpis.pricedCount ? `$${kpis.avgCPW.toFixed(2)}` : "—"}</div>
        </div>
        <div className="dashboard-kpi">
          <div className="dashboard-kpi-label">Wardrobe efficiency</div>
          <div className="dashboard-kpi-value">
            {kpis.efficiencyPct != null ? `${kpis.efficiencyPct}%` : "—"}
          </div>
          <div className="dashboard-kpi-hint">Priced pieces worn ≥1×</div>
        </div>
      </div>

      <div className="dashboard-action-card">
        <div className="dashboard-action-eyebrow">Guided action</div>
        {wardrobe.length === 0 ? (
          <>
            <p className="dashboard-action-copy">Step 1: Catalog your first asset.</p>
            <button type="button" className="dashboard-text-link" onClick={() => setActiveNav("wardrobe")}>
              Open Asset Gallery →
            </button>
          </>
        ) : (
          <>
            <p className="dashboard-action-copy">
              {weatherLoading && "Checking local weather…"}
              {!weatherLoading && weather && (
                <>
                  Today is about <strong>{weather.temp}°C</strong> and <strong>{weather.condition}</strong>.
                  {suggestion && (
                    <>
                      {" "}
                      Consider wearing <strong>{suggestion.name || "this piece"}</strong>
                      {suggestion.category ? ` (${suggestion.category})` : ""} — it&apos;s clean and due for rotation.
                    </>
                  )}
                  {!suggestion && " Add a clean piece or log wears to refine picks."}
                </>
              )}
              {!weatherLoading && !weather && weatherError && <span> {weatherError}</span>}
            </p>
            {weatherError && (
              <button type="button" className="dashboard-text-link" onClick={() => void refresh()}>
                Retry location
              </button>
            )}
            <div className="dashboard-action-links">
              <button type="button" className="dashboard-text-link" onClick={() => setActiveNav("planner")}>
                Open Planner
              </button>
              <span className="dashboard-action-sep" aria-hidden>
                ·
              </span>
              <button type="button" className="dashboard-text-link" onClick={() => setActiveNav("wardrobe")}>
                Asset Gallery
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
