#!/usr/bin/env bash
#
# Code Agent installer — downloads the right prebuilt binary for your system
# from GitHub Releases and installs it to ~/.local/bin (or $INSTALL_DIR).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/sishenaichipingguo/code-agent/main/install.sh | bash
#
# Options (env vars):
#   INSTALL_DIR   target directory (default: ~/.local/bin)
#   VERSION       release tag to install (default: latest)
#
set -euo pipefail

REPO="sishenaichipingguo/code-agent"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${VERSION:-latest}"
BINARY_NAME="agent"

err() { echo "error: $*" >&2; exit 1; }
info() { echo "==> $*"; }

# --- Detect platform ---------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux)  os_tag="linux" ;;
  Darwin) os_tag="darwin" ;;
  *) err "unsupported OS: $os (Windows users: download the .zip from the Releases page)" ;;
esac

case "$arch" in
  x86_64|amd64) arch_tag="x64" ;;
  arm64|aarch64) arch_tag="arm64" ;;
  *) err "unsupported architecture: $arch" ;;
esac

asset="agent-${os_tag}-${arch_tag}.tar.gz"

# --- Resolve download URL ----------------------------------------------------
if [ "$VERSION" = "latest" ]; then
  base_url="https://github.com/${REPO}/releases/latest/download"
else
  base_url="https://github.com/${REPO}/releases/download/${VERSION}"
fi
url="${base_url}/${asset}"

# --- Download and install ----------------------------------------------------
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

info "Downloading ${asset} (${VERSION})..."
if ! curl -fsSL "$url" -o "$tmp/$asset"; then
  err "download failed: $url
Check that a release exists at https://github.com/${REPO}/releases"
fi

info "Extracting..."
tar -xzf "$tmp/$asset" -C "$tmp"

mkdir -p "$INSTALL_DIR"
mv "$tmp/agent-${os_tag}-${arch_tag}" "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"

# macOS: bun-compiled binaries need an ad-hoc signature to run.
if [ "$os_tag" = "darwin" ] && command -v codesign >/dev/null 2>&1; then
  codesign --remove-signature "$INSTALL_DIR/$BINARY_NAME" 2>/dev/null || true
  codesign -s - --force "$INSTALL_DIR/$BINARY_NAME" 2>/dev/null || true
fi

info "Installed to $INSTALL_DIR/$BINARY_NAME"

# --- PATH hint ---------------------------------------------------------------
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "  $INSTALL_DIR is not on your PATH. Add this to your shell profile:"
    echo "    export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo ""
info "Done. Try: agent --help"
