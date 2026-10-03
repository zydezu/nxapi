#!/usr/bin/env bash
# Usage: ./build.sh [--install] [electron-builder linux targets...]   (default target: appimage)
set -euo pipefail

cd "$(dirname "$0")"

install=false
targets=()
for arg in "$@"; do
    case "$arg" in
        --install) install=true ;;
        *) targets+=("$arg") ;;
    esac
done
[ ${#targets[@]} -eq 0 ] && targets=(appimage)

env_file="${NXAPI_DATA_PATH:-$HOME/.local/share/nxapi-nodejs}/.env"
if [ -z "${NXAPI_AUTH_CLIENT_ID:-}" ] && [ -f "$env_file" ]; then
    NXAPI_AUTH_CLIENT_ID="$(grep -m1 '^NXAPI_AUTH_CLIENT_ID=' "$env_file" | cut -d= -f2- || true)"
fi
if [ -z "${NXAPI_AUTH_CLIENT_ID:-}" ]; then
    echo "warning: NXAPI_AUTH_CLIENT_ID not set and not found in $env_file; the build won't have a client ID embedded" >&2
fi

export NXAPI_AUTH_CLI_CLIENT_ID="${NXAPI_AUTH_CLIENT_ID:-}"
export NXAPI_AUTH_APP_CLIENT_ID="${NXAPI_AUTH_CLIENT_ID:-}"

rm -rf dist/app/package

npx tsc
NODE_ENV=production npx rollup --config
npx electron-builder build --linux "${targets[@]}" --publish never

version="$(node -p "require('./package.json').version")"
appimage="dist/app/package/nxapi-$version.AppImage"

if $install; then
    if [ ! -f "$appimage" ]; then
        echo "error: --install needs the appimage target" >&2
        exit 1
    fi
    if pgrep -f 'nxapi-app|Nintendo Switch Online' > /dev/null; then
        echo "error: nxapi is running; quit it (including from the tray) and run again" >&2
        exit 1
    fi
    mkdir -p "$HOME/Applications"
    cp "$appimage" "$HOME/Applications/nxapi"
    echo "Installed to ~/Applications/nxapi"
fi

echo "Built:"
ls -1 dist/app/package/ | grep -v -E '^(linux-unpacked|.*\.ya?ml|.*\.blockmap)$' | sed 's|^|  dist/app/package/|'
