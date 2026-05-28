import React, { useCallback, useEffect, useState } from "react";

function useLocalWeather() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          timeout: 15000,
          maximumAge: 300000,
          enableHighAccuracy: false,
        })
      );
      const { latitude, longitude } = pos.coords;

      let city = "your city";
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          { headers: { "User-Agent": "FashionOS/1.0" } }
        );
        if (geoRes.ok) {
          const d = await geoRes.json();
          city = d.address?.city || d.address?.town || d.address?.suburb || city;
        }
      } catch {}

      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=celsius`
      );
      const wData = await wRes.json();
      const temp = Math.round(wData.current.temperature_2m);
      const codes = {
        0: "☀️",
        1: "🌤",
        2: "⛅️",
        3: "☁️",
        45: "🌫",
        51: "🌦",
        61: "🌧",
        63: "🌧",
        71: "🌨",
        80: "🌦",
        95: "⛈",
      };
      const icon = codes[wData.current.weathercode] || "🌡";
      setWeather({ temp, city, icon });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { weather, loading };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function wardrobeSummary(wardrobe) {
  const total = wardrobe.length;
  const clean = wardrobe.filter((it) => it.laundryStatus === "clean").length;
  const categories = [...new Set(wardrobe.map((it) => it.category).filter(Boolean))];
  return { total, clean, categories };
}

function getUpcomingEvents(events) {
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((e) => e?.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 2);
}

function formatEventDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const diffDays = Math.round((date - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return date.toLocaleDateString("en-CA", { weekday: "long" });
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function DashboardScreen({ wardrobe, setActiveNav, profile, events = [] }) {
  const { weather, loading: weatherLoading } = useLocalWeather();
  const summary = wardrobeSummary(wardrobe);
  const upcomingEvents = getUpcomingEvents(events);
  const greeting = getGreeting();
  const firstName = profile?.name?.split(" ")[0] || profile?.displayName?.split(" ")[0] || "";

  const hasWardrobe = wardrobe.length > 0;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 0 48px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "2rem",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: "0 0 6px",
            lineHeight: 1.2,
          }}
        >
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>

        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
            minHeight: 22,
          }}
        >
          {weatherLoading ? "Checking weather…" : weather ? `${weather.icon} ${weather.temp}°C in ${weather.city}` : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setActiveNav("planner")}
        style={{
          width: "100%",
          padding: "18px 24px",
          background: "var(--color-text-primary)",
          color: "var(--color-bg)",
          border: "none",
          borderRadius: "var(--radius-lg)",
          fontFamily: "var(--font-serif)",
          fontSize: "1.15rem",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 12,
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "opacity var(--transition)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.88";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        <span>What should I wear today?</span>
        <span style={{ fontSize: "1.3rem" }}>→</span>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 32 }}>
        {[
          { label: "My Wardrobe", icon: "👗", nav: "wardrobe" },
          { label: "Gap Analysis", icon: "🔍", nav: "gaps" },
        ].map(({ label, icon, nav }) => (
          <button
            key={nav}
            type="button"
            onClick={() => setActiveNav(nav)}
            style={{
              padding: "14px 16px",
              background: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "var(--color-text-primary)",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "background var(--transition)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e8e1d6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-bg-secondary)";
            }}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {hasWardrobe ? (
        <div
          style={{
            padding: "20px 22px",
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginBottom: 14,
            }}
          >
            Your Wardrobe
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1 }}>
                {summary.total}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>pieces</div>
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1 }}>
                {summary.clean}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>clean & ready</div>
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1 }}>
                {summary.categories.length}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>categories</div>
            </div>
          </div>
          {summary.clean === 0 && summary.total > 0 && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--color-border)",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              🧺 All items marked dirty — update laundry status in your wardrobe.
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "28px 24px",
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>👗</div>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 8,
            }}
          >
            Start with your wardrobe
          </div>
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Scan your closet or add pieces manually to get outfit suggestions.
          </div>
          <button
            type="button"
            onClick={() => setActiveNav("wardrobe")}
            style={{
              padding: "10px 24px",
              background: "var(--color-amber)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Scan my closet
          </button>
        </div>
      )}
    </div>
  );
}
