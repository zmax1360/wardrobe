import React, { createContext, useContext, useState } from "react";
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

  const navItems = [
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
  ];

  const mobileTabItems = [
    { id: "dashboard", icon: "🏠", label: "Home" },
    { id: "wardrobe", icon: "👗", label: "Wardrobe" },
    { id: "planner", icon: "✨", label: "Planner" },
    { id: "shopper", icon: "🛍️", label: "Shop" },
    { id: "__more", icon: "⋯", label: "More" },
  ];

  const [moreOpen, setMoreOpen] = useState(false);

  const moreItems = [
    { id: "gaps", icon: "🔍", label: "Gap Analysis" },
    { id: "designer", icon: "🎨", label: "Designer" },
    { id: "evaluator", icon: "✅", label: "Evaluator" },
    { id: "equity", icon: "◈", label: "Equity" },
    { id: "calendar", icon: "📅", label: "Calendar" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

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
          {navItems.map((nav) => {
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

      <div
        className="app-layout-content"
        style={{ marginLeft: 64, flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        {children}
      </div>

      <nav className="app-layout-bottom-tabs" aria-label="Primary">
        {mobileTabItems.map((nav) => {
          const active = activeNav === nav.id;
          return (
            <button
              key={nav.id}
              type="button"
              title={nav.label}
              aria-label={nav.label}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                if (nav.id === "__more") setMoreOpen(true);
                else setActiveNav(nav.id);
              }}
              className={`app-layout-bottom-tab ${active ? "app-layout-bottom-tab--active" : ""}`}
            >
              <span className="app-layout-bottom-tab-icon" aria-hidden>
                {nav.icon}
              </span>
              <span className="app-layout-bottom-tab-label">{nav.label}</span>
            </button>
          );
        })}
      </nav>

      {moreOpen ? (
        <div
          className="app-more-backdrop"
          role="presentation"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="app-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="app-more-grabber" aria-hidden />
            <div className="app-more-grid">
              {moreItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="app-more-item"
                  onClick={() => {
                    setActiveNav(it.id);
                    setMoreOpen(false);
                  }}
                >
                  <span className="app-more-item-icon" aria-hidden>
                    {it.icon}
                  </span>
                  <span className="app-more-item-label">{it.label}</span>
                </button>
              ))}
              <button
                type="button"
                className="app-more-item"
                onClick={() => {
                  onToggleAgentPanel?.();
                  setMoreOpen(false);
                }}
              >
                <span className="app-more-item-icon" aria-hidden>
                  ◎
                </span>
                <span className="app-more-item-label">Activity</span>
              </button>
              <button
                type="button"
                className="app-more-item app-more-item--danger"
                onClick={() => {
                  void signOut(auth).catch(() => {});
                  setMoreOpen(false);
                }}
              >
                <span className="app-more-item-icon" aria-hidden>
                  ⎋
                </span>
                <span className="app-more-item-label">Logout</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
