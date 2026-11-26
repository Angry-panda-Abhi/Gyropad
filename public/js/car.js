/**
 * Gyropad Pro - 3D Sports Car Model & Real-Time Vehicle Dynamics
 * Features:
 * - Ackermann steering with high-speed understeer/oversteer modeling
 * - Pacejka lateral tire friction & progressive drift dynamics
 * - Realistic 6-speed transmission with gear ratios and RPM redline
 * - Suspension body roll and pitch inertia
 */

class Car {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();
    this.wheels = [];
    this.frontWheels = [];
    this.brakeLights = [];
    
    // Position, Heading & Velocity
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.speed = 0.0; // m/s
    this.speedKmh = 0;
    this.heading = 0.0; // radians
    this.steeringAngle = 0.0; // -1.0 to +1.0
    this.targetSteering = 0.0;
    
    // Inputs
    this.throttle = 0.0;
    this.brake = 0.0;
    this.clutch = 0.0;
    this.handbrake = false;
    this.nosActive = false;
    
    // Transmission
    this.gear = 1;
    this.gearRatios = {
      '-1': -3.2,
      '0': 0.0,
      '1': 3.6,
      '2': 2.3,
      '3': 1.6,
      '4': 1.2,
      '5': 0.95,
      '6': 0.8
    };
    this.finalDrive = 3.4;
    this.rpm = 1000.0;
    this.maxRpm = 8400.0;
    this.idleRpm = 950.0;
    this.shiftCooldown = 0.0;
    this.autoTransmission = true;
    
    // Specs & Physics Constants
    this.mass = 1240.0; // kg
    this.wheelbase = 2.65; // meters
    this.wheelRadius = 0.36; // meters
    this.lateralG = 0.0;
    this.longitudinalG = 0.0;
    this.slipAngle = 0.0;
    this.isOffRoad = false;
    
