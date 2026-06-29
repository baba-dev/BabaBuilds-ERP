import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;
const groq = apiKey ? new Groq({ apiKey }) : null;

export type DocumentAnalysisResult = {
  title: string;
  summary: string;
  meta: Record<string, any>;
};

export async function analyzeDocumentWithGroq(text: string): Promise<DocumentAnalysisResult | null> {
  if (!groq) {
    console.warn("Groq API key is missing. Skipping AI analysis.");
    return null;
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an intelligent document analyzer for an ERP system. Your job is to extract the main title of the document, provide a concise summary, and extract any relevant metadata (like dates, amounts, sender, recipient, keywords, etc.) as a JSON object."
        },
        {
          role: "user",
          content: `Please analyze the following document text:\n\n${text.slice(0, 15000)}` // Limit text length
        }
      ],
      model: "llama3-groq-70b-8192-tool-use-preview",
      tools: [
        {
          type: "function",
          function: {
            name: "save_document_metadata",
            description: "Saves the analyzed title, summary, and metadata for a document.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "The inferred title of the document" },
                summary: { type: "string", description: "A concise summary of the document's content" },
                meta: { 
                  type: "object", 
                  description: "Any relevant key-value metadata extracted from the document",
                  additionalProperties: true
                }
              },
              required: ["title", "summary", "meta"]
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "save_document_metadata" } }
    });

    const toolCall = chatCompletion.choices[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function.name === 'save_document_metadata') {
      const args = JSON.parse(toolCall.function.arguments);
      return {
        title: args.title || "Untitled Document",
        summary: args.summary || "No summary available.",
        meta: args.meta || {}
      };
    }
  } catch (error) {
    console.error("Error analyzing document with Groq:", error);
  }

  return null;
}
