#!/usr/bin/env python3
"""
Gyropad Cross-Platform Virtual Gamepad & Keyboard Engine (Linux & Windows)
Translates Gyropad Phone motion, pedals, and gamepad controls into real
kernel-level virtual devices:
  - Linux: Xbox 360 Controller & Virtual Keyboard via /dev/uinput
  - Windows: Microsoft Xbox 360 Controller via ViGEmBus (vgamepad)
  -> 100% Native compatibility with Steam, Assetto Corsa, BeamNG.drive,
     Euro Truck Simulator 2, Forza, TrackMania, RPCS3, and all PC games.
"""

import os
import sys
import json
import time
import asyncio
from typing import Optional, Dict, Any

IS_WINDOWS = sys.platform == "win32"

try:
    import evdev
    from evdev import UInput, ecodes as e, AbsInfo
    HAS_EVDEV = True
except ImportError:
    HAS_EVDEV = False

try:
    import vgamepad as vg
    HAS_VGAMEPAD = True
except ImportError:
    HAS_VGAMEPAD = False


class GyropadVirtualController:
    """Manages kernel-level virtual input devices on Linux and Windows."""

    def __init__(self, mode: str = "gamepad"):
        self.mode = mode  # 'gamepad', 'keyboard_wasd', 'keyboard_arrows', 'hybrid'
        self.gamepad = None
        self.keyboard = None
        self.is_active = False
        self.error_message: Optional[str] = None
        self.held_keys = set()

        if IS_WINDOWS:
            if not HAS_VGAMEPAD:
                self.error_message = "The 'vgamepad' package is missing on Windows. Run: pip install vgamepad"
                return
        else:
            if not HAS_EVDEV:
                self.error_message = "The 'evdev' python package is missing. Run: pip install evdev"
                return

        self._init_devices()

    def _is_uinput_writable(self) -> bool:
        if IS_WINDOWS:
            return True
        return os.path.exists("/dev/uinput") and os.access("/dev/uinput", os.W_OK)

    def _init_devices(self):
        # --- WINDOWS INITIALIZATION ---
        if IS_WINDOWS:
            if not HAS_VGAMEPAD:
                self.is_active = False
                self.error_message = "Install vgamepad with: pip install vgamepad"
                return
            try:
                self.gamepad = vg.VX360Gamepad()
                self.is_active = True
                self.error_message = None
                print("  [Virtual Controller] ✓ Initialized Xbox 360 Gamepad for Windows (ViGEmBus).")
            except Exception as err:
                self.is_active = False
                self.error_message = f"Failed to initialize Windows vgamepad: {err}"
                print(f"  [Virtual Controller Warning] {self.error_message}")
            return

        # --- LINUX INITIALIZATION ---
        if not self._is_uinput_writable():
            self.error_message = "Permission denied on /dev/uinput. Run 'bash setup_pc.sh' once to enable non-root access."
            self.is_active = False
            return

        try:
            # 1. Virtual Xbox 360 Controller / Racing Wheel
            # Matches official Linux kernel drivers/input/joystick/xpad.c (XTYPE_XBOX360, 045e:028e)
            gamepad_caps = {
                e.EV_KEY: [
                    e.BTN_A, e.BTN_B, e.BTN_X, e.BTN_Y,
                    e.BTN_TL, e.BTN_TR,          # Bumpers / Paddle Shifters (LB, RB)
                    e.BTN_SELECT, e.BTN_START,   # Back / Start (b6, b7 in SDL2)
                    e.BTN_MODE,                  # Xbox Guide Button
                    e.BTN_THUMBL, e.BTN_THUMBR   # Left/Right Stick Clicks
                ],
                e.EV_ABS: [
                    # Steering Wheel / Left Stick X (-32768 to 32767)
                    (e.ABS_X, AbsInfo(value=0, min=-32768, max=32767, fuzz=16, flat=128, resolution=0)),
                    # Left Stick Y (-32768 to 32767)
                    (e.ABS_Y, AbsInfo(value=0, min=-32768, max=32767, fuzz=16, flat=128, resolution=0)),
                    # Right Stick X (-32768 to 32767)
                    (e.ABS_RX, AbsInfo(value=0, min=-32768, max=32767, fuzz=16, flat=128, resolution=0)),
                    # Right Stick Y (-32768 to 32767)
                    (e.ABS_RY, AbsInfo(value=0, min=-32768, max=32767, fuzz=16, flat=128, resolution=0)),
                    # Right Trigger / Throttle: 0 to 255 (Standard 8-bit Xbox 360 controller range)
                    (e.ABS_RZ, AbsInfo(value=0, min=0, max=255, fuzz=0, flat=0, resolution=0)),
                    # Left Trigger / Brake: 0 to 255 (Standard 8-bit Xbox 360 controller range)
                    (e.ABS_Z, AbsInfo(value=0, min=0, max=255, fuzz=0, flat=0, resolution=0)),
                    # D-pad Hat (-1, 0, 1)
                    (e.ABS_HAT0X, AbsInfo(value=0, min=-1, max=1, fuzz=0, flat=0, resolution=0)),
                    (e.ABS_HAT0Y, AbsInfo(value=0, min=-1, max=1, fuzz=0, flat=0, resolution=0)),
                ]
            }
            self.gamepad = UInput(
                gamepad_caps,
                name="Gyropad Virtual Steering Wheel & Gamepad",
                vendor=0x045e,
                product=0x028e,
                version=0x0110
            )

            # 2. Virtual Keyboard for WASD & Arrow Key games
            keyboard_caps = {
                e.EV_KEY: [
                    e.KEY_W, e.KEY_A, e.KEY_S, e.KEY_D,
                    e.KEY_UP, e.KEY_DOWN, e.KEY_LEFT, e.KEY_RIGHT,
                    e.KEY_SPACE, e.KEY_LEFTSHIFT, e.KEY_LEFTCTRL,
                    e.KEY_ENTER, e.KEY_ESC, e.KEY_C, e.KEY_R
                ]
            }
            self.keyboard = UInput(
                keyboard_caps,
                name="Gyropad Virtual Keyboard"
            )

            self.is_active = True
            self.error_message = None
            print("  [Virtual Controller] ✓ Initialized Xbox 360 Gamepad & Virtual Keyboard devices.")
        except Exception as err:
            self.is_active = False
            self.error_message = f"Failed to initialize uinput devices: {err}"
            print(f"  [Virtual Controller Warning] {self.error_message}")

    def retry_init(self) -> bool:
        """Attempts to reinitialize if permissions were granted after startup."""
        if not self.is_active:
            self._init_devices()
        return self.is_active

    def set_mode(self, mode: str) -> bool:
        """Switch active mode ('gamepad', 'keyboard_wasd', 'keyboard_arrows', 'hybrid')."""
        valid_modes = ["gamepad", "keyboard_wasd", "keyboard_arrows", "hybrid"]
        if mode not in valid_modes:
            return False
        self._release_all_keys()
        self.mode = mode
        return True

    def _release_all_keys(self):
        """Releases any held virtual keyboard keys (Linux)."""
        if not IS_WINDOWS and self.keyboard and self.held_keys:
            for key_code in list(self.held_keys):
                try:
                    self.keyboard.write(e.EV_KEY, key_code, 0)
                except Exception:
                    pass
            try:
                self.keyboard.syn()
            except Exception:
                pass
            self.held_keys.clear()

    def _set_key(self, key_code: int, press: bool):
        """Safely updates virtual keyboard key state."""
        if not self.keyboard or IS_WINDOWS:
            return
        if press and key_code not in self.held_keys:
            self.keyboard.write(e.EV_KEY, key_code, 1)
            self.held_keys.add(key_code)
        elif not press and key_code in self.held_keys:
            self.keyboard.write(e.EV_KEY, key_code, 0)
            self.held_keys.remove(key_code)

    def dispatch_input(self, data: Dict[str, Any]):
        """Dispatches phone control packets to virtual devices."""
        if not self.is_active:
            if self._is_uinput_writable():
                self._init_devices()
            if not self.is_active:
                return

        try:
            # WINDOWS DISPATCH
            if IS_WINDOWS:
                if self.gamepad and self.is_active:
                    self._update_windows_gamepad(data)
                return

            # LINUX DISPATCH
            if self.gamepad and self.mode in ["gamepad", "hybrid"]:
                self._update_linux_gamepad(data)

            if self.keyboard and self.mode in ["keyboard_wasd", "keyboard_arrows", "hybrid"]:
                self._update_linux_keyboard(data)

        except Exception:
            pass

    def _update_windows_gamepad(self, data: Dict[str, Any]):
        """Translates phone input to Windows ViGEmBus Xbox 360 controller."""
        gp = self.gamepad
        mode = data.get("mode", "racepad")
        buttons = data.get("buttons", {})

        if mode == "racepad":
            if "steering" in data:
                val = max(-32768, min(32767, int(data["steering"] * 32767)))
                gp.left_joystick(x_value=val, y_value=0)

            if "throttle" in data:
                gas = max(0, min(255, int(data["throttle"] * 255)))
                gp.right_trigger(value=gas)

            if "brake" in data:
                brk = max(0, min(255, int(data["brake"] * 255)))
                gp.left_trigger(value=brk)

            # Handbrake (maps to A button if pressed, unless explicit buttons['a'] is set)
            if data.get("handbrake") or buttons.get("handbrake") or buttons.get("a"):
                gp.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)
            else:
                gp.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)

            if data.get("shiftUp") or buttons.get("rb") or buttons.get("gear_up"):
                gp.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER)
            else:
                gp.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER)

            if data.get("shiftDown") or buttons.get("lb") or buttons.get("gear_down"):
                gp.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER)
            else:
                gp.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER)

        elif mode == "gamepad":
            ls = data.get("leftStick", {})
            lx = max(-32768, min(32767, int(ls.get("x", 0) * 32767)))
            ly = max(-32768, min(32767, int(ls.get("y", 0) * 32767)))  # Positive Cartesian is UP
            gp.left_joystick(x_value=lx, y_value=ly)

            rs = data.get("rightStick", {})
            rx = max(-32768, min(32767, int(rs.get("x", 0) * 32767)))
            ry = max(-32768, min(32767, int(rs.get("y", 0) * 32767)))
            gp.right_joystick(x_value=rx, y_value=ry)

            gp.right_trigger(value=255 if (buttons.get("rt") or data.get("throttle", 0) > 0.5) else 0)
            gp.left_trigger(value=255 if (buttons.get("lt") or data.get("brake", 0) > 0.5) else 0)

        # Common Action Buttons & D-Pad for both Racepad and Gamepad modes
        btn_map = {
            "a": vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
            "b": vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
            "x": vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
            "y": vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
            "lb": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
            "rb": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
            "start": vg.XUSB_BUTTON.XUSB_GAMEPAD_START,
            "back": vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
            "dpad_up": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
            "dpad_down": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
            "dpad_left": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
            "dpad_right": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
            "lights": vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
            "horn": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_THUMB,
            "cam": vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
        }
        for k, btn in btn_map.items():
            if buttons.get(k):
                gp.press_button(button=btn)
            elif k != "a" or mode == "gamepad":
                gp.release_button(button=btn)

        gp.update()

    def _update_linux_gamepad(self, data: Dict[str, Any]):
        gp = self.gamepad
        mode = data.get("mode", "racepad")
        buttons = data.get("buttons", {})

        if mode == "racepad":
            if "steering" in data:
                steer_val = max(-32768, min(32767, int(data["steering"] * 32767)))
                gp.write(e.EV_ABS, e.ABS_X, steer_val)

            # Throttle / RT (0..255)
            gas_val = max(0, min(255, int(data.get("throttle", 0) * 255)))
            gp.write(e.EV_ABS, e.ABS_RZ, gas_val)

            # Brake / LT (0..255)
            brk_val = max(0, min(255, int(data.get("brake", 0) * 255)))
            gp.write(e.EV_ABS, e.ABS_Z, brk_val)

            # Handbrake / A button
            gp.write(e.EV_KEY, e.BTN_A, 1 if (data.get("handbrake") or buttons.get("handbrake") or buttons.get("a")) else 0)

            # Sequential Shift Up (RB) / Shift Down (LB)
            gp.write(e.EV_KEY, e.BTN_TR, 1 if (data.get("shiftUp") or buttons.get("rb") or buttons.get("gear_up")) else 0)
            gp.write(e.EV_KEY, e.BTN_TL, 1 if (data.get("shiftDown") or buttons.get("lb") or buttons.get("gear_down")) else 0)

        elif mode == "gamepad":
            ls = data.get("leftStick", {})
            lx = max(-32768, min(32767, int(ls.get("x", 0) * 32767)))
            ly = max(-32768, min(32767, int(-ls.get("y", 0) * 32767)))
            gp.write(e.EV_ABS, e.ABS_X, lx)
            gp.write(e.EV_ABS, e.ABS_Y, ly)

            rs = data.get("rightStick", {})
            rx = max(-32768, min(32767, int(rs.get("x", 0) * 32767)))
            ry = max(-32768, min(32767, int(-rs.get("y", 0) * 32767)))
            gp.write(e.EV_ABS, e.ABS_RX, rx)
            gp.write(e.EV_ABS, e.ABS_RY, ry)

            # LB & RB (Bumpers / Shoulders)
            gp.write(e.EV_KEY, e.BTN_TL, 1 if (buttons.get("lb") or data.get("shiftDown")) else 0)
            gp.write(e.EV_KEY, e.BTN_TR, 1 if (buttons.get("rb") or data.get("shiftUp")) else 0)

            # LT & RT (Triggers: pure analog 0..255)
            gas_val = 255 if buttons.get("rt") else max(0, min(255, int(data.get("throttle", 0) * 255)))
            gp.write(e.EV_ABS, e.ABS_RZ, gas_val)

            brk_val = 255 if buttons.get("lt") else max(0, min(255, int(data.get("brake", 0) * 255)))
            gp.write(e.EV_ABS, e.ABS_Z, brk_val)

            gp.write(e.EV_KEY, e.BTN_A, 1 if (buttons.get("a") or data.get("handbrake")) else 0)

        # Common Action Buttons (B, X, Y, START, BACK, HORN, CAM)
        gp.write(e.EV_KEY, e.BTN_B, 1 if buttons.get("b") else 0)
        gp.write(e.EV_KEY, e.BTN_X, 1 if buttons.get("x") else 0)
        gp.write(e.EV_KEY, e.BTN_Y, 1 if (buttons.get("y") or buttons.get("lights")) else 0)
        gp.write(e.EV_KEY, e.BTN_START, 1 if buttons.get("start") else 0)
        gp.write(e.EV_KEY, e.BTN_SELECT, 1 if (buttons.get("back") or buttons.get("cam")) else 0)
        gp.write(e.EV_KEY, e.BTN_THUMBL, 1 if buttons.get("horn") else 0)

        # D-pad Hat (ABS_HAT0X, ABS_HAT0Y)
        hat_x = 1 if buttons.get("dpad_right") else (-1 if buttons.get("dpad_left") else 0)
        gp.write(e.EV_ABS, e.ABS_HAT0X, hat_x)

        hat_y = 1 if buttons.get("dpad_down") else (-1 if buttons.get("dpad_up") else 0)
        gp.write(e.EV_ABS, e.ABS_HAT0Y, hat_y)

        gp.syn()

    def _update_linux_keyboard(self, data: Dict[str, Any]):
        kb = self.keyboard
        steering = data.get("steering", 0.0)
        throttle = data.get("throttle", 0.0)
        brake = data.get("brake", 0.0)
        handbrake = data.get("handbrake", False)

        steer_deadzone = 0.18
        pedal_deadzone = 0.15

        if self.mode in ["keyboard_wasd", "hybrid"]:
            self._set_key(e.KEY_W, throttle > pedal_deadzone)
            self._set_key(e.KEY_S, brake > pedal_deadzone)
            self._set_key(e.KEY_A, steering < -steer_deadzone)
            self._set_key(e.KEY_D, steering > steer_deadzone)
            self._set_key(e.KEY_SPACE, handbrake)

            self._set_key(e.KEY_LEFTSHIFT, bool(data.get("shiftUp") or data.get("nos") or data.get("buttons", {}).get("rb")))
            self._set_key(e.KEY_LEFTCTRL, bool(data.get("shiftDown") or data.get("buttons", {}).get("lb")))

        elif self.mode == "keyboard_arrows":
            self._set_key(e.KEY_UP, throttle > pedal_deadzone)
            self._set_key(e.KEY_DOWN, brake > pedal_deadzone)
            self._set_key(e.KEY_LEFT, steering < -steer_deadzone)
            self._set_key(e.KEY_RIGHT, steering > steer_deadzone)
            self._set_key(e.KEY_SPACE, handbrake)

        # Action Buttons in Keyboard Mode (with release state properly dispatched)
        buttons = data.get("buttons", {})
        self._set_key(e.KEY_UP, bool(buttons.get("dpad_up")))
        self._set_key(e.KEY_DOWN, bool(buttons.get("dpad_down")))
        self._set_key(e.KEY_LEFT, bool(buttons.get("dpad_left")))
        self._set_key(e.KEY_RIGHT, bool(buttons.get("dpad_right")))
        self._set_key(e.KEY_ENTER, bool(buttons.get("a")))
        self._set_key(e.KEY_ESC, bool(buttons.get("b")))
        self._set_key(e.KEY_C, bool(buttons.get("x") or buttons.get("cam")))
        self._set_key(e.KEY_R, bool(buttons.get("y") or buttons.get("lights")))

        kb.syn()

    def get_status(self) -> Dict[str, Any]:
        """Returns the current state of virtual devices."""
        if IS_WINDOWS:
            return {
                "supported": HAS_VGAMEPAD,
                "platform": "windows",
                "uinput_accessible": True,
                "active": self.is_active,
                "mode": self.mode,
                "error": self.error_message,
                "devices": [
                    {
                        "type": "gamepad",
                        "name": "Xbox 360 Controller for Windows (ViGEmBus)",
                        "vendor": "0x045e",
                        "product": "0x028e",
                        "active": self.gamepad is not None
                    }
                ] if self.is_active else []
            }

        writable = self._is_uinput_writable()
        return {
            "supported": HAS_EVDEV,
            "platform": "linux",
            "uinput_accessible": writable,
            "active": self.is_active,
            "mode": self.mode,
            "error": self.error_message,
            "devices": [
                {
                    "type": "gamepad",
                    "name": "Gyropad Virtual Steering Wheel & Gamepad",
                    "vendor": "0x045e",
                    "product": "0x028e",
                    "active": self.gamepad is not None
                },
                {
                    "type": "keyboard",
                    "name": "Gyropad Virtual Keyboard",
                    "active": self.keyboard is not None
                }
            ] if self.is_active else []
        }

    def close(self):
        """Safely release and close virtual devices."""
        self._release_all_keys()
        if self.gamepad:
            try:
                self.gamepad.close()
            except Exception:
                pass
            self.gamepad = None
        if self.keyboard:
            try:
                self.keyboard.close()
            except Exception:
                pass
            self.keyboard = None
        self.is_active = False


