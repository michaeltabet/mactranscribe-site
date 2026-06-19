#!/bin/bash
# Build the Astro SSR site container image and push it to the registry.
# The site is now server-rendered (auth + billing + dashboard), so it ships as a
# Node image, not a static nginx ConfigMap. Argo syncs k8s/site.yaml; this script
# only handles the image. Bump the tag in k8s/site.yaml (or have CI patch it) to
# roll a new build.
#
# Usage:
#   ./build-site.sh [TAG]
# Env:
#   IMAGE   full image ref (default: ghcr.io/michaeltabet/mactranscribe-site)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/michaeltabet/mactranscribe-site}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
REF="${IMAGE}:${TAG}"

echo "Building ${REF} ..."
docker build -t "${REF}" -t "${IMAGE}:latest" .

echo "Pushing ${REF} ..."
docker push "${REF}"
docker push "${IMAGE}:latest"

echo
echo "Pushed ${REF}"
echo "Next: set 'image: ${REF}' in k8s/site.yaml and commit — Argo will sync."
