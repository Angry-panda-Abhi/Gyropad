#!/usr/bin/env python3
"""
Gyropad PC Companion & Web Controller Server
Zero-dependency Python 3 HTTP & WebSocket Server with integrated
Linux Virtual Gamepad (Xbox 360) and Virtual Keyboard engine.
"""

import os
import sys
import json
import time
import socket
import asyncio
import threading
import mimetypes
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

try:
    import websockets
except ImportError:
    print("Error: 'websockets' package is required. Install with: pip install websockets")
    sys.exit(1)

import ssl

# Import the Virtual Gamepad & Keyboard Engine
try:
    from virtual_gamepad import GyropadVirtualController
    virtual_controller = GyropadVirtualController(mode="gamepad")
except Exception as e:
    virtual_controller = None
    print(f"[Virtual Controller Warning] Could not load: {e}")

HTTP_PORT = 8080
HTTPS_PORT = 8443
WS_PORT = 8765
WSS_PORT = 8766
# Resolve asset root (works in both raw Python and PyInstaller frozen single-binary)
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    APP_ROOT = sys._MEIPASS
else:
    APP_ROOT = os.path.dirname(os.path.abspath(__file__))

BASE_DIR = os.path.join(APP_ROOT, "public")

# Config directory for persistent SSL certs (~/.config/gyropad or local repo)
CONFIG_DIR = os.path.expanduser("~/.config/gyropad")
os.makedirs(CONFIG_DIR, exist_ok=True)
CERT_FILE = os.path.join(CONFIG_DIR, "cert.pem")
KEY_FILE = os.path.join(CONFIG_DIR, "key.pem")

# Fallback to local certs if present in repo directory
local_cert = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cert.pem")
local_key = os.path.join(os.path.dirname(os.path.abspath(__file__)), "key.pem")
if os.path.isfile(local_cert) and os.path.isfile(local_key):
    CERT_FILE = local_cert
    KEY_FILE = local_key

# Auto-generate self-signed certs if missing (ensures HTTPS works out of the box on new clones or standalone app)
if not (os.path.isfile(CERT_FILE) and os.path.isfile(KEY_FILE)):
    try:
        import subprocess
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", KEY_FILE, "-out", CERT_FILE,
            "-days", "365", "-nodes", "-subj", "/CN=Gyropad"
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.chmod(KEY_FILE, 0o600)
        print("  [SSL] Generated self-signed SSL certificates for local HTTPS.")
    except Exception as e:
        print(f"  [SSL Notice] Could not auto-generate SSL certs: {e}")

has_ssl = os.path.isfile(CERT_FILE) and os.path.isfile(KEY_FILE)
ssl_ctx = None
if has_ssl:
    try:
        ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_ctx.load_cert_chain(CERT_FILE, KEY_FILE)
    except Exception as e:
        print(f"[SSL Warning] Could not load certs: {e}")
        has_ssl = False

# Connected WebSocket clients
pc_clients = set()
phone_clients = set()
main_loop = None
last_phone_active_time = 0.0
phone_connected_state = False


def get_local_ips():
    """Detect active local LAN IP addresses (Wi-Fi, Ethernet, USB) on Linux & Windows."""
    ips = []

    # Windows LAN IP detection
    if sys.platform == "win32":
        try:
            hostname = socket.gethostname()
            for ip in socket.gethostbyname_ex(hostname)[2]:
                if not ip.startswith("127.") and ip not in ips:
                    ips.append(ip)
        except Exception:
            pass

    # Linux network interfaces directly via `ip -4 addr show`
    if not ips and sys.platform != "win32":
        try:
            import subprocess
            out = subprocess.check_output(["ip", "-4", "addr", "show"], text=True, timeout=2)
            wireless_ips = []
            other_ips = []
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("inet "):
                    parts = line.split()
                    ip = parts[1].split("/")[0]
                    if not ip.startswith("127."):
                        iface = parts[-1] if len(parts) >= 7 else ""
                        if iface.startswith("wl") or iface.startswith("wlan") or iface.startswith("wifi"):
                            wireless_ips.append(ip)
                        else:
                            other_ips.append(ip)
            ips.extend(wireless_ips + other_ips)
        except Exception:
            pass

    # 2. Socket routing fallback
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            primary_ip = s.getsockname()[0]
            s.close()
            if primary_ip not in ips and not primary_ip.startswith("127."):
                ips.append(primary_ip)
        except Exception:
            pass

    if not ips:
        ips.append("127.0.0.1")
    return ips


class GyropadHTTPHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler serving the Gyropad web app & PC Gamepad APIs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        msg = format % args
        if any(r in msg for r in ["/phone", "/pc", "/api/", "/downloads"]):
            print(f"  [HTTP] {msg}")

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean in ["", "/"]:
            clean = "/index.html"
        elif clean == "/pc":
            clean = "/pc.html"
        elif clean == "/phone":
            clean = "/phone.html"
        return super().translate_path(clean)

    def do_GET(self):
        clean_path = self.path.split("?", 1)[0]

        # Fast ping endpoint for latency checks
        if clean_path == "/api/ping":
            global last_phone_active_time, phone_connected_state
            last_phone_active_time = time.time()
            if not phone_connected_state and main_loop and not main_loop.is_closed():
                phone_connected_state = True
                for pc in list(pc_clients):
                    try:
                        asyncio.run_coroutine_threadsafe(
                            pc.send(json.dumps({"type": "phone_status", "connected": True})),
                            main_loop
                        )
                    except Exception:
                        pass
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(b'{"pong":true}')
            return

        # API endpoint for PC Companion to get accurate Wi-Fi LAN IP
        if clean_path == "/api/network":
            ips = get_local_ips()
            primary_ip = ips[0]
            data = {
                "ip": primary_ip,
                "all_ips": ips,
                "phone_url": f"http://{primary_ip}:{HTTP_PORT}/phone",
                "phone_https_url": f"https://{primary_ip}:{HTTPS_PORT}/phone" if has_ssl else None,
                "ws_url": f"ws://{primary_ip}:{WS_PORT}",
                "wss_url": f"wss://{primary_ip}:{WSS_PORT}" if has_ssl else None,
                "http_port": HTTP_PORT,
                "https_port": HTTPS_PORT,
                "ws_port": WS_PORT,
                "wss_port": WSS_PORT,
                "has_ssl": has_ssl
            }
            body = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # API endpoint for Gamepad Status
        if clean_path == "/api/gamepad/status":
            if virtual_controller:
                virtual_controller.retry_init()
                status = virtual_controller.get_status()
            else:
                status = {
                    "supported": False,
                    "uinput_accessible": False,
                    "active": False,
                    "mode": "gamepad",
                    "error": "Virtual Controller module not loaded",
                    "devices": []
                }
            body = json.dumps(status).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Mobile redirect for root URL
        user_agent = self.headers.get("User-Agent", "").lower()
        is_mobile = any(m in user_agent for m in ["android", "iphone", "ipad", "mobile"])

        if clean_path in ["", "/"] and is_mobile:
            self.send_response(302)
            self.send_header("Location", "/phone")
            self.end_headers()
            return

        super().do_GET()

    def do_POST(self):
        clean_path = self.path.split("?", 1)[0]

        # API endpoint for high-speed HTTP fallback input stream
        if clean_path == "/api/input":
            global last_phone_active_time, phone_connected_state
            last_phone_active_time = time.time()
            if not phone_connected_state and main_loop and not main_loop.is_closed():
                phone_connected_state = True
                for pc in list(pc_clients):
                    try:
                        asyncio.run_coroutine_threadsafe(
                            pc.send(json.dumps({"type": "phone_status", "connected": True})),
                            main_loop
                        )
                    except Exception:
                        pass

            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                if virtual_controller and virtual_controller.is_active:
                    virtual_controller.dispatch_input(data)

                # Broadcast to PC companion clients
                if main_loop and not main_loop.is_closed():
                    msg_str = json.dumps(data)
                    for pc in list(pc_clients):
                        try:
                            asyncio.run_coroutine_threadsafe(pc.send(msg_str), main_loop)
                        except Exception:
                            pass

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        # API endpoint to switch controller mode dynamically
        if clean_path == "/api/gamepad/mode":
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                body = json.loads(post_data.decode('utf-8'))
                mode = body.get("mode", "gamepad")
                if virtual_controller:
                    virtual_controller.set_mode(mode)
                    status = virtual_controller.get_status()
                    # Broadcast updated status to all connected PC dashboards
                    status_json = json.dumps({"type": "gamepad_status", "status": status})
                    for pc in list(pc_clients):
                        try:
                            asyncio.run_coroutine_threadsafe(pc.send(status_json), asyncio.get_event_loop())
                        except Exception:
                            pass
                else:
                    status = {"active": False, "mode": mode, "error": "Driver not loaded"}

                resp = json.dumps(status).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