# Standalone runner for CLI execution
async def standalone_main():
    print("=" * 60)
    print(f"   🎮 GYROPAD VIRTUAL GAMEPAD BRIDGE ({'WINDOWS' if IS_WINDOWS else 'LINUX'})")
    print("=" * 60)

    controller = GyropadVirtualController(mode="gamepad")
    if not controller.is_active:
        print(f"Error: {controller.error_message}")
        if not IS_WINDOWS:
            print("\nTo fix permissions permanently without sudo:")
            print("  bash setup_pc.sh")
            print("\nOr run directly with sudo:")
            print("  sudo python3 virtual_gamepad.py")
        sys.exit(1)

    print("✓ Virtual Xbox 360 Controller ready.")
    print("Connecting to local Gyropad server on ws://localhost:8765...")

    try:
        import websockets
    except ImportError:
        print("Error: websockets library missing. Run: pip install websockets")
        sys.exit(1)

    uri = "ws://localhost:8765"
    while True:
        try:
            async with websockets.connect(uri) as ws:
                await ws.send(json.dumps({"type": "handshake", "role": "pc"}))
                print("✓ Connected to Gyropad Server! Ready to drive in any game.")
                async for msg_str in ws:
                    try:
                        data = json.loads(msg_str)
                        if data.get("type") == "input":
                            controller.dispatch_input(data)
                    except Exception:
                        pass
        except Exception as err:
            print(f"Waiting for Gyropad server... ({err})")
            await asyncio.sleep(2)


if __name__ == "__main__":
    try:
        asyncio.run(standalone_main())
    except KeyboardInterrupt:
        print("\n[Virtual Gamepad] Stopped.")
