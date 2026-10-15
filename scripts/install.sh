#!/bin/sh
# Installs or updates DesignOS from the latest GitHub release:
#   curl -fsSL https://github.com/dhruv465/DesignOS/releases/latest/download/install.sh | sh
# DesignOS isn't notarized. curl doesn't quarantine what it downloads, and the quarantine
# flag is cleared anyway, so macOS opens it without the "could not verify" block.
set -eu

if [ -t 1 ] && [ "${TERM:-}" != "dumb" ]; then
  BOLD=$(printf '\033[1m')
  DIM=$(printf '\033[2m')
  RESET=$(printf '\033[0m')
  CYAN=$(printf '\033[36m')
  GREEN=$(printf '\033[32m')
  MAGENTA=$(printf '\033[35m')
  YELLOW=$(printf '\033[33m')
  BLUE=$(printf '\033[34m')
else
  BOLD=""
  DIM=""
  RESET=""
  CYAN=""
  GREEN=""
  MAGENTA=""
  YELLOW=""
  BLUE=""
fi

# Print DesignOS banner
printf "\n"
printf "  ${BOLD}${CYAN} ____            _               ___  ____  ${RESET}\n"
printf "  ${BOLD}${CYAN}|  _ \  ___  ___(_) __ _ _ __   / _ \/ ___| ${RESET}\n"
printf "  ${BOLD}${CYAN}| | | |/ _ \/ __| |/ _\` | '_ \ | | | \___ \ ${RESET}\n"
printf "  ${BOLD}${CYAN}| |_| |  __/\__ \ | (_| | | | || |_| |___) |${RESET}\n"
printf "  ${BOLD}${CYAN}|____/ \___||___/_|\__, |_| |_(_)___/|____/ ${RESET}\n"
printf "  ${DIM}${CYAN}                   |___/                    ${RESET}\n"
printf "  ${BOLD}A local-first design reference library for your Mac.${RESET}\n"
printf "  ${DIM}Save what catches your eye. Find it when it matters.${RESET}\n\n"

[ "$(uname -s)/$(uname -m)" = "Darwin/arm64" ] || { echo "DesignOS needs a Mac with Apple Silicon." >&2; exit 1; }
dir=/Applications
[ -w "$dir" ] || { dir="$HOME/Applications"; mkdir -p "$dir"; } # standard (non-admin) accounts
app="$dir/DesignOS.app"
tmp=$(mktemp -d)
stage=$(mktemp -d "$dir/.designos-install.XXXXXX")
trap 'rm -rf "$tmp"; if [ ! -e "$stage/previous.app" ]; then rm -rf "$stage"; fi' EXIT

printf "  ${CYAN}↓${RESET} Downloading DesignOS release for Apple Silicon…\n"
curl -fL --progress-bar https://github.com/dhruv465/DesignOS/releases/latest/download/DesignOS-arm64.zip -o "$tmp/DesignOS.zip"

printf "  ${CYAN}📦${RESET} Extracting application bundle…\n"
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

printf "  ${CYAN}✨${RESET} Clearing macOS gatekeeper quarantine…\n"
xattr -dr com.apple.quarantine "$app" 2>/dev/null || true

printf "  ${GREEN}✔${RESET} ${BOLD}Installed DesignOS in %s.${RESET}\n\n" "$dir"

# Cool things showcase once installed
printf "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "  ${BOLD}✦ Welcome to DesignOS — Here's what you can do:${RESET}\n"
printf "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${MAGENTA}✦${RESET} ${BOLD}Masonry Reference Library${RESET}\n"
printf "    ${DIM}Collect images, videos, and visual ideas in one place.${RESET}\n"
printf "    ${DIM}Local-first, lightning-fast, and private on your Mac.${RESET}\n\n"

printf "  ${CYAN}✦${RESET} ${BOLD}Spaces — Freeform Canvas${RESET}\n"
printf "    ${DIM}Compose moodboards with images, typography, notes & palettes.${RESET}\n"
printf "    ${DIM}Export your direction as crisp PNG or SVG boards.${RESET}\n\n"

printf "  ${YELLOW}✦${RESET} ${BOLD}Color & Visual Search${RESET}\n"
printf "    ${DIM}Filter references by extracted color tones, search inside text${RESET}\n"
printf "    ${DIM}with OCR, or find by semantic aesthetic meaning.${RESET}\n\n"

printf "  ${BLUE}✦${RESET} ${BOLD}Browser Extension & 1-Click Clip${RESET}\n"
printf "    ${DIM}Save full pages, images, and social posts directly from${RESET}\n"
printf "    ${DIM}Chrome, Arc, Brave & Edge. (Settings → Extension)${RESET}\n\n"

printf "  ${GREEN}✦${RESET} ${BOLD}AI Context with MCP${RESET}\n"
printf "    ${DIM}Connect Claude, Cursor, or AI coding agents to search your${RESET}\n"
printf "    ${DIM}saved design library automatically. (Settings → AI tools)${RESET}\n\n"

printf "  ${DIM}────────────────────────────────────────────────────────────${RESET}\n"
printf "  ${BOLD}Quick Start:${RESET} ${DIM}Drop images onto the window or press${RESET} ${BOLD}⌘O${RESET} ${DIM}to import.${RESET}\n"
printf "  ${DIM}────────────────────────────────────────────────────────────${RESET}\n\n"

printf "  ${GREEN}🚀${RESET} Launching %s…\n\n" "$app"
open "$app"
