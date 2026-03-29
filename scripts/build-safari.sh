#!/bin/bash

# ===============================
#
#   THIS ⬇︎ IS VIBE-CODED 
#
# ===============================
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the project root (parent of scripts directory)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root
cd "$PROJECT_ROOT"

# Configuration
SOURCE_DIR="src/dist/chrome"
OUTPUT_DIR="src/dist/safari"
OUTPUT_FILE="expire-tabs.appex"
TEMP_DIR=$(mktemp -d)
PROJECT_DIR="$TEMP_DIR/safari-project"
BUILD_DIR="$TEMP_DIR/build"

# Cleanup function
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Convert extension to Xcode project
echo "📦 Converting extension to Xcode project..."
xcrun safari-web-extension-converter "$SOURCE_DIR" \
    --project-location "$PROJECT_DIR" \
    --app-name "Expire Tabs" \
    --bundle-identifier "com.expiretabs.extension" \
    --macos-only \
    --swift \
    --no-open \
    --no-prompt \
    --force \
    --copy-resources

# Find the Xcode project
XCODE_PROJECT=$(find "$PROJECT_DIR" -name "*.xcodeproj" | head -1)
if [ -z "$XCODE_PROJECT" ]; then
    echo "❌ Error: Xcode project not found"
    exit 1
fi

PROJECT_NAME=$(basename "$XCODE_PROJECT" .xcodeproj)
PROJECT_DIR_PATH=$(dirname "$XCODE_PROJECT")

# Build the Xcode project
echo "🔨 Building Xcode project..."
cd "$PROJECT_DIR_PATH"
if ! xcodebuild -project "$PROJECT_NAME.xcodeproj" \
    -scheme "$PROJECT_NAME" \
    -configuration Release \
    -derivedDataPath "$BUILD_DIR" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    clean build; then
    echo "❌ Error: Xcode build failed"
    exit 1
fi

# Find the built .appex file (it's inside the .app bundle)
APPEX_PATH=$(find "$BUILD_DIR/Build/Products/Release" -name "*.appex" -type d | head -1)
if [ -z "$APPEX_PATH" ]; then
    echo "❌ Error: .appex file not found in build output"
    echo "   Searched in: $BUILD_DIR/Build/Products/Release"
    echo "   Available files:"
    find "$BUILD_DIR/Build/Products/Release" -type d -maxdepth 3 | head -20
    exit 1
fi

echo "   Found .appex at: $APPEX_PATH"

# Copy .appex to output directory
echo "📋 Copying .appex to output directory..."
cd "$PROJECT_ROOT"
rm -rf "$OUTPUT_DIR/$OUTPUT_FILE"
cp -R "$APPEX_PATH" "$OUTPUT_DIR/$OUTPUT_FILE"

echo "✅ Safari extension built successfully: $OUTPUT_DIR/$OUTPUT_FILE"
