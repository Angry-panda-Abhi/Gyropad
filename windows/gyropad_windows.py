#!/usr/bin/env python3
"""
Gyropad Windows PC Companion
Translates Gyropad Phone motion & gamepad controls into a native Microsoft
Xbox 360 Controller on Windows using ViGEmBus (vgamepad).

100% compatible with:
  - Steam & Steam Input (Forza Horizon, Assetto Corsa, BeamNG.drive, ETS2, F1, Dirt Rally)
  - Epic Games, EA App, Ubisoft Connect, Xbox Game Pass
  - Emulators (RPCS3, PCSX2, Dolphin, Yuzu, Ryujinx)

Usage on Windows:
  1. Double click setup_windows.bat (or run: pip install websockets vgamepad)
  2. python gyropad_windows.py
"""

import sys
import json
import asyncio

try:
    import websockets
except ImportError:
    print("Error: 'websockets' is not installed. Run: pip install websockets")
    sys.exit(1)

try:
    import vgamepad as vg
except ImportError:
    print("\n[Notice] 'vgamepad' is not installed.")
    print("To install the virtual Xbox 360 controller driver for Windows:")
    print("  pip install vgamepad")
    print("This will automatically install the ViGEmBus driver.\n")
    sys.exit(1)


class GyropadWindowsBridge:
    def __init__(self, host="localhost", port=8765):
        self.host = host
        self.port = port
        self.gamepad = vg.VX360Gamepad()
        print("✓ Created virtual Xbox 360 Controller on Windows (ViGEmBus).")

    def handle_input(self, data):
        gp = self.gamepad
        mode = data.get("mode", "racepad")

        if mode == "racepad":
            # Steering Wheel (-1.0 to 1.0) -> (-32768 to 32767)
            if "steering" in data:
                val = max(-32768, min(32767, int(data["steering"] * 32767)))
                gp.left_joystick(x_value=val, y_value=0)

            # Throttle (0.0 to 1.0) -> (0 to 255)
            if "throttle" in data:
                gas = max(0, min(255, int(data["throttle"] * 255)))
                gp.right_trigger(value=gas)

            # Brake (0.0 to 1.0) -> (0 to 255)
            if "brake" in data:
                brk = max(0, min(255, int(data["brake"] * 255)))
                gp.left_trigger(value=brk)

            # Handbrake -> Button A
            if data.get("handbrake"):
                gp.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)
            else:
                gp.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)

            # Paddle Shifters
            if data.get("shiftUp"):
                gp.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER)
            else:
                gp.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER)

            if data.get("shiftDown"):
                gp.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER)
            else:
                gp.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER)

        elif mode == "gamepad":
            ls = data.get("leftStick", {})
            lx = max(-32768, min(32767, int(ls.get("x", 0) * 32767)))
            ly = max(-32768, min(32767, int(-ls.get("y", 0) * 32767)))
            gp.left_joystick(x_value=lx, y_value=ly)

            rs = data.get("rightStick", {})
            rx = max(-32768, min(32767, int(rs.get("x", 0) * 32767)))
            ry = max(-32768, min(32767, int(-rs.get("y", 0) * 32767)))
            gp.right_joystick(x_value=rx, y_value=ry)

            buttons = data.get("buttons", {})
            btn_map = {
                "a": vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
                "b": vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
                "x": vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
                "y": vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
                "lb": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
                "rb": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
                "start": vg.XUSB_BUTTON.XUSB_GAMEPAD_START,
                "back": vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
            }
            for k, btn in btn_map.items():
                if buttons.get(k):
                    gp.press_button(button=btn)
                else:
                    gp.release_button(button=btn)

            gp.right_trigger(value=255 if buttons.get("rt") else 0)
            gp.left_trigger(value=255 if buttons.get("lt") else 0)

        gp.update()

    async def run(self):
        uri = f"ws://{self.host}:{self.port}"
        print(f"Connecting to Gyropad Server on {uri}...")
        while True:
            try:
                async with websockets.connect(uri) as ws:
                    await ws.send(json.dumps({"type": "handshake", "role": "pc"}))
                    print("✓ Connected to Gyropad Server! Phone steering is live in Windows.")
                    async for msg_str in ws:
                        try:
                            msg = json.loads(msg_str)
                            if msg.get("type") == "input":
                                self.handle_input(msg)
                        except Exception:
                            pass
            except Exception as e:
                print(f"Waiting for Gyropad server... ({e})")
                await asyncio.sleep(2)


if __name__ == "__main__":
    host = "localhost"
    if len(sys.argv) > 1:
        host = sys.argv[1]
    bridge = GyropadWindowsBridge(host=host)
    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        print("\n[Gyropad Windows] Stopped.")
