# Testing Monet AI Director

## 🚀 Quick Start

The dev server is running on **http://localhost:8080**

## Test the Intent Layer (THE MOAT)

```bash
./test-intent.sh
```

This will test 3 scenarios:
1. **Specific prompt** - "Make a 30s anime AMV" → Should extract detailed intent
2. **Sports highlight** - "Create a hype reel" → Different genre understanding
3. **Vague prompt** - "Make a cool edit" → Should ask clarifying questions

## Manual API Testing

### 1. Extract Intent
```bash
curl -X POST http://localhost:8080/api/decode-intent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make a 30s anime AMV cut to this song",
    "projectId": "test-123",
    "context": {
      "hasMusic": true,
      "hasFootage": true
    }
  }' | jq '.'
```

### 2. Upload Media (Future)
```bash
# Request upload URL
curl -X POST http://localhost:8080/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-123",
    "type": "footage",
    "filename": "clip1.mp4",
    "contentType": "video/mp4"
  }' | jq '.'
```

## What to Expect

**Good Intent Extraction**:
- `confidence`: 0.7-1.0
- `intent.goal.primary`: Clear creative objective
- `intent.style.pacing`: "fast" or "aggressive" for AMVs
- `intent.technical.syncToBeat`: true for music-driven edits
- `intent.structure.energyCurve`: 10 values showing intensity progression

**Needs Clarification**:
- `confidence`: 0.3-0.6
- `clarifyingQuestions`: Array of questions with options
- Frontend should show these to user before proceeding

## Database Check

```bash
# Check if intents are being stored
npx wrangler d1 execute monet-db-dev --local \
  --command "SELECT id, user_prompt, confidence FROM edit_intents LIMIT 5"
```

## Next Steps

After intent extraction works:
1. **Analysis Pipeline** - Extract footage segments, detect beats
2. **EDL Generation** - Turn intent → timeline
3. **Rendering** - Preview + export

## Troubleshooting

**Server not responding?**
```bash
# Check what port it's on
lsof -nP -iTCP -sTCP:LISTEN | grep node

# Restart server
pkill -f "vite dev"
bun run dev
```

**Gemini API errors?**
- Check `.dev.vars` has your API key
- Verify key at https://aistudio.google.com/app/apikey