async def ws_handler(websocket):
    """Handles WebSocket connections for phone controller and PC dashboard."""
    client_role = None
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                # Initial handshake to register client role
                if msg_type == "handshake":
                    client_role = data.get("role")
                    if client_role == "pc":
                        pc_clients.add(websocket)
                        has_phone = len(phone_clients) > 0 or (time.time() - last_phone_active_time) < 3.5
                        gp_status = virtual_controller.get_status() if virtual_controller else {}
                        await websocket.send(json.dumps({
                            "type": "phone_status",
                            "connected": has_phone,
                            "gamepad_status": gp_status
                        }))

                    elif client_role == "phone":
                        phone_clients.add(websocket)
                        phone_connected_state = True
                        print("  [WS] 📱 Phone Controller connected!")
                        # Notify all PC clients
                        for pc in list(pc_clients):
                            try:
                                await pc.send(json.dumps({
                                    "type": "phone_status",
                                    "connected": True
                                }))
                            except Exception:
                                pass

                # Heartbeat ping/pong for latency tracking
                elif msg_type == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))

                # Mode switch request via WebSocket
                elif msg_type == "set_gamepad_mode":
                    mode = data.get("mode")
                    if virtual_controller and mode:
                        virtual_controller.set_mode(mode)
                        gp_status = virtual_controller.get_status()
                        for pc in list(pc_clients):
                            try:
                                await pc.send(json.dumps({
                                    "type": "gamepad_status",
                                    "status": gp_status
                                }))
                            except Exception:
                                pass

                # Real-time control packets from phone
                elif msg_type == "input":
                    # 1. Feed directly into Linux kernel virtual Xbox 360 / Keyboard device!
                    if virtual_controller and virtual_controller.is_active:
                        virtual_controller.dispatch_input(data)

                    # 2. Broadcast to all PC dashboards (for 3D simulator & telemetry meters)
                    for pc in list(pc_clients):
                        try:
                            await pc.send(message)
                        except Exception:
                            pass

                # Feedback from PC game (speed, gear) to phone HUD
                elif msg_type == "game_state":
                    for ph in list(phone_clients):
                        try:
                            await ph.send(message)
                        except Exception:
                            pass

            except json.JSONDecodeError:
                pass

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if websocket in pc_clients:
            pc_clients.remove(websocket)
        if websocket in phone_clients:
            phone_clients.remove(websocket)
            print("  [WS] 📱 Phone Controller disconnected")
            # If phone is not actively streaming via HTTP, notify PCs
            if (time.time() - last_phone_active_time) > 3.5:
                phone_connected_state = False
                for pc in list(pc_clients):
                    try:
                        await pc.send(json.dumps({
                            "type": "phone_status",
                            "connected": False
                        }))
                    except Exception:
                        pass


async def phone_watchdog():
    """Periodically checks if HTTP phone client has gone inactive (>3.5s) and notifies PC."""
    global phone_connected_state
    while True:
        await asyncio.sleep(1.5)
        if len(phone_clients) == 0 and phone_connected_state:
            if (time.time() - last_phone_active_time) > 3.5:
                phone_connected_state = False
                for pc in list(pc_clients):
                    try:
                        await pc.send(json.dumps({
                            "type": "phone_status",
                            "connected": False
                        }))
                    except Exception:
                        pass


def start_http_server():
    """Runs the Threading HTTP Server on port 8080."""
    httpd = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), GyropadHTTPHandler)
    httpd.serve_forever()


def start_https_server():
    """Runs the Threading HTTPS Server on port 8443 if SSL is available."""
    if not ssl_ctx:
        return
    try:
        httpd = ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), GyropadHTTPHandler)
        httpd.socket = ssl_ctx.wrap_socket(httpd.socket, server_side=True)
        httpd.serve_forever()
    except Exception as e:
        print(f"  [HTTPS] Error: {e}")


async def main():
    global main_loop
    main_loop = asyncio.get_running_loop()
    ips = get_local_ips()
    primary_ip = ips[0]

    # Start HTTP server thread
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    # Start HTTPS server thread
    if has_ssl and ssl_ctx:
        https_thread = threading.Thread(target=start_https_server, daemon=True)
        https_thread.start()

    gp_state = "ACTIVE" if (virtual_controller and virtual_controller.is_active) else "READY (Setup script available)"

    print("\n" + "=" * 65)
    print("   🏎️   G Y R O P A D   P R O   S E R V I C E   O N L I N E")
    print("=" * 65)
    print(f"  🖥️   PC Companion & Dashboard:  http://localhost:{HTTP_PORT}/pc")
    print(f"  📱  Phone Controller (HTTP):   http://{primary_ip}:{HTTP_PORT}/phone")
    if has_ssl:
        print(f"  🔒  Phone Controller (HTTPS):  https://{primary_ip}:{HTTPS_PORT}/phone")
    print(f"  🎮  Virtual Xbox 360 Driver:   {gp_state}")
    print(f"  ⚡  WebSocket Telemetry:       ws://0.0.0.0:{WS_PORT}")
    if has_ssl:
        print(f"  🔐  WebSocket Secure (WSS):    wss://0.0.0.0:{WSS_PORT}")
    print("-" * 65)
    print("  Tip: Run 'bash setup_pc.sh' once to enable native Xbox 360 controller driver.")
    print("=" * 65 + "\n")

    # Start WebSocket servers
    ws_server = await websockets.serve(ws_handler, "0.0.0.0", WS_PORT)
    wss_server = None
    if has_ssl and ssl_ctx:
        try:
            wss_server = await websockets.serve(ws_handler, "0.0.0.0", WSS_PORT, ssl=ssl_ctx)
        except Exception as e:
            print(f"  [WSS Error]: {e}")

    # Background phone inactivity watchdog
    asyncio.create_task(phone_watchdog())

    await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        if virtual_controller:
            virtual_controller.close()
        print("\n[Gyropad] Server stopped.")
