import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";
import { scrubSensitiveData } from "@/lib/diagnostics/logger";

const prisma = new PrismaClient();
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "dummy", 
});

export async function POST(req: Request) {
  try {
    const { errorName, errorMessage, errorStack, route } = await req.json();

    const scrubbedMessage = scrubSensitiveData(errorMessage || "");
    const scrubbedStack = scrubSensitiveData(errorStack || "");

    // 1. Log the error to the database first so we have a record even if AI fails
    const logEntry = await prisma.systemErrorLog.create({
      data: {
        errorType: errorName || "UnknownError",
        message: scrubbedMessage,
        stackTrace: scrubbedStack,
        route,
        status: "UNRESOLVED",
      }
    });

    let friendlyMessage = "We hit an unexpected error while loading this page. Our team has been notified.";

    // 2. Fast AI call for user-friendly message
    if (process.env.GROQ_API_KEY) {
      try {
        const prompt = `
You are an empathetic, non-technical customer support assistant for a web application.
A user just encountered an error. 
Explain to the user what went wrong in 1-2 friendly, jargon-free sentences. 
Do not mention code, stack traces, or server issues directly. Blame the system, not the user.

Error Name: ${errorName}
Message: ${scrubbedMessage}
Route: ${route}

Respond ONLY with the friendly message text. No quotes or wrappers.
        `.trim();

        const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama3-8b-8192", // We use 8b here specifically for lowest latency
          temperature: 0.3,
          max_tokens: 100
        });

        const content = completion.choices[0]?.message?.content?.trim();
        if (content) {
          friendlyMessage = content;
        }
      } catch (aiErr) {
        console.error("Failed to generate user-friendly AI message:", aiErr);
      }
    } else {
        // Mock fallback
        friendlyMessage = "It looks like something went wrong with the data we received. Don't worry, we've alerted our developers!";
    }

    // 3. Update the log with the message we gave the user
    await prisma.systemErrorLog.update({
      where: { id: logEntry.id },
      data: { aiUserFriendlyMessage: friendlyMessage }
    });

    // 4. Also trigger the main async deep-analysis in the background
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/diagnostics/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId: logEntry.id }),
    }).catch(() => {}); // fire and forget

    return NextResponse.json({ friendlyMessage, logId: logEntry.id });

  } catch (err) {
    console.error("User-message diagnostic error:", err);
    return NextResponse.json({ 
      friendlyMessage: "We hit an unexpected error while loading this page. Our team has been notified." 
    }, { status: 500 });
  }
}
