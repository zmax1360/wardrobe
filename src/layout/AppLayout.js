import React, { useMemo, createContext, useContext } from "react";
import { signOut } from "firebase/auth";

import { auth } from "../firebase";
import { COLORS, baseTransition, radius } from "../styles/theme";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";

const AppLayoutSidebarDataContext = createContext(null);

/** Sidebar badge data (same sources as before extraction). Wrap AppLayout with this. */
export function AppLayoutSidebarDataProvider({ profile, wardrobe, events, children }) {
  return (
    <AppLayoutSidebarDataContext.Provider value={{ profile, wardrobe, events }}>
      {children}
    </AppLayoutSidebarDataContext.Provider>
  );
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AppLayout({ activeNav, setActiveNav, children }) {
  const ctx = useContext(AppLayoutSidebarDataContext);
  const profile = ctx?.profile;
  const wardrobe = ctx?.wardrobe ?? [];
  const events = ctx?.events ?? [];
  const profileIcon =
    profile?.gender === "male"
      ? "👨"
      : profile?.gender === "female"
        ? "👩"
        : profile?.gender === "nonbinary" || profile?.gender === "undisclosed"
          ? "🧑"
          : "✦";

  const stats = useMemo(() => {
    const total = wardrobe.length;
    let clean = 0;
    let dirty = 0;
    let wash = 0;
    wardrobe.forEach((it) => {
      if (it.laundryStatus === "clean") clean++;
      else if (it.laundryStatus === "dirty") dirty++;
      else wash++;
    });
    return { total, clean, dirty, wash };
  }, [wardrobe]);

  const upcomingEventCount = useMemo(() => {
    const t = todayYmdLocal();
    return events.filter((ev) => ev && typeof ev.date === "string" && ev.date >= t).length;
  }, [events]);

  return (
    <div
      style={mergeStyles(ui.appShell, {
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
      })}
    >
      <aside
        style={mergeStyles(ui.sidebar, {
          width: 72,
          flexShrink: 0,
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 20,
          gap: 6,
          zIndex: 20,
          overflowY: "auto",
          boxShadow: "none",
          borderRight: "1px solid #EEEEEE",
          background: "#FFFFFF",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
        })}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 24,
            padding: "12px 0",
            borderBottom: `1px solid ${COLORS.border}`,
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              color: COLORS.primary,
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            F·O·S
          </div>
          <div style={{ fontSize: "1.8rem", lineHeight: 1 }}>{profileIcon}</div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            width: "100%",
            minHeight: 0,
            padding: "0 4px",
          }}
        >
          {[
            {
              title: "Daily",
              items: [
                { id: "planner", icon: "✨", label: "Planner" },
                { id: "evaluator", icon: "✅", label: "Evaluator" },
              ],
            },
            {
              title: "Improve My Style",
              items: [
                { id: "gaps", icon: "🔍", label: "Gap Analysis" },
                { id: "shopper", icon: "🛍️", label: "Shop" },
                { id: "designer", icon: "🎨", label: "Designer" },
              ],
            },
            {
              title: "Wardrobe",
              items: [
                { id: "wardrobe", icon: "👗", label: "Wardrobe" },
                { id: "equity", icon: "◈", label: "Equity" },
                { id: "calendar", icon: "📅", label: "Calendar" },
                { id: "profile", icon: "👤", label: "Profile" },
              ],
            },
          ].map((section) => (
            <div
              key={section.title}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}
            >
              <div
                style={{
                  ...type.eyebrow,
                  textAlign: "center",
                  width: "100%",
                  lineHeight: 1.25,
                  padding: "0 2px",
                }}
              >
                {section.title}
              </div>
              {section.items.map((nav) => {
                const active = activeNav === nav.id;
                return (
                  <button
                    key={nav.id}
                    type="button"
                    title={nav.label}
                    onClick={() => setActiveNav(nav.id)}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.md,
                      border: active ? `1px solid ${COLORS.primarySoft}` : "1px solid transparent",
                      background: active ? COLORS.surface : "transparent",
                      boxShadow: active ? COLORS.cardGlow : "none",
                      color: active ? COLORS.primary : COLORS.textSoft,
                      cursor: "pointer",
                      fontSize: "1.35rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      transition: baseTransition,
                    }}
                  >
                    {nav.icon}
                    {nav.id === "wardrobe" && stats.total > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          minWidth: 18,
                          height: 18,
                          padding: "0 5px",
                          borderRadius: 999,
                          background: COLORS.primary,
                          color: "#FFFFFF",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {stats.total > 99 ? "99+" : stats.total}
                      </span>
                    )}
                    {nav.id === "calendar" && upcomingEventCount > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          minWidth: 18,
                          height: 18,
                          padding: "0 5px",
                          borderRadius: 999,
                          background: COLORS.primary,
                          color: "#FFFFFF",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {upcomingEventCount > 99 ? "99+" : upcomingEventCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 16, width: "100%" }}>
          <button
            type="button"
            title="Sign out"
            onClick={() => {
              void signOut(auth).catch(() => {});
            }}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.textSoft,
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              cursor: "pointer",
              textTransform: "uppercase",
              fontFamily: "'DM Sans', sans-serif",
              transition: baseTransition,
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      <div style={{ marginLeft: 80, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}
