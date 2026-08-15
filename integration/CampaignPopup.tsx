// Drop-in popup for the public website (stevenmoning.vercel.app).
//
// Mount this once near the root of the app (e.g. in App.tsx / layout.tsx).
// It fetches the admin panel's public campaigns endpoint, waits the
// campaign's configured delay, then shows a closable popup with the
// campaign's photo or video, headline, body text and an optional button.
//
// Zero external dependencies — plain React + inline styles, so it drops into
// a Vite app, a Next.js app (as a Client Component — add "use client" at the
// top if so), or anything else. Copy this file into the site's own repo.

import { useEffect, useState } from "react";

// Point this at the admin panel's deployed URL.
const API_BASE = "https://REPLACE-WITH-ADMIN-PANEL-DOMAIN.vercel.app";

type CampaignMediaType = "image" | "video";

interface Campaign {
  id: string;
  headline: string;
  body: string | null;
  media_url: string | null;
  media_type: CampaignMediaType;
  cta_text: string | null;
  cta_url: string | null;
  priority: number;
  display_delay_seconds: number;
  frequency: "once_per_session" | "once_per_visitor" | "every_visit";
  starts_at: string | null;
  ends_at: string | null;
}

function storageFor(frequency: Campaign["frequency"]): Storage | null {
  if (frequency === "once_per_visitor") return localStorage;
  if (frequency === "once_per_session") return sessionStorage;
  return null; // "every_visit" — never remember a dismissal
}

function alreadyDismissed(campaign: Campaign): boolean {
  const store = storageFor(campaign.frequency);
  if (!store) return false;
  return store.getItem(`campaign-seen:${campaign.id}`) === "1";
}

function markDismissed(campaign: Campaign): void {
  const store = storageFor(campaign.frequency);
  store?.setItem(`campaign-seen:${campaign.id}`, "1");
}

export default function CampaignPopup() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [visible, setVisible] = useState(false);

  // Fetch the live campaigns once on mount and pick the top-priority one
  // that hasn't already been dismissed under its own frequency rule.
  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/api/campaigns`)
      .then((res) => res.json())
      .then((json: { data?: Campaign[] }) => {
        if (cancelled) return;
        const winner = (json.data ?? []).find((c) => !alreadyDismissed(c));
        if (winner) setCampaign(winner);
      })
      .catch(() => {
        /* a failed fetch should never break the page — just skip the popup */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Show it after its configured delay.
  useEffect(() => {
    if (!campaign) return;
    const timer = setTimeout(() => setVisible(true), campaign.display_delay_seconds * 1000);
    return () => clearTimeout(timer);
  }, [campaign]);

  function close() {
    if (campaign) markDismissed(campaign);
    setVisible(false);
  }

  if (!campaign || !visible) return null;

  return (
    <div style={styles.backdrop} onClick={close}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="Close" style={styles.closeButton}>
          ×
        </button>

        {campaign.media_url &&
          (campaign.media_type === "video" ? (
            <video
              src={campaign.media_url}
              style={styles.media}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img src={campaign.media_url} alt="" style={styles.media} />
          ))}

        <div style={styles.body}>
          <h2 style={styles.headline}>{campaign.headline}</h2>
          {campaign.body && <p style={styles.text}>{campaign.body}</p>}
          {campaign.cta_text && campaign.cta_url && (
            <a href={campaign.cta_url} style={styles.cta}>
              {campaign.cta_text}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(6, 16, 28, 0.7)",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  card: {
    position: "relative",
    background: "#fff",
    borderRadius: 16,
    maxWidth: 440,
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 24px 60px -12px rgba(6, 16, 28, 0.5)",
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    background: "rgba(6, 16, 28, 0.6)",
    color: "#fff",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    zIndex: 1,
  },
  media: {
    width: "100%",
    height: 220,
    objectFit: "cover",
    display: "block",
    background: "#06101c",
  },
  body: {
    padding: "20px 24px 24px",
    textAlign: "center",
  },
  headline: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: "#06101c",
  },
  text: {
    margin: "10px 0 0",
    fontSize: 14,
    color: "#4a4a4a",
    lineHeight: 1.5,
  },
  cta: {
    display: "inline-block",
    marginTop: 16,
    padding: "10px 24px",
    borderRadius: 8,
    background: "#06101c",
    color: "#faf4e8",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
  },
};
