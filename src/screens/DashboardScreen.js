import React, { useCallback, useEffect, useMemo, useState } from "react";

import { calculateCPW, getPurchasePriceNum, getTimesWorn } from "../utils/wardrobeFinance";

/** Alive copy; when an agent run is active, surface it. */
function agentCrewStatusLine(agentActivity) {
  if (agentActivity?.status === "running") {
    return "Agent Crew: Active — orchestrating your request";
  }
  return "Agent Crew: Monitoring Gaps";
}

function useDashboardKpis(wardrobe) {
  return useMemo(() => {
    const totalValue = wardrobe.reduce((sum, it) => sum + getPurchasePriceNum(it), 0);
    const priced = wardrobe.filter((it) => getPurchasePriceNum(it) > 0);
    const avgCPW =
      priced.length > 0
        ? priced.reduce((sum, it) => sum + calculateCPW(getPurchasePriceNum(it), getTimesWorn(it)), 0) /
          priced.length
        : 0;

    const wornCount = wardrobe.filter((it) => getTimesWorn(it) > 0).length;
    const utilityPct =
      wardrobe.length > 0 ? Math.round((wornCount / wardrobe.length) * 100) : null;

    return { totalValue, avgCPW, utilityPct, pricedCount: priced.length, wornCount, totalCount: wardrobe.length };
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

      let city = "Toronto";
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
        /* CORS / rate limits — keep default Toronto */
      }

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
      setWeather({ temp, condition, city });
    } catch (e) {
      const code = e && typeof e.code === "number" ? e.code : null;
      if (code === 1) setError("Allow location for weather-aware briefings.");
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

function pickSpotlightItem(wardrobe, weather) {
  if (!wardrobe.length) return null;
  const clean = wardrobe.filter((it) => it.laundryStatus === "clean");
  const pool = clean.length ? clean : wardrobe;
  let list = [...pool].sort((a, b) => getTimesWorn(a) - getTimesWorn(b));

  if (weather && typeof weather.temp === "number") {
    const cat = (it) => String(it.category || "").toLowerCase();
    if (weather.temp < 11) {
      const outer = list.filter((it) => cat(it).includes("outer"));
      if (outer.length) list = outer.sort((a, b) => getTimesWorn(a) - getTimesWorn(b));
    } else if (weather.temp > 24) {
      const light = list.filter((it) => /top|dress|shirt|tee|tank|skirt|short/i.test(cat(it) + (it.name || "")));
      if (light.length) list = light.sort((a, b) => getTimesWorn(a) - getTimesWorn(b));
    }
  }

  return list[0] || null;
}

export function DashboardScreen({ wardrobe, setActiveNav, agentActivity }) {
  const kpis = useDashboardKpis(wardrobe);
  const { weather, loading: weatherLoading, error: weatherError, refresh } = useLocalWeather();
  const spotlight = useMemo(() => pickSpotlightItem(wardrobe, weather), [wardrobe, weather]);

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page-title">The Daily Briefing</h1>
      <p className="dashboard-page-lede">
        Value, cost-per-wear, and utility — one calm view of your collection.
      </p>
      <p className="dashboard-agent-status" role="status">
        {agentCrewStatusLine(agentActivity)}
      </p>

      <div className="dashboard-kpi-row">
        <div className="dashboard-kpi">
          <div className="dashboard-kpi-label">Total value</div>
          <div className="dashboard-kpi-value">${kpis.totalValue.toFixed(0)}</div>
          <div className="dashboard-kpi-hint">Sum of purchase prices (incl. catalog value)</div>
        </div>
        <div className="dashboard-kpi">
          <div className="dashboard-kpi-label">Average CPW</div>
          <div className="dashboard-kpi-value">{kpis.pricedCount ? `$${kpis.avgCPW.toFixed(2)}` : "—"}</div>
          <div className="dashboard-kpi-hint">Priced items only</div>
        </div>
        <div className="dashboard-kpi">
          <div className="dashboard-kpi-label">Utility</div>
          <div className="dashboard-kpi-value">{kpis.utilityPct != null ? `${kpis.utilityPct}%` : "—"}</div>
          <div className="dashboard-kpi-hint">
            {kpis.totalCount ? `${kpis.wornCount} / ${kpis.totalCount} pieces worn ≥1×` : "—"}
          </div>
        </div>
      </div>

      {wardrobe.length === 0 ? (
        <section className="dashboard-empty-cta" aria-labelledby="dashboard-empty-heading">
          <h2 id="dashboard-empty-heading" className="dashboard-empty-cta-title">
            Your Collection Begins Here
          </h2>
          <p className="dashboard-empty-cta-copy">
            Catalog one piece to unlock CPW, equity, and planner intelligence — your closet as a balance sheet.
          </p>
          <button type="button" className="dashboard-empty-cta-button" onClick={() => setActiveNav("wardrobe")}>
            Import your first piece
          </button>
        </section>
      ) : (
        <section className="dashboard-spotlight">
          <div className="dashboard-spotlight-eyebrow">Asset spotlight</div>
          {weatherLoading ? (
            <p className="dashboard-spotlight-copy">Fetching weather…</p>
          ) : (
            <p className="dashboard-spotlight-copy">
              {weather ? (
                <>
                  It&apos;s <strong>{weather.temp}°</strong> in <strong>{weather.city || "Toronto"}</strong>.
                </>
              ) : (
                <span className="dashboard-spotlight-muted">Local weather unavailable — </span>
              )}
              {spotlight ? (
                <>
                  {" "}
                  Your <strong>{spotlight.name || "piece"}</strong>
                  {spotlight.category ? ` (${spotlight.category})` : ""} is due for a wear to lower its CPW.
                </>
              ) : (
                <> Add a clean item or log wears to personalize this line.</>
              )}
              {weatherError ? <span className="dashboard-spotlight-muted"> {weatherError}</span> : null}
            </p>
          )}
          {weatherError ? (
            <button type="button" className="dashboard-text-link dashboard-spotlight-retry" onClick={() => void refresh()}>
              Retry location
            </button>
          ) : null}
          <div className="dashboard-spotlight-links">
            <button type="button" className="dashboard-text-link" onClick={() => setActiveNav("wardrobe")}>
              Asset Gallery
            </button>
            <span className="dashboard-action-sep" aria-hidden>
              ·
            </span>
            <button type="button" className="dashboard-text-link" onClick={() => setActiveNav("planner")}>
              Planner
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
