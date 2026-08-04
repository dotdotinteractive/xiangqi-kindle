#!/bin/bash
#
# build.sh - Package Xiangqi for Kindle distribution
#
# Usage: ./build.sh
#
# Output: dist/xiangqi-kindle.zip
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
DATE=$(date +%Y%m%d)
ZIP_NAME="dist/xiangqi-kindle-${VERSION}.zip"
ZIP_GENERIC="dist/xiangqi-kindle.zip"

echo "=========================================="
echo "  Xiangqi 象棋 - Build Script"
echo "  Version: $VERSION"
echo "=========================================="
echo ""

# Check required files exist
REQUIRED_FILES=(
    "index.html"
    "main.js"
    "main.css"
    "config.xml"
    "assets/wukong.js"
    "kual_extension/menu.json"
    "kual_extension/config.xml"
    "kual_extension/bin/launch.sh"
)

echo "[1/5] Checking source files..."
for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "  ERROR: Missing $f"
        exit 1
    fi
    echo "  OK: $f"
done
echo ""

# Create staging directory
STAGING=$(mktemp -d)
trap "rm -rf $STAGING" EXIT

echo "[2/5] Staging files..."
mkdir -p "$STAGING/xiangqi/documents/xiangqi/assets"
mkdir -p "$STAGING/xiangqi/extensions/xiangqi/bin"

# Web app files
cp index.html main.js main.css config.xml "$STAGING/xiangqi/documents/xiangqi/"
cp assets/wukong.js "$STAGING/xiangqi/documents/xiangqi/assets/"

# KUAL extension
cp kual_extension/menu.json "$STAGING/xiangqi/extensions/xiangqi/"
cp kual_extension/config.xml "$STAGING/xiangqi/extensions/xiangqi/"
cp kual_extension/bin/launch.sh "$STAGING/xiangqi/extensions/xiangqi/bin/"

# Install instructions
cp dist/INSTALL.txt "$STAGING/xiangqi/"

echo "  Staged $(find "$STAGING" -type f | wc -l) files"
echo ""

# Show structure
echo "[3/5] Package structure:"
( cd "$STAGING" && find xiangqi -type f | sort | sed 's/^/  /' )
echo ""

# Create dist directory
mkdir -p dist

# Remove old zips
echo "[4/5] Creating zip..."
rm -f "$ZIP_NAME" "$ZIP_GENERIC"

( cd "$STAGING" && zip -r -q "$SCRIPT_DIR/$ZIP_NAME" xiangqi/ )
cp "$ZIP_NAME" "$ZIP_GENERIC"

echo "  Created: $ZIP_NAME"
echo "  Created: $ZIP_GENERIC"
echo ""

# Show result
echo "[5/5] Done!"
echo ""
echo "  Output:"
ls -lh dist/*.zip | sed 's/^/    /'
echo ""
echo "  To distribute: upload dist/xiangqi-kindle.zip to the forum"
echo "  Users unzip and copy xiangqi/documents/ and xiangqi/extensions/"
echo "  to their Kindle root directory."
echo ""
