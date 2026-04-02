import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Groq from 'groq-sdk';
import { scanBuffer } from '@/lib/security/clamav';

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK & BYOK FETCH
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId } 
    });

    if (!profile?.groqApiKey) {
      return NextResponse.json({ 
        error: "AI Scanner requires a Groq API Key. Please configure it in Business Settings." 
      }, { status: 400 });
    }

    // 2. EXTRACT & VALIDATE THE FILE
    const formData = await request.formData();
    const file = formData.get('receipt') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No receipt file uploaded." }, { status: 400 });
    }

    // Next.js Edge/Serverless handles images much better than PDFs for Vision AI.
    // If you want to support PDFs later, you'd need a library like `pdf-parse` to extract the text first.
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      return NextResponse.json({ 
        error: "Currently, the AI Scanner only supports image formats (JPG, PNG, WEBP). Please take a screenshot of your PDF." 
      }, { status: 400 });
    }

    // 3. CONVERT IMAGE TO BASE64 FOR GROQ VISION
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const isSafe = await scanBuffer(buffer);
    if (!isSafe) {
      return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
    }

    const base64Image = buffer.toString('base64');
    const imageUrl = `data:${file.type};base64,${base64Image}`;

    // 4. CALL GROQ VISION AI
    const groq = new Groq({ apiKey: profile.groqApiKey });

    const systemPrompt = `You are an elite data extraction AI for an Indian accounting firm.
    Analyze the provided receipt/invoice image and extract the key financial data.
    
    Categorize the expense strictly into ONE of these exact categories:
    "Hosting & Cloud", "Software Subscriptions", "Hardware & Equipment", "Internet & Utilities", "Sub-contractors", "Office & Rent", "Meals & Entertainment", "Other".
    
    You MUST respond in strictly valid JSON format matching this schema:
    {
      "vendor": "String (Name of the merchant)",
      "amount": Number (The final total amount in INR, no currency symbols),
      "date": "String (Format strictly as YYYY-MM-DD)",
      "category": "String (Must exactly match one of the allowed categories above)",
      "description": "String (A short 3-6 word summary of what was purchased)"
    }
    
    If you cannot find a piece of data, return null for that field, but never break the JSON structure.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.2-11b-vision-preview", // Groq's insanely fast multimodal vision model
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      temperature: 0.1, // Keep it highly deterministic
      response_format: { type: "json_object" } // Force strict JSON output
    });

    // 5. PARSE & RETURN THE EXTRACTED DATA
    const responseContent = completion.choices[0]?.message?.content || "{}";
    
    try {
      const extractedData = JSON.parse(responseContent);
      
      // Send the clean, mapped data back to the frontend form
      return NextResponse.json({
        vendor: extractedData.vendor || "",
        amount: extractedData.amount || "",
        date: extractedData.date || new Date().toISOString().split('T')[0],
        category: extractedData.category || "Other",
        description: extractedData.description || ""
      });

    } catch (parseError) {
      console.error("Failed to parse Groq Vision JSON:", parseError);
      return NextResponse.json({ error: "AI could not cleanly parse the receipt data." }, { status: 500 });
    }

  } catch (error: any) {
    console.error("AI Scanner Error:", error);
    return NextResponse.json({ error: "An error occurred while scanning the receipt." }, { status: 500 });
  }
}