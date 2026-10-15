#!/bin/sh
# Installs or updates DesignOS from the latest GitHub release:
#   curl -fsSL https://github.com/dhruv465/DesignOS/releases/latest/download/install.sh | sh
# DesignOS isn't notarized. curl doesn't quarantine what it downloads, and the quarantine
# flag is cleared anyway, so macOS opens it without the "could not verify" block.
set -eu
[ "$(uname -s)/$(uname -m)" = "Darwin/arm64" ] || { echo "DesignOS needs a Mac with Apple Silicon." >&2; exit 1; }
dir=/Applications
[ -w "$dir" ] || { dir="$HOME/Applications"; mkdir -p "$dir"; } # standard (non-admin) accounts
app="$dir/DesignOS.app"
tmp=$(mktemp -d)
stage=$(mktemp -d "$dir/.designos-install.XXXXXX")
trap 'rm -rf "$tmp"; if [ ! -e "$stage/previous.app" ]; then rm -rf "$stage"; fi' EXIT
echo "Downloading DesignOS…"
curl -fL --progress-bar https://github.com/dhruv465/DesignOS/releases/latest/download/DesignOS-arm64.zip -o "$tmp/DesignOS.zip"
ditto -x -k "$tmp/DesignOS.zip" "$tmp"
[ -f "$tmp/DesignOS.app/Contents/Info.plist" ] && [ -x "$tmp/DesignOS.app/Contents/MacOS/DesignOS" ] || { echo "Download has no valid DesignOS.app." >&2; exit 1; }
ditto "$tmp/DesignOS.app" "$stage/DesignOS.app"
# Quit both branded executables before replacing the app: they can share one
# existing library. SIGTERM closes it normally without an Automation prompt.
for running in DesignOS Magpie; do
  if pkill -x "$running"; then
    i=0
    while pgrep -xq "$running"; do
      i=$((i + 1)); [ "$i" -le 100 ] || { echo "Quit $running, then run this again." >&2; exit 1; }
      sleep 0.2
    done
  fi
done
if [ -e "$app" ]; then mv "$app" "$stage/previous.app"; fi
if ! mv "$stage/DesignOS.app" "$app"; then
  [ ! -e "$stage/previous.app" ] || mv "$stage/previous.app" "$app"
  echo "Installation failed; previous app restored." >&2
  exit 1
fi
rm -rf "$stage/previous.app"
xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
echo "Installed DesignOS in $dir."
open "$app"
