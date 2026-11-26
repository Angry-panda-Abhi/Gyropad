#!/usr/bin/env bash
# Gyropad Launcher Script
cd "$(dirname "$0")"

# If server is already running, open dashboard directly
if curl -s -m 1 http://localhost:8080/api/network >/dev/null 2>&1; then
    echo "Gyropad server is active. Opening PC Dashboard..."
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:8080/pc" >/dev/null 2>&1 &
    fi
    exit 0
fi

echo "Starting Gyropad PC Companion & Web Controller..."
if command -v xdg-open &>/dev/null; then
    (sleep 1.2 && xdg-open "http://localhost:8080/pc" >/dev/null 2>&1) &
fi
exec python3 server.py
