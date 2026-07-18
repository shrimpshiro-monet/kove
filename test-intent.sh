#!/bin/bash
# Test Intent Extraction - THE MOAT

PORT=8080  # Vite dev server port

echo "🎬 Testing Monet Intent Extraction..."
echo ""

# Create a test project
PROJECT_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "Project ID: $PROJECT_ID"
echo ""

# Test 1: Anime AMV
echo "📝 Test 1: Anime AMV prompt"
curl -X POST http://localhost:$PORT/api/decode-intent \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Make a 30s anime AMV cut to this song\",
    \"projectId\": \"$PROJECT_ID\",
    \"context\": {
      \"hasMusic\": true,
      \"hasFootage\": true
    }
  }" | jq '.'

echo ""
echo "---"
echo ""

# Test 2: Sports Highlight
echo "📝 Test 2: Sports highlight prompt"
curl -X POST http://localhost:$PORT/api/decode-intent \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Create a hype reel from my basketball game\",
    \"projectId\": \"$PROJECT_ID\"
  }" | jq '.'

echo ""
echo "---"
echo ""

# Test 3: Vague prompt (should ask clarifying questions)
echo "📝 Test 3: Vague prompt (should ask questions)"
curl -X POST http://localhost:$PORT/api/decode-intent \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Make a cool edit with my clips\",
    \"projectId\": \"$PROJECT_ID\"
  }" | jq '.'

echo ""
echo "✨ Intent extraction tests complete!"
