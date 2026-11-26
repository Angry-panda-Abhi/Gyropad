/**
 * Gyropad Pro - Ultra-Fast Mobile Game Controller Engine
 * Supports 100% concurrent multi-touch, rock-solid landscape gyro,
 * and high-speed telemetry with auto HTTP POST fallback.
 */

class GyropadMobileEngine {
  constructor() {
    this.mode = 'racepad'; // 'racepad' or 'gamepad'

    // Connectivity State
    this.ws = null;
    this.wsConnected = false;
    this.httpFallbackActive = false;
    this.httpPosting = false;
    this.lastHttpSendTime = 0;
    this.targetHost = window.location.hostname || 'localhost';
    this.targetPort = window.location.port || (window.location.protocol === 'https:' ? '8443' : '8080');
    this.isHttps = window.location.protocol === 'https:';
    this.lastPacketTime = 0;
    this.latency = 0;

    // Steering & Sensor Fusion State
    this.fusedAngle = 0.0;       // Smooth angle in degrees
    this.rawAngle = 0.0;         // Latest raw angle from sensor
    this.zeroOffset = 0.0;       // Calibrated zero center offset
    this.isSteeringLocked = false;
    this.isTouchSteering = false;
    this.touchSteerAngle = 0.0;
    this.sensorActive = false;
    this.steerLockToLock = 90;   // ±45° tilt for 100% full steering lock (natural wrist movement)
    this.deadzone = 0.02;        // 2%
    this.linearity = 1.15;       // Progressive curve
    this.invertSteer = false;

    // Pedals (0.0 to 1.0)
    this.throttle = 0.0;
    this.brake = 0.0;
    this.clutch = 0.0;
    this.hbrake = 0.0;

    // Buttons
    this.shiftUp = false;
    this.shiftDown = false;
    this.buttons = {
      a: false,
      b: false,
      x: false,
      y: false,
      dpad_up: false,
      dpad_down: false,
      dpad_left: false,
      dpad_right: false,
      lights: false,
      horn: false,
      cam: false,
      lb: false,
      rb: false,
      lt: false,
      rt: false,
      start: false,
      back: false
    };

    // Virtual Gamepad analog sticks (-1.0 to 1.0)
    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };

    this.enableHaptics = true;

