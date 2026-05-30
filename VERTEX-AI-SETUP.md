## Vertex AI Setup (GCP Credits)

**Why Vertex AI over Gemini API?**
- Gemini API free tier: 20 requests/day (hit limit in testing)
- Vertex AI: Enterprise limits, GCP credits, production-ready
- Same Gemini models, better infrastructure

### Setup Steps

#### 1. Enable Vertex AI in GCP Console

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Or via console:
# https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
```

#### 2. Set up Application Default Credentials (Easiest)

```bash
# Login with your GCP account
gcloud auth application-default login

# This creates credentials at:
# ~/.config/gcloud/application_default_credentials.json
```

#### 3. Configure .dev.vars

Create `.dev.vars` in project root:

```
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
ENVIRONMENT=development
```

**That's it!** The Vertex AI SDK will automatically use your application default credentials.

#### 4. Verify Setup

```bash
# Start dev server
bun dev

# Make a test request - should see:
# "Using Vertex AI (GCP) for Gemini models"
```

### Alternative: Service Account (Production)

For production/CI:

1. Create service account:
```bash
gcloud iam service-accounts create monet-ai \
  --display-name="Monet AI Director"
```

2. Grant Vertex AI permissions:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:monet-ai@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

3. Create and download key:
```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=monet-ai@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

4. Add to .dev.vars:
```
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GCP_CREDENTIALS={"type":"service_account","project_id":"..."}
```

### Cost Estimate

**Gemini 2.0 Flash via Vertex AI:**
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

**Per edit (with caching):**
- Intent: ~1k tokens → $0.0004
- Analysis: ~2k tokens → $0.0008
- EDL: ~1k tokens → $0.0004
- **Total: ~$0.0016 per edit**

**With $300 GCP credits:**
- ~187,500 edits
- More than enough for development + testing

### Troubleshooting

**"GCP_PROJECT_ID not found"**
- Check `.dev.vars` exists and has correct format
- Restart dev server after changing .dev.vars

**"Permission denied" errors**
- Run `gcloud auth application-default login`
- Or check service account has `roles/aiplatform.user`

**"Model not found"**
- Verify Vertex AI API is enabled
- Check region supports gemini-2.0-flash-exp (us-central1 does)

### Switching Between Vertex AI and Gemini API

The system auto-detects which service to use:

1. **Vertex AI** (if `GCP_PROJECT_ID` set)
2. **Gemini API** (if `GEMINI_API_KEY` set)
3. **Error** (if neither set)

To switch back to Gemini API:
```
# Comment out Vertex config
# GCP_PROJECT_ID=...

# Add Gemini key
GEMINI_API_KEY=your-key
```

### Available Models

Via Vertex AI:
- `gemini-2.0-flash-exp` (default) - Latest, fastest
- `gemini-1.5-flash` - Stable
- `gemini-1.5-pro` - Most capable
- `gemini-1.0-pro` - Legacy

Current config uses `gemini-2.0-flash-exp` for best performance.
