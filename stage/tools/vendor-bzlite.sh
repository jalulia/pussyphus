#!/bin/sh
# Copies the Desktop Bo engine subset the stage needs out of a checkout of the private repo jalulia/bo.
# The engine stays out of this public repo; run this once after cloning.
#   sh stage/tools/vendor-bzlite.sh /path/to/bo
set -eu
BO=${1:?usage: vendor-bzlite.sh /path/to/jalulia-bo-checkout}
PIN=95296a5
HERE=$(cd "$(dirname "$0")/.." && pwd)
OUT="$HERE/bzlite"
git -C "$BO" cat-file -e "$PIN^{commit}" 2>/dev/null || { echo "jalulia/bo commit $PIN not found in $BO (fetch it first)"; exit 1; }
mkdir -p "$OUT"
for f in raster.js cat.js font-data.js rex.js; do git -C "$BO" show "$PIN:src/$f" > "$OUT/$f"; done
{ git -C "$BO" show "$PIN:src/world.js" | head -n 1256
  echo '  BZ.Cat = Cat; BZ.FRAME = FRAME; // Desktop Bo world.js lines 1-1256 (the Cat), World class left out for the stage'
  echo '})();'; } > "$OUT/world-cat.js"
echo "vendored jalulia/bo@$PIN into $OUT"
(cd "$OUT" && sha256sum raster.js cat.js font-data.js rex.js world-cat.js)
