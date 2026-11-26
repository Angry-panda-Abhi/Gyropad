#!/usr/bin/env bash
# Gyropad ADB Reverse USB Bridge
# Forwards ports over USB cable so phone can connect to http://localhost:8080/phone with 0ms lag!

ADB_PATH=$(command -v adb 2>/dev/null || true)
if [ -z "$ADB_PATH" ] && [ -d "$HOME/Android/Sdk/platform-tools" ]; then
  ADB_PATH="$HOME/Android/Sdk/platform-tools/adb"
fi

if [ -z "$ADB_PATH" ]; then
  echo "Error: adb not found. Ensure Android platform-tools is installed."
  exit 1
fi

echo "Checking connected Android devices..."
"$ADB_PATH" devices

echo "Forwarding ports to phone over USB cable..."
"$ADB_PATH" reverse tcp:8080 tcp:8080
"$ADB_PATH" reverse tcp:8443 tcp:8443
"$ADB_PATH" reverse tcp:8765 tcp:8765
"$ADB_PATH" reverse tcp:8766 tcp:8766

echo ""
echo "=========================================================="
echo "  ✓ USB REVERSE FORWARDING COMPLETE!"
echo "  Now open Chrome on your phone and visit:"
echo "    http://localhost:8080/phone"
echo "  (Zero latency, 100% full gyro sensor access, no Wi-Fi needed!)"
echo "=========================================================="
