import { parsedCvSchema, type ParsedCv } from "./schemas.ts";

export async function parseCvWithMinimax(rawText: string): Promise<{
  data: ParsedCv;
  modelUsed: string;
}> {
  const apiKey = Deno.env.get("MINIMAX_API_KEY");
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");

  const model = Deno.env.get("MINIMAX_MODEL") ?? "MiniMax-Text-01";

  const systemPrompt =
    `You are a CV parser. Extract structured data and return ONLY valid JSON matching this schema:
{"name":"","email":"","phone":"","summary":"","skills":[],"experience":[{"company":"","role":"","dates":"","bullets":[]}],"education":[{"institution":"","degree":"","dates":""}]}
No markdown, no preamble.`;

  const res = await fetch(
    "https://api.minimax.chat/v1/text/chatcompletion_v2",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Parse this CV and return JSON:\n\n${rawText.slice(0, 120_000)}`,
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MiniMax API error (${res.status}): ${errText}`);
  }

  const payload = await res.json();
  const content = extractAssistantContent(payload);
  const json = extractJson(content);
  const data = parsedCvSchema.parse(json);

  return { data, modelUsed: model };
}

function extractAssistantContent(payload: Record<string, unknown>): string {
  const choices = payload.choices as Array<{ message?: { content?: string } }> | undefined;
  if (choices?.[0]?.message?.content) {
    return choices[0].message.content;
  }
  const reply = payload.reply as string | undefined;
  if (reply) return reply;
  throw new Error("Unexpected MiniMax response shape");
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  return JSON.parse(candidate);
}
