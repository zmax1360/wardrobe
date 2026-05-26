import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const BRAND_BG = "#1a1208";
const BRAND_ACCENT = "#c4813a";
const BRAND_WARM = "#faf7f2";
const BODY_FONT = "'DM Sans', ui-sans-serif, system-ui, sans-serif";

const META_DESC =
  "Fashion OS turns your wardrobe into a smart system. Know what you own. Wear more of it. Shop only what you actually need.";

function useReveal(enabled = true) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return [ref, visible];
}

function RevealWrap({ as: Comp = "div", children, className, style, id }) {
  const [ref, vis] = useReveal();
  return (
    <Comp
      ref={ref}
      id={id}
      className={className}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? "translateY(0)" : "translateY(28px)",
        transition:
          "opacity 0.75s cubic-bezier(0.22, 1, 0.36, 1), transform 0.75s cubic-bezier(0.22, 1, 0.36, 1)",
        ...style,
      }}
    >
      {children}
    </Comp>
  );
}

const FRUSTRATION_OPTIONS = [
  "I wear the same things and forget what I own",
  "I keep buying stuff I already have",
  "I spend too long deciding what to wear",
  "My closet is chaos and I can't find anything",
];

const CURRENT_SYSTEM_OPTIONS = [
  "I don't, it's a mess",
  "Mental memory",
  "Photos or screenshots",
  "Spreadsheet or app",
];

const PAY_OPTIONS = ["Yes, absolutely", "Maybe, depends on the features", "No, only if it's free"];

/** TODO: replace with real testimonials */
const PLACEHOLDER_QUOTES = [
  { body: "Finally I wear things I forgot I owned. Mornings aren't a panic anymore.", author: "Maya R.", initials: "MR" },
  { body: "The gap lens stopped me doubling up on navy basics.", author: "James T.", initials: "JT" },
  { body: "Weather-aware suggestions actually match my commute.", author: "Priya S.", initials: "PS" },
];

function LandingNavLogo() {
  return (
    <Link
      to="/"
      className="fos-lp-logo"
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "1.15rem",
        fontWeight: 500,
        color: BRAND_WARM,
        letterSpacing: "0.04em",
        textDecoration: "none",
      }}
      aria-label="Fashion OS Home"
    >
      Fashion<span style={{ opacity: 0.45 }}> </span>
      <span style={{ margin: "0 0.4rem", fontWeight: 300, color: BRAND_ACCENT }}>|</span>
      <span style={{ color: BRAND_ACCENT }}> OS</span>
    </Link>
  );
}

const SHOTS = `${process.env.PUBLIC_URL || ""}/screenshots`;

const HOW_IT_WORKS_STEPS = [
  {
    num: "01",
    textFirst: true,
    headline: "Photo dump your closet",
    body:
      "Upload any photo. Fashion OS instantly identifies the item — category, color, style, brand. Your entire wardrobe cataloged automatically.",
    img: `${SHOTS}/screenshot-catalog.png`,
    alt:
      "Fashion OS AI wardrobe cataloging — upload a photo and AI instantly identifies category, color and style",
    imgW: 900,
    imgH: 616,
  },
  {
    num: "02",
    textFirst: false,
    headline: "Get dressed in seconds",
    body:
      "Tell it your occasion. Fashion OS checks the weather, reads your wardrobe, and suggests a complete look. No more standing in front of your closet at 7am.",
    img: `${SHOTS}/screenshot-planner.png`,
    alt:
      "Fashion OS outfit planner — weather-aware daily outfit suggestions based on your wardrobe",
    imgW: 520,
    imgH: 511,
  },
  {
    num: "03",
    textFirst: true,
    headline: "Know exactly what's missing",
    body:
      "Gap Analysis scans your wardrobe and tells you what to buy next — and why. No more duplicate purchases. No more impulse buys.",
    img: `${SHOTS}/screenshot-gap.png`,
    alt:
      "Fashion OS gap analysis — discover what clothing items are missing from your wardrobe",
    imgW: 600,
    imgH: 590,
  },
  {
    num: "04",
    textFirst: false,
    headline: "Your wardrobe, by the numbers",
    body:
      "The Daily Briefing shows your total wardrobe value, cost-per-wear, and utility score. Finally know which pieces earn their place.",
    img: `${SHOTS}/screenshot-briefing.png`,
    alt:
      "Fashion OS daily briefing — wardrobe value, cost-per-wear and utility score dashboard",
    imgW: 466,
    imgH: 600,
  },
];

function HiWPhoneScreenshot({ src, alt, width, height }) {
  return (
    <div className="phone-frame fos-lp-hiw-shrink" role="presentation">
      <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
    </div>
  );
}

