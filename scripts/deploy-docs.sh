#!/usr/bin/env bash
# Deploys docs/site (the Stripe workflow document) to Vercel as a static site,
# then stamps the resulting production URL into the document and the README.
#
# Only docs/site is uploaded. That is deliberate: docs/superpowers holds internal
# specs and plans, and deploying the repo root would publish them too.
#
# Requires an authenticated Vercel CLI. Authenticate once, interactively:
#   npx vercel login
# or export a token into this script's environment:
#   VERCEL_TOKEN=… scripts/deploy-docs.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/docs/site"
PROJECT="${VERCEL_PROJECT:-strapi-press-stripe-workflow}"
VERCEL="npx --yes vercel@latest"

TOKEN_ARG=""
if [ -n "${VERCEL_TOKEN:-}" ]; then
  TOKEN_ARG="--token $VERCEL_TOKEN"
fi

if ! $VERCEL whoami $TOKEN_ARG >/dev/null 2>&1; then
  echo "Not authenticated with Vercel." >&2
  echo "Run 'npx vercel login' first, or set VERCEL_TOKEN." >&2
  exit 1
fi

echo "==> Linking $SITE to project '$PROJECT'"
$VERCEL link --yes --cwd "$SITE" --project "$PROJECT" $TOKEN_ARG || exit 1

echo "==> Deploying to production"
raw="$($VERCEL deploy --prod --yes --cwd "$SITE" $TOKEN_ARG 2>/dev/null)"

# CLI v59 prints a JSON envelope; older versions printed a bare URL. Handle both.
url="$(printf '%s' "$raw" | python3 -c '
import json, re, sys
raw = sys.stdin.read()
try:
    print(json.loads(raw[raw.index("{"):])["deployment"]["url"])
except Exception:
    hits = re.findall(r"https://\S+", raw)
    print(hits[-1] if hits else "")
')"

case "$url" in
  https://*) ;;
  *) echo "Deploy did not return a URL. Raw output:" >&2; printf '%s\n' "$raw" >&2; exit 1 ;;
esac

# The per-deployment URL carries a random hash. The stable production alias is
# what belongs in the docs, so prefer it and fall back to the deployment URL.
alias_url="https://$PROJECT.vercel.app"
if ! curl -sSf -o /dev/null --max-time 15 "$alias_url"; then
  alias_url="$url"
fi

echo "==> Live at $alias_url"

# Stamp the URL into the document footer, replacing any previous stamp.
python3 - "$SITE/index.html" "$alias_url" <<'PY'
import re, sys
path, url = sys.argv[1], sys.argv[2]
html = open(path, encoding='utf-8').read()
line = f'  <br>Published at <a href="{url}">{url}</a>.\n'
html, n = re.subn(r'\n  <br>Published at <a href="[^"]*">[^<]*</a>\.\n', '\n' + line, html)
if not n:
    html = html.replace('</footer>', line + '</footer>', 1)
open(path, 'w', encoding='utf-8').write(html)
PY

python3 - "$ROOT/README.md" "$alias_url" <<'PY'
import re, sys
path, url = sys.argv[1], sys.argv[2]
try:
    md = open(path, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit(0)
line = f'- [Stripe payment workflow]({url}) — the full checkout flow, diagrammed and annotated line by line.\n'
md, n = re.subn(r'- \[Stripe payment workflow\]\([^)]*\)[^\n]*\n', line, md)
if not n:
    md = md.rstrip('\n') + '\n\n## Documentation\n\n' + line
open(path, 'w', encoding='utf-8').write(md)
PY

echo "==> Stamped the URL into docs/site/index.html and README.md"
echo
echo "Production URL: $alias_url"
