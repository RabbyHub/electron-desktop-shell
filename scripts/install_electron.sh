#!/usr/bin/env sh

# Switches:
# ELECTRON_VER=^16.0.0 sh ./scripts/install_electron.sh
# ELECTRON_VER=^17.0.0 sh ./scripts/install_electron.sh
# ELECTRON_VER=^18.0.0 sh ./scripts/install_electron.sh
# ELECTRON_VER=^19.0.0 sh ./scripts/install_electron.sh
# ELECTRON_VER=^20.0.0 sh ./scripts/install_electron.sh
# ELECTRON_VER=^21.0.0 sh ./scripts/install_electron.sh

if [ -z "$ELECTRON_VER" ]; then
  echo "[install_electron.sh] no ELECTRON_VER specified, we don't need install another version electron"
  exit 0
fi

./node_modules/.bin/lerna add electron@$ELECTRON_VER --no-ci -D --scope=*/electron-chrome-extensions

echo "[install_electron.sh] check installed electron version:";
npm ls electron --prefix=packages/electron-chrome-extensions;

echo "[install_electron.sh] done";
