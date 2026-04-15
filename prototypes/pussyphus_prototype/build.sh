#!/bin/bash
# ════════════════════════════════════════
# PUSSYPHUS — build single-file HTML for distribution
# Inlines all ES modules into one <script> block
# Usage: ./build.sh [output.html]
# ════════════════════════════════════════

set -e

OUT="${1:-dist/pussyphus.html}"
mkdir -p "$(dirname "$OUT")"

# Use esbuild to bundle all modules into a single IIFE
# Falls back to a simple cat approach if esbuild isn't available

if command -v npx &> /dev/null && npx esbuild --version &> /dev/null 2>&1; then
  echo "→ Bundling with esbuild..."

  # Bundle all JS into one file, preserving the three.js external import
  npx esbuild src/main.js \
    --bundle \
    --format=esm \
    --external:three \
    --external:tone \
    --outfile=.build_tmp.js \
    --minify

  # Read the HTML, replace the module script tag with the bundled code
  python3 -c "
import re

with open('index.html', 'r') as f:
    html = f.read()

with open('.build_tmp.js', 'r') as f:
    js = f.read()

# Replace the src=\"src/main.js\" script tag with inline bundled code
html = re.sub(
    r'<script type=\"module\" src=\"src/main.js\"></script>',
    f'<script type=\"module\">\n{js}\n</script>',
    html
)

with open('$OUT', 'w') as f:
    f.write(html)

print(f'✓ Built → $OUT')
"

  rm -f .build_tmp.js

else
  echo "→ esbuild not found, using simple concatenation..."
  echo "  (install with: npm i -g esbuild)"

  # Simple fallback: concatenate modules in dependency order
  # This is fragile but works for quick sharing
  python3 << 'PYEOF'
import re, os

# Read all source files in dependency order
MODULE_ORDER = [
    "src/constants.js",
    "src/render/materials.js",
    "src/input.js",
    "src/render/scene.js",
    "src/render/dither.js",
    "src/world/escalator.js",
    "src/world/environment.js",
    "src/world/npcs.js",
    "src/cat/cat.js",
    "src/cat/catModel.js",
    "src/cat/catAnim.js",
    "src/ui/hud.js",
    "src/ui/titleScreen.js",
    "src/audio/fragments.generated.js",
    "src/audio/mixer.js",
    "src/audio/music.js",
    "src/audio/crowd.js",
    "src/main.js",
]

combined = []
for path in MODULE_ORDER:
    if not os.path.exists(path):
        print(f"  ⚠ Missing: {path}")
        continue
    with open(path) as f:
        code = f.read()
    # Strip import/export statements for naive concat
    # (This is lossy — use esbuild for real builds)
    code = re.sub(r'^import\s+.*?;\s*$', '', code, flags=re.MULTILINE)
    code = re.sub(r'^export\s+(let|const|function|class|default)\s+', r'\1 ', code, flags=re.MULTILINE)
    code = re.sub(r'^export\s+\{.*?\};\s*$', '', code, flags=re.MULTILINE)
    combined.append(f"// ═══ {path} ═══\n{code}")

js = "\n".join(combined)

with open("index.html") as f:
    html = f.read()

html = re.sub(
    r'<script type="module" src="src/main.js"></script>',
    f'<script type="module">\nimport * as THREE from \'three\';\n{js}\n</script>',
    html
)

with open("$OUT", "w") as f:
    f.write(html)

print(f"✓ Built (naive concat) → $OUT")
print("  ⚠ For production, install esbuild: npm i -g esbuild")
PYEOF

fi

echo "Done. File size: $(wc -c < "$OUT") bytes"
