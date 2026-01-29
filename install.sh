#!/bin/bash
set -e

# Cordbot installation script
# Usage: curl -fsSL https://cordbot.io/install.sh | bash

REPO="yourusername/cordbot"
INSTALL_DIR="${CORDBOT_INSTALL_DIR:-$HOME/.cordbot}"
BIN_DIR="$INSTALL_DIR/bin"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🤖 Cordbot Installer${NC}\n"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux*)  OS="linux";;
  Darwin*) OS="macos";;
  MINGW*|MSYS*|CYGWIN*) OS="win";;
  *)
    echo -e "${RED}❌ Unsupported operating system: $OS${NC}"
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64";;
  arm64|aarch64) ARCH="arm64";;
  *)
    echo -e "${RED}❌ Unsupported architecture: $ARCH${NC}"
    exit 1
    ;;
esac

echo -e "${CYAN}Detected platform: ${OS}-${ARCH}${NC}"

# Construct binary name
BINARY_NAME="cordbot-${OS}-${ARCH}"
if [ "$OS" = "win" ]; then
  BINARY_NAME="${BINARY_NAME}.exe"
fi

# Get latest release URL
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}"

echo -e "${CYAN}Downloading Cordbot...${NC}"

# Create installation directory
mkdir -p "$BIN_DIR"

# Download binary
if command -v curl &> /dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$BIN_DIR/cordbot"
elif command -v wget &> /dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$BIN_DIR/cordbot"
else
  echo -e "${RED}❌ Neither curl nor wget found. Please install one of them.${NC}"
  exit 1
fi

# Make executable
chmod +x "$BIN_DIR/cordbot"

echo -e "${GREEN}✓ Cordbot downloaded to $BIN_DIR/cordbot${NC}"

# Add to PATH if not already there
SHELL_RC=""
case "$SHELL" in
  */bash) SHELL_RC="$HOME/.bashrc";;
  */zsh)  SHELL_RC="$HOME/.zshrc";;
  */fish) SHELL_RC="$HOME/.config/fish/config.fish";;
esac

PATH_EXPORT="export PATH=\"\$PATH:$BIN_DIR\""

if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
  if ! grep -q "$BIN_DIR" "$SHELL_RC"; then
    echo "" >> "$SHELL_RC"
    echo "# Cordbot" >> "$SHELL_RC"
    echo "$PATH_EXPORT" >> "$SHELL_RC"
    echo -e "${GREEN}✓ Added Cordbot to PATH in $SHELL_RC${NC}"
    echo -e "${YELLOW}⚠️  Run 'source $SHELL_RC' or restart your terminal to use 'cordbot' command${NC}"
  fi
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Cordbot installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Getting Started:${NC}"
echo ""
echo -e "  1. Visit ${CYAN}https://cordbot.io${NC} to configure your bot"
echo -e "  2. Navigate to your workspace directory"
echo -e "  3. Run: ${GREEN}cordbot${NC}"
echo ""
echo -e "${YELLOW}Note: If 'cordbot' command is not found, run:${NC}"
echo -e "  ${CYAN}$PATH_EXPORT${NC}"
echo -e "  Or use the full path: ${CYAN}$BIN_DIR/cordbot${NC}"
echo ""
