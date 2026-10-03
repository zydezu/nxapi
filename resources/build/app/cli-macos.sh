#!/bin/sh

# Run as nxapi.app/Contents/bin/nxapi

APP_BUNDLE_PATH="$(dirname "$0")/../.."
export ELECTRON_RUN_AS_NODE=1

exec "$APP_BUNDLE_PATH/Contents/MacOS/nxapi" "$APP_BUNDLE_PATH/Contents/Resources/app/dist/bundle/cli-bundle.js" $@
