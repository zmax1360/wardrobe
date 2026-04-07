import React, { useState, useEffect } from "react";

import { COLORS } from "../styles/theme";
import { type } from "../styles/typography";
import { ui } from "../styles/ui";
import { mergeStyles } from "../utils/styleUtils";
import { AgentMap } from "./AgentMap";

export function AgentPanel({ agentActivity, formatDuration, getAgentStatusTone }) {
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const [agentPanelMinimized, setAgentPanelMinimized] = useState(false);
  const [agentPanelPosition, setAgentPanelPosition] = useState({ x: 24, y: 150 });
  const [isDraggingAgentPanel, setIsDraggingAgentPanel] = useState(false);
  const [agentDragOffset, setAgentDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const initial = {
      x: Math.max(window.innerWidth - 430, 24),
      y: 150,
    };
    setAgentPanelPosition(initial);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("agentPanelPosition");
    if (saved) {
      try {
        setAgentPanelPosition(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "agentPanelPosition",
      JSON.stringify(agentPanelPosition)
    );
  }, [agentPanelPosition]);

  function clampAgentPanelPosition(nextX, nextY) {
    const panelWidth = 390;
    const panelHeight = agentPanelMinimized ? 76 : 420;
    const padding = 16;

    const maxX = Math.max(window.innerWidth - panelWidth - padding, padding);
    const maxY = Math.max(window.innerHeight - panelHeight - padding, padding);

    return {
      x: Math.min(Math.max(nextX, padding), maxX),
      y: Math.min(Math.max(nextY, padding), maxY),
    };
  }

  function handleAgentPanelMouseDown(e) {
    if (e.button !== 0) return;

    const rect = e.currentTarget.parentElement.getBoundingClientRect();

    setIsDraggingAgentPanel(true);
    setAgentDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  useEffect(() => {
    if (!isDraggingAgentPanel) return;

    function handleMouseMove(e) {
      const next = clampAgentPanelPosition(
        e.clientX - agentDragOffset.x,
        e.clientY - agentDragOffset.y
      );
      setAgentPanelPosition(next);
    }

    function handleMouseUp() {
      setIsDraggingAgentPanel(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingAgentPanel, agentDragOffset.x, agentDragOffset.y, agentPanelMinimized]);

  useEffect(() => {
    function handleResize() {
      setAgentPanelPosition((prev) => clampAgentPanelPosition(prev.x, prev.y));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [agentPanelMinimized]);

  return (
    <>
      {!agentPanelOpen ? (
        <button
          type="button"
          onClick={() => {
            setAgentPanelOpen(true);
            setAgentPanelMinimized(false);
          }}
          style={mergeStyles(ui.primaryButton, {
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 1400,
            minHeight: 56,
            padding: "14px 18px",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 16px 40px rgba(32, 26, 23, 0.18)",
          })}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>◎</span>
          <span>Agent Activity</span>
          {agentActivity.status === "running" ? (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#FFFFFF",
                display: "inline-block",
              }}
            />
          ) : null}
        </button>
      ) : null}

      {agentPanelOpen ? (
        <div
          style={mergeStyles(ui.panel, ui.floatingPanel, {
            position: "fixed",
            left: agentPanelPosition.x,
            top: agentPanelPosition.y,
            width: 390,
            maxWidth: "calc(100vw - 32px)",
            zIndex: 1401,
            boxShadow: "0 24px 60px rgba(32, 26, 23, 0.20)",
            overflow: "hidden",
            userSelect: isDraggingAgentPanel ? "none" : "auto",
          })}
        >
          <div
            onMouseDown={handleAgentPanelMouseDown}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              cursor: isDraggingAgentPanel ? "grabbing" : "grab",
              background: "rgba(255,253,252,0.92)",
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <div style={type.eyebrow}>Agent Activity</div>
              <div style={{ ...type.cardTitle, fontSize: 20 }}>
                Live execution map
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={mergeStyles(ui.chip, getAgentStatusTone(agentActivity.status), {
                  padding: "8px 10px",
                  whiteSpace: "nowrap",
                })}
              >
                {agentActivity.status === "running" ? "Running" : "Idle"}
              </div>

              <button
                type="button"
                onClick={() => setAgentPanelMinimized((prev) => !prev)}
                style={mergeStyles(ui.ghostButton, {
                  padding: "8px 10px",
                  minWidth: 40,
                })}
              >
                {agentPanelMinimized ? "Open" : "Min"}
              </button>

              <button
                type="button"
                onClick={() => setAgentPanelOpen(false)}
                style={mergeStyles(ui.ghostButton, {
                  padding: "8px 10px",
                  minWidth: 40,
                })}
              >
                ×
              </button>
            </div>
          </div>

          {!agentPanelMinimized ? (
            <div
              style={{
                padding: "16px",
                display: "grid",
                gap: 14,
                maxHeight: "min(70vh, 560px)",
                overflowY: "auto",
              }}
            >
              <div style={type.body}>
                See which agent is running, what it is doing, and how long each AI call takes.
              </div>

              <AgentMap agentActivity={agentActivity} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={mergeStyles(ui.softPanel, { padding: "12px 14px" })}>
                  <div style={type.meta}>Current agent</div>
                  <div style={{ ...type.bodyStrong, marginTop: 6 }}>
                    {agentActivity.currentAgent || "None"}
                  </div>
                </div>

                <div style={mergeStyles(ui.softPanel, { padding: "12px 14px" })}>
                  <div style={type.meta}>Last duration</div>
                  <div style={{ ...type.bodyStrong, marginTop: 6 }}>
                    {formatDuration(agentActivity.durationMs)}
                  </div>
                </div>
              </div>

              <div style={mergeStyles(ui.softPanel, { padding: "12px 14px" })}>
                <div style={type.meta}>Current task</div>
                <div style={{ ...type.bodyStrong, marginTop: 6 }}>
                  {agentActivity.currentTask || "Waiting for next action"}
                </div>
              </div>

              <div style={mergeStyles(ui.softPanel, { padding: "12px 14px" })}>
                <div style={type.meta}>Last completed</div>
                <div style={{ ...type.bodyStrong, marginTop: 6 }}>
                  {agentActivity.lastCompletedAgent || "None yet"}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={type.meta}>Recent calls</div>

                {agentActivity.history && agentActivity.history.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {agentActivity.history.slice(0, 6).map((entry) => (
                      <div
                        key={entry.id}
                        style={mergeStyles(ui.softPanel, {
                          padding: "12px 14px",
                          display: "grid",
                          gap: 8,
                        })}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={type.bodyStrong}>{entry.agentName}</div>

                          <div
                            style={mergeStyles(ui.chip, getAgentStatusTone(entry.status), {
                              padding: "8px 10px",
                            })}
                          >
                            {entry.status === "error" ? "Error" : "Done"} · {formatDuration(entry.durationMs)}
                          </div>
                        </div>

                        <div style={type.body}>{entry.taskLabel}</div>

                        {entry.summary ? (
                          <div style={type.meta}>{entry.summary}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={mergeStyles(ui.softPanel, { padding: "12px 14px" })}>
                    <div style={type.body}>No agent calls yet.</div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
