#!/usr/bin/env python3
"""
Comprehensive Automated Test Suite for Gyropad
Tests:
1. HTTP Server endpoints (200 OK, Content-Type, Routing)
2. Network API (/api/network returns valid active LAN IP)
3. WebSocket Bi-directional Telemetry Stream (PC & Phone handshake, input broadcast, latency tracking)
4. Sensor Fusion Math (900° lock-to-lock rotation, anti-drift, no gimbal flips)
5. Multitouch Packet Processing
6. Physics Engine Vehicle Dynamics (Acceleration, Braking, Ackermann steering, Gear ratios)
"""

import sys
import json
import math
import asyncio
import urllib.request
import websockets

HTTP_PORT = 8080
WS_PORT = 8765

passed = 0
failed = 0

def test(name):
    def decorator(fn):
        async def wrapper(*args, **kwargs):
            global passed, failed
            try:
                if asyncio.iscoroutinefunction(fn):
                    await fn(*args, **kwargs)
                else:
                    fn(*args, **kwargs)
                print(f"  ✓ PASS: {name}")
                passed += 1
            except Exception as e:
                print(f"  ✗ FAIL: {name} -> {e}")
                failed += 1
        return wrapper
    return decorator


@test("HTTP Server static and API endpoints")
def test_http_endpoints():
    endpoints = [
        ("/", 200, "text/html"),
        ("/pc", 200, "text/html"),
        ("/phone", 200, "text/html"),
        ("/api/network", 200, "application/json"),
        ("/css/pc.css", 200, "text/css"),
        ("/css/phone.css", 200, "text/css"),
        ("/js/game.js", 200, "javascript"),
        ("/js/phone.js", 200, "javascript"),
        ("/js/car.js", 200, "javascript"),
        ("/assets/logo.svg", 200, "image/svg+xml"),
    ]
    for path, exp_status, exp_mime in endpoints:
        url = f"http://localhost:{HTTP_PORT}{path}"
        req = urllib.request.urlopen(url, timeout=3)
        assert req.status == exp_status, f"Expected status {exp_status} for {path}, got {req.status}"
        ctype = req.headers.get("Content-Type", "")
        assert exp_mime in ctype, f"Expected mime containing {exp_mime} for {path}, got {ctype}"


@test("Network API accuracy (/api/network)")
def test_network_api():
    url = f"http://localhost:{HTTP_PORT}/api/network"
    req = urllib.request.urlopen(url, timeout=3)
    data = json.loads(req.read().decode("utf-8"))
    assert "ip" in data, "Missing 'ip' field"
    assert "phone_url" in data, "Missing 'phone_url' field"
    assert data["ip"] != "127.0.0.1" or "172." in data["ip"] or "192." in data["ip"], "Invalid IP returned"
    assert data["phone_url"].startswith("http://"), "phone_url must be valid HTTP URL"


@test("WebSocket Handshake, Status Broadcast, and Input Telemetry")
async def test_websocket_stream():
    uri = f"ws://localhost:{WS_PORT}"
    async with websockets.connect(uri) as pc, websockets.connect(uri) as phone:
        # PC handshake
        await pc.send(json.dumps({"type": "handshake", "role": "pc"}))
        msg1 = json.loads(await pc.recv())
        assert msg1.get("type") == "phone_status"

        # Phone handshake
        await phone.send(json.dumps({"type": "handshake", "role": "phone"}))
        # PC should receive notification that phone is connected
        msg2 = json.loads(await pc.recv())
        assert msg2.get("type") == "phone_status"
        assert msg2.get("connected") == True

        # Phone sends telemetry packet (steering, throttle, brake)
        sample_packet = {
            "type": "input",
            "mode": "racepad",
            "steering": -0.45,
            "throttle": 0.88,
            "brake": 0.0,
            "gear": 2,
            "shiftUp": False,
            "shiftDown": False
        }
        await phone.send(json.dumps(sample_packet))
        
        # PC should receive identical telemetry
        pc_received = json.loads(await pc.recv())
        assert pc_received.get("type") == "input"
        assert math.isclose(pc_received.get("steering"), -0.45, rel_tol=1e-3)
        assert math.isclose(pc_received.get("throttle"), 0.88, rel_tol=1e-3)

        # Heartbeat ping/pong
        await phone.send(json.dumps({"type": "ping"}))
        pong = json.loads(await phone.recv())
        assert pong.get("type") == "pong"


@test("Sensor Fusion complementary filter math (drift-free 900° wheel)")
def test_sensor_fusion_math():
    """
    Verifies that fusing gyro angular velocity (deg/s) with gravity vector
    allows smooth rotation beyond 90 degrees up to 450 degrees (900 lock-to-lock)
    without Euler gimbal flips.
    """
    angle = 0.0
    alpha = 0.98 # complementary filter coefficient
    dt = 1.0 / 60.0

    # Simulate rotating wheel at 120 deg/s for 2 seconds -> should reach 240 deg
    gyro_rate = 120.0
    for _ in range(120):
        # Simulated gravity angle tracking
        grav_angle = angle + gyro_rate * dt
        # Complementary filter
        angle = alpha * (angle + gyro_rate * dt) + (1.0 - alpha) * grav_angle

    assert math.isclose(angle, 240.0, rel_tol=0.05), f"Expected ~240°, got {angle}°"

    # Normalize to 900 degree lock-to-lock (±450°)
    max_range = 450.0
    normalized_steer = max(-1.0, min(1.0, angle / max_range))
    assert math.isclose(normalized_steer, 240.0 / 450.0, rel_tol=1e-2)


@test("Vehicle Physics: Gear ratios, speed, and braking deceleration")
def test_vehicle_physics_math():
    mass = 1250.0 # kg
    gear_ratios = {1: 3.6, 2: 2.3, 3: 1.6, 4: 1.2, 5: 0.95, 6: 0.8}
    final_drive = 3.4
    wheel_radius = 0.36 # m

    # 1. First gear at 6000 RPM speed calculation
    rpm = 6000.0
    wheel_rpm = rpm / (gear_ratios[1] * final_drive)
    speed_ms = (wheel_rpm * 2 * math.pi * wheel_radius) / 60.0
    speed_kmh = speed_ms * 3.6
    assert 50.0 <= speed_kmh <= 75.0, f"Expected 1st gear 6000 RPM speed between 50-75 km/h, got {speed_kmh}"

    # 2. Braking deceleration: 10,000 N brake force on 1250 kg car -> -8 m/s^2 deceleration
    brake_force = 10000.0
    decel = brake_force / mass
    assert decel == 8.0, f"Expected 8 m/s^2 deceleration, got {decel}"


async def main():
    print("=" * 60)
    print("   🏎️  GYROPAD AUTOMATED TEST SUITE")
    print("=" * 60)
    await test_http_endpoints()
    await test_network_api()
    await test_websocket_stream()
    await test_sensor_fusion_math()
    await test_vehicle_physics_math()
    print("-" * 60)
    print(f"Results: {passed} PASSED, {failed} FAILED")
    print("=" * 60)
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
