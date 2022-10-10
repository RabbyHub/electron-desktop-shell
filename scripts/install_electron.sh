#!/usr/bin/env sh

if [ -z "$ELECTRON_VER" ]; then
  echo "[install_electron.sh] no ELECTRON_VER specified, we don't need install another version electron"
  exit 0
fi

./node_modules/.bin/lerna add electron@$ELECTRON_VER --no-ci -D --scope=*/electron-chrome-extensions

echo "[install_electron.sh] check installed electron version:";
npm ls electron --prefix=packages/electron-chrome-extensions;

echo "[install_electron.sh] done";
