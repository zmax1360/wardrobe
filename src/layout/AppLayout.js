import React, { createContext, useContext } from "react";
import { signOut } from "firebase/auth";

import { auth } from "../firebase";
import { COLORS, baseTransition } from "../styles/theme";
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

export function AppLayout({ activeNav, setActiveNav, children, agentPanelOpen, onToggleAgentPanel, agentActivity }) {
  const ctx = useContext(AppLayoutSidebarDataContext);
  const profile = ctx?.profile;
  const profileIcon =
    profile?.gender === "male"
      ? "👨"
      : profile?.gender === "female"
        ? "👩"
        : profile?.gender === "nonbinary" || profile?.gender === "undisclosed"
          ? "🧑"
          : "✦";

  return (
    <div
      style={mergeStyles(ui.appShell, {
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
      })}
    >
      <aside
        className="app-layout-sidebar"
        style={mergeStyles(ui.sidebar, {
          width: 64,
          flexShrink: 0,
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          paddingTop: 18,
          gap: 4,
          zIndex: 20,
          overflowY: "auto",
          boxShadow: "none",
          borderRight: "1px solid #F0F0F0",
          background: "#FFFFFF",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
        })}
      >
        <div
          className="app-layout-sidebar-brand"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 20,
            padding: "8px 0 0",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: "0.58rem",
              letterSpacing: "0.22em",
              color: "#9A9A9A",
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            F·O·S
          </div>
          <div style={{ fontSize: "1.5rem", lineHeight: 1, opacity: 0.55 }}>{profileIcon}</div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            width: "100%",
            minHeight: 0,
            padding: "0 4px",
          }}
        >
          {[
            { id: "dashboard", icon: "🏠", label: "Home" },
            { id: "planner", icon: "✨", label: "Planner" },
            { id: "evaluator", icon: "✅", label: "Evaluator" },
            { id: "gaps", icon: "🔍", label: "Gap Analysis" },
            { id: "shopper", icon: "🛍️", label: "Shop" },
            { id: "designer", icon: "🎨", label: "Designer" },
            { id: "wardrobe", icon: "👗", label: "Wardrobe" },
            { id: "equity", icon: "◈", label: "Equity" },
            { id: "calendar", icon: "📅", label: "Calendar" },
            { id: "profile", icon: "👤", label: "Profile" },
          ].map((nav) => {
            const active = activeNav === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                title={nav.label}
                onClick={() => setActiveNav(nav.id)}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 0,
                  border: "none",
                  background: "transparent",
                  boxShadow: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "0 10px",
                  position: "relative",
                  transition: baseTransition,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: "50%",
                    background: active ? "#000000" : "transparent",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "1.12rem",
                    lineHeight: 1,
                    opacity: active ? 1 : 0.5,
                    filter: active ? "none" : "grayscale(1)",
                    color: active ? "#000000" : "#8A8A8A",
                  }}
                >
                  {nav.icon}
                </span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            marginBottom: 16,
            width: "100%",
          }}
        >
          <button
            type="button"
            className="app-layout-activity-btn"
            title={agentPanelOpen ? "Hide agent activity" : "Show agent activity"}
            aria-pressed={agentPanelOpen === true}
            onClick={() => onToggleAgentPanel?.()}
          >
            <span className="app-layout-activity-icon" aria-hidden>
              ◎
            </span>
            <span className="app-layout-activity-label">Activity</span>
            {agentActivity?.status === "running" ? (
              <span className="app-layout-activity-running-dot" title="Agent running" />
            ) : null}
          </button>
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

      <div style={{ marginLeft: 64, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}
