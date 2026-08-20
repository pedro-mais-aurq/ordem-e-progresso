#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

if command -v timeout >/dev/null 2>&1; then
  timeout_bin="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  timeout_bin="gtimeout"
else
  echo "build-verified.sh requires GNU timeout (timeout or gtimeout)." >&2
  exit 69
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
"${timeout_bin}" \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

# Vinext gera o Worker e os assets, mas não copia metadados do projeto.
# Empacote o manifesto já versionado antes da validação do artifact.
mkdir -p "${SITES_PROJECT_ROOT}/dist/.openai"
cp \
  "${SITES_PROJECT_ROOT}/.openai/hosting.json" \
  "${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"

"${script_dir}/validate-artifact.sh"
