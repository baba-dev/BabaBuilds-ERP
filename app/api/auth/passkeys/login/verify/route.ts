import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { recordAuthFailure } from "@/lib/auth-observability";
import { checkPasswordAuthRateLimit, hashRateLimitValue, recordPasswordAuthFailure } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";
import { consumeChallenge, fromBase64URL, getIp, getOrigin, getRpID, issueLoginToken, readClientChallenge } from "@/lib/auth/passkeys";

export async function POST(request: Request) {
  const ip = getIp(request);
  const key = `passkey-login:${hashRateLimitValue(ip)}`;
  const limited = checkPasswordAuthRateLimit(key);
  if (!limited.ok) {
    recordAuthFailure({ reason: "PASSKEY_LOGIN_RATE_LIMITED", code: "PASSKEY_LOGIN_RATE_LIMITED", provider: "passkey-login" });
    return NextResponse.json({ error: "Too many passkey attempts.", retryAfter: limited.retryAfterSeconds }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const credentialID = (body as { id?: unknown } | null)?.id;
  if (typeof credentialID !== "string" || credentialID.length === 0) {
    recordPasswordAuthFailure(key);
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }

  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialID },
    include: { user: true },
  });
  if (!credential?.user?.email) {
    recordPasswordAuthFailure(key);
    return NextResponse.json({ error: "Unknown passkey" }, { status: 404 });
  }

  const challenge = readClientChallenge(body);
  if (!challenge) {
    recordPasswordAuthFailure(key);
    return NextResponse.json({ error: "Invalid passkey response" }, { status: 400 });
  }

  const stored = await consumeChallenge(challenge, "authentication");
  if (!stored) {
    recordPasswordAuthFailure(key);
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: stored.challenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpID(),
    credential: {
      id: credential.credentialID,
      publicKey: fromBase64URL(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports?.split(",").filter(Boolean) as AuthenticatorTransport[] | undefined,
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    recordPasswordAuthFailure(key);
    return NextResponse.json({ error: "Passkey verification failed" }, { status: 400 });
  }

  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: {
      counter: Number(verification.authenticationInfo.newCounter || credential.counter),
      lastUsedAt: new Date(),
    },
  });

  const loginToken = await issueLoginToken(credential.userId);
  return NextResponse.json({ loginToken });
}
