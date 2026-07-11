# Dockerfile for Monet Editly Render Container
# Uses FFmpeg with xfade transitions (no gl-transitions needed)

FROM node:20-bookworm-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy render script
COPY render.js ./render.js

# Set environment
ENV NODE_ENV=production

# Default command
CMD ["node", "render.js"]
