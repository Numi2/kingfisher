#!/usr/bin/env bash
set -euo pipefail

cat .source/part-* > /tmp/kingfisher-source.b64
base64 --decode /tmp/kingfisher-source.b64 > /tmp/kingfisher-source.zip
rm -rf /tmp/kingfisher-unpacked
mkdir -p /tmp/kingfisher-unpacked
unzip -q /tmp/kingfisher-source.zip -d /tmp/kingfisher-unpacked
APP_ROOT="$(find /tmp/kingfisher-unpacked -mindepth 1 -maxdepth 1 -type d | head -n 1)"

test -n "$APP_ROOT"
test -f "$APP_ROOT/package.json"
test -d "$APP_ROOT/app"

cp -a "$APP_ROOT"/. ./
npm install --legacy-peer-deps
