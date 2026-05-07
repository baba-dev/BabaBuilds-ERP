type SiteverifyRequestBody = {
  secret: string;
  response: string;
  remoteip?: string;
};

export async function verifyTurnstileToken(token: string, remoteIp?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  const body: SiteverifyRequestBody = {
    secret,
    response: token,
  };
  const normalizedRemoteIp = remoteIp?.trim();
  if (normalizedRemoteIp && normalizedRemoteIp !== "unknown") {
    body.remoteip = normalizedRemoteIp;
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ success: false }));
    return Boolean(data?.success);
  } catch {
    return false;
  }
}