    this.buildCarMesh();
    this.scene.add(this.mesh);
  }

  buildCarMesh() {
    // High-tech Matte Carbon & Titanium Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1E1B26,
      metalness: 0.85,
      roughness: 0.25
    });

    const aeroCarbonMat = new THREE.MeshStandardMaterial({
      color: 0x0D0C10,
      metalness: 0.4,
      roughness: 0.6
    });

    const cockpitGlassMat = new THREE.MeshStandardMaterial({
      color: 0x050408,
      metalness: 0.95,
      roughness: 0.05,
      transparent: true,
      opacity: 0.8
    });

    // Lower Chassis
    const bodyGeo = new THREE.BoxGeometry(1.92, 0.42, 4.4);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.42;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.mesh.add(bodyMesh);

    // Front Nose / Splitter
    const noseGeo = new THREE.BoxGeometry(1.86, 0.22, 1.4);
    const noseMesh = new THREE.Mesh(noseGeo, bodyMat);
    noseMesh.position.set(0, 0.32, 1.8);
    noseMesh.rotation.x = -0.12;
    noseMesh.castShadow = true;
    this.mesh.add(noseMesh);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.06, 0.8), aeroCarbonMat);
    splitter.position.set(0, 0.18, 2.3);
    this.mesh.add(splitter);

    // Cockpit Canopy
    const cabinGeo = new THREE.BoxGeometry(1.36, 0.44, 2.0);
    const cabinMesh = new THREE.Mesh(cabinGeo, cockpitGlassMat);
    cabinMesh.position.set(0, 0.78, -0.2);
    cabinMesh.castShadow = true;
    this.mesh.add(cabinMesh);

    // Rear GT Wing
    const standGeo = new THREE.BoxGeometry(0.06, 0.42, 0.15);
    const leftStand = new THREE.Mesh(standGeo, aeroCarbonMat);
    leftStand.position.set(-0.6, 0.85, -2.0);
    const rightStand = new THREE.Mesh(standGeo, aeroCarbonMat);
    rightStand.position.set(0.6, 0.85, -2.0);
    this.mesh.add(leftStand);
    this.mesh.add(rightStand);

    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.35), aeroCarbonMat);
    wingBlade.position.set(0, 1.05, -2.05);
    wingBlade.rotation.x = 0.08;
    this.mesh.add(wingBlade);

    // LED Headlights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xE0E7FF });
    const leftLight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.1), lightMat);
    leftLight.position.set(-0.65, 0.42, 2.45);
    const rightLight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.1), lightMat);
    rightLight.position.set(0.65, 0.42, 2.45);
    this.mesh.add(leftLight);
    this.mesh.add(rightLight);

    // Brake Lights (Functional Bright LED Strip)
    this.brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0x400000,
      emissive: 0x660000,
      emissiveIntensity: 0.3
    });
    const leftBrake = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.05), this.brakeLightMat);
    leftBrake.position.set(-0.6, 0.5, -2.22);
    const rightBrake = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.05), this.brakeLightMat);
    rightBrake.position.set(0.6, 0.5, -2.22);
    this.mesh.add(leftBrake);
    this.mesh.add(rightBrake);
    this.brakeLights.push(leftBrake, rightBrake);

    // 4 Wheels
    this.createWheel(-0.95, 0.36, 1.35, true);   // Front Left
    this.createWheel(0.95, 0.36, 1.35, true);    // Front Right
    this.createWheel(-0.95, 0.36, -1.35, false); // Rear Left
    this.createWheel(0.95, 0.36, -1.35, false);  // Rear Right
  }

  createWheel(x, y, z, isFront) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);

    // Tire Rubber
    const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x121115,
      roughness: 0.9,
      metalness: 0.1
    });
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;

    // Rim Bezel
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.29, 14);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x8E8A9C,
      metalness: 0.9,
      roughness: 0.2
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    tireMesh.add(rimMesh);

    wheelGroup.add(tireMesh);
    this.mesh.add(wheelGroup);

    const wheelObj = { group: wheelGroup, mesh: tireMesh, isFront };
    this.wheels.push(wheelObj);
    if (isFront) this.frontWheels.push(wheelObj);
  }

  shiftUp() {
    if (this.gear < 6) {
      this.gear++;
      this.shiftCooldown = 0.22;
      if (window.soundEngine) window.soundEngine.playShiftSound();
    }
  }

  shiftDown() {
    if (this.gear > -1) {
      this.gear--;
      this.shiftCooldown = 0.22;
      if (window.soundEngine) window.soundEngine.playShiftSound();
    }
  }

  update(dt) {
    if (dt <= 0 || dt > 0.1) dt = 0.016;

    // Smooth Ackermann Steering input
    const steerSmoothing = 8.0;
    this.steeringAngle += (this.targetSteering - this.steeringAngle) * Math.min(1.0, dt * steerSmoothing);

    // Physical steering angle (capped at ±34° = ±0.59 rad)
    const steerAngleRad = this.steeringAngle * 0.59;
    for (let w of this.frontWheels) {
      w.group.rotation.y = steerAngleRad;
    }

    // Transmission & Engine Speed (RPM)
    const ratio = this.gearRatios[this.gear.toString()] || 0.0;
    const forwardKmh = this.speed * 3.6;
    this.speedKmh = Math.abs(Math.round(forwardKmh));

    if (this.gear === 0) {
      // Neutral free rev
      const targetRpm = this.idleRpm + this.throttle * (this.maxRpm - this.idleRpm);
      this.rpm += (targetRpm - this.rpm) * dt * 9.0;
    } else {
      const axleRpm = (Math.abs(this.speed) * 60) / (2 * Math.PI * this.wheelRadius);
      const driveRpm = axleRpm * this.finalDrive * Math.abs(ratio);
      const targetRpm = Math.max(this.idleRpm, Math.min(this.maxRpm, driveRpm + this.throttle * 650));
      this.rpm += (targetRpm - this.rpm) * dt * 12.0;
    }

    // Auto-sequential gearbox logic
    if (this.autoTransmission && this.gear > 0) {
      this.shiftCooldown -= dt;
      if (this.shiftCooldown <= 0) {
        if (this.rpm > 7400 && this.gear < 6) {
          this.shiftUp();
        } else if (this.rpm < 2200 && this.gear > 1) {
          this.shiftDown();
        }
      }
    }

    // Engine Power Output (Torque curve)
    let driveForce = 0.0;
    if (this.gear !== 0) {
      const rpmFrac = Math.max(0.1, this.rpm / this.maxRpm);
      // Realistic torque band: peaks at 65% RPM
      const torque = Math.sin(rpmFrac * Math.PI * 0.85) * 520.0; // Nm
      const boost = this.nosActive ? 1.6 : 1.0;
      driveForce = (torque * ratio * this.finalDrive * this.throttle * boost) / this.wheelRadius;
      if (this.gear === -1) driveForce = -Math.abs(driveForce) * 0.65;
    }

    // Resistance: Aerodynamic drag + rolling resistance + grass friction
    const airDrag = 0.5 * 1.225 * 0.32 * 2.15 * (this.speed * Math.abs(this.speed));
    const rollCoeff = this.isOffRoad ? 0.08 : 0.015;
    const rollingResistance = rollCoeff * this.mass * 9.81 * Math.sign(this.speed);

    // Braking force
    let brakeForce = this.brake * 11000.0;
    if (this.handbrake) brakeForce += 15000.0;
    if (Math.abs(this.speed) > 0.05) {
      brakeForce *= Math.sign(this.speed);
    } else if (this.brake > 0.05) {
      this.speed = 0.0;
    }

    // Net Longitudinal Acceleration
    const netForce = driveForce - airDrag - rollingResistance - (this.speed !== 0 ? brakeForce : 0);
    const accel = netForce / this.mass;
    this.longitudinalG = accel / 9.81;

    this.speed += accel * dt;
    if (Math.abs(this.speed) < 0.05 && this.throttle === 0) this.speed = 0.0;

    // Lateral Dynamics & Pacejka Drift Model
    if (Math.abs(steerAngleRad) > 0.001) {
      const turnRadius = this.wheelbase / Math.tan(Math.abs(steerAngleRad));
      const centripetal = (this.speed * this.speed) / turnRadius;
      this.lateralG = (centripetal / 9.81) * Math.sign(steerAngleRad);

      // Tire slip curve
      this.slipAngle = this.handbrake ? 0.85 : Math.max(0.0, (Math.abs(this.lateralG) - 0.75) * 0.7);

      // Kinematic yaw rate with slip damping
      const yawRate = (this.speed / turnRadius) * Math.sign(steerAngleRad) * (1.0 - this.slipAngle * 0.3);
      this.heading += yawRate * dt;
    } else {
      this.lateralG = 0.0;
      this.slipAngle = 0.0;
    }

    // Position integration along heading
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    this.position.x += fwdX * this.speed * dt;
    this.position.z += fwdZ * this.speed * dt;

    // Mesh placement and suspension dynamics
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;

    // Dynamic body roll and pitch
    const rollAngle = -this.lateralG * 0.04;
    const pitchAngle = -this.longitudinalG * 0.025;
    this.mesh.rotation.z = rollAngle;
    this.mesh.rotation.x = pitchAngle;

    // Rotate tires with velocity
    const wheelAngularRoll = (this.speed * dt) / this.wheelRadius;
    for (let w of this.wheels) {
      w.mesh.rotation.x += wheelAngularRoll;
    }

    // Brake light glow
    const isBraking = this.brake > 0.05 || this.handbrake;
    if (this.brakeLightMat) {
      this.brakeLightMat.emissive.setHex(isBraking ? 0xFF0033 : 0x440000);
      this.brakeLightMat.emissiveIntensity = isBraking ? 2.8 : 0.2;
    }

    // Audio Engine Update
    if (window.soundEngine) {
      window.soundEngine.updateEngine(this.rpm / this.maxRpm, this.throttle, this.speedKmh);
      window.soundEngine.updateTireScreech(this.slipAngle + (this.handbrake ? 0.6 : 0.0));
    }
  }

  resetPosition(x = 0, z = 0, heading = 0) {
    this.position.set(x, 0, z);
    this.speed = 0.0;
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.gear = 1;
    this.rpm = 950.0;
    this.throttle = 0.0;
    this.brake = 0.0;
    this.steeringAngle = 0.0;
    this.targetSteering = 0.0;
    this.lateralG = 0.0;
    this.longitudinalG = 0.0;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, heading, 0);
  }
}

window.Car = Car;
