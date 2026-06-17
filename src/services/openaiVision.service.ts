import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RoomOutput {
  name: string;
  type: string;
  length: number | null;
  width: number | null;
  unit?: string;
}

export interface VisionResult {
  rooms: RoomOutput[];
  wallThickness: number;
  unit: string;
  totalDimensions: { length: number | null; width: number | null };
  confidence: number;
}

export async function analyzeFloorPlan(
  buffer: Buffer,
  mimeType = "image/jpeg",
  model = "gpt-4.1",
): Promise<VisionResult> {
  const base64 = buffer.toString("base64");

  const PROMPT = `You are an expert architectural floor-plan analyst. Return a single VALID JSON object only.`;

  const resp = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT },
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${base64}`,
          },
        ],
      },
    ],
  });

  // Attempt to find JSON in the response
  const text = (resp.output_text ||
    JSON.stringify(resp.output || "")) as string;
  const match = text.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : text;
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    parsed = {
      rooms: [],
      wallThickness: 0,
      unit: "unknown",
      totalDimensions: { length: null, width: null },
      confidence: 0,
    };
  }

  return parsed as VisionResult;
}
