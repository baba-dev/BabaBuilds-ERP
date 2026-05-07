"use client";

type LoadExternalScriptOptions = {
  id?: string;
  timeoutMs?: number;
};

const scriptPromises = new Map<string, Promise<boolean>>();

export async function loadExternalScript(
  src: string,
  options: LoadExternalScriptOptions = {},
): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const cacheKey = `${options.id ?? ""}:${src}`;
  const existingPromise = scriptPromises.get(cacheKey);
  if (existingPromise) return existingPromise;

  const promise = new Promise<boolean>((resolve) => {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const existingScript = document.querySelector<HTMLScriptElement>(
      options.id ? `script#${CSS.escape(options.id)}` : `script[src="${src}"]`,
    );

    if (existingScript) {
      const alreadyLoaded =
        existingScript.dataset.loaded === "true" ||
        existingScript.getAttribute("data-loaded") === "true";
      if (alreadyLoaded) {
        resolve(true);
        return;
      }
    }

    const script =
      existingScript ??
      (() => {
        const s = document.createElement("script");
        if (options.id) s.id = options.id;
        s.src = src;
        s.async = true;
        document.body.appendChild(s);
        return s;
      })();

    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const onLoad = () => {
      script.dataset.loaded = "true";
      cleanup();
      resolve(true);
    };

    const onError = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
  });

  scriptPromises.set(cacheKey, promise);
  const loaded = await promise;
  if (!loaded) scriptPromises.delete(cacheKey);
  return loaded;
}
