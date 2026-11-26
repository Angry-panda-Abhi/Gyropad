/**
 * Gyropad Pro - PC Companion & Telemetry Dashboard Script
 */

class PCCompanion {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.phoneConnected = false;
    this.game = null;
    this.pingStartTime = 0;
    this.latency = 0;
    this.gamepadMode = 'gamepad';
    this.gamepadStatus = null;

    this.init();
  }

  init() {
    this.setupTabs();
    this.setupGamepadBridge();
    this.connectWebSocket();
    this.generateQRCode();
    this.setupSkyHeadliner();
    this.setupSettingsHandlers();

    if (document.getElementById('game-canvas')) {
      this.game = new RacingGame('game-canvas');
    }

    setInterval(() => this.measurePing(), 2000);
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetId = tab.getAttribute('data-target');
        document.querySelectorAll('.tab-content').forEach(section => {
          section.classList.remove('active');
        });
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.add('active');

        if (targetId === 'tab-game' && this.game) {
          setTimeout(() => this.game.onResize(), 50);
        }
      });
    });

    const startBtn = document.getElementById('btn-start-driving');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const modal = document.getElementById('game-start-modal');
        if (modal) modal.style.display = 'none';
        if (window.soundEngine) window.soundEngine.init();
      });
    }
  }

  connectWebSocket() {
    const host = window.location.hostname || 'localhost';
    const wsUrl = `ws://${host}:8765`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.updatePCStatus(true);
        this.ws.send(JSON.stringify({ type: 'handshake', role: 'pc' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'phone_status') {
            this.serverReportedPhone = msg.connected;
            this.phoneConnected = msg.connected;
            this.updatePhoneStatus(msg.connected);
            if (msg.gamepad_status) {
              this.updateGamepadStatusUI(msg.gamepad_status);
            }
          }

          if (msg.type === 'gamepad_status') {
            this.updateGamepadStatusUI(msg.status);
          }

          if (msg.type === 'pong') {
            this.latency = Math.round(performance.now() - this.pingStartTime);
            const latEl = document.getElementById('pc-latency');
            if (latEl) latEl.textContent = `${this.latency} ms`;
          }

          if (msg.type === 'input') {
            if (!this.phoneConnected) {
              this.phoneConnected = true;
              this.updatePhoneStatus(true);
            }
            clearTimeout(this.phoneDisconnectTimer);
            this.phoneDisconnectTimer = setTimeout(() => {
              if (this.phoneConnected && !this.serverReportedPhone) {
                this.phoneConnected = false;
                this.updatePhoneStatus(false);
              }
            }, 3500);

            if (this.game) {
              this.game.applyPhoneInput(msg);
            }
            this.updateTelemetryHUD(msg);
            this.updateHardwareVisualizer(msg);
          }
        } catch (e) {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.updatePCStatus(false);
        this.updatePhoneStatus(false);
        setTimeout(() => this.connectWebSocket(), 1500);
      };

      this.ws.onerror = () => {
        this.ws.close();
      };
    } catch (e) {
      setTimeout(() => this.connectWebSocket(), 2000);
    }
  }

  updatePCStatus(online) {
    const dot = document.getElementById('pc-conn-dot');
    const txt = document.getElementById('pc-conn-text');
    if (dot) {
      if (online) dot.classList.add('online');
      else dot.classList.remove('online');
    }
    if (txt) {
      txt.textContent = online ? 'LINK ONLINE' : 'DISCONNECTED';
    }
  }

  updatePhoneStatus(online) {
    const phoneInd = document.getElementById('phone-connected-indicator');
    if (phoneInd) {
      phoneInd.textContent = online ? 'PHONE: LINKED' : 'PHONE: STANDBY';
      phoneInd.style.color = online ? '#00FF66' : '#8E8A9C';
    }
    const modalHint = document.getElementById('modal-phone-hint');
    if (modalHint) {
      modalHint.innerHTML = online 
        ? '<strong style="color: #00FF66;">✓ PHONE CONNECTED AND SYNCHRONIZED</strong>'
        : 'SCAN QR WITH PHONE OR VISIT:';
    }
  }

  measurePing() {
    if (!this.connected || !this.ws) return;
    this.pingStartTime = performance.now();
    this.ws.send(JSON.stringify({ type: 'ping' }));
  }

  updateTelemetryHUD(data) {
    // Wheel Telemetry
    if (data.steering !== undefined) {
      const angleDeg = data.rawAngle !== undefined ? data.rawAngle : (data.steering * 90);
      const wheelSvg = document.getElementById('telemetry-wheel-svg');
      const angleText = document.getElementById('telemetry-angle-val');
      if (wheelSvg) wheelSvg.style.transform = `rotate(${data.steering * 180}deg)`;
      if (angleText) {
        const sign = angleDeg > 0 ? '+' : '';
        angleText.textContent = `${sign}${angleDeg.toFixed(1)}°`;
      }
    }

    // Pedals
    if (data.throttle !== undefined) {
      const pct = Math.round(data.throttle * 100);
      const fill = document.getElementById('telemetry-gas-fill');
      const val = document.getElementById('telemetry-gas-val');
      if (fill) fill.style.height = `${pct}%`;
      if (val) val.textContent = `${pct}%`;
    }

    if (data.brake !== undefined) {
      const pct = Math.round(data.brake * 100);
      const fill = document.getElementById('telemetry-brake-fill');
      const val = document.getElementById('telemetry-brake-val');
      if (fill) fill.style.height = `${pct}%`;
      if (val) val.textContent = `${pct}%`;
    }

    if (data.clutch !== undefined) {
      const pct = Math.round(data.clutch * 100);
      const fill = document.getElementById('telemetry-clutch-fill');
      const val = document.getElementById('telemetry-clutch-val');
      if (fill) fill.style.height = `${pct}%`;
      if (val) val.textContent = `${pct}%`;
    }

    // Shifter Paddles Highlight
    if (data.shiftDown) {
      const p = document.getElementById('dash-paddle-down');
      if (p) {
        p.classList.add('active');
        setTimeout(() => p.classList.remove('active'), 140);
      }
    }
    if (data.shiftUp) {
      const p = document.getElementById('dash-paddle-up');
      if (p) {
        p.classList.add('active');
        setTimeout(() => p.classList.remove('active'), 140);
      }
    }

    // G-Force Friction Vector
    if (this.game && this.game.car) {
      const gX = Math.max(-1.5, Math.min(1.5, this.game.car.lateralG));
      const gY = Math.max(-1.5, Math.min(1.5, this.game.car.longitudinalG));

      const dot = document.getElementById('g-force-dot');
      const readout = document.getElementById('g-force-readout');

      if (dot) {
        const px = 70 + (gX / 1.5) * 55;
        const py = 70 - (gY / 1.5) * 55;
        dot.style.left = `${px}px`;
        dot.style.top = `${py}px`;
      }
      if (readout) {
        readout.textContent = `LAT: ${Math.abs(gX).toFixed(2)} G | LONG: ${Math.abs(gY).toFixed(2)} G`;
      }

      // Large Gear Indicator
      const g = this.game.car.gear;
      const gearEl = document.getElementById('dash-gear-display');
      if (gearEl) gearEl.textContent = g === -1 ? 'R' : (g === 0 ? 'N' : g);
    }
  }

  async generateQRCode() {
    let phoneUrl = `${window.location.protocol}//${window.location.hostname || 'localhost'}:${window.location.port || '8080'}/phone`;
    try {
      const res = await fetch('/api/network');
      if (res.ok) {
        const net = await res.json();
        if (net.phone_url) phoneUrl = net.phone_url;
      }
    } catch (e) {
      const host = window.location.hostname || 'localhost';
      const port = window.location.port || '8080';
      phoneUrl = `${window.location.protocol}//${host}:${port}/phone`;
    }

    const urlDisplay = document.querySelectorAll('.display-phone-url');
    urlDisplay.forEach(el => {
      el.textContent = phoneUrl;
      if (el.tagName === 'A') el.href = phoneUrl;
    });

    const httpsDisplay = document.querySelectorAll('.display-phone-https-url');
    const httpsUrl = phoneUrl.replace('http:', 'https:').replace(':8080', ':8443');
    httpsDisplay.forEach(el => {
      el.textContent = httpsUrl;
      if (el.tagName === 'A') el.href = httpsUrl;
    });

    ['start-qr', 'dash-qr-holder'].forEach(containerId => {
      const el = document.getElementById(containerId);
      if (el && window.QRCode) {
        el.innerHTML = '';
        new QRCode(el, {
          text: phoneUrl,
          width: 140,
          height: 140,
          colorDark: '#0A090D',
          colorLight: '#FFFFFF',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    });
  }

  setupSettingsHandlers() {
    const rangeSelect = document.getElementById('setting-steer-range');
    if (rangeSelect && this.game && this.game.car) {
      rangeSelect.addEventListener('change', (e) => {
        // Range updated
      });
    }

    const soundToggle = document.getElementById('setting-sound-toggle');
    if (soundToggle) {
      soundToggle.addEventListener('change', (e) => {
        if (window.soundEngine) {
          window.soundEngine.isMuted = !e.target.checked;
        }
      });
    }
  }

  setupSkyHeadliner() {
    const cv = document.getElementById('sky');
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let stars = [];
    let vw = 0, vh = 0;
    let tx = 0, ty = 0, px = 0, py = 0, inf = 0, infTo = 0;

    function resize() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      cv.width = vw;
      cv.height = vh;
      stars = [];
      const n = Math.round(Math.min(260, Math.max(70, (vw * vh) / 5000)));
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * vw,
          y: Math.random() * vh,
          size: 0.7 + Math.random() * 1.3,
          baseAlpha: 0.12 + Math.random() * 0.4,
          speed: 0.6 + Math.random() * 1.8
        });
      }
    }

    window.addEventListener('mousemove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      infTo = 1;
    });

    window.addEventListener('mouseleave', () => { infTo = 0; });
    window.addEventListener('resize', resize);
    resize();

    let t = 0;
    function render() {
      t += 0.015;
      ctx.clearRect(0, 0, vw, vh);

      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      inf += (infTo - inf) * 0.04;

      for (let s of stars) {
        const twinkle = Math.sin(t * s.speed + s.x) * 0.2;
        let alpha = Math.max(0.08, Math.min(1.0, s.baseAlpha + twinkle));

        if (inf > 0.01) {
          const dx = px - s.x;
          const dy = py - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) {
            const boost = (1 - dist / 200) * 0.6 * inf;
            alpha = Math.min(1.0, alpha + boost);
          }
        }

        ctx.fillStyle = `rgba(230, 224, 240, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }

  setupGamepadBridge() {
    // Mode card click handlers
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.getAttribute('data-mode');
        this.setGamepadMode(mode);
      });
    });

    // Copy command button
    const copyBtn = document.getElementById('btn-copy-setup');
    const cmdText = document.getElementById('setup-command-text');
    if (copyBtn && cmdText) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cmdText.textContent.trim()).then(() => {
          const orig = copyBtn.textContent;
          copyBtn.textContent = 'COPIED!';
          copyBtn.style.background = 'var(--accent-green)';
          copyBtn.style.color = '#000';
          setTimeout(() => {
            copyBtn.textContent = orig;
            copyBtn.style.background = '';
            copyBtn.style.color = '';
          }, 1800);
        }).catch(() => {});
      });
    }

    // Initial fetch of gamepad driver status
    this.fetchGamepadStatus();
    setInterval(() => this.fetchGamepadStatus(), 4000);
  }

  async fetchGamepadStatus() {
    try {
      const res = await fetch('/api/gamepad/status');
      if (res.ok) {
        const data = await res.json();
        this.updateGamepadStatusUI(data);
      }
    } catch (e) {}
  }

  async setGamepadMode(mode) {
    this.gamepadMode = mode;
    // Send via WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_gamepad_mode', mode: mode }));
    }
    // Also send via HTTP POST fallback
    try {
      const res = await fetch('/api/gamepad/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode })
      });
      if (res.ok) {
        const data = await res.json();
        this.updateGamepadStatusUI(data);
      }
    } catch (e) {}
  }

  updateGamepadStatusUI(status) {
    if (!status) return;
    this.gamepadStatus = status;

    const pill = document.getElementById('driver-status-pill');
    const txt = document.getElementById('driver-status-text');
    const devNode = document.getElementById('status-device-node');

    if (status.active) {
      if (pill) {
        pill.className = 'driver-pill active';
      }
      if (txt) {
        txt.textContent = '● VIRTUAL XBOX 360 CONTROLLER: ACTIVE & RUNNING';
      }
      if (devNode) {
        devNode.textContent = '/dev/input/js0 (Kernel Xbox 360 & Keyboard)';
        devNode.style.color = 'var(--accent-green)';
      }
    } else {
      if (pill) {
        pill.className = 'driver-pill warning';
      }
      if (txt) {
        txt.textContent = '⚠️ DRIVER SETUP REQUIRED (RUN BASH SETUP_PC.SH)';
      }
      if (devNode) {
        devNode.textContent = status.error || 'Awaiting /dev/uinput permissions';
        devNode.style.color = 'var(--accent-amber)';
      }
    }

    // Update active mode card
    const currentMode = status.mode || this.gamepadMode;
    document.querySelectorAll('.mode-card').forEach(c => {
      if (c.getAttribute('data-mode') === currentMode) {
        c.classList.add('selected');
      } else {
        c.classList.remove('selected');
      }
    });

    const modeTag = document.getElementById('live-driver-mode-tag');
    if (modeTag) {
      const modeNames = {
        gamepad: 'MODE: XBOX 360 (XINPUT)',
        keyboard_wasd: 'MODE: KEYBOARD (WASD)',
        keyboard_arrows: 'MODE: KEYBOARD (ARROWS)'
      };
      modeTag.textContent = modeNames[currentMode] || `MODE: ${currentMode.toUpperCase()}`;
    }
  }

  updateHardwareVisualizer(data) {
    // 1. Steering & Thumbstick
    if (data.steering !== undefined) {
      const steerNorm = Math.max(-1.0, Math.min(1.0, data.steering));
      const steerRaw = Math.round(steerNorm * 32767);
      const angleDeg = data.rawAngle !== undefined ? data.rawAngle : (steerNorm * 90);

      const thumb = document.getElementById('vis-thumb-left');
      if (thumb) {
        const tx = steerNorm * 14;
        thumb.style.transform = `translate(${tx}px, 0px)`;
      }

      const steerVal = document.getElementById('vis-steer-val');
      if (steerVal) {
        const sign = angleDeg > 0 ? '+' : '';
        steerVal.textContent = `${sign}${angleDeg.toFixed(1)}° (${steerRaw})`;
      }

      const steerFill = document.getElementById('vis-steer-fill');
      if (steerFill) {
        const pct = Math.abs(steerNorm) * 50;
        steerFill.style.width = `${pct}%`;
        if (steerNorm < 0) {
          steerFill.style.left = `${50 - pct}%`;
        } else {
          steerFill.style.left = '50%';
        }
      }
    }

    // 2. Throttle
    if (data.throttle !== undefined) {
      const gasPct = Math.round(data.throttle * 100);
      const gasRaw = Math.round(data.throttle * 1023);
      const gasFill = document.getElementById('vis-gas-fill');
      const gasVal = document.getElementById('vis-gas-val');
      if (gasFill) gasFill.style.width = `${gasPct}%`;
      if (gasVal) gasVal.textContent = `${gasPct}% (${gasRaw})`;
    }

    // 3. Brake
    if (data.brake !== undefined) {
      const brkPct = Math.round(data.brake * 100);
      const brkRaw = Math.round(data.brake * 1023);
      const brkFill = document.getElementById('vis-brake-fill');
      const brkVal = document.getElementById('vis-brake-val');
      if (brkFill) brkFill.style.width = `${brkPct}%`;
      if (brkVal) brkVal.textContent = `${brkPct}% (${brkRaw})`;
    }

    // 4. Handbrake & Button A
    if (data.handbrake !== undefined) {
      const hbVal = document.getElementById('vis-handbrake-val');
      const btnA = document.getElementById('vis-btn-a');
      if (hbVal) hbVal.textContent = data.handbrake ? 'PULLED (BTN_A)' : 'RELEASED';
      if (btnA) {
        if (data.handbrake) btnA.classList.add('active');
        else btnA.classList.remove('active');
      }
    }

    // 5. Paddles (LB/RB)
    if (data.shiftDown) {
      const lb = document.getElementById('vis-lb');
      if (lb) {
        lb.classList.add('active');
        setTimeout(() => lb.classList.remove('active'), 150);
      }
    }
    if (data.shiftUp) {
      const rb = document.getElementById('vis-rb');
      if (rb) {
        rb.classList.add('active');
        setTimeout(() => rb.classList.remove('active'), 150);
      }
    }

    // 6. Face buttons if gamepad mode
    if (data.buttons) {
      ['a', 'b', 'x', 'y'].forEach(btn => {
        const el = document.getElementById(`vis-btn-${btn}`);
        if (el) {
          if (data.buttons[btn]) el.classList.add('active');
          else if (btn !== 'a' || !data.handbrake) el.classList.remove('active');
        }
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.companion = new PCCompanion();
});
