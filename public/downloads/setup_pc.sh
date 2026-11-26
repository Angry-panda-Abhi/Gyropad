#!/usr/bin/env bash
# ==============================================================================
#  🏎️  GYROPAD PRO - LINUX ONE-CLICK DRIVER & PC COMPANION INSTALLER
# ==============================================================================
#  Configures kernel-level /dev/uinput access so your phone acts as a real
#  Microsoft Xbox 360 Controller & Virtual Keyboard for ANY PC game:
#    - Steam & Steam Input (Assetto Corsa, BeamNG.drive, ETS2, Forza Horizon)
#    - Emulators (RPCS3, PCSX2, Dolphin, RetroArch)
#    - Keyboard-only games (TrackMania, GTA, Retro racers)
# ==============================================================================

set -e

# Detect user
if [ -n "$SUDO_USER" ]; then
    TARGET_USER="$SUDO_USER"
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
    TARGET_USER="$USER"
    USER_HOME="$HOME"
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================================================"
echo "   🏎️   G Y R O P A D   P C   C O M P A N I O N   S E T U P"
echo "========================================================================"
echo "Target User: $TARGET_USER"
echo "Gyropad Dir: $DIR"
echo "------------------------------------------------------------------------"

# 1. Check Python 3
echo "[1/6] Verifying Python 3 environment..."
if ! command -v python3 &> /dev/null; then
    echo "  [Error] Python 3 is required. Installing via apt..."
    sudo apt-get update && sudo apt-get install -y python3 python3-pip
fi
echo "  ✓ Python 3 is ready: $(python3 --version)"

# 2. Check & Install Python packages (evdev, websockets)
echo "[2/6] Checking required Python driver packages..."
python3 -c "import evdev, websockets" 2>/dev/null || {
    echo "  Installing 'evdev' and 'websockets'..."
    pip3 install --break-system-packages evdev websockets 2>/dev/null || \
    pip install evdev websockets 2>/dev/null || \
    sudo apt-get install -y python3-evdev python3-websockets
}
echo "  ✓ Python packages (evdev, websockets) verified."

# 3. Configure udev rules for /dev/uinput (Xbox 360 & Keyboard emulation)
echo "[3/6] Setting up kernel /dev/uinput rules (no sudo required for games)..."
UDEV_RULE_FILE="/etc/udev/rules.d/99-gyropad-uinput.rules"

echo 'KERNEL=="uinput", MODE="0660", GROUP="uinput", TAG+="uaccess"' | sudo tee "$UDEV_RULE_FILE" > /dev/null
echo 'KERNEL=="uinput", SUBSYSTEM=="misc", TAG+="uaccess", OPTIONS+="static_node=uinput"' | sudo tee -a "$UDEV_RULE_FILE" > /dev/null

# 4. Create group and add user
echo "[4/6] Configuring user groups and loading uinput kernel module..."
sudo groupadd -f uinput
sudo usermod -aG uinput,input "$TARGET_USER"
sudo modprobe uinput

# Grant immediate runtime access so user does not need to log out or reboot
sudo chmod 0666 /dev/uinput
sudo udevadm control --reload-rules
sudo udevadm trigger
echo "  ✓ /dev/uinput permissions configured successfully."

# 5. Create Desktop Launcher & Menu Shortcuts
echo "[5/6] Creating Desktop and Application Menu launchers..."
APP_DIR="$USER_HOME/.local/share/applications"
DESKTOP_DIR="$USER_HOME/Desktop"
mkdir -p "$APP_DIR" "$DESKTOP_DIR"

LAUNCHER_SCRIPT="$DIR/run.sh"
chmod +x "$LAUNCHER_SCRIPT"
chmod +x "$DIR/server.py"
chmod +x "$DIR/virtual_gamepad.py"

DESKTOP_ENTRY="[Desktop Entry]
Version=1.0
Type=Application
Name=Gyropad Pro
GenericName=Virtual Steering Wheel & Gamepad
Comment=Smartphone Steering Wheel and Gamepad Companion for PC Games
Exec=$DIR/run.sh
Icon=$DIR/public/assets/logo.svg
Terminal=false
Categories=Game;Utility;
Keywords=gamepad;joystick;steering;wheel;gyro;sim;racing;
"

echo "$DESKTOP_ENTRY" > "$APP_DIR/gyropad.desktop"
echo "$DESKTOP_ENTRY" > "$DESKTOP_DIR/Gyropad.desktop"
chmod +x "$DESKTOP_DIR/Gyropad.desktop"
chmod +x "$APP_DIR/gyropad.desktop"

# Trust desktop icon if gio is available (Ubuntu GNOME desktop)
if command -v gio &>/dev/null; then
    gio set "$DESKTOP_DIR/Gyropad.desktop" metadata::trusted true 2>/dev/null || true
fi
echo "  ✓ Desktop icon created: $DESKTOP_DIR/Gyropad.desktop"

# 6. Restart Gyropad background service if active
echo "[6/6] Applying permissions to active Gyropad background service..."
if command -v systemctl &>/dev/null; then
    # Run user systemctl for the target user
    su - "$TARGET_USER" -c "systemctl --user restart gyropad.service" 2>/dev/null || true
fi

echo "========================================================================"
echo "   🎉   S E T U P   C O M P L E T E D   S U C C E S S F U L L Y !"
echo "========================================================================"
echo "1. Your phone is now ready to control ANY PC game as a real Xbox 360 controller!"
echo "2. Double click the 'Gyropad' icon on your desktop, or run:"
echo "     $DIR/run.sh"
echo "3. Open http://localhost:8080/pc in your browser."
echo "4. Connect your phone via Wi-Fi or USB tethering."
echo ""
echo "Supported Games:"
echo "  • Steam (Assetto Corsa, BeamNG.drive, Euro Truck Simulator 2, Forza Horizon)"
echo "  • Emulators (RPCS3, PCSX2, Dolphin, RetroArch)"
echo "  • Keyboard PC Games (TrackMania, GTA, Web Racers)"
echo "========================================================================"
