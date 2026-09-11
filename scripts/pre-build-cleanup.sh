#!/bin/bash
# Pre-build cleanup script to free memory before Docker builds
# Usage: ./scripts/pre-build-cleanup.sh [--build]

set -e

echo "=== Pre-Build Memory Cleanup ==="
echo ""

# 1. Stop Docker containers
echo ">> Stopping Docker containers..."
docker compose down || true
echo ""

# 2. Docker cleanup
echo ">> Cleaning Docker resources..."
docker system prune -f
docker builder prune -f
docker image prune -f
echo ""

# 3. Sync filesystem before clearing cache
echo ">> Syncing filesystem..."
sync

# 4. Clear page cache (requires sudo)
echo ">> Clearing page cache..."
sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches' || echo "   (requires sudo - skipped)"
echo ""

# 5. Restart swap
echo ">> Restarting swap..."
sudo swapoff -a && sudo swapon -a || echo "   (requires sudo - skipped)"
echo ""

# 6. Show current status
echo "=== Current Status ==="
echo ""
echo ">> Memory:"
free -h
echo ""
echo ">> Disk:"
df -h /
echo ""

# 7. Optional: run build
if [ "$1" = "--build" ]; then
    echo "=== Starting Docker Build ==="
    docker compose build --no-cache
    docker compose up -d
    echo ""
    echo "Build complete!"
else
    echo "Ready to build. Run: docker compose build --no-cache"
fi