    this.init();
  }

  init() {
    this.detectProtocolAndSensors();
    this.setupMultiTouchControls();
    this.setupSensors();
    this.setupUIModals();
    this.connectNetwork();

    // High frequency 60Hz telemetry dispatch
    setInterval(() => this.dispatchPacket(), 1000 / 60);

    // Latency ping monitor every 2 seconds
    setInterval(() => this.measureLatency(), 2000);

    // Keep screen awake
    this.requestWakeLock();
  }

  detectProtocolAndSensors() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // Mobile Chrome blocks DeviceOrientation on plain HTTP
    if (!this.isHttps && !isLocal) {
      const notice = document.getElementById('insecure-http-notice');
      const link = document.getElementById('link-switch-https');
      if (notice && link) {
        link.href = `https://${window.location.hostname}:8443/phone`;
        notice.style.display = 'block';
        const dismissBtn = document.getElementById('btn-dismiss-http-notice');
        if (dismissBtn) {
          dismissBtn.onclick = () => { notice.style.display = 'none'; };
        }
      }
    }
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        await navigator.wakeLock.request('screen');
      }
    } catch (e) {}
  }

  triggerHaptic(pattern = 15) {
    if (this.enableHaptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  // =========================================================
  // ROBUST MULTI-TOUCH CONTROLLER ENGINE
  // =========================================================
  setupMultiTouchControls() {
    // 1. Pedal Sliders
    this.bindPedal('slider-speed', 'fill-speed', 'val-speed', (pct) => {
      this.throttle = pct;
    });

    this.bindPedal('slider-brake', 'fill-brake', 'val-brake', (pct) => {
      this.brake = pct;
    });

    this.bindPedal('slider-clutch', 'fill-clutch', 'val-clutch', (pct) => {
      this.clutch = pct;
    });

    this.bindPedal('slider-hbrake', 'fill-hbrake', 'val-hbrake', (pct) => {
      this.hbrake = pct;
    });

    // 2. Sequential Shifter Gears
    this.bindButton('btn-gear-up', () => {
      this.shiftUp = true;
      this.buttons.rb = true;
      this.triggerHaptic(20);
    }, () => {
      this.shiftUp = false;
      this.buttons.rb = false;
    });

    this.bindButton('btn-gear-down', () => {
      this.shiftDown = true;
      this.buttons.lb = true;
      this.triggerHaptic(20);
    }, () => {
      this.shiftDown = false;
      this.buttons.lb = false;
    });

    // 3. Action Buttons (Y, X, A, B)
    const actMap = [
      { id: 'btn-act-y', key: 'y' },
      { id: 'btn-act-x', key: 'x' },
      { id: 'btn-act-a', key: 'a' },
      { id: 'btn-act-b', key: 'b' }
    ];
    actMap.forEach(b => {
      this.bindButton(b.id, () => {
        this.buttons[b.key] = true;
        this.triggerHaptic(18);
      }, () => {
        this.buttons[b.key] = false;
      });
    });

    // 4. D-Pad Directional Cluster
    const dpadMap = [
      { id: 'btn-dpad-up', key: 'dpad_up' },
      { id: 'btn-dpad-down', key: 'dpad_down' },
      { id: 'btn-dpad-left', key: 'dpad_left' },
      { id: 'btn-dpad-right', key: 'dpad_right' }
    ];
    dpadMap.forEach(d => {
      this.bindButton(d.id, () => {
        this.buttons[d.key] = true;
        this.triggerHaptic(15);
      }, () => {
        this.buttons[d.key] = false;
      });
    });

    // 5. Aux Motorsport Buttons
    this.bindButton('btn-lights', () => {
      this.buttons.lights = true;
      this.triggerHaptic(20);
    }, () => {
      this.buttons.lights = false;
    });

    this.bindButton('btn-horn', () => {
      this.buttons.horn = true;
      this.triggerHaptic(25);
    }, () => {
      this.buttons.horn = false;
    });

    this.bindButton('btn-cam', () => {
      this.buttons.cam = true;
      this.triggerHaptic(20);
    }, () => {
      this.buttons.cam = false;
    });

    // 6. Gamepad Mode Buttons & Triggers
    this.bindButton('btn-lt', () => {
      this.buttons.lt = true;
      this.brake = 1.0;
      this.triggerHaptic(20);
    }, () => {
      this.buttons.lt = false;
      if (this.mode === 'gamepad') this.brake = 0.0;
    });

    this.bindButton('btn-lb', () => {
      this.buttons.lb = true;
      this.triggerHaptic(18);
    }, () => {
      this.buttons.lb = false;
    });

    this.bindButton('btn-rt', () => {
      this.buttons.rt = true;
      this.throttle = 1.0;
      this.triggerHaptic(20);
    }, () => {
      this.buttons.rt = false;
      if (this.mode === 'gamepad') this.throttle = 0.0;
    });

    this.bindButton('btn-rb', () => {
      this.buttons.rb = true;
      this.triggerHaptic(18);
    }, () => {
      this.buttons.rb = false;
    });

    this.bindButton('btn-pad-start', () => {
      this.buttons.start = true;
      this.triggerHaptic(20);
    }, () => {
      this.buttons.start = false;
    });

    this.bindButton('btn-pad-back', () => {
      this.buttons.back = true;
      this.triggerHaptic(20);
    }, () => {
      this.buttons.back = false;
    });

    // 7. Analog Thumbsticks
    this.bindAnalogStick('stick-left-outer', 'stick-left-thumb', (x, y) => {
      this.leftStick.x = x;
      this.leftStick.y = y;
    });

    this.bindAnalogStick('stick-right-outer', 'stick-right-thumb', (x, y) => {
      this.rightStick.x = x;
      this.rightStick.y = y;
    });

    // 8. Center Steering Arc Touch Fallback
    this.setupSteeringArchTouch();
  }

  bindButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;

    let isDown = false;
    let activePointerId = null;

    const press = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (!isDown) {
        isDown = true;
        el.classList.add('active');
        onDown();
      }
    };

    const release = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (isDown) {
        isDown = false;
        activePointerId = null;
        el.classList.remove('active');
        onUp();
      }
    };

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', (e) => {
        activePointerId = e.pointerId;
        press(e);
        try { el.setPointerCapture(e.pointerId); } catch(err) {}
      });

      el.addEventListener('pointerup', (e) => {
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
        release(e);
      });

      el.addEventListener('pointercancel', (e) => {
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
        release(e);
      });

      el.addEventListener('lostpointercapture', () => {
        release();
      });
    } else {
      el.addEventListener('touchstart', (e) => {
        if (e.cancelable) e.preventDefault();
        press(e);
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        if (e.cancelable) e.preventDefault();
        release(e);
      }, { passive: false });
      el.addEventListener('touchcancel', (e) => {
        if (e.cancelable) e.preventDefault();
        release(e);
      }, { passive: false });
    }
  }

  bindTap(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;

    let lastTap = 0;
    const trigger = (e) => {
      if (e && e.cancelable) e.preventDefault();
      const now = Date.now();
      if (now - lastTap < 220) return; // Debounce rapid double-fire
      lastTap = now;

      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 120);
      callback(e);
    };

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', trigger);
    } else {
      el.addEventListener('touchstart', trigger, { passive: false });
      el.addEventListener('click', trigger);
    }
  }

  bindPedal(sliderId, fillId, valId, onUpdate) {
    const sliderEl = document.getElementById(sliderId);
    const fillEl = document.getElementById(fillId);
    const valEl = document.getElementById(valId);
    if (!sliderEl) return;

    let activePointerId = null;

    const calcPct = (clientY) => {
      const rect = sliderEl.getBoundingClientRect();
      let pct = (rect.bottom - clientY) / rect.height;
      pct = Math.max(0.0, Math.min(1.0, pct));
      if (fillEl) fillEl.style.height = `${(pct * 100).toFixed(0)}%`;
      if (valEl) valEl.textContent = (pct * 100).toFixed(0);
      onUpdate(pct);
    };

    const resetPedal = () => {
      activePointerId = null;
      sliderEl.classList.remove('active');
      if (fillEl) fillEl.style.height = '0%';
      if (valEl) valEl.textContent = '0';
      onUpdate(0.0);
    };

    if (window.PointerEvent) {
      sliderEl.addEventListener('pointerdown', (e) => {
        if (e.cancelable) e.preventDefault();
        activePointerId = e.pointerId;
        sliderEl.classList.add('active');
        try { sliderEl.setPointerCapture(e.pointerId); } catch(err) {}
        this.triggerHaptic(12);
        calcPct(e.clientY);
      });

      sliderEl.addEventListener('pointermove', (e) => {
        if (e.pointerId === activePointerId) {
          if (e.cancelable) e.preventDefault();
          calcPct(e.clientY);
        }
      });

      sliderEl.addEventListener('pointerup', (e) => {
        if (e.pointerId === activePointerId) {
          try { sliderEl.releasePointerCapture(e.pointerId); } catch(err) {}
          resetPedal();
        }
      });

      sliderEl.addEventListener('pointercancel', (e) => {
        if (e.pointerId === activePointerId) {
          try { sliderEl.releasePointerCapture(e.pointerId); } catch(err) {}
          resetPedal();
        }
      });

      sliderEl.addEventListener('lostpointercapture', (e) => {
        if (e.pointerId === activePointerId) {
          resetPedal();
        }
      });
    } else {
      sliderEl.addEventListener('touchstart', (e) => {
        if (e.cancelable) e.preventDefault();
        sliderEl.classList.add('active');
        this.triggerHaptic(12);
        calcPct(e.changedTouches[0].clientY);
      }, { passive: false });

      sliderEl.addEventListener('touchmove', (e) => {
        if (e.cancelable) e.preventDefault();
        calcPct(e.changedTouches[0].clientY);
      }, { passive: false });

      sliderEl.addEventListener('touchend', (e) => {
        if (e.cancelable) e.preventDefault();
        resetPedal();
      }, { passive: false });

      sliderEl.addEventListener('touchcancel', (e) => {
        if (e.cancelable) e.preventDefault();
        resetPedal();
      }, { passive: false });
    }
  }

  bindAnalogStick(outerId, thumbId, onUpdate) {
    const outer = document.getElementById(outerId);
    const thumb = document.getElementById(thumbId);
    if (!outer || !thumb) return;

    const maxRadius = 40;

    const updateStick = (clientX, clientY) => {
      const rect = outer.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      thumb.style.transform = `translate(${dx}px, ${dy}px)`;
      const normX = dx / maxRadius;
      const normY = -dy / maxRadius; // Up is positive Cartesian
      onUpdate(normX, normY);
    };

    const resetStick = () => {
      outer.classList.remove('active');
      thumb.style.transform = 'translate(0px, 0px)';
      onUpdate(0, 0);
    };

    outer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      outer.classList.add('active');
      try { outer.setPointerCapture(e.pointerId); } catch(err) {}
      updateStick(e.clientX, e.clientY);
    });

    outer.addEventListener('pointermove', (e) => {
      if (outer.hasPointerCapture(e.pointerId)) {
        e.preventDefault();
        updateStick(e.clientX, e.clientY);
      }
    });

    outer.addEventListener('pointerup', (e) => {
      try { outer.releasePointerCapture(e.pointerId); } catch(err) {}
      resetStick();
    });

    outer.addEventListener('pointercancel', (e) => {
      try { outer.releasePointerCapture(e.pointerId); } catch(err) {}
      resetStick();
    });
  }

  setupSteeringArchTouch() {
    const archArea = document.getElementById('steering-touch-area');
    if (!archArea) return;

    let startX = 0;

    const calcTouchSteer = (clientX) => {
      const dx = clientX - startX;
      const norm = Math.max(-1.0, Math.min(1.0, dx / 85));
      this.touchSteerAngle = norm * (this.steerLockToLock / 2);
      this.isTouchSteering = true;
      this.fusedAngle = this.touchSteerAngle;
      this.updateArcVisual(this.fusedAngle);
    };

    const endTouchSteer = () => {
      this.isTouchSteering = false;
      if (!this.sensorActive) {
        this.fusedAngle = 0;
        this.updateArcVisual(0);
      }
    };

    archArea.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      try { archArea.setPointerCapture(e.pointerId); } catch(err) {}
      calcTouchSteer(e.clientX);
    });

    archArea.addEventListener('pointermove', (e) => {
      if (archArea.hasPointerCapture(e.pointerId)) {
        e.preventDefault();
        calcTouchSteer(e.clientX);
      }
    });

    archArea.addEventListener('pointerup', (e) => {
      try { archArea.releasePointerCapture(e.pointerId); } catch(err) {}
      endTouchSteer();
    });

    archArea.addEventListener('pointercancel', (e) => {
      try { archArea.releasePointerCapture(e.pointerId); } catch(err) {}
      endTouchSteer();
    });
  }

  // =========================================================
  // GYROSCOPE & SENSOR FUSION ENGINE (HARDWARE ATTITUDE FUSION)
  // =========================================================
  setupSensors() {
    this.sensorEventsCount = 0;
    this.initialCalibrated = false;

    // True Hardware Gyroscope & Attitude Tracking
    const handleOrientation = (e) => {
      if (this.isSteeringLocked || this.isTouchSteering) return;

      const beta = e.beta;   // Rotation around short edge (Steering wheel turn in landscape)
      const gamma = e.gamma; // Rotation around long edge (Pitch towards/away from face)
      if (beta === null || beta === undefined) return;

      this.sensorEventsCount++;
      this.sensorActive = true;
      this.updateSensorStatusUI(true, 'GYRO ONLINE');

      // Detect landscape orientation angle
      const orientAngle = screen.orientation ? screen.orientation.angle : (window.orientation || 0);

      // In landscape:
      // - Turning phone like a steering wheel rotates around the short edge -> BETA
      // - Flipping/tipping phone towards or away from face rotates around long edge -> GAMMA
      // By using BETA, flipping the phone has ZERO effect on steering!
      let rawSteer = 0;
      if (orientAngle === 90 || (screen.orientation && screen.orientation.type && screen.orientation.type.includes('landscape-primary'))) {
        // Landscape primary (top to left, angle 90): Turning right dips right edge -> beta increases
        rawSteer = beta;
      } else if (orientAngle === 270 || orientAngle === -90 || (screen.orientation && screen.orientation.type && screen.orientation.type.includes('landscape-secondary'))) {
        // Landscape secondary (top to right, angle 270): Inverted
        rawSteer = -beta;
      } else {
        // Fallback for devices with auto-rotate locked
        if (window.innerWidth > window.innerHeight) {
          rawSteer = beta;
        } else {
          rawSteer = gamma || 0;
        }
      }

      // Automatically zero out resting posture on first reading so player starts at 0°
      if (!this.initialCalibrated && Math.abs(rawSteer) > 0.5) {
        this.zeroOffset = rawSteer;
        this.initialCalibrated = true;
      }

      this.rawAngle = rawSteer;
      const target = this.rawAngle - this.zeroOffset;

      // Smooth responsive low-pass filter (0.35 factor ensures zero lag and silky motion)
      this.fusedAngle += (target - this.fusedAngle) * 0.35;
      this.updateArcVisual(this.fusedAngle);
    };

    window.addEventListener('deviceorientation', handleOrientation, true);

    // Sensor diagnostics check 1.5 seconds after load
    setTimeout(() => {
      if (this.sensorEventsCount === 0) {
        if (!this.isHttps && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          this.updateSensorStatusUI(false, '⚠️ GYRO BLOCKED (USE HTTPS)');
          const notice = document.getElementById('insecure-http-notice');
          if (notice) notice.style.display = 'block';
        } else {
          this.updateSensorStatusUI(false, '⚠️ TAP TO ENABLE SENSORS');
        }
      }
    }, 1500);

    // Tap on sensor status badge triggers HTTPS redirect or recalibration
    const sensorBadge = document.getElementById('sensor-indicator');
    if (sensorBadge) {
      sensorBadge.addEventListener('click', () => {
        if (!this.isHttps && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          window.location.href = `https://${this.targetHost}:8443/phone`;
        } else if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission().then(res => {
            if (res === 'granted') this.updateSensorStatusUI(true, 'GYRO ONLINE');
          }).catch(console.error);
        } else {
          this.calibrateCenter();
        }
      });
    }

    // iOS 13+ permission modal
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const modal = document.getElementById('sensor-permission-modal');
      const btn = document.getElementById('btn-grant-sensors');
      if (modal && btn) {
        modal.style.display = 'flex';
        btn.onclick = () => {
          DeviceOrientationEvent.requestPermission().then(res => {
            if (res === 'granted') {
              modal.style.display = 'none';
              this.updateSensorStatusUI(true, 'GYRO ONLINE');
            }
          }).catch(console.error);
        };
      }
    }
  }

  updateSensorStatusUI(online, text) {
    const dot = document.getElementById('sensor-indicator-dot');
    const label = document.getElementById('sensor-indicator-text');
    const badge = document.getElementById('sensor-indicator');
    if (dot) dot.style.backgroundColor = online ? '#10b981' : '#f59e0b';
    if (label) label.textContent = text;
    if (badge) {
      if (online) {
        badge.classList.remove('blocked');
        badge.classList.add('online');
      } else {
        badge.classList.remove('online');
        badge.classList.add('blocked');
      }
    }
  }

  calibrateCenter() {
    this.zeroOffset = this.rawAngle;
    this.fusedAngle = 0;
    this.updateArcVisual(0);
    this.triggerHaptic([30, 40, 50]);

    const degNum = document.getElementById('degree-number');
    if (degNum) {
      degNum.textContent = '0°';
      degNum.style.color = '#10b981';
      setTimeout(() => { if (degNum) degNum.style.color = '#ffffff'; }, 800);
    }
  }

  toggleSteeringLock() {
    this.isSteeringLocked = !this.isSteeringLocked;
    this.triggerHaptic(20);
    const lockBtn = document.getElementById('btn-steering-lock');
    const lockShackle = document.getElementById('lock-shackle');
    if (lockBtn) {
      if (this.isSteeringLocked) {
        lockBtn.classList.add('locked');
        if (lockShackle) lockShackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
      } else {
        lockBtn.classList.remove('locked');
        if (lockShackle) lockShackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v2');
      }
    }
  }

  updateArcVisual(angleDeg) {
    const dot = document.getElementById('arc-dot');
    const degNum = document.getElementById('degree-number');
    const degSide = document.getElementById('degree-side');

    const effective = this.invertSteer ? -angleDeg : angleDeg;
    const rounded = Math.round(effective);
    const absDeg = Math.abs(rounded);

    if (degNum) degNum.textContent = `${absDeg}°`;
    if (degSide) {
      if (rounded > 0) degSide.textContent = 'R';
      else if (rounded < 0) degSide.textContent = 'L';
      else degSide.textContent = '';
    }

    // Arc radius: 85, center: (110, 115)
    // 90° is top center, 170° is left lock, 10° is right lock
    if (dot) {
      const halfLock = this.steerLockToLock / 2;
      const norm = Math.max(-1.0, Math.min(1.0, effective / halfLock));
      const phiDeg = 90 - (norm * 80);
      const rad = phiDeg * (Math.PI / 180);
      const cx = 110 + 85 * Math.cos(rad);
      const cy = 115 - 85 * Math.sin(rad);

      dot.setAttribute('cx', cx.toFixed(1));
      dot.setAttribute('cy', cy.toFixed(1));
    }
  }

  getNormalizedSteering() {
    let angle = this.fusedAngle;
    if (this.invertSteer) angle = -angle;

    const halfLock = this.steerLockToLock / 2;
    let norm = angle / halfLock;
    norm = Math.max(-1.0, Math.min(1.0, norm));

    if (Math.abs(norm) < this.deadzone) return 0.0;

    const sign = Math.sign(norm);
    const scaled = (Math.abs(norm) - this.deadzone) / (1.0 - this.deadzone);
    return sign * Math.pow(scaled, this.linearity);
  }

  // =========================================================
  // TELEMETRY & NETWORK TRANSMISSION
  // =========================================================
  connectNetwork() {
    const wsProto = this.isHttps ? 'wss:' : 'ws:';
    const wsPort = this.isHttps ? 8766 : 8765;
    const wsUrl = `${wsProto}//${this.targetHost}:${wsPort}`;

    let wsSettled = false;
    if (this.wsConnectTimer) clearTimeout(this.wsConnectTimer);
    this.wsConnectTimer = setTimeout(() => {
      if (!this.wsConnected && !wsSettled) {
        wsSettled = true;
        this.activateHttpFallback();
      }
    }, 1200);

    try {
      if (this.ws) {
        try { this.ws.close(); } catch(e) {}
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        wsSettled = true;
        if (this.wsConnectTimer) clearTimeout(this.wsConnectTimer);
        this.wsConnected = true;
        this.httpFallbackActive = false;
        this.updateConnectionBadge('connected', 'CONNECTED (WS)');
        this.ws.send(JSON.stringify({ type: 'handshake', role: 'phone' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') {
            this.latency = Math.round(performance.now() - this.lastPacketTime);
          }
        } catch (e) {}
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        if (!wsSettled) {
          wsSettled = true;
          this.activateHttpFallback();
        } else if (!this.httpFallbackActive) {
          this.activateHttpFallback();
        }
      };

      this.ws.onerror = () => {
        this.wsConnected = false;
        if (!wsSettled) {
          wsSettled = true;
          this.activateHttpFallback();
        } else if (!this.httpFallbackActive) {
          this.activateHttpFallback();
        }
      };
    } catch (e) {
      wsSettled = true;
      this.activateHttpFallback();
    }
  }

  activateHttpFallback() {
    this.httpFallbackActive = true;
    const proto = this.isHttps ? 'https:' : 'http:';
    fetch(`${proto}//${this.targetHost}:${this.targetPort}/api/ping`, { cache: 'no-store' })
      .then(res => res.json())
      .then(() => {
        this.updateConnectionBadge('connected-http', 'CONNECTED (HTTP)');
      })
      .catch(() => {
        this.updateConnectionBadge('disconnected', 'DISCONNECTED');
        setTimeout(() => this.connectNetwork(), 2500);
      });
  }

  updateConnectionBadge(state, label) {
    const connectBtn = document.getElementById('btn-connect');
    const connectDot = document.getElementById('connect-dot');
    const connectLabel = document.getElementById('connect-label');
    const modalDot = document.getElementById('badge-dot');
    const modalText = document.getElementById('badge-text');

    if (state === 'connected' || state === 'connected-http') {
      if (connectBtn) {
        connectBtn.classList.add('connected');
      }
      if (connectDot) connectDot.style.backgroundColor = '#10b981';
      if (connectLabel) connectLabel.textContent = 'CONNECTED';
      if (modalDot) modalDot.className = 'badge-dot online';
      if (modalText) modalText.textContent = state === 'connected' ? 'ONLINE (WebSocket 60Hz)' : 'ONLINE (HTTP Stream 50Hz)';
    } else {
      if (connectBtn) {
        connectBtn.classList.remove('connected');
      }
      if (connectDot) connectDot.style.backgroundColor = '#71717a';
      if (connectLabel) connectLabel.textContent = 'CONNECT';
      if (modalDot) modalDot.className = 'badge-dot';
      if (modalText) modalText.textContent = 'DISCONNECTED';
    }
  }

  buildPayload() {
    // In racepad mode: steering comes from gyro or touch arch
    // In gamepad mode: leftStick controls steering if not using gyro
    const normSteer = this.mode === 'racepad' ? this.getNormalizedSteering() : (this.leftStick.x !== 0 ? this.leftStick.x : this.getNormalizedSteering());
    const throttleVal = this.mode === 'racepad' ? this.throttle : (this.buttons.rt ? 1.0 : (this.rightStick.y > 0 ? this.rightStick.y : 0.0));
    const brakeVal = this.mode === 'racepad' ? this.brake : (this.buttons.lt ? 1.0 : (this.rightStick.y < 0 ? -this.rightStick.y : 0.0));

    return {
      type: 'input',
      mode: this.mode,
      steering: normSteer,
      throttle: throttleVal,
      brake: brakeVal,
      clutch: this.clutch,
      handbrake: this.hbrake > 0.1 || this.buttons.a,
      shiftUp: this.shiftUp || this.buttons.rb,
      shiftDown: this.shiftDown || this.buttons.lb,
      buttons: { ...this.buttons },
      leftStick: { ...this.leftStick },
      rightStick: { ...this.rightStick },
      timestamp: Date.now()
    };
  }

  dispatchPacket() {
    const payload = this.buildPayload();
    this.lastPacketTime = performance.now();

    // 1. Primary: WebSocket (Zero latency, full 60Hz)
    if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return;
      } catch (e) {
        this.wsConnected = false;
        this.activateHttpFallback();
      }
    }

    // 2. Fallback: HTTP POST (/api/input)
    // High-speed 50Hz stream with mutex lock to prevent network queue congestion
    if (this.httpFallbackActive && !this.httpPosting) {
      const now = performance.now();
      if (now - this.lastHttpSendTime >= 20) {
        this.lastHttpSendTime = now;
        this.httpPosting = true;
        const proto = this.isHttps ? 'https:' : 'http:';
        const url = `${proto}//${this.targetHost}:${this.targetPort}/api/input`;
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).then(() => {
          this.httpPosting = false;
        }).catch(() => {
          this.httpPosting = false;
        });
      }
    }
  }

  measureLatency() {
    if (this.wsConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }

  // =========================================================
  // UI MODALS & FAST NAVIGATION
  // =========================================================
  setupUIModals() {
    // Calibrate Center Button
    this.bindTap('btn-calibrate', () => this.calibrateCenter());

    // Steering Lock Button
    this.bindTap('btn-steering-lock', () => this.toggleSteeringLock());

    // Mode Toggle Pills
    const racepadView = document.getElementById('racepad-view');
    const gamepadView = document.getElementById('gamepad-view');

    const toggleMode = () => {
      if (this.mode === 'racepad') {
        this.mode = 'gamepad';
        if (racepadView) racepadView.classList.add('hidden-view');
        if (gamepadView) gamepadView.classList.remove('hidden-view');
      } else {
        this.mode = 'racepad';
        if (gamepadView) gamepadView.classList.add('hidden-view');
        if (racepadView) racepadView.classList.remove('hidden-view');
      }
      this.triggerHaptic(25);
    };

    this.bindTap('btn-mode-pill', toggleMode);
    this.bindTap('btn-mode-pill-pad', toggleMode);

    // Fullscreen / Arrange Button
    this.bindTap('btn-arrange', () => {
      this.triggerHaptic(20);
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Power Button
    this.bindTap('btn-power', () => {
      this.triggerHaptic(20);
      if (this.ws) {
        this.ws.close();
      }
      this.connectNetwork();
    });

    // Connect Modal
    const connectModal = document.getElementById('modal-connect');
    const inputPcIp = document.getElementById('input-pc-ip');
    const inputPcPort = document.getElementById('input-pc-port');
    const actionConnect = document.getElementById('btn-action-connect');
    const actionPing = document.getElementById('btn-action-test-ping');

    if (inputPcIp) inputPcIp.value = this.targetHost;
    if (inputPcPort) inputPcPort.value = this.targetPort;

    if (connectModal) {
      this.bindTap('btn-connect', () => {
        connectModal.style.display = 'flex';
        // Auto-fetch detected host IPs from server for quick switching
        fetch(`/api/network`)
          .then(res => res.json())
          .then(data => {
            const container = document.getElementById('quick-ip-container');
            if (container && data.all_ips && data.all_ips.length > 0) {
              container.innerHTML = '';
              data.all_ips.forEach(ip => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-quick-ip';
                btn.style.cssText = 'background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.4); color: #d8b4fe; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-family: monospace; cursor: pointer;';
                btn.textContent = ip;
                btn.onclick = () => {
                  if (inputPcIp) inputPcIp.value = ip;
                  this.targetHost = ip;
                  this.connectNetwork();
                };
                container.appendChild(btn);
              });
            }
          })
          .catch(() => {});
      });

      this.bindTap('btn-close-connect-modal', () => {
        connectModal.style.display = 'none';
      });
    }

    if (actionConnect) {
      this.bindTap('btn-action-connect', () => {
        if (inputPcIp && inputPcIp.value.trim()) this.targetHost = inputPcIp.value.trim();
        if (inputPcPort && inputPcPort.value.trim()) this.targetPort = inputPcPort.value.trim();
        this.connectNetwork();
        if (connectModal) connectModal.style.display = 'none';
      });
    }

    if (actionPing) {
      this.bindTap('btn-action-test-ping', async () => {
        const t0 = performance.now();
        const host = (inputPcIp && inputPcIp.value.trim()) || this.targetHost;
        const port = (inputPcPort && inputPcPort.value.trim()) || this.targetPort;
        const proto = this.isHttps ? 'https:' : 'http:';
        try {
          actionPing.textContent = 'TESTING...';
          await fetch(`${proto}//${host}:${port}/api/ping`);
          const dt = Math.round(performance.now() - t0);
          actionPing.textContent = `PING: ${dt}ms (OK!)`;
          actionPing.style.borderColor = '#10b981';
          actionPing.style.color = '#10b981';
        } catch (e) {
          actionPing.textContent = 'FAILED (Blocked)';
          actionPing.style.borderColor = '#ef4444';
          actionPing.style.color = '#ef4444';
        }
        setTimeout(() => {
          actionPing.textContent = 'TEST PING';
          actionPing.style.borderColor = '';
          actionPing.style.color = '';
        }, 2500);
      });
    }

    // Setup Modal
    const setupModal = document.getElementById('modal-setup');
    if (setupModal) {
      this.bindTap('btn-setup', () => {
        setupModal.style.display = 'flex';
      });

      this.bindTap('btn-close-setup-modal', () => {
        setupModal.style.display = 'none';
      });
    }

    const selRange = document.getElementById('select-steer-range');
    const rngDeadzone = document.getElementById('range-deadzone');
    const txtDeadzone = document.getElementById('txt-deadzone');
    const rngLinearity = document.getElementById('range-linearity');
    const txtLinearity = document.getElementById('txt-linearity');
    const chkInvert = document.getElementById('chk-invert-steer');
    const chkHaptics = document.getElementById('chk-haptics');

    if (selRange) {
      selRange.value = "90";
      selRange.onchange = (e) => {
        this.steerLockToLock = parseInt(e.target.value, 10) || 90;
      };
    }

    if (rngDeadzone && txtDeadzone) {
      rngDeadzone.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        this.deadzone = val / 100.0;
        txtDeadzone.textContent = `${val}%`;
      };
    }

    if (rngLinearity && txtLinearity) {
      rngLinearity.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        this.linearity = val / 100.0;
        txtLinearity.textContent = this.linearity.toFixed(2);
      };
    }

    if (chkInvert) {
      chkInvert.onchange = (e) => {
        this.invertSteer = e.target.checked;
      };
    }

    if (chkHaptics) {
      chkHaptics.onchange = (e) => {
        this.enableHaptics = e.target.checked;
      };
    }
  }
}

// Instantiate on document ready
window.addEventListener('DOMContentLoaded', () => {
  window.gyropad = new GyropadMobileEngine();
});
