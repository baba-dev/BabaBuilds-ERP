/**
 * MenuMinute-style circular theme reveal, adapted for ERP's next-themes provider.
 *
 * next-themes applies its DOM class in a React effect, not necessarily when
 * setTheme() returns. Wait for that class change before taking the new snapshot
 * so the reveal never animates a stale copy of the old theme.
 */
export type ErpThemePreference = "light" | "dark" | "system";

const DURATION_MS = 550;
let revealInProgress = false;

function resolvesToDark(theme: ErpThemePreference): boolean {
  return theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function setThemeWithCircularReveal(
  theme: ErpThemePreference,
  setTheme: (theme: string) => void,
  origin?: Element | null,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    setTheme(theme);
    return;
  }

  const root = document.documentElement;
  const targetDark = resolvesToDark(theme);
  if (
    root.classList.contains("dark") === targetDark ||
    revealInProgress ||
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    setTheme(theme);
    return;
  }

  const bounds = origin?.getBoundingClientRect();
  const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
  const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const cleanup = () => {
    revealInProgress = false;
    delete root.dataset.erpThemeReveal;
  };

  revealInProgress = true;
  root.dataset.erpThemeReveal = "active";

  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          // The theme provider updates <html class="dark"> asynchronously.
          // Observing it also preserves the provider's localStorage/system logic.
          const observer = new MutationObserver(() => {
            if (root.classList.contains("dark") === targetDark) finish();
          });
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            window.clearTimeout(timeout);
            resolve();
          };
          observer.observe(root, { attributes: true, attributeFilter: ["class"] });
          // Never block the browser's transition if a theme update gets delayed.
          const timeout = window.setTimeout(finish, 900);
          setTheme(theme);
          if (root.classList.contains("dark") === targetDark) finish();
        }),
    );
  } catch {
    cleanup();
    setTheme(theme);
    return;
  }

  void transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: DURATION_MS,
          easing: "ease-in-out",
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      // Browser cancelled the visual transition; the requested theme still applies.
    });

  void transition.finished.then(cleanup, cleanup);
}
