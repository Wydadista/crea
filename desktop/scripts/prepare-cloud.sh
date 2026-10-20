#!/usr/bin/env bash
# Linux cloud development only; Windows developers use the commands in README.md.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export NODE_USE_ENV_PROXY=1
npm ci --cache /tmp/crea-npm-cache --no-audit --no-fund
electron_config_cache=/tmp/crea-electron-cache node node_modules/electron/install.js
if ! command -v Xvfb >/dev/null && [[ ! -x .local-tools/bin/Xvfb ]]; then
  task_apt=$(mktemp -d /tmp/crea-apt-XXXXXX)
  trap 'rm -rf "$task_apt"' EXIT
  mkdir -p "$task_apt/lists/partial" "$task_apt/cache/archives/partial" "$task_apt/packages" .local-tools/bin
  cat > "$task_apt/sources.list" <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
SOURCES
  apt_options=(-o "Dir::Etc::sourcelist=$task_apt/sources.list" -o Dir::Etc::sourceparts=- -o "Dir::State::lists=$task_apt/lists" -o "Dir::Cache=$task_apt/cache" -o Debug::NoLocking=true -o Acquire::Retries=0)
  /usr/bin/apt-get "${apt_options[@]}" update
  (cd "$task_apt/packages" && /usr/bin/apt-get "${apt_options[@]}" download xvfb)
  for package in "$task_apt"/packages/*.deb; do dpkg-deb -x "$package" "$task_apt/root"; done
  cp "$task_apt/root/usr/bin/Xvfb" .local-tools/bin/Xvfb
fi
