#!/usr/bin/env bash
#
# sign-chromium-macos.sh <Chromium.app> <signing-identity> <entitlements.plist>
#
# Codesign a bundled Chromium.app for Apple notarization. Unlike the bundled
# node/git (single relocatable Mach-O files), Chromium.app is a deep app bundle:
# a main executable, a versioned framework, and several helper .app bundles
# (GPU/Renderer/Plugin/…). Notarization requires EVERY nested Mach-O AND every
# nested bundle (.app/.framework) to be signed with a Developer ID + hardened
# runtime + a secure timestamp, signed INSIDE-OUT (deepest first), with the JIT /
# unsigned-memory / library-validation entitlements Chromium's V8 + sandbox need
# on the main app and the helpers.
#
# We can't use a single `--deep` pass: --deep does not propagate entitlements to
# nested bundles, so the helper processes would be killed at runtime. So we sign
# each Mach-O file, then each nested bundle deepest-first, applying the
# entitlements to every code object.
set -euo pipefail

APP="${1:?usage: sign-chromium-macos.sh <Chromium.app> <identity> <entitlements>}"
ID="${2:?missing signing identity}"
ENT="${3:?missing entitlements plist}"

if [[ ! -d "${APP}" ]]; then
  echo "ERROR: app bundle not found: ${APP}"
  exit 1
fi

sign() {
  codesign --force --timestamp --options runtime --entitlements "${ENT}" --sign "${ID}" "$1"
}

echo "=== Signing Chromium: ${APP} ==="

# 1. Every nested Mach-O file (dylibs, .so, framework binaries, helper execs),
#    deepest-first so a parent is never signed before its children.
file_count=0
while IFS= read -r f; do
  if file "$f" | grep -q "Mach-O"; then
    sign "$f"
    file_count=$((file_count + 1))
  fi
done < <(find "${APP}" -depth -type f)
echo "Signed ${file_count} nested Mach-O files"

# 2. Every nested bundle (.app / .framework) deepest-first. `find -depth` lists
#    the top Chromium.app LAST, so the whole tree is sealed inside-out in one pass.
bundle_count=0
while IFS= read -r b; do
  sign "$b"
  bundle_count=$((bundle_count + 1))
done < <(find "${APP}" -depth \( -name "*.app" -o -name "*.framework" \) -type d)
echo "Signed ${bundle_count} nested bundles (helpers + frameworks + main app)"

# 3. Verify the seal.
codesign --verify --deep --strict --verbose=2 "${APP}"
echo "Chromium signed + verified OK"
