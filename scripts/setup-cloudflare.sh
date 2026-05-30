#!/bin/bash
# Monet AI - Cloudflare Resource Setup Script

set -e  # Exit on error

echo "🎬 Setting up Cloudflare resources for Monet AI Director..."
echo ""

# Check if authenticated
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "❌ Not authenticated with Cloudflare"
    echo "Please run: npx wrangler login"
    exit 1
fi

echo "✅ Authenticated with Cloudflare"
echo ""

# Create D1 Database
echo "📊 Creating D1 database..."
D1_OUTPUT=$(npx wrangler d1 create monet-db-dev 2>&1) || true
echo "$D1_OUTPUT"

if echo "$D1_OUTPUT" | grep -q "already exists"; then
    echo "ℹ️  Database already exists, fetching ID..."
    D1_LIST=$(npx wrangler d1 list --json 2>&1)
    D1_ID=$(echo "$D1_LIST" | jq -r '.[] | select(.name=="monet-db-dev") | .uuid')
else
    # Extract database ID from creation output
    D1_ID=$(echo "$D1_OUTPUT" | grep "database_id" | sed 's/.*= "\(.*\)"/\1/')
fi

echo "D1 Database ID: $D1_ID"
echo ""

# Create R2 Buckets
echo "🪣 Creating R2 buckets..."
npx wrangler r2 bucket create monet-media-dev 2>&1 | grep -v "already exists" || echo "✓ monet-media-dev"
npx wrangler r2 bucket create monet-media-preview 2>&1 | grep -v "already exists" || echo "✓ monet-media-preview"
npx wrangler r2 bucket create monet-renders-dev 2>&1 | grep -v "already exists" || echo "✓ monet-renders-dev"
npx wrangler r2 bucket create monet-renders-preview 2>&1 | grep -v "already exists" || echo "✓ monet-renders-preview"
echo ""

# Create KV Namespace
echo "🗄️  Creating KV namespace..."
KV_OUTPUT=$(npx wrangler kv namespace create MONET_KV 2>&1) || true
echo "$KV_OUTPUT"

if echo "$KV_OUTPUT" | grep -q "already exists"; then
    echo "ℹ️  KV namespace already exists, fetching ID..."
    KV_LIST=$(npx wrangler kv namespace list --json 2>&1)
    KV_ID=$(echo "$KV_LIST" | jq -r '.[] | select(.title | contains("MONET_KV")) | select(.title | contains("preview") | not) | .id' | head -1)
else
    KV_ID=$(echo "$KV_OUTPUT" | grep "id" | head -1 | sed 's/.*= "\(.*\)"/\1/')
fi

echo "KV Namespace ID: $KV_ID"
echo ""

# Create preview KV namespace
echo "🗄️  Creating KV preview namespace..."
KV_PREVIEW_OUTPUT=$(npx wrangler kv namespace create MONET_KV --preview 2>&1) || true
echo "$KV_PREVIEW_OUTPUT"

if echo "$KV_PREVIEW_OUTPUT" | grep -q "already exists"; then
    echo "ℹ️  KV preview namespace already exists, fetching ID..."
    KV_LIST=$(npx wrangler kv namespace list --json 2>&1)
    KV_PREVIEW_ID=$(echo "$KV_LIST" | jq -r '.[] | select(.title | contains("MONET_KV")) | select(.title | contains("preview")) | .id' | head -1)
else
    KV_PREVIEW_ID=$(echo "$KV_PREVIEW_OUTPUT" | grep "id" | head -1 | sed 's/.*= "\(.*\)"/\1/')
fi

echo "KV Preview Namespace ID: $KV_PREVIEW_ID"
echo ""

# Update wrangler.jsonc with actual IDs
echo "📝 Updating wrangler.jsonc with resource IDs..."

# Backup original
cp wrangler.jsonc wrangler.jsonc.backup

# Update D1 database_id
if [[ -n "$D1_ID" ]]; then
    sed -i.tmp "s/\"database_id\": \"TO_BE_CREATED\"/\"database_id\": \"$D1_ID\"/" wrangler.jsonc
    rm wrangler.jsonc.tmp
fi

# Update KV IDs
if [[ -n "$KV_ID" ]]; then
    sed -i.tmp "s/\"id\": \"TO_BE_CREATED\"/\"id\": \"$KV_ID\"/" wrangler.jsonc
    rm wrangler.jsonc.tmp
fi

if [[ -n "$KV_PREVIEW_ID" ]]; then
    sed -i.tmp "s/\"preview_id\": \"TO_BE_CREATED\"/\"preview_id\": \"$KV_PREVIEW_ID\"/" wrangler.jsonc
    rm wrangler.jsonc.tmp
fi

echo "✅ wrangler.jsonc updated"
echo ""

# Run database migrations
echo "🗃️  Running D1 migrations..."
npx wrangler d1 execute monet-db-dev --file=src/server/migrations/001_initial.sql
echo "✅ Database schema created"
echo ""

# Create .dev.vars file if it doesn't exist
if [ ! -f .dev.vars ]; then
    echo "📝 Creating .dev.vars file..."
    cat > .dev.vars << 'EOF'
# Gemini API Key (required)
# Get your key from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your-gemini-api-key-here

# Environment
ENVIRONMENT=development
EOF
    echo "✅ Created .dev.vars - Please add your Gemini API key"
else
    echo "ℹ️  .dev.vars already exists"
fi

echo ""
echo "✨ Cloudflare setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Add your Gemini API key to .dev.vars"
echo "   Get it from: https://aistudio.google.com/app/apikey"
echo ""
echo "2. Start the dev server:"
echo "   bun run dev"
echo ""
echo "3. Your resources:"
echo "   - D1 Database: monet-db-dev ($D1_ID)"
echo "   - R2 Buckets: monet-media-dev, monet-renders-dev"
echo "   - KV Namespace: MONET_KV ($KV_ID)"
