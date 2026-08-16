#!/usr/bin/env bash
# Downloads the blog's demo photographs into assets/media/.
#
# A one-time developer tool, NOT part of any runtime path: the images are
# committed, so bootstrap never touches the network. Re-running this should
# produce no git diff — the Picsum IDs are fixed, so every clone and every run
# gets byte-identical photographs.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/assets/media"
mkdir -p "$DEST"

# name|picsum id|width|height
FILES="
cover-schema.jpg|1015|1600|900
cover-modeling.jpg|180|1600|900
cover-css.jpg|1073|1600|900
figure-components.jpg|1050|1600|900
avatar-asim.jpg|1005|600|600
avatar-hassan.jpg|1012|600|600
"

echo "$FILES" | while IFS='|' read -r name id w h; do
  [ -z "$name" ] && continue
  url="https://picsum.photos/id/$id/$w/$h"
  printf 'fetching %-24s <- %s\n' "$name" "$url"
  curl -sSL --fail -o "$DEST/$name" "$url"
done

echo
ls -l "$DEST"/*.jpg | awk '{print $5, $NF}'
