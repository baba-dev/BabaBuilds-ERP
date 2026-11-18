import { afterEach, describe, expect, it, vi } from "vitest";
import { setThemeWithCircularReveal } from "@/lib/theme-transition";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockBrowser(options: { dark?: boolean; reducedMotion?: boolean } = {}) {
  let dark = options.dark ?? false;
  const animate = vi.fn();
  const root = {
    dataset: {} as Record<string, string>,
    classList: { contains: (token: string) => token === "dark" && dark },
    animate,
  };
  const setTheme = vi.fn((theme: string) => {
    dark = theme === "dark";
  });
  const browser = {
    innerWidth: 1200,
    innerHeight: 800,
    matchMedia: vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)"
        ? (options.reducedMotion ?? false)
        : false,
    })),
    setTimeout,
    clearTimeout,
  };
  const documentMock: {
    documentElement: typeof root;
    startViewTransition?: (update: () => Promise<void>) => {
      ready: Promise<void>; finished: Promise<void>;
    };
  } = { documentElement: root };
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", documentMock);
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  return { root, setTheme, documentMock, animate };
}

describe("ERP theme reveal", () => {
  it("falls back to next-themes where View Transitions are unsupported", () => {
    const { root, setTheme } = mockBrowser();
    setThemeWithCircularReveal("dark", setTheme);
    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark");
    expect(root.dataset.erpThemeReveal).toBeUndefined();
  });

  it("switches instantly for reduced-motion preferences", () => {
    const { setTheme, documentMock } = mockBrowser({ reducedMotion: true });
    const start = vi.fn();
    documentMock.startViewTransition = start;
    setThemeWithCircularReveal("dark", setTheme);
    expect(start).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark");
  });

  it("does not animate when selecting system with an unchanged effective theme", () => {
    const { setTheme, documentMock } = mockBrowser();
    const start = vi.fn();
    documentMock.startViewTransition = start;
    setThemeWithCircularReveal("system", setTheme);
    expect(start).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenCalledExactlyOnceWith("system");
  });

  it("reveals from the control and removes the scoped flag on completion", async () => {
    const { root, setTheme, documentMock, animate } = mockBrowser();
    let complete!: () => void;
    const finished = new Promise<void>((resolve) => { complete = resolve; });
    documentMock.startViewTransition = (update) => {
      void update();
      return { ready: Promise.resolve(), finished };
    };
    const origin = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 30 }),
    } as Element;

    setThemeWithCircularReveal("dark", setTheme, origin);
    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark");
    expect(root.dataset.erpThemeReveal).toBe("active");
    await Promise.resolve();
    expect(animate).toHaveBeenCalledWith(
      expect.objectContaining({
        clipPath: expect.arrayContaining(["circle(0px at 30px 35px)"]),
      }),
      expect.objectContaining({
        duration: 550,
        pseudoElement: "::view-transition-new(root)",
      }),
    );
    complete();
    await finished;
    await Promise.resolve();
    expect(root.dataset.erpThemeReveal).toBeUndefined();
  });
});
