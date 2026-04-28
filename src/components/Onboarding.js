import { COLORS } from "../constants/colors";

export function Onboarding({
  onboardingStep,
  draft,
  setDraft,
  onboardingBodyTypes,
  onboardingTopSizes,
  onboardingBottomSizes,
  onboardingShoeSizes,
  goBackOnboarding,
  goNextOnboarding,
  canAdvance,
  baseTransition,
  GENDER_OPTIONS,
  BUDGET_OPTIONS,
  STYLE_PREFS,
  BRANDS,
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'DM Sans', sans-serif",
        padding: "48px 24px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "2.25rem",
            margin: "0 0 8px",
            letterSpacing: "0.02em",
          }}
        >
          Fashion OS
        </h1>
        <p style={{ color: COLORS.textMuted, margin: "0 0 32px", fontSize: "0.95rem" }}>
          Tailor your style profile in seven steps.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: n <= onboardingStep ? COLORS.primary : COLORS.surface2,
                transition: baseTransition,
              }}
            />
          ))}
        </div>

        <div
          style={{
            background: COLORS.surface,
            borderRadius: 12,
            padding: 28,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          {onboardingStep === 1 && (
            <>
              <label style={{ display: "block", color: COLORS.textMuted, fontSize: "0.8rem", marginBottom: 8 }}>
                Your name
              </label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Alex"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface2,
                  color: COLORS.text,
                  fontSize: "1rem",
                  outline: "none",
                  transition: baseTransition,
                }}
              />
            </>
          )}

          {onboardingStep === 2 && (
            <>
              <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Gender</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                }}
              >
                {GENDER_OPTIONS.map((opt) => {
                  const selected = draft.gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          gender: opt.value,
                          bodyType: d.gender !== opt.value ? [] : d.bodyType,
                        }))
                      }
                      style={{
                        minHeight: 88,
                        padding: "20px 16px",
                        borderRadius: 10,
                        border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "1rem",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        transition: baseTransition,
                      }}
                    >
                      <span style={{ fontSize: "1.75rem" }}>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {onboardingStep === 3 && (
            <>
              <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Body type</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 10,
                }}
              >
                {onboardingBodyTypes.map((bt) => {
                  const selected = Array.isArray(draft.bodyType)
                    ? draft.bodyType.includes(bt)
                    : draft.bodyType === bt;
                  return (
                    <button
                      key={bt}
                      type="button"
                      onClick={() =>
                        setDraft((d) => {
                          const current = Array.isArray(d.bodyType)
                            ? d.bodyType
                            : d.bodyType
                              ? [d.bodyType]
                              : [];
                          const on = current.includes(bt);
                          return {
                            ...d,
                            bodyType: on ? current.filter((x) => x !== bt) : [...current, bt],
                          };
                        })
                      }
                      style={{
                        padding: "14px 12px",
                        borderRadius: 10,
                        border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "0.88rem",
                        textAlign: "left",
                        transition: baseTransition,
                      }}
                    >
                      {bt}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: "0.78rem", color: COLORS.textMuted, marginTop: 4 }}>
                Select all that apply
              </p>
            </>
          )}

          {onboardingStep === 4 && (
            <>
              <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Shopping budget</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {BUDGET_OPTIONS.map((b) => {
                  const selected = draft.budget === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, budget: b.id }))}
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: 10,
                        border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        color: COLORS.text,
                        cursor: "pointer",
                        transition: baseTransition,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                      <div style={{ fontSize: "0.82rem", color: COLORS.textMuted }}>{b.sub}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {onboardingStep === 5 && (
            <>
              <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>
                Style preferences (choose any)
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {STYLE_PREFS.map((s) => {
                  const on = draft.styles.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          styles: on ? d.styles.filter((x) => x !== s) : [...d.styles, s],
                        }))
                      }
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                        background: on ? COLORS.primarySoft : COLORS.surface2,
                        color: on ? COLORS.text : COLORS.textMuted,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: baseTransition,
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {onboardingStep === 6 && (
            <>
              <p style={{ margin: "0 0 16px", color: COLORS.textMuted, fontSize: "0.9rem" }}>
                Preferred brands (optional)
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {BRANDS.map((b) => {
                  const on = draft.brands.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          brands: on ? d.brands.filter((x) => x !== b) : [...d.brands, b],
                        }))
                      }
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: `1px solid ${on ? COLORS.primary : COLORS.border}`,
                        background: on ? COLORS.primarySoft : COLORS.surface2,
                        color: on ? COLORS.text : COLORS.textMuted,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: baseTransition,
                      }}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {onboardingStep === 7 && (
            <>
              <p style={{ margin: "0 0 12px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Top size</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {onboardingTopSizes.map((sz) => {
                  const selected = draft.topSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, topSize: sz }))}
                      style={{
                        minWidth: 44,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: baseTransition,
                      }}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
              <p style={{ margin: "0 0 12px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Bottom size</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {onboardingBottomSizes.map((sz) => {
                  const selected = draft.bottomSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, bottomSize: sz }))}
                      style={{
                        minWidth: 44,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: baseTransition,
                      }}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
              <p style={{ margin: "0 0 12px", color: COLORS.textMuted, fontSize: "0.9rem" }}>Shoe size (US)</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {onboardingShoeSizes.map((sz) => {
                  const selected = draft.shoeSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, shoeSize: sz }))}
                      style={{
                        minWidth: 44,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
                        background: selected ? COLORS.primarySoft : COLORS.surface2,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: baseTransition,
                      }}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, gap: 12 }}>
            <button
              type="button"
              onClick={goBackOnboarding}
              disabled={onboardingStep === 1}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                background: "transparent",
                color: onboardingStep === 1 ? COLORS.textMuted : COLORS.text,
                cursor: onboardingStep === 1 ? "default" : "pointer",
                transition: baseTransition,
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={goNextOnboarding}
              disabled={!canAdvance}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                border: "none",
                background: canAdvance ? COLORS.primary : COLORS.surface2,
                color: canAdvance ? "#FFFFFF" : COLORS.textMuted,
                cursor: canAdvance ? "pointer" : "default",
                fontWeight: 600,
                transition: baseTransition,
              }}
            >
              {onboardingStep === 7 ? "Enter hub" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
