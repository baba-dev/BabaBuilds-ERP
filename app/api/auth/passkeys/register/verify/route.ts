import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeChallenge, getOrigin, getRpID, normalizeTransports, readClientChallenge, toBase64URL } from "@/lib/auth/passkeys";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const challenge = readClientChallenge(body);
  if (!challenge) {
    return NextResponse.json({ error: "Invalid passkey response" }, { status: 400 });
  }

  const stored = await consumeChallenge(challenge, "registration", session.user.id);
  if (!stored) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: stored.challenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpID(),
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Passkey verification failed" }, { status: 400 });
  }

  const info = verification.registrationInfo;
  const passkey = await prisma.webAuthnCredential.upsert({
    where: { credentialID: info.credential.id },
    create: {
      userId: session.user.id,
      credentialID: info.credential.id,
      publicKey: toBase64URL(info.credential.publicKey),
      counter: Number(info.credential.counter || 0),
      transports: normalizeTransports((body as { response?: { transports?: unknown } })?.response?.transports),
      deviceType: info.credentialDeviceType,
      backedUp: Boolean(info.credentialBackedUp),
      name: "New passkey",
    },
    update: {
      userId: session.user.id,
      publicKey: toBase64URL(info.credential.publicKey),
      counter: Number(info.credential.counter || 0),
      transports: normalizeTransports((body as { response?: { transports?: unknown } })?.response?.transports),
      deviceType: info.credentialDeviceType,
      backedUp: Boolean(info.credentialBackedUp),
      name: "New passkey",
    },
  });

  logActivity({
    action: "account_security.passkey_added",
    outcome: "success",
    entityType: "WebAuthnCredential",
    entityId: passkey.id,
    actorId: session.user.id,
    actorEmail: session.user.email,
    metadata: { deviceType: info.credentialDeviceType, backedUp: Boolean(info.credentialBackedUp) },
  });

  return NextResponse.json({ ok: true });
}
