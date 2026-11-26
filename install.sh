#!/usr/bin/env bash
# ==============================================================================
#  🏎️  Gyropad Pro - One-Line Universal Installer
# ==============================================================================
#  Installs Gyropad Pro as a desktop application on Linux.
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/Angry-panda-Abhi/Gyropad/main/install.sh | bash
# ==============================================================================

set -e

INSTALL_DIR="$HOME/.local/share/gyropad"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/Desktop"
APP_DIR="$HOME/.local/share/applications"

echo "========================================================================"
echo "   🏎️   I N S T A L L I N G   G Y R O P A D   P R O"
echo "========================================================================"

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$DESKTOP_DIR" "$APP_DIR"

# 1. Fetch latest repository
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "[1/4] Updating existing Gyropad installation..."
    cd "$INSTALL_DIR"
    git pull origin main 2>/dev/null || true
else
    echo "[1/4] Downloading Gyropad application files..."
    git clone https://github.com/Angry-panda-Abhi/Gyropad.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 2. Configure kernel uinput rules and dependencies
echo "[2/4] Configuring Xbox 360 controller driver and permissions..."
bash "$INSTALL_DIR/setup_pc.sh"

# 3. Create CLI command symlink
echo "[3/4] Creating 'gyropad' terminal command in $BIN_DIR..."
ln -sf "$INSTALL_DIR/run.sh" "$BIN_DIR/gyropad"
chmod +x "$BIN_DIR/gyropad"

# 4. Configure background service
echo "[4/4] Activating background companion service..."
mkdir -p "$HOME/.config/systemd/user"
cat << 'EOF' > "$HOME/.config/systemd/user/gyropad.service"
[Unit]
Description=Gyropad PC Companion & Web Controller
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.local/share/gyropad
ExecStart=/usr/bin/python3 -u %h/.local/share/gyropad/server.py
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now gyropad.service 2>/dev/null || true

echo "========================================================================"
echo "   🎉   G Y R O P A D   I S   R E A D Y   T O   R A C E !"
echo "========================================================================"
echo "• Launch from Application Menu or double click 'Gyropad' on your Desktop"
echo "• Or run 'gyropad' from any terminal"
echo "• Open http://localhost:8080/pc to connect your phone"
echo "========================================================================"

if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:8080/pc" >/dev/null 2>&1 &
fi
