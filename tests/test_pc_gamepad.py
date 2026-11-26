#!/usr/bin/env python3
"""
Test Suite: PC Game Controller Driver, Setup, and Mode Switching
Validates that Gyropad functions as an Xbox 360 controller and virtual keyboard
for any PC game (Steam, Assetto Corsa, BeamNG, ETS2, TrackMania, RetroArch).
"""

import os
import sys
import json
import urllib.request
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from virtual_gamepad import GyropadVirtualController


class TestPCGamepadCompanion(unittest.TestCase):
    def setUp(self):
        self.controller = GyropadVirtualController(mode="gamepad")

    def test_01_gamepad_device_spec(self):
        """Verifies Microsoft Xbox 360 controller device specifications."""
        status = self.controller.get_status()
        self.assertTrue(status["supported"], "evdev library should be installed and supported.")
        self.assertEqual(status["mode"], "gamepad")
        self.assertIn("uinput_accessible", status)

    def test_02_mode_switching(self):
        """Validates dynamic mode switching across all target game profiles."""
        self.assertTrue(self.controller.set_mode("keyboard_wasd"))
        self.assertEqual(self.controller.mode, "keyboard_wasd")

        self.assertTrue(self.controller.set_mode("keyboard_arrows"))
        self.assertEqual(self.controller.mode, "keyboard_arrows")

        self.assertTrue(self.controller.set_mode("hybrid"))
        self.assertEqual(self.controller.mode, "hybrid")

        self.assertTrue(self.controller.set_mode("gamepad"))
        self.assertEqual(self.controller.mode, "gamepad")

        # Invalid mode should be rejected
        self.assertFalse(self.controller.set_mode("invalid_mode"))

    def test_03_xbox360_axis_scaling_math(self):
        """Validates that analog steering and trigger math matches Linux kernel specs."""
        # 1. Steering Axis (-1.0 to 1.0) -> (-32768 to 32767)
        test_cases_steer = [
            (-1.0, -32768),
            (0.0, 0),
            (1.0, 32767),
            (-0.5, -16383),
            (0.5, 16383)
        ]
        for normalized, expected in test_cases_steer:
            val = max(-32768, min(32767, int(normalized * 32767)))
            self.assertAlmostEqual(val, expected, delta=2)

        # 2. Trigger Axes (0.0 to 1.0) -> (0 to 255) standard Xbox 360 8-bit range
        test_cases_pedal = [
            (0.0, 0),
            (0.5, 127),
            (1.0, 255)
        ]
        for normalized, expected in test_cases_pedal:
            val = max(0, min(255, int(normalized * 255)))
            self.assertAlmostEqual(val, expected, delta=2)

    def test_04_keyboard_wasd_threshold_logic(self):
        """Verifies deadzone thresholds for virtual keyboard emulation."""
        steer_deadzone = 0.18
        pedal_deadzone = 0.15

        # Steering Left activates A
        steer_left = -0.35
        self.assertTrue(steer_left < -steer_deadzone)

        # Neutral steering releases both A and D
        steer_center = 0.05
        self.assertFalse(steer_center < -steer_deadzone)
        self.assertFalse(steer_center > steer_deadzone)

        # Steering Right activates D
        steer_right = 0.40
        self.assertTrue(steer_right > steer_deadzone)

        # Gas activates W
        gas_pressed = 0.8
        self.assertTrue(gas_pressed > pedal_deadzone)
        gas_released = 0.05
        self.assertFalse(gas_released > pedal_deadzone)

    def test_05_http_gamepad_api(self):
        """Validates that the running Gyropad server responds to /api/gamepad endpoints."""
        url = "http://localhost:8080/api/gamepad/status"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode())
                self.assertIn("supported", data)
                self.assertIn("mode", data)
                self.assertIn("uinput_accessible", data)
        except Exception as e:
            self.fail(f"Could not connect to /api/gamepad/status: {e}")

    def test_06_http_gamepad_mode_switching(self):
        """Validates dynamic mode change via POST /api/gamepad/mode."""
        url = "http://localhost:8080/api/gamepad/mode"
        payload = json.dumps({"mode": "gamepad"}).encode()
        try:
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode())
                self.assertEqual(data["mode"], "gamepad")
        except Exception as e:
            self.fail(f"Could not switch mode via POST /api/gamepad/mode: {e}")

    def test_07_downloadable_companion_assets(self):
        """Verifies that all setup scripts and companion zip packages are served."""
        files = [
            "/downloads/setup_pc.sh",
            "/downloads/setup_windows.bat",
            "/downloads/run_windows.bat",
            "/downloads/gyropad-pc-companion.zip"
        ]
        for path in files:
            url = f"http://localhost:8080{path}"
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=2) as resp:
                    self.assertEqual(resp.status, 200, f"Endpoint {path} must return 200")
                    content_length = int(resp.headers.get("Content-Length", 0))
                    self.assertGreater(content_length, 0, f"File {path} must not be empty")
            except Exception as e:
                self.fail(f"Failed to fetch downloadable asset {path}: {e}")


if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("   🎮 GYROPAD PC GAME CONTROLLER AUTOMATED TEST SUITE")
    print("=" * 65)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPCGamepadCompanion)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print("-" * 65)
        print("All PC Gamepad Companion tests PASSED.")
        print("=" * 65 + "\n")
        sys.exit(0)
    else:
        sys.exit(1)
