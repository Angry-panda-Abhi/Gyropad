#!/usr/bin/env bash
# ==============================================================================
#  Gyropad Pro - Standalone Application Packager
# ==============================================================================
#  Bundles Gyropad and all dependencies into a single, standalone Linux
#  executable that runs on any modern Linux system without needing Python.
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================================"
echo "   🏎️   B U I L D I N G   G Y R O P A D   A P P L I C A T I O N"
echo "========================================================================"

# Check PyInstaller
if ! command -v pyinstaller &> /dev/null && [ ! -f "$HOME/.local/bin/pyinstaller" ]; then
    echo "Installing PyInstaller..."
    pip3 install --break-system-packages pyinstaller 2>/dev/null || pip install pyinstaller
fi

PYINSTALLER="pyinstaller"
if [ -f "$HOME/.local/bin/pyinstaller" ]; then
    PYINSTALLER="$HOME/.local/bin/pyinstaller"
fi

echo "[1/3] Compiling standalone executable..."
$PYINSTALLER \
    --name gyropad \
    --clean \
    --noconfirm \
    --onefile \
    --add-data "public:public" \
    server.py

echo "[2/3] Packaging distribution archive..."
mkdir -p dist/package
cp dist/gyropad dist/package/
cp setup_pc.sh dist/package/
cp README.md dist/package/
cd dist/package
tar -czvf ../gyropad-linux-x86_64.tar.gz gyropad setup_pc.sh README.md
cd "$DIR"
rm -rf dist/package

echo "[3/3] Build complete!"
echo "------------------------------------------------------------------------"
echo "Standalone binary:   $DIR/dist/gyropad"
echo "Release archive:     $DIR/dist/gyropad-linux-x86_64.tar.gz"
echo "========================================================================"
