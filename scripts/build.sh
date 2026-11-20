#!/usr/bin/env bash
# Build the Ootle Split template to WASM with local paths stripped from the binary.
# Output: dist/ootle_split.wasm (+ .sha256)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CARGO_HOME_DIR="${CARGO_HOME:-$HOME/.cargo}"
cd "$ROOT/template"
# Windows (Git Bash) paths appear in the binary in native form, so remap both spellings.
NATIVE_CARGO="$(cygpath -w "$CARGO_HOME_DIR" 2>/dev/null || echo "$CARGO_HOME_DIR")"
NATIVE_ROOT="$(cygpath -w "$ROOT" 2>/dev/null || echo "$ROOT")"
export RUSTFLAGS="--remap-path-prefix=$NATIVE_CARGO=/build/.cargo --remap-path-prefix=$CARGO_HOME_DIR=/build/.cargo --remap-path-prefix=$NATIVE_ROOT=/build/src --remap-path-prefix=$ROOT=/build/src"
cargo build --release --target wasm32-unknown-unknown
mkdir -p "$ROOT/dist"
cp target/wasm32-unknown-unknown/release/ootle_split.wasm "$ROOT/dist/ootle_split.wasm"
cd "$ROOT/dist"
sha256sum ootle_split.wasm | tee ootle_split.wasm.sha256
wc -c < ootle_split.wasm
if grep -a -q -i "$(basename "$HOME")" ootle_split.wasm; then echo "WARNING: home path leaked into wasm" >&2; exit 1; fi