function WaitlistFlow() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [frustration, setFrustration] = useState([]);
  const [currentSystem, setCurrentSystem] = useState([]);
  const [willingToPay, setWillingToPay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const prev = () => {
    setSubmitError("");
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = useCallback(async () => {
    if (!emailOk || !frustration.length || !currentSystem.length || !willingToPay) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        email: email.trim(),
        frustration,
        currentSystem,
        willingToPay,
        timestamp: serverTimestamp(),
        source: "landing_page",
      };
      if (willingToPay === "Yes, absolutely") {
        payload.hotLead = true;
      }
      await addDoc(collection(db, "waitlist"), payload);
      setSuccess(true);
    } catch (e) {
      setSubmitError(
        `Something went wrong saving your signup. Please try again. ${e.message ? `(${e.code || "error"})` : ""}`
      );
    } finally {
      setSubmitting(false);
    }
  }, [emailOk, email, frustration, currentSystem, willingToPay]);

  if (success) {
    return (
      <div className="fos-lp-success" style={{ textAlign: "center", padding: "32px 0 12px" }}>
        <style>{`
          @keyframes fosLpCheck {
            from { opacity: 0; transform: scale(0.6);}
            to { opacity: 1; transform: scale(1);}
          }
          .fos-lp-check-ring {
            width: 72px;
            height: 72px;
            margin: 0 auto 20px;
            border-radius: 50%;
            border: 3px solid ${BRAND_ACCENT};
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fosLpCheck 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            background: rgba(196, 129, 58, 0.12);
          }
        `}</style>
        <div className="fos-lp-check-ring" aria-hidden>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l6 6L22 8" stroke={BRAND_ACCENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "1.85rem",
            color: BRAND_WARM,
            margin: "0 0 12px",
            fontWeight: 500,
          }}
        >
          You&apos;re on the list! 🎉
        </h3>
        <p style={{ margin: 0, color: "rgba(250,247,242,0.78)", fontSize: "1.05rem", lineHeight: 1.55 }}>
          We&apos;ll be in touch when Fashion OS is ready for you.
        </p>
      </div>
    );
  }

  return (
    <section className="fos-lp-form-wrap" aria-labelledby="fos-waitlist-heading">
      <div style={{ marginBottom: 18 }}>
        <p style={{ margin: "0 0 8px", color: BRAND_ACCENT, fontWeight: 600, fontSize: "0.85rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Step {step} of 4
        </p>
        <div
          style={{
            height: 4,
            borderRadius: 4,
            background: "rgba(250,247,242,0.12)",
            overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={4}
          aria-label="Questionnaire progress"
        >
          <div
            style={{
              height: "100%",
              width: `${(step / 4) * 100}%`,
              background: `linear-gradient(90deg, ${BRAND_ACCENT}, #e0a068)`,
              transition: "width 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
              borderRadius: 4,
            }}
          />
        </div>
      </div>

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label htmlFor="fos-waitlist-email" style={{ color: BRAND_WARM, fontWeight: 600 }}>
            Email
          </label>
          <input
            id="fos-waitlist-email"
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="fos-lp-waitlist-input"
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
            <button
              type="button"
              className="fos-lp-btn-primary fos-lp-waitlist-cta"
              disabled={!emailOk}
              onClick={() => emailOk && setStep(2)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={{ color: BRAND_WARM, fontSize: "1.1rem", margin: "0 0 18px", lineHeight: 1.45, fontFamily: "Georgia, serif" }}>
            What&apos;s your biggest wardrobe frustration?
          </p>
          <p
            style={{
              fontSize: "0.8rem",
              color: "rgba(250,247,242,0.5)",
              margin: "-8px 0 12px",
              fontStyle: "italic",
            }}
          >
            Select all that apply
          </p>
          <div className="fos-lp-cards">
            {FRUSTRATION_OPTIONS.map((label) => (
              <button
                key={label}
                type="button"
                className={`fos-lp-choice${frustration.includes(label) ? " fos-lp-choice--on" : ""}`}
                onClick={() =>
                  setFrustration((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]))
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="fos-lp-btn-secondary" onClick={prev}>
              Back
            </button>
            <button
              type="button"
              className="fos-lp-btn-primary fos-lp-waitlist-cta"
              disabled={!frustration.length}
              onClick={() => frustration.length && setStep(3)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p style={{ color: BRAND_WARM, fontSize: "1.1rem", margin: "0 0 18px", lineHeight: 1.45, fontFamily: "Georgia, serif" }}>
            How do you currently keep track of your clothes?
          </p>
          <p
            style={{
              fontSize: "0.8rem",
              color: "rgba(250,247,242,0.5)",
              margin: "-8px 0 12px",
              fontStyle: "italic",
            }}
          >
            Select all that apply
          </p>
          <div className="fos-lp-cards">
            {CURRENT_SYSTEM_OPTIONS.map((label) => (
              <button
                key={label}
                type="button"
                className={`fos-lp-choice${currentSystem.includes(label) ? " fos-lp-choice--on" : ""}`}
                onClick={() =>
                  setCurrentSystem((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]))
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="fos-lp-btn-secondary" onClick={prev}>
              Back
            </button>
            <button
              type="button"
              className="fos-lp-btn-primary fos-lp-waitlist-cta"
              disabled={!currentSystem.length}
              onClick={() => currentSystem.length && setStep(4)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p style={{ color: BRAND_WARM, fontSize: "1.1rem", margin: "0 0 18px", lineHeight: 1.45, fontFamily: "Georgia, serif" }}>
            Fashion OS is launching at $9.99/month. Would you pay that?
          </p>
          <div className="fos-lp-cards">
            {PAY_OPTIONS.map((label) => (
              <button
                key={label}
                type="button"
                className={`fos-lp-choice${willingToPay === label ? " fos-lp-choice--on" : ""}`}
                onClick={() => setWillingToPay(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="fos-lp-btn-secondary" onClick={prev}>
              Back
            </button>
            <button
              type="button"
              className="fos-lp-btn-primary fos-lp-waitlist-cta"
              disabled={!willingToPay || submitting}
              onClick={() => willingToPay && handleSubmit()}
            >
              {submitting ? "Joining…" : "Join Waitlist"}
            </button>
          </div>
          {submitError ? (
            <p style={{ margin: "14px 0 0", color: "#ffb3a8", fontSize: "0.92rem", lineHeight: 1.45 }} role="alert">
              {submitError}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default function LandingPage() {
  const scrollToWait = () => {
    const el = document.getElementById("waitlist");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="fos-lp">
      <Helmet>
        <title>Fashion OS — Dress smarter. Shop less.</title>
        <meta name="description" content={META_DESC} />
        <meta property="og:title" content="Fashion OS — Dress smarter. Shop less." />
        <meta property="og:description" content={META_DESC} />
      </Helmet>

      <style>{`
        .fos-lp {
          box-sizing: border-box;
          min-height: 100vh;
          background: ${BRAND_BG};
          color: ${BRAND_WARM};
          font-family: ${BODY_FONT};
          -webkit-font-smoothing: antialiased;
        }
        .fos-lp *,
        .fos-lp *::before,
        .fos-lp *::after { box-sizing: border-box; }
        .fos-lp-inner {
          width: min(1120px, 100%);
          margin: 0 auto;
          padding: 0 clamp(18px, 4vw, 40px);
        }
        .fos-lp-nav {
          position: sticky;
          top: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: clamp(14px, 3vw, 18px) clamp(18px, 4vw, 40px);
          border-bottom: 1px solid rgba(196, 129, 58, 0.15);
          background: rgba(26, 18, 8, 0.94);
          backdrop-filter: blur(10px);
        }
        .fos-lp-logo .fos-lp-pipe {
          margin: 0 0.4rem;
          font-weight: 300;
          color: ${BRAND_ACCENT};
        }
        .fos-lp-nav-signin {
          font-size: 0.93rem;
          font-weight: 600;
          color: rgba(250,247,242,0.88);
          text-decoration: none;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: color 0.2s ease;
        }
        .fos-lp-nav-signin:hover { color: ${BRAND_ACCENT}; }

        .fos-lp-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding-top: clamp(72px, 12vh, 120px);
          padding-bottom: 80px;
          overflow: clip;
        }
        .fos-lp-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 65% at 70% -10%, rgba(196,129,58,0.22), transparent 55%),
            radial-gradient(circle at 18% 40%, rgba(196,129,58,0.08), transparent 38%),
            linear-gradient(180deg, rgba(26,18,8,1) 0%, ${BRAND_BG} 100%);
          pointer-events: none;
        }
        .fos-lp-hero-geos {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.85;
          overflow: hidden;
        }
        .fos-lp-geo {
          position: absolute;
          border: 1px solid rgba(196,129,58,0.18);
          border-radius: 2px;
        }
        @keyframes fosLpHeroIn {
          from { opacity: 0; transform: translateY(22px);}
          to { opacity: 1; transform: translateY(0);}
        }
        .fos-lp-hero-content {
          position: relative;
          z-index: 2;
          animation: fosLpHeroIn 0.95s cubic-bezier(0.22, 1, 0.36, 1) both;
          max-width: 720px;
        }
        .fos-lp-headline {
          font-family: Georgia, 'Times New Roman', serif;
          font-weight: 600;
          font-size: clamp(2.3rem, 6vw, 3.85rem);
          line-height: 1.06;
          margin: 0 0 12px;
          letter-spacing: -0.035em;
        }
        .fos-lp-subheadline {
          font-family: Georgia, 'Times New Roman', serif;
          font-weight: 400;
          font-size: clamp(1.68rem, 4.8vw, 2.85rem);
          line-height: 1.08;
          margin: 0 0 20px;
          letter-spacing: -0.032em;
          color: rgba(250,247,242,0.92);
        }
        .fos-lp-lead {
          font-family: Georgia, serif;
          font-size: clamp(1.08rem, 2.8vw, 1.42rem);
          line-height: 1.42;
          color: rgba(250,247,242,0.72);
          margin: 22px 0 22px;
        }
        .fos-lp-lead-strong { color: rgba(250,247,242,0.92); font-weight: 500; }
        .fos-lp-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 15px 32px;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, ${BRAND_ACCENT}, #a86a2f);
          color: ${BRAND_BG};
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.22s ease, box-shadow 0.22s ease, opacity 0.2s;
          box-shadow: 0 8px 32px rgba(196,129,58,0.28);
        }
        .fos-lp-btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 14px 40px rgba(196,129,58,0.35);
        }
        .fos-lp-btn-primary:disabled { opacity: 0.42; cursor: not-allowed; box-shadow: none;}
        .fos-lp-btn-secondary {
          padding: 12px 20px;
          border-radius: 999px;
          border: 1px solid rgba(196,129,58,0.45);
          background: transparent;
          color: rgba(250,247,242,0.88);
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.92rem;
          transition: border-color 0.2s, color 0.2s;
        }
        .fos-lp-btn-secondary:hover { border-color: ${BRAND_ACCENT}; color: ${BRAND_ACCENT};}

        .fos-lp-section-title {
          font-family: Georgia, serif;
          font-weight: 500;
          font-size: clamp(1.85rem, 4.2vw, 2.5rem);
          margin: 0 0 clamp(36px, 6vw, 52px);
          letter-spacing: -0.02em;
          text-align: center;
        }

        .fos-lp-cards-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
          gap: clamp(16px, 3vw, 24px);
        }
        ul.fos-lp-cards-row {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        ul.fos-lp-cards-row > li {
          margin: 0;
        }
        .fos-lp-dark-card {
          background: rgba(12, 8, 4, 0.65);
          border: 1px solid rgba(196,129,58,0.16);
          border-radius: 16px;
          padding: clamp(22px, 4vw, 30px);
          position: relative;
          overflow: hidden;
        }
        .fos-lp-dark-card::before {
          content:'';
          position: absolute;
          top: -50%;
          left: -20%;
          width: 140%;
          height: 70%;
          background: radial-gradient(circle at 60% 0%, rgba(196,129,58,0.09), transparent 70%);
          pointer-events: none;
        }
        .fos-lp-card-num {
          font-family: Georgia, serif;
          font-size: 1.85rem;
          color: ${BRAND_ACCENT};
          font-weight: 600;
          margin-bottom: 10px;
        }
        .fos-lp-card-text { margin: 0; line-height: 1.52; color: rgba(250,247,242,0.83); font-size: 1.02rem; }
        .fos-lp-card-heading {
          margin: 0;
          line-height: 1.45;
          color: rgba(250,247,242,0.83);
          font-size: 1.02rem;
          font-family: inherit;
          font-weight: 600;
        }

        /* ── How it works: phone screenshots (scoped) ── */
        .fos-lp-hiw-step-wrap {
          border-bottom: 1px solid rgba(196, 129, 58, 0.2);
        }
        .fos-lp-hiw-step-wrap:last-of-type {
          border-bottom: none;
        }
        .fos-lp-hiw-inner {
          display: flex;
          align-items: center;
          gap: clamp(36px, 6vw, 60px);
          padding: 80px 0;
          flex-wrap: wrap;
          justify-content: center;
        }
        @media (min-width: 900px) {
          .fos-lp-hiw-inner { flex-wrap: nowrap; justify-content: center;}
        }
        @media (max-width: 899px) {
          .fos-lp-hiw-inner {
            flex-direction: column;
            gap: 40px;
            padding: clamp(56px, 10vw, 80px) 0;
            align-items: center;
          }
          .fos-lp-hiw-visual { order: -1; width: 100%; display: flex; justify-content: center;}
          .fos-lp-hiw-text { order: 1; width: 100%; max-width: 520px;}
        }
        .fos-lp-hiw-text {
          flex: 1 1 260px;
          min-width: 0;
          max-width: 480px;
          margin: 0;
        }
        .fos-lp-hiw-visual {
          flex: 0 0 auto;
          display: flex;
          justify-content: center;
          margin: 0;
        }
        .fos-lp-hiw-num {
          font-family: Georgia, serif;
          font-size: clamp(0.92rem, 2vw, 1rem);
          font-weight: 600;
          letter-spacing: 0.38em;
          color: rgba(196, 129, 58, 0.85);
          margin: 0 0 10px;
        }
        .fos-lp-hiw-headline {
          font-family: Georgia, serif;
          font-weight: 500;
          font-size: clamp(1.52rem, 3.8vw, 2rem);
          line-height: 1.14;
          margin: 0 0 14px;
          letter-spacing: -0.024em;
        }
        .fos-lp-hiw-body {
          margin: 0;
          line-height: 1.6;
          color: rgba(250,247,242,0.74);
          font-size: clamp(1rem, 2.5vw, 1.085rem);
        }
        .fos-lp-hiw-shrink { flex-shrink: 0;}
        .fos-lp .phone-frame {
          position: relative;
          width: 280px;
          border-radius: 40px;
          border: 8px solid #2a1f0e;
          box-shadow:
            0 0 0 2px #c4813a,
            0 30px 80px rgba(0,0,0,0.5);
          overflow: hidden;
          background: #1a1208;
        }
        .fos-lp .phone-frame::before {
          content: '';
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          width: 80px;
          height: 6px;
          background: #2a1f0e;
          border-radius: 3px;
          z-index: 10;
        }
        .fos-lp .phone-frame img {
          width: 100%;
          display: block;
          border-radius: 32px;
          vertical-align: bottom;
        }

        ul.fos-lp-feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(288px, 100%), 1fr));
          gap: 18px;
          list-style: none;
          padding: 0;
          margin: 0;
        }
        ul.fos-lp-feature-grid > li {
          margin: 0;
        }
        .fos-lp-feat {
          background: rgba(10, 7, 4, 0.7);
          border: 1px solid rgba(196,129,58,0.14);
          border-radius: 14px;
          padding: 22px;
          transition: border-color 0.25s ease, transform 0.28s cubic-bezier(0.22,1,0.36,1);
        }
        .fos-lp-feat:hover {
          border-color: ${BRAND_ACCENT};
          transform: translateY(-4px);
        }
        .fos-lp-feat h3 {
          margin: 0 0 8px;
          font-family: Georgia, serif;
          font-weight: 500;
          font-size: 1.12rem;
        }
        .fos-lp-feat p {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.5;
          color: rgba(250,247,242,0.68);
        }
        .fos-lp-feat-line {
          height: 2px;
          width: 36px;
          background: rgba(196,129,58,0.45);
          border-radius: 2px;
          margin-bottom: 12px;
          display: block;
          transition: width 0.3s ease, background 0.3s ease;
        }
        .fos-lp-feat:hover .fos-lp-feat-line {
          width: 56px;
          background: ${BRAND_ACCENT};
        }

        ul.fos-lp-quote-grid {
          display: grid;
          gap: clamp(16px, 3vw, 22px);
          list-style: none;
          padding: 0;
          margin: 0;
        }
        ul.fos-lp-quote-grid > li {
          margin: 0;
        }
        ul.fos-lp-quote-grid .fos-lp-quote {
          margin: 0;
        }
        .fos-lp-quote {
          background: rgba(8, 6, 4, 0.55);
          border: 1px solid rgba(196,129,58,0.12);
          border-radius: 16px;
          padding: clamp(22px, 4vw, 28px);
        }
        .fos-lp-stars {
          letter-spacing: 2px;
          color: ${BRAND_ACCENT};
          font-size: 0.9rem;
          margin-bottom: 12px;
        }
        .fos-lp-quote-text { margin: 0 0 16px; line-height: 1.52; font-size: 1rem; color: rgba(250,247,242,0.82); }
        .fos-lp-quote-foot { font-size: 0.92rem; color: rgba(250,247,242,0.55); font-weight: 600; }

        .fos-lp-cards { display: flex; flex-direction: column; gap: 12px; }
        .fos-lp-choice {
          padding: 16px 18px;
          text-align: left;
          border-radius: 12px;
          border: 1px solid rgba(196,129,58,0.22);
          background: rgba(10, 7, 4, 0.75);
          color: rgba(250,247,242,0.9);
          font-family: inherit;
          font-size: 0.95rem;
          line-height: 1.4;
          cursor: pointer;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s;
        }
        .fos-lp-choice:hover { border-color: rgba(196,129,58,0.45); background: rgba(18,13,9,0.85); }
        .fos-lp-choice.fos-lp-choice--on {
          border-color: ${BRAND_ACCENT};
          box-shadow: 0 0 0 1px ${BRAND_ACCENT}, 0 8px 24px rgba(196,129,58,0.12);
          background: rgba(196,129,58,0.1);
          color: ${BRAND_WARM};
          font-weight: 600;
        }

        section#waitlist.fos-lp-section.fos-lp-inner.fos-lp-waitlist-section {
          min-height: 600px;
          padding-top: 120px;
          padding-bottom: 120px;
          scroll-margin-top: 80px;
        }
        section#waitlist.fos-lp-waitlist-section .fos-lp-waitlist-card {
          max-width: 560px;
          width: 100%;
          margin-left: auto;
          margin-right: auto;
        }
        section#waitlist .fos-lp-waitlist-title {
          font-family: Georgia, serif;
          font-weight: 500;
          font-size: 32px;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
          text-align: center;
          line-height: 1.12;
        }
        @media (min-width: 760px) {
          section#waitlist .fos-lp-waitlist-title {
            font-size: 48px;
          }
        }
        section#waitlist .fos-lp-waitlist-sub {
          text-align: center;
          margin: 0 0 32px;
          color: rgba(250,247,242,0.68);
          font-size: 18px;
          line-height: 1.5;
        }
        section#waitlist .fos-lp-waitlist-input {
          width: 100%;
          height: 56px;
          padding: 0 18px;
          border-radius: 10px;
          border: 1px solid rgba(196,129,58,0.35);
          background: rgba(26,18,8,0.92);
          color: ${BRAND_WARM};
          font-size: 16px;
          outline: none;
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2);
          font-family: ${BODY_FONT};
        }
        section#waitlist .fos-lp-btn-primary.fos-lp-waitlist-cta {
          min-height: 56px;
          font-size: 16px;
          padding-left: 28px;
          padding-right: 28px;
        }
        section#waitlist.fos-lp-waitlist-section .fos-lp-choice {
          min-height: 64px;
          font-size: 15px;
          display: flex;
          align-items: center;
        }

        .fos-lp-footer {
          border-top: 1px solid rgba(196,129,58,0.15);
          padding: clamp(40px, 8vw, 64px) 0 clamp(28px, 5vw, 40px);
          background: #120c07;
          margin-top: clamp(72px, 12vw, 120px);
        }
        .fos-lp-footer-grid {
          display: grid;
          gap: clamp(28px, 5vw, 40px);
          grid-template-columns: 1fr;
        }
        @media (min-width: 760px) {
          .fos-lp-footer-grid { grid-template-columns: 1fr 1fr; align-items: start; }
        }
        .fos-lp-footer-nav { display: flex; flex-wrap: wrap; gap: 18px; }
        .fos-lp-footer-nav a { color: rgba(250,247,242,0.65); font-size: 0.92rem; font-weight: 600; text-decoration: none;}
        .fos-lp-footer-nav a:hover { color: ${BRAND_ACCENT}; }
        #privacy-policy { scroll-margin-top: 80px;}

        .fos-lp-section {
          padding: clamp(72px, 13vw, 118px) 0;
          position: relative;
        }
        section#problem.fos-lp-section {
          padding-top: 0;
          padding-bottom: clamp(72px, 13vw, 118px);
        }
        .fos-lp-muted-bg {
          border-top: 1px solid rgba(196,129,58,0.08);
          border-bottom: 1px solid rgba(196,129,58,0.08);
          background:
            radial-gradient(circle at 12% 20%, rgba(196,129,58,0.06), transparent 46%),
            radial-gradient(circle at 92% 60%, rgba(196,129,58,0.05), transparent 48%),
            #140e09;
        }

        /* Mobile / small tablet: fluid layout (targets ~320px–430px phones) — desktop unchanged at 769px+ */
        @media (max-width: 768px) {
          .fos-lp img {
            max-width: 100%;
            height: auto;
            display: block;
          }

          .fos-lp .phone-frame {
            border: none !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25) !important;
            width: min(85vw, 360px) !important;
          }

          .fos-lp .phone-frame::before {
            display: none !important;
          }

          main .fos-lp-inner {
            padding-left: 0;
            padding-right: 0;
          }
          .fos-lp-hero .fos-lp-inner {
            padding-left: clamp(16px, 5vw, 24px);
            padding-right: clamp(16px, 5vw, 24px);
          }

          .fos-lp-section {
            padding: clamp(40px, 10vw, 80px) clamp(16px, 5vw, 24px);
          }
          section#problem.fos-lp-section {
            padding-top: 0;
            padding-right: clamp(16px, 5vw, 24px);
            padding-bottom: clamp(40px, 10vw, 80px);
            padding-left: clamp(16px, 5vw, 24px);
          }

          .fos-lp-section-title {
            font-size: clamp(1.4rem, 6vw, 2.2rem);
          }
          .fos-lp-card-heading {
            font-size: clamp(1.1rem, 4.5vw, 1.5rem);
          }
          .fos-lp-lead {
            font-size: clamp(0.875rem, 3.5vw, 1rem);
          }

          .fos-lp-hero {
            min-height: auto;
            justify-content: flex-start;
            padding-top: clamp(4rem, 20.5vw, 5.5rem);
            padding-bottom: clamp(2.75rem, 15.5vw, 3.75rem);
          }
          .fos-lp-headline {
            font-size: clamp(2rem, 8vw, 3.5rem);
          }
          .fos-lp-subheadline {
            font-size: clamp(1.1rem, 5.2vw, 2rem);
          }
          .fos-lp-hero .fos-lp-btn-primary {
            width: 100%;
            min-height: 52px;
            font-size: clamp(0.9rem, 3.8vw, 1rem);
          }

          .fos-lp-hiw-inner {
            flex-direction: column;
            gap: clamp(28px, 7vw, 40px);
            padding: clamp(32px, 8vw, 56px) 5vw;
            align-items: center;
          }
          .fos-lp-hiw-visual {
            order: -1;
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .fos-lp-hiw-text {
            order: 1;
            width: 100%;
            max-width: 100%;
            text-align: center;
          }
          .fos-lp-hiw-num {
            font-size: clamp(1.5rem, 6vw, 2rem);
          }
          .fos-lp-hiw-headline {
            font-size: clamp(1.1rem, 4.5vw, 1.4rem);
          }
          .fos-lp-hiw-body {
            font-size: clamp(0.875rem, 3.5vw, 1rem);
          }

          ul.fos-lp-feature-grid {
            grid-template-columns: 1fr;
          }
          .fos-lp-feat {
            padding: clamp(16px, 4vw, 24px);
            min-height: auto;
          }
          .fos-lp-feat h3 {
            font-size: clamp(0.9rem, 3.8vw, 1rem);
          }
          .fos-lp-feat p {
            font-size: clamp(0.8rem, 3.2vw, 0.875rem);
          }

          ul.fos-lp-quote-grid {
            grid-template-columns: 1fr;
          }
          .fos-lp-quote {
            padding: clamp(16px, 4vw, 24px);
          }
          .fos-lp-quote-text {
            font-size: clamp(0.85rem, 3.5vw, 0.95rem);
            line-height: 1.6;
          }

          section#waitlist.fos-lp-section.fos-lp-inner.fos-lp-waitlist-section {
            min-height: auto;
            padding-top: clamp(40px, 10vw, 80px);
            padding-bottom: clamp(40px, 10vw, 80px);
            padding-left: clamp(16px, 5vw, 24px);
            padding-right: clamp(16px, 5vw, 24px);
          }
          section#waitlist .fos-lp-dark-card.fos-lp-waitlist-card {
            padding: 5vw;
            width: 100%;
            max-width: 100%;
          }
          section#waitlist .fos-lp-waitlist-title {
            font-size: clamp(1.4rem, 6vw, 2rem);
          }
          section#waitlist .fos-lp-waitlist-sub {
            font-size: clamp(0.9rem, 3.5vw, 1rem);
          }
          section#waitlist.fos-lp-waitlist-section .fos-lp-choice {
            padding: clamp(10px, 3vw, 14px) clamp(12px, 4vw, 16px);
            font-size: clamp(0.85rem, 3.5vw, 0.95rem);
            width: 100%;
            min-height: 44px;
          }
          section#waitlist .fos-lp-form-wrap .fos-lp-btn-primary,
          section#waitlist .fos-lp-form-wrap .fos-lp-btn-secondary {
            width: 100%;
            min-height: 52px;
            font-size: clamp(0.9rem, 3.8vw, 1rem);
          }
          section#waitlist .fos-lp-form-wrap .fos-lp-btn-primary.fos-lp-waitlist-cta {
            min-height: 52px;
            font-size: clamp(0.9rem, 3.8vw, 1rem);
          }
          section#waitlist .fos-lp-form-wrap div:has(> button.fos-lp-btn-secondary) {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: clamp(12px, 3vw, 16px);
          }
        }
      `}</style>

      {/* decorative hero geometry */}
      <header>
        <nav className="fos-lp-nav" aria-label="Primary marketing nav">
          <LandingNavLogo />
          <Link to="/app" className="fos-lp-nav-signin">
            Sign In
          </Link>
        </nav>
      </header>

      <main>
        <section id="hero" className="fos-lp-hero" aria-labelledby="fos-hero-heading">
          <div className="fos-lp-hero-geos" aria-hidden>
            {[12, 22, 8, 42, 76, 91].map((left, i) => (
              <span
                key={i}
                className="fos-lp-geo"
                style={{
                  width: `${40 + ((i * 17) % 90)}px`,
                  height: `${40 + ((i * 31) % 70)}px`,
                  left: `${12 + left + i * 5}%`,
                  top: `${(i * 19) % 55}%`,
                  transform: `rotate(${i * 23}deg)`,
                  opacity: 0.12 + ((i % 4) / 36),
                }}
              />
            ))}
          </div>
          <div className="fos-lp-inner">
            <RevealWrap className="fos-lp-hero-content">
              <h1 id="fos-hero-heading" className="fos-lp-headline">
                Your closet is full.
              </h1>
              <p className="fos-lp-subheadline">You still have nothing to wear.</p>
              <p className="fos-lp-lead">
                <span className="fos-lp-lead-strong">{META_DESC}</span>
              </p>
              <button type="button" className="fos-lp-btn-primary" onClick={scrollToWait}>
                Join the Waitlist
              </button>
            </RevealWrap>
          </div>
        </section>

        <section id="problem" className="fos-lp-section fos-lp-inner">
          <RevealWrap style={{ width: "100%" }}>
            <h2 className="fos-lp-section-title">Sound familiar?</h2>
            <ul className="fos-lp-cards-row">
              {[
                "You own 100 items and wear the same 5",
                "You keep buying things you already have",
                "Every morning is a 10-minute decision spiral",
              ].map((t, idx) => (
                <li key={t}>
                  <article className="fos-lp-dark-card">
                    <p className="fos-lp-card-num" aria-hidden="true">{idx + 1}</p>
                    <h3 className="fos-lp-card-heading">{t}</h3>
                  </article>
                </li>
              ))}
            </ul>
          </RevealWrap>
        </section>

        <section
          id="how-it-works"
          className="fos-lp-section fos-lp-muted-bg fos-lp-hiw-root"
          aria-labelledby="fos-hiw-heading"
        >
          <div className="fos-lp-inner">
            <h2 id="fos-hiw-heading" className="fos-lp-section-title">
              How Fashion OS works
            </h2>
            {HOW_IT_WORKS_STEPS.map((row) => (
              <section
                key={row.num}
                className="fos-lp-hiw-step-wrap"
                aria-labelledby={`fos-hiw-step-${row.num}`}
              >
                <RevealWrap className="fos-lp-hiw-reveal" style={{ width: "100%" }}>
                  <div className="fos-lp-hiw-inner">
                    {row.textFirst ? (
                      <>
                        <article className="fos-lp-hiw-text">
                          <p className="fos-lp-hiw-num" aria-hidden="true">{row.num}</p>
                          <h3 id={`fos-hiw-step-${row.num}`} className="fos-lp-hiw-headline">
                            {row.headline}
                          </h3>
                          <p className="fos-lp-hiw-body">{row.body}</p>
                        </article>
                        <figure className="fos-lp-hiw-visual">
                          <HiWPhoneScreenshot
                            src={row.img}
                            alt={row.alt}
                            width={row.imgW}
                            height={row.imgH}
                          />
                        </figure>
                      </>
                    ) : (
                      <>
                        <figure className="fos-lp-hiw-visual">
                          <HiWPhoneScreenshot
                            src={row.img}
                            alt={row.alt}
                            width={row.imgW}
                            height={row.imgH}
                          />
                        </figure>
                        <article className="fos-lp-hiw-text">
                          <p className="fos-lp-hiw-num" aria-hidden="true">{row.num}</p>
                          <h3 id={`fos-hiw-step-${row.num}`} className="fos-lp-hiw-headline">
                            {row.headline}
                          </h3>
                          <p className="fos-lp-hiw-body">{row.body}</p>
                        </article>
                      </>
                    )}
                  </div>
                </RevealWrap>
              </section>
            ))}
          </div>
        </section>

        <section id="features" className="fos-lp-section fos-lp-inner">
          <RevealWrap style={{ width: "100%" }}>
            <h2 className="fos-lp-section-title">Everything your wardrobe needs</h2>
            <ul className="fos-lp-feature-grid">
              {[
                {
                  title: "AI Wardrobe Cataloging",
                  text: "Photo to catalog automatically — no spreadsheets.",
                },
                { title: "Weather-Aware Outfits", text: "Dress for the actual day ahead." },
                { title: "Gap Analysis", text: "Know what you're missing before you shop." },
                { title: "Outfit Planner", text: "Plan your week against life and laundry." },
                { title: "Smart Shopping", text: "Buy less, buy better, only when it earns a spot." },
                {
                  title: "Style Memory",
                  text: "AI learns your taste and gets sharper over time.",
                },
              ].map((f) => (
                <li key={f.title}>
                  <article className="fos-lp-feat">
                    <span className="fos-lp-feat-line" aria-hidden="true" />
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </article>
                </li>
              ))}
            </ul>
          </RevealWrap>
        </section>

        <section id="testimonials" className="fos-lp-section fos-lp-muted-bg" aria-labelledby="fos-testimonials-heading">
          <div className="fos-lp-inner">
            <RevealWrap style={{ width: "100%" }}>
              <h2 id="fos-testimonials-heading" className="fos-lp-section-title">
                Built for real wardrobes
              </h2>
              {/* TODO: replace with real testimonials */}
              <ul className="fos-lp-quote-grid fos-lp-cards-row">
                {PLACEHOLDER_QUOTES.map((q) => (
                  <li key={q.author}>
                    <blockquote className="fos-lp-quote">
                      <p className="fos-lp-stars" aria-label="Five stars">
                        ★★★★★
                      </p>
                      <p className="fos-lp-quote-text">{q.body}</p>
                      <footer className="fos-lp-quote-foot">— {q.author}</footer>
                    </blockquote>
                  </li>
                ))}
              </ul>
            </RevealWrap>
          </div>
        </section>

        <section id="waitlist" className="fos-lp-section fos-lp-inner fos-lp-waitlist-section">
          <RevealWrap style={{ width: "100%" }}>
            <article
              className="fos-lp-dark-card fos-lp-waitlist-card"
              style={{
                paddingTop: "clamp(28px, 5vw, 42px)",
                paddingBottom: "clamp(28px, 5vw, 42px)",
              }}
            >
              <h2 id="fos-waitlist-heading" className="fos-lp-waitlist-title">
                Be the first in.
              </h2>
              <p className="fos-lp-waitlist-sub">Tell us about your wardrobe and join the waitlist.</p>
              <WaitlistFlow />
            </article>
          </RevealWrap>
        </section>
      </main>

      <footer className="fos-lp-footer" id="privacy-policy">
        <div className="fos-lp-inner fos-lp-footer-grid">
          <div>
            <LandingNavLogo />
            <p style={{ margin: "14px 0 0", color: "rgba(250,247,242,0.55)", fontSize: "0.95rem" }}>Dress smarter. Shop less.</p>
          </div>
          <div>
            <nav className="fos-lp-footer-nav" aria-label="Footer">
              <Link to="/app">Sign In</Link>
              <a href="#privacy-policy">Privacy Policy</a>
            </nav>
            <p style={{ margin: "22px 0 0", color: "rgba(250,247,242,0.38)", fontSize: "0.88rem", lineHeight: 1.5 }}>
              Privacy: we use your signup answers to prioritize the waitlist. No spam · Unsubscribe anytime.
            </p>
            <p style={{ margin: "18px 0 0", color: "rgba(250,247,242,0.35)", fontSize: "0.82rem" }}>© 2026 Fashion OS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
