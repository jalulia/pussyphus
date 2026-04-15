#!/bin/bash
# ════════════════════════════════════════
# PUSSYPHUS — Preflight Consistency Checker
# Run from the Pussyphus/ root directory
# Usage: ./preflight.sh
# ════════════════════════════════════════

set -e

PASS=0
WARN=0
FAIL=0
DIR="$(cd "$(dirname "$0")" && pwd)"

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; PASS=$((PASS+1)); }
yellow() { printf "\033[33m⚠ %s\033[0m\n" "$1"; WARN=$((WARN+1)); }
red() { printf "\033[31m✗ %s\033[0m\n" "$1"; FAIL=$((FAIL+1)); }

echo "═══ PUSSYPHUS Preflight ═══"
echo ""

# ── 1. Breed consistency: no "Siamese" in active files ──
echo "── Breed Consistency ──"
# Look for "Siamese" that ISN'T in a correction context
# Exclude: "NOT Siamese", "Siamese →", "from PF Magic Siamese data", archive descriptions, changelog entries
STALE_HITS=$(grep -rn "Siamese" \
  "$DIR/PUSSYPHUS_StateOfGameDesign_V1.md" \
  "$DIR/prototypes/pussyphus_character_study.html" \
  "$DIR/prototypes/pussyphus_prototype/src/" \
  "$DIR/prototypes/pussyphus_prototype/index.html" \
  2>/dev/null \
  | grep -vi "NOT.*Siamese" \
  | grep -v "Siamese →" \
  | grep -v "from PF Magic Siamese data" \
  | grep -v "archive/" \
  | grep -v "Still has Siamese" \
  || true)

if [ -z "$STALE_HITS" ]; then
  green "No stale 'Siamese' references in active source/GDD files"
else
  red "Found stale 'Siamese' in active files:"
  echo "$STALE_HITS" | while read -r line; do
    echo "    $line"
  done
fi

# ── 2. Modular source integrity ──
echo ""
echo "── Source Modules ──"
EXPECTED_MODULES=(
  "src/main.js"
  "src/constants.js"
  "src/input.js"
  "src/cat/cat.js"
  "src/cat/catModel.js"
  "src/cat/catAnim.js"
  "src/world/escalator.js"
  "src/world/environment.js"
  "src/world/npcs.js"
  "src/render/materials.js"
  "src/render/scene.js"
  "src/render/dither.js"
  "src/ui/hud.js"
  "src/ui/titleScreen.js"
  "src/audio/mixer.js"
  "src/audio/music.js"
  "src/audio/crowd.js"
  "src/audio/fragments.generated.js"
)

PROTO="$DIR/prototypes/pussyphus_prototype"
for mod in "${EXPECTED_MODULES[@]}"; do
  if [ -f "$PROTO/$mod" ]; then
    green "$mod exists"
  else
    red "$mod MISSING"
  fi
done

# ── 3. Build script ──
echo ""
echo "── Build Script ──"
if [ -f "$PROTO/build.sh" ]; then
  green "build.sh exists"
  if [ -x "$PROTO/build.sh" ]; then
    green "build.sh is executable"
  else
    yellow "build.sh is not executable (run: chmod +x build.sh)"
  fi
else
  red "build.sh MISSING"
fi

# ── 4. Key files present ──
echo ""
echo "── Project Files ──"
for f in \
  "$DIR/PUSSYPHUS_StateOfGameDesign_V1.md" \
  "$DIR/CLAUDE.md" \
  "$DIR/CHANGELOG.md" \
  "$DIR/THE_PUSSYPHUS_Bo_Character.jpg" \
  "$DIR/prototypes/pussyphus_character_study.html" \
  "$PROTO/index.html" \
  "$PROTO/README.md"; do
  if [ -f "$f" ]; then
    green "$(basename "$f") exists"
  else
    red "$(basename "$f") MISSING"
  fi
done

# ── 5. GDD version check ──
echo ""
echo "── GDD Version ──"
GDD_VER=$(grep -m1 "^\*\*Version:\*\*" "$DIR/PUSSYPHUS_StateOfGameDesign_V1.md" 2>/dev/null || echo "not found")
echo "  $GDD_VER"

# ── 6. Three.js import check ──
echo ""
echo "── Three.js Import ──"
if grep -q "three.js/r128" "$PROTO/index.html" 2>/dev/null; then
  green "index.html imports Three.js r128"
else
  yellow "Three.js version may have changed in index.html"
fi

# ── Summary ──
echo ""
echo "═══════════════════════════"
printf "  \033[32m%d passed\033[0m  " "$PASS"
printf "\033[33m%d warnings\033[0m  " "$WARN"
printf "\033[31m%d failed\033[0m\n" "$FAIL"
echo "═══════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
