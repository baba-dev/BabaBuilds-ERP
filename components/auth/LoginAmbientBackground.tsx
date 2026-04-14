import * as React from "react";

export type LoginAmbientBackgroundProps = {
  /**
   * Adds a very subtle drifting particle layer.
   * Disable for the cleanest enterprise look.
   */
  particles?: boolean;
  /**
   * Additional className for the root background wrapper.
   */
  className?: string;
};

/**
 * Production-ready ambient background for auth surfaces.
 *
 * Implementation goals:
 * - No runtime randomness (avoids hydration mismatch).
 * - GPU-friendly transforms and opacity; no layout thrashing.
 * - Respects prefers-reduced-motion (global reduce-motion rules already present).
 * - Theme-tunable via CSS variables (see `app/globals.css` tokens).
 */
export function LoginAmbientBackground({
  particles = true,
  className = "",
}: LoginAmbientBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none absolute inset-0 overflow-hidden",
        // Ensure this stays behind auth UI.
        "z-0",
        className,
      ].join(" ")}
    >
      {/* Base gradient wash */}
      <div className="absolute inset-0 login-ambient-base" />

      {/* Subtle spotlight behind the centered card (composition anchor) */}
      <div className="absolute inset-0 login-ambient-spotlight" />

      {/* Aurora blobs (slow, low-contrast, center-biased) */}
      <div className="absolute inset-0 login-ambient-aurora" />

      {/* Digital vines / workflow curves (SVG, thin, masked at edges) */}
      <svg
        className="absolute inset-0 h-full w-full login-ambient-vines"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <defs>
          {/* Soft edge falloff to keep edges calm */}
          <radialGradient id="loginVineMask" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="55%" stopColor="white" stopOpacity="0.75" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="loginVinesFade">
            <rect width="1200" height="800" fill="url(#loginVineMask)" />
          </mask>

          <linearGradient id="loginVineStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--login-vine-1)" stopOpacity="0.85" />
            <stop offset="55%" stopColor="var(--login-vine-2)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--login-vine-3)" stopOpacity="0.5" />
          </linearGradient>

          <filter id="loginVineGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 0.7 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g mask="url(#loginVinesFade)" className="login-ambient-vines-motion">
          {/* A small set of curves; thin and understated. */}
          <path
            d="M-80,560 C120,520 180,620 320,560 C470,495 560,420 720,455 C870,490 960,610 1150,545 C1320,485 1400,540 1310,700"
            fill="none"
            stroke="url(#loginVineStroke)"
            strokeWidth="1.15"
            strokeLinecap="round"
            strokeDasharray="10 18"
            className="login-vine-stroke login-vine-a"
            filter="url(#loginVineGlow)"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M-120,340 C40,290 170,370 300,340 C440,306 520,230 680,255 C840,280 925,395 1090,350 C1240,310 1360,330 1310,460"
            fill="none"
            stroke="url(#loginVineStroke)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="8 22"
            className="login-vine-stroke login-vine-b"
            opacity="0.9"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M40,860 C180,760 230,660 380,640 C550,615 610,710 760,670 C910,630 1000,520 1140,520 C1310,520 1400,650 1320,820"
            fill="none"
            stroke="url(#loginVineStroke)"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeDasharray="6 26"
            className="login-vine-stroke login-vine-c"
            opacity="0.75"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {particles ? (
          <g mask="url(#loginVinesFade)" className="login-ambient-particles">
            {/* Tiny dots; intentionally few to keep it premium/subtle. */}
            {[
              { cx: 260, cy: 270, r: 1.2, o: 0.45 },
              { cx: 420, cy: 510, r: 1.0, o: 0.32 },
              { cx: 640, cy: 330, r: 1.4, o: 0.38 },
              { cx: 820, cy: 520, r: 1.0, o: 0.26 },
              { cx: 980, cy: 300, r: 1.3, o: 0.32 },
              { cx: 560, cy: 620, r: 1.1, o: 0.28 },
              { cx: 720, cy: 200, r: 1.0, o: 0.25 },
              { cx: 330, cy: 360, r: 1.0, o: 0.22 },
            ].map((p, idx) => (
              <circle
                key={idx}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill="var(--login-particle)"
                opacity={p.o}
                className={`login-particle login-particle-${idx % 4}`}
              />
            ))}
          </g>
        ) : null}
      </svg>

      {/* Final soft vignette to keep edges quiet and preserve readability */}
      <div className="absolute inset-0 login-ambient-vignette" />
    </div>
  );
}

