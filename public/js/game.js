/**
 * Gyropad Pro - 3D Racing Game Simulator & Host Engine
 */

class RacingGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.car = null;
    this.track = null;
    
    this.cameraMode = 'chase'; // 'chase', 'hood', 'orbit'
    this.clock = new THREE.Clock();
    this.isRunning = false;

    // Lap Timing
    this.lapStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.currentCheckpointIdx = 0;
    this.lapCount = 0;

    // Keyboard state
    this.keys = {};
    this.phoneSteerActive = false;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08070B);
    this.scene.fog = new THREE.FogExp2(0x08070B, 0.0032);

    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0x4A455A, 0.5);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xFFF9F0, 1.25);
    sunLight.position.set(130, 220, 110);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 450;
    const d = 90;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    this.scene.add(sunLight);

    // Build World
    this.track = new Track(this.scene);
    this.car = new Car(this.scene);
    this.car.resetPosition(0, 8, 0);

    this.setupKeyboard();
    window.addEventListener('resize', () => this.onResize());

    this.isRunning = true;
    this.lapStartTime = performance.now();
    this.animate();
  }

  onResize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'r' || e.key === 'R') {
        this.car.resetPosition(0, 8, 0);
      }
      if (e.key === 'c' || e.key === 'C') {
        this.cameraMode = this.cameraMode === 'chase' ? 'hood' : (this.cameraMode === 'hood' ? 'orbit' : 'chase');
      }
      if (e.key === 'e' || e.key === 'E') {
        this.car.shiftUp();
      }
      if (e.key === 'q' || e.key === 'Q') {
        this.car.shiftDown();
      }
      if (e.key === 'h' || e.key === 'H') {
        if (window.soundEngine) window.soundEngine.playHorn();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  applyPhoneInput(data) {
    if (!this.car) return;

    if (data.steering !== undefined) {
      this.car.targetSteering = Math.max(-1.0, Math.min(1.0, data.steering));
      this.phoneSteerActive = true;
    }

    if (data.throttle !== undefined) {
      this.car.throttle = Math.max(0.0, Math.min(1.0, data.throttle));
    }

    if (data.brake !== undefined) {
      this.car.brake = Math.max(0.0, Math.min(1.0, data.brake));
    }

    if (data.clutch !== undefined) {
      this.car.clutch = data.clutch;
    }

    if (data.handbrake !== undefined) {
      this.car.handbrake = !!data.handbrake;
    }

    if (data.nos !== undefined) {
      this.car.nosActive = !!data.nos;
    }

    if (data.shiftUp) {
      this.car.shiftUp();
    }

    if (data.shiftDown) {
      this.car.shiftDown();
    }

    if (data.horn && window.soundEngine) {
      window.soundEngine.playHorn();
    }

    if (data.resetCar) {
      this.car.resetPosition(0, 8, 0);
    }
  }

  updateKeyboardInput() {
    // Keyboard fallback if phone throttle/brake is idle
    if (this.car.throttle === 0.0 && this.car.brake === 0.0) {
      if (this.keys['w'] || this.keys['arrowup']) {
        this.car.throttle = 1.0;
      } else {
        this.car.throttle = 0.0;
      }

      if (this.keys['s'] || this.keys['arrowdown']) {
        this.car.brake = 1.0;
      } else {
        this.car.brake = 0.0;
      }
    }

    // Keyboard steering fallback if phone steering is untouched
    if (!this.phoneSteerActive || this.car.targetSteering === 0.0) {
      if (this.keys['a'] || this.keys['arrowleft']) {
        this.car.targetSteering = -1.0;
      } else if (this.keys['d'] || this.keys['arrowright']) {
        this.car.targetSteering = 1.0;
      } else if (!this.phoneSteerActive) {
        this.car.targetSteering = 0.0;
      }
    }

    if (this.keys[' ']) {
      this.car.handbrake = true;
    }
  }

  updateCamera() {
    if (!this.car || !this.camera) return;

    const carPos = this.car.position;
    const heading = this.car.heading;

    if (this.cameraMode === 'chase') {
      const dist = 7.6;
      const height = 3.1;
      const targetX = carPos.x - Math.sin(heading) * dist;
      const targetZ = carPos.z - Math.cos(heading) * dist;
      const targetY = carPos.y + height;

      this.camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.16);
      const lookAtTarget = new THREE.Vector3(
        carPos.x + Math.sin(heading) * 4.5,
        carPos.y + 1.2,
        carPos.z + Math.cos(heading) * 4.5
      );
      this.camera.lookAt(lookAtTarget);
    } else if (this.cameraMode === 'hood') {
      const targetX = carPos.x + Math.sin(heading) * 0.4;
      const targetZ = carPos.z + Math.cos(heading) * 0.4;
      const targetY = carPos.y + 1.1;

      this.camera.position.set(targetX, targetY, targetZ);
      const lookAtTarget = new THREE.Vector3(
        carPos.x + Math.sin(heading) * 25.0,
        carPos.y + 1.1,
        carPos.z + Math.cos(heading) * 25.0
      );
      this.camera.lookAt(lookAtTarget);
    }
  }

  updateHUD() {
    if (!this.car) return;

    // Off-road check
    this.car.isOffRoad = this.track.checkOffRoad(this.car.position);

    // Speedometer
    const speedEl = document.getElementById('hud-speed');
    if (speedEl) speedEl.textContent = this.car.speedKmh;

    // Gearbox Display
    const gearEl = document.getElementById('hud-gear');
    if (gearEl) {
      gearEl.textContent = this.car.gear === -1 ? 'R' : (this.car.gear === 0 ? 'N' : this.car.gear);
    }

    // Mini Steering Dial
    const miniWheel = document.getElementById('mini-wheel');
    if (miniWheel) {
      const deg = this.car.steeringAngle * 90;
      miniWheel.style.transform = `rotate(${deg}deg)`;
    }

    // RPM LED Shift Lights
    const rpmRatio = this.car.rpm / this.car.maxRpm;
    const leds = document.querySelectorAll('.rpm-led');
    const totalLeds = leds.length;
    const litCount = Math.floor(rpmRatio * totalLeds);
    leds.forEach((led, idx) => {
      if (idx < litCount) led.classList.add('on');
      else led.classList.remove('on');
    });

    // Pedals Mini Gauges
    const gasFill = document.getElementById('hud-gas-fill');
    if (gasFill) gasFill.style.height = `${Math.round(this.car.throttle * 100)}%`;

    const brakeFill = document.getElementById('hud-brake-fill');
    if (brakeFill) brakeFill.style.height = `${Math.round(this.car.brake * 100)}%`;

    const clutchFill = document.getElementById('hud-clutch-fill');
    if (clutchFill) clutchFill.style.height = `${Math.round(this.car.clutch * 100)}%`;

    // Lap Timer
    const now = performance.now();
    this.currentLapTime = (now - this.lapStartTime) / 1000;
    const lapEl = document.getElementById('hud-lap-time');
    if (lapEl) lapEl.textContent = this.formatTime(this.currentLapTime);

    // Checkpoint Gate Crossing
    const hitCp = this.track.checkLapProgress(this.car.position);
    if (hitCp) {
      if (hitCp.id === (this.currentCheckpointIdx + 1) % this.track.checkpoints.length) {
        this.currentCheckpointIdx = hitCp.id;
        if (hitCp.isFinish) {
          this.lapCount++;
          if (!this.bestLapTime || this.currentLapTime < this.bestLapTime) {
            this.bestLapTime = this.currentLapTime;
            const bestEl = document.getElementById('hud-best-time');
            if (bestEl) bestEl.textContent = 'BEST: ' + this.formatTime(this.bestLapTime);
          }
          if (window.soundEngine) window.soundEngine.playLapDing();
          this.lapStartTime = performance.now();
        }
      }
    }

    // Send game state back to Phone HUD
    if (window.companion && window.companion.ws && window.companion.ws.readyState === WebSocket.OPEN) {
      window.companion.ws.send(JSON.stringify({
        type: 'game_state',
        speed: this.car.speedKmh,
        gear: this.car.gear,
        rpmRatio: rpmRatio
      }));
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`;
  }

  animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();

    this.updateKeyboardInput();
    this.car.update(dt);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.updateHUD();
  }
}

window.RacingGame = RacingGame;
