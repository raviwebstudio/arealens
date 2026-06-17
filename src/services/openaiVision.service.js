/**
 * OpenAI Vision service — JS implementation used by the server.
 * Accepts an image Buffer and returns parsed JSON following the AreaLens schema.
 */
const OpenAI = require("openai");
const debug = require("debug")("openai:vision");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeFloorPlan(
  buffer,
  mimeType = "image/jpeg",
  model = "gpt-4.1",
) {
  const base64 = buffer.toString("base64");

  const PROMPT = `You are an expert architectural floor-plan analyst.
Analyze the attached floor plan image and return ONLY a single VALID JSON object with the following structure (no markdown, no explanation):
{
  "rooms": [
    {
      "name": "Bedroom",
      "type": "bedroom|kitchen|bathroom|balcony|hall|utility|other",
      "length": 12.0,
      "width": 10.0,
      "unit": "ft|m"
    }
  ],
  "wallThickness": 0.5,            // in same unit
  "unit": "ft|m|unknown",
  "totalDimensions": { "length": 40.0, "width": 30.0 },
  "confidence": 92                 // integer 0-100
}

Rules:
- Detect room labels and dimensions where present.
- If units are ambiguous, infer unit (feet or metres) and set "unit".
- Extract balconies, kitchens, and bathrooms as separate entries with appropriate "type".
- If dimension numbers are not present, make a best estimate and indicate reasonable values.
- Return numbers (not strings) for numeric fields.
- Always return valid JSON only. Do NOT include markdown, backticks, or explanatory text.
- If the image is NOT a floor plan, return "confidence": 0 and an empty "rooms" array.
`;

  try {
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

    debug("OpenAI response object:", JSON.stringify(resp, null, 2));

    // Extract text content robustly
    let text = "";
    if (resp.output && Array.isArray(resp.output)) {
      for (const item of resp.output) {
        if (item.content && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === "output_text" || c.type === "text")
              text += (c.text || "") + "\n";
            if (c.type === "message" && c.text) text += c.text + "\n";
            if (c.type === "output" && c.parts)
              text += c.parts.join("\n") + "\n";
          }
        } else if (typeof item === "string") text += item + "\n";
      }
    } else if (resp.output_text) {
      text = resp.output_text;
    } else if (resp.content && resp.content[0] && resp.content[0].text) {
      text = resp.content[0].text;
    }

    // Extract JSON substring
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      debug("Failed to parse JSON from OpenAI response:", e.message);
      // Fallback minimal structure
      parsed = {
        rooms: [],
        wallThickness: 0,
        unit: "unknown",
        totalDimensions: { length: null, width: null },
        confidence: 0,
      };
    }

    return parsed;
  } catch (err) {
    debug("OpenAI call error:", err?.message || err);
    throw err;
  }
}

module.exports = { analyzeFloorPlan };
