# 🏎️ Gyropad Pro - Sim Companion & PC Game Controller

Turn any smartphone into a precision motion-controlled racing steering wheel, pedal set, and gamepad for **any PC game** simply by downloading and completing the one-time PC setup.

**Author**: [Angry-panda-Abhi](https://github.com/Angry-panda-Abhi)

---

## 🎯 Play ANY Game on PC

Gyropad provides a hardware kernel-level bridge so your phone acts as a real controller directly in Windows & Linux:

1. **🏎️ Steam & PC Racing Simulators (Xbox 360 Controller / XInput)**:
   - **Supported Games**: *Assetto Corsa*, *Assetto Corsa Competizione*, *BeamNG.drive*, *Euro Truck Simulator 2*, *American Truck Simulator*, *Forza Horizon 4 & 5*, *F1 23/24*, *Project CARS*, *Dirt Rally*, *WRC*, *Rocket League*, *GTA V*.
   - **Capabilities**:
     - True 900° lock-to-lock analog steering wheel (`ABS_X`).
     - Progressive analog gas trigger (`RT` / `ABS_RZ`).
     - Progressive analog brake trigger (`LT` / `ABS_Z`).
     - Sequential paddle shifters (`LB` / `RB`).
     - Handbrake button (`A`), NOS boost, and camera view toggle.

2. **⌨️ Keyboard-Only & Arcade Games (Virtual Keyboard WASD / Arrows)**:
   - **Supported Games**: *TrackMania*, *Need for Speed Most Wanted/Underground*, *OutRun*, retro flash racers, and browser games.
   - **Capabilities**: Phone tilt and pedal touches automatically press `W`, `A`, `S`, `D`, and `Space` at the OS kernel level.

3. **🕹️ Emulators (PS2 / PS3 / Switch / Retro)**:
   - **Supported Emulators**: *RPCS3*, *PCSX2*, *Dolphin*, *DuckStation*, *RetroArch*, *PPSSPP*.
   - **Capabilities**: Instantly recognized as an Xbox 360 controller with full analog axis mapping.

---

## 📥 How to Download & Play

### Option 1: Direct GitHub Download (Easiest for Everyone)
Anyone visiting this repository can start playing immediately in 1 click:
1. Click the green **`<> Code`** button at the top right of this page and select **"Download ZIP"**.
2. Extract the downloaded `Gyropad-main.zip` folder.
3. Launch:
   - **On Windows**: Simply double-click **`run_windows.bat`**! (It automatically checks Python, installs drivers, and opens the dashboard).
   - **On Linux**: Double-click **`run.sh`** or run `bash setup_pc.sh`.

### Option 2: Linux One-Line Terminal Installer
On Ubuntu, Debian, Fedora, Arch, or Linux Mint, open a terminal and run:
```bash
curl -fsSL https://raw.githubusercontent.com/Angry-panda-Abhi/Gyropad/main/install.sh | bash
```
This automatically configures the Xbox 360 controller driver, adds the **Gyropad** application icon to your Desktop & Applications Menu, and launches the companion.

### Option 3: Pre-Compiled GitHub Release Binaries
If a release is published under the **Releases** tab:
- **Windows (`x64`)**: Download `gyropad-windows-x64.zip`, extract, and double-click `gyropad.exe`.
- **Linux (`x86_64`)**: Download `gyropad-linux-x86_64.tar.gz`, extract, and run `./gyropad`.

### Option 4: 📱 Mobile Phone Controller (PWA Native App)
When visiting your PC's controller URL on your smartphone (`https://<PC_IP>:8443/phone`):
- Tap the green **"INSTALL APP"** button in the top bar (or select **"Add to Home Screen"** in Chrome/Safari).
- Gyropad installs directly to your phone's home screen with a dedicated motorsport app icon and launches full-screen in landscape mode without browser navigation bars!

---

## 🚀 Run From Source

### On Linux (Ubuntu / Debian / Arch / Fedora):
1. Run the one-step setup script in the Gyropad folder:
   ```bash
   cd Gyropad
   bash setup_pc.sh
   ```
   *What this does:*
   - Configures `/etc/udev/rules.d/99-gyropad-uinput.rules` for non-root `/dev/uinput` access.
   - Adds your user to the `uinput` group.
   - Creates a **Gyropad** clickable application icon directly on your Desktop and Application Menu (`~/Desktop/Gyropad.desktop`).
   - Launches the companion server and opens the dashboard in your browser.

2. Double-click the **Gyropad** desktop shortcut anytime you want to race!

### On Windows:
1. Open the `windows/` folder and double-click `setup_windows.bat`.
2. It installs `vgamepad` and creates a virtual Microsoft Xbox 360 controller via the standard ViGEmBus driver.

---

## 📱 Connecting Your Smartphone

1. Open your browser on PC to:
   ```
   http://localhost:8080/pc
   ```
2. Connect your phone:
   - **Wi-Fi**: Scan the QR code displayed on the screen with your phone camera, or visit:
     `https://<YOUR_PC_IP>:8443/phone` (or `http://<YOUR_PC_IP>:8080/phone`).
   - **USB Cable (Zero Lag)**: Plug your phone into your PC with a USB cable and enable **USB Tethering** in your phone's Settings.
3. Hold your phone horizontally like a racing wheel.
4. Tap the center **CALIBRATE (ZERO)** button while holding your phone straight.

---

## 🕹️ In-Game Mapping Guide

### Steam (Assetto Corsa, BeamNG.drive, Euro Truck Simulator 2):
1. Connect your phone to Gyropad.
2. In Steam, go to **Settings &rarr; Controller &rarr; General Controller Settings**. You will see **"Microsoft Xbox 360 Controller"** detected.
3. Launch your game:
   - **Steering**: Bind to Left Stick Horizontal (`ABS_X`).
   - **Throttle**: Bind to Right Trigger (`RT`).
   - **Brake**: Bind to Left Trigger (`LT`).
   - **Shift Up / Down**: Bind to Right Bumper (`RB`) and Left Bumper (`LB`).

### TrackMania & Keyboard Games:
1. On the PC Dashboard (`http://localhost:8080/pc`), click the **"KEYBOARD WASD"** profile.
2. Launch TrackMania or any keyboard game — tilting your phone will now steer (`A` / `D`), and pedals will accelerate (`W`) and brake (`S`).

---

## 🧪 Automated Test Verification

Gyropad includes complete automated test coverage:
```bash
python3 tests/test_gyropad.py
python3 tests/test_components.py
python3 tests/test_pc_gamepad.py
```
- Multi-touch pedal isolation (zero cross-talk between feet).
- 900° drift-free sensor fusion and complementary filter math.
- Xbox 360 controller axis scaling and uinput event integrity.
- Keyboard WASD deadzone thresholding.
- Network API and WebSocket real-time telemetry streaming.
