import * as React from "react";

export type AuthAmbientBackgroundProps = {
  /**
   * Extra classes on the root (e.g. z-index tweaks). Root is `pointer-events-none`.
   */
  className?: string;
};

/**
 * Premium ambient background for authentication surfaces.
 *
 * Layer stack (bottom → top):
 * 1. Base warm gradient — anchors light/dark theme.
 * 2. Subtle dot-grid pattern — masked so the card area stays calmer than the edges.
 * 3. Four blurred mesh “orbs” — slow CSS drift, orange-led palette.
 * 4. Vignette + central spotlight — frames the composition and guides focus to the form.
 *
 * Motion is pure CSS; `prefers-reduced-motion` freezes drift via `app/globals.css`.
 */
export function AuthAmbientBackground({ className = "" }: AuthAmbientBackgroundProps) {
  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none absolute inset-0 overflow-hidden select-none",
        "z-0",
        className,
      ].join(" ")}
    >
      {/* 1) Base gradient — foundation wash; orange-amber biased in both themes */}
      <div className="auth-ambient-base absolute inset-0" />

      {/* 2) Fine pattern — barely visible; radial mask keeps the center quiet for the card */}
      <div className="auth-ambient-pattern absolute inset-0" />

      {/* 3) Mesh glow orbs — large, soft, independently timed float cycles */}
      <div className="auth-ambient-mesh absolute inset-0">
        <div className="auth-ambient-orb auth-ambient-orb-a" />
        <div className="auth-ambient-orb auth-ambient-orb-b" />
        <div className="auth-ambient-orb auth-ambient-orb-c" />
        <div className="auth-ambient-orb auth-ambient-orb-d" />
      </div>

      {/* 4) Spotlight toward the form + edge vignette — readability and framing */}
      <div className="auth-ambient-vignette absolute inset-0" />
    </div>
  );
}
