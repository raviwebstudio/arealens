# OpenAI Vision — AreaLens API

Endpoint: `POST /api/scan-floorplan`

Content-Type: `multipart/form-data`

Form field: `floor_plan` (file) — allowed types: `image/jpeg`, `image/png`, `image/heic`, `image/webp` (max 10MB)

Headers: `Authorization: Bearer <JWT>` (protected route)

Example curl request:

```bash
curl -X POST "http://localhost:3000/api/scan-floorplan" \
  -H "Authorization: Bearer <JWT>" \
  -F "floor_plan=@/path/to/floorplan.jpg"
```

Example success response:

```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "name": "Bedroom",
        "type": "bedroom",
        "length": 12,
        "width": 10,
        "unit": "ft"
      },
      {
        "name": "Kitchen",
        "type": "kitchen",
        "length": 8,
        "width": 6,
        "unit": "ft"
      }
    ],
    "wallThickness": 0.5,
    "unit": "ft",
    "totalDimensions": { "length": 40, "width": 30 },
    "confidence": 92,
    "requiresReview": false
  }
}
```

Low-confidence example (requires manual review):

```json
{
  "success": true,
  "data": {
    "rooms": [],
    "wallThickness": 0,
    "unit": "unknown",
    "totalDimensions": { "length": null, "width": null },
    "confidence": 25,
    "requiresReview": true
  }
}
```

Notes:

- The OpenAI Responses API is used to analyse the image and return a strict JSON payload.
- If confidence < 70 the field `requiresReview: true` will be set.
- Store results are saved to the `scans` table under `ai_raw_response`, `rooms`, `dimensions` and `ai_confidence_score`.
