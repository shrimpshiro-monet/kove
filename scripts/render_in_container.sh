#!/bin/bash
# render_in_container.sh
# Render EDL to MP4 using Docker container with gl-transitions support.
#
# Usage:
#   ./scripts/render_in_container.sh <edl.json> <footage_dir> [output.mp4]
#
# Example:
#   ./scripts/render_in_container.sh output/my-edit-edl.json ./testfiles output/my-edit.mp4

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker/render"

# Parse arguments
EDL_PATH="${1:?Usage: $0 <edl.json> <footage_dir> [output.mp4]}"
FOOTAGE_DIR="${2:?Usage: $0 <edl.json> <footage_dir> [output.mp4]}"
OUTPUT_PATH="${3:-$(dirname "$EDL_PATH")/$(basename "$EDL_PATH" .json)-render.mp4}"

# Convert to absolute paths
EDL_PATH="$(cd "$(dirname "$EDL_PATH")" && pwd)/$(basename "$EDL_PATH")"
FOOTAGE_DIR="$(cd "$FOOTAGE_DIR" && pwd)"
OUTPUT_PATH="$(cd "$(dirname "$OUTPUT_PATH")" && pwd)/$(basename "$OUTPUT_PATH")"

echo "=== Monet Docker Render ==="
echo "EDL: $EDL_PATH"
echo "Footage: $FOOTAGE_DIR"
echo "Output: $OUTPUT_PATH"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker not installed"
    echo "Install: https://docs.docker.com/get-docker/"
    exit 1
fi

# Build container if needed
IMAGE_NAME="monet-render"
if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
    echo "Building render container..."
    docker build -t "$IMAGE_NAME" "$DOCKER_DIR"
    echo ""
fi

# Run render
echo "Starting render in container..."
docker run --rm \
    -v "$EDL_PATH:/data/edl.json:ro" \
    -v "$FOOTAGE_DIR:/data/footage:ro" \
    -v "$OUTPUT_PATH:/data/output.mp4" \
    -e EDL_PATH=/data/edl.json \
    -e OUTPUT_PATH=/data/output.mp4 \
    -e FOOTAGE_DIR=/data/footage \
    "$IMAGE_NAME"

echo ""
echo "=== Render Complete ==="
echo "Output: $OUTPUT_PATH"
ls -lh "$OUTPUT_PATH" 2>/dev/null || echo "Warning: Output file not found"
