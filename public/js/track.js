/**
 * Gyropad Pro - 3D Circuit & Precision Lap Split System
 */

class Track {
  constructor(scene) {
    this.scene = scene;
    this.checkpoints = [];
    this.trackPoints = [];
    this.trackWidth = 14.0;
    this.buildTrack();
  }

  buildTrack() {
    // Grand Prix Circuit Spline Points
    const points = [
      new THREE.Vector3(0, 0, 0),         // Start/Finish straight
      new THREE.Vector3(0, 0, 140),       // Long Main straight
      new THREE.Vector3(30, 0, 210),      // Turn 1 Entry
      new THREE.Vector3(90, 0, 230),      // Turn 1 Apex
      new THREE.Vector3(150, 0, 190),     // Turn 2 Exit
      new THREE.Vector3(170, 0, 120),     // Back straight
      new THREE.Vector3(195, 0, 40),      // Chicane
      new THREE.Vector3(155, 0, -30),
      new THREE.Vector3(160, 0, -110),    // Hairpin Approach
      new THREE.Vector3(115, 0, -165),    // Hairpin Apex
      new THREE.Vector3(45, 0, -145),     // Hairpin Exit
      new THREE.Vector3(15, 0, -80),      // S-Curves
      new THREE.Vector3(-15, 0, -30),
      new THREE.Vector3(0, 0, 0)
    ];

    this.curve = new THREE.CatmullRomCurve3(points, true);
    const divisions = 280;
    this.trackPoints = this.curve.getPoints(divisions);

    // Dark Terrain
    const groundGeo = new THREE.PlaneGeometry(1400, 1400);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0A0F0C,
      roughness: 0.95,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Asphalt Ribbon & Apex Curbs
    this.buildRoadMesh();

    // Start / Finish Line Gantry
    this.buildStartGantry();

    // Trackside Barriers
    this.buildBarriers();

    // Lap Timing Gates
    this.setupCheckpoints();
  }

  buildRoadMesh() {
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x16151B,
      roughness: 0.85,
      metalness: 0.15
    });

    const roadGeo = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];

    const numPoints = this.trackPoints.length;
    for (let i = 0; i < numPoints; i++) {
      const p1 = this.trackPoints[i];
      const p2 = this.trackPoints[(i + 1) % numPoints];

      const fwd = new THREE.Vector3().subVectors(p2, p1).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

      const leftEdge = new THREE.Vector3().addVectors(p1, right.clone().multiplyScalar(-this.trackWidth / 2));
      const rightEdge = new THREE.Vector3().addVectors(p1, right.clone().multiplyScalar(this.trackWidth / 2));

      const nextP1 = this.trackPoints[(i + 1) % numPoints];
      const nextP2 = this.trackPoints[(i + 2) % numPoints];
      const nextFwd = new THREE.Vector3().subVectors(nextP2, nextP1).normalize();
      const nextRight = new THREE.Vector3(-nextFwd.z, 0, nextFwd.x).normalize();

      const nextLeftEdge = new THREE.Vector3().addVectors(nextP1, nextRight.clone().multiplyScalar(-this.trackWidth / 2));
      const nextRightEdge = new THREE.Vector3().addVectors(nextP1, nextRight.clone().multiplyScalar(this.trackWidth / 2));

      // 2 triangles per quad
      vertices.push(leftEdge.x, 0.01, leftEdge.z);
      vertices.push(rightEdge.x, 0.01, rightEdge.z);
      vertices.push(nextLeftEdge.x, 0.01, nextLeftEdge.z);

      vertices.push(rightEdge.x, 0.01, rightEdge.z);
      vertices.push(nextRightEdge.x, 0.01, nextRightEdge.z);
      vertices.push(nextLeftEdge.x, 0.01, nextLeftEdge.z);

      for (let k = 0; k < 6; k++) normals.push(0, 1, 0);
    }

    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
  }

  buildStartGantry() {
    const gantry = new THREE.Group();
    gantry.position.set(0, 0, 5);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x221F2D, metalness: 0.85, roughness: 0.2 });
    const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), metalMat);
    leftPillar.position.set(-this.trackWidth / 2 - 1.5, 4, 0);
    const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), metalMat);
    rightPillar.position.set(this.trackWidth / 2 + 1.5, 4, 0);

    const overheadBeam = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth + 4, 1.2, 1.2), metalMat);
    overheadBeam.position.set(0, 7.5, 0);

    const displayBoard = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x110F16, metalness: 0.5 }));
    displayBoard.position.set(0, 7.5, -0.6);

    gantry.add(leftPillar, rightPillar, overheadBeam, displayBoard);
    this.scene.add(gantry);

    // White starting line
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(this.trackWidth, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xFFFFFF })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.02, 5);
    this.scene.add(startLine);
  }

  buildBarriers() {
    const numPoints = this.trackPoints.length;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x484457, metalness: 0.7 });

    for (let i = 0; i < numPoints; i += 8) {
      const p = this.trackPoints[i];
      const pNext = this.trackPoints[(i + 1) % numPoints];
      const fwd = new THREE.Vector3().subVectors(pNext, p).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), postMat);
      postL.position.copy(p).add(right.clone().multiplyScalar(-this.trackWidth / 2 - 1.5));
      postL.position.y = 0.6;
      this.scene.add(postL);

      const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8), postMat);
      postR.position.copy(p).add(right.clone().multiplyScalar(this.trackWidth / 2 + 1.5));
      postR.position.y = 0.6;
      this.scene.add(postR);
    }
  }

  setupCheckpoints() {
    const total = this.trackPoints.length;
    const indices = [0, Math.floor(total * 0.25), Math.floor(total * 0.50), Math.floor(total * 0.75)];

    this.checkpoints = indices.map((idx, i) => {
      const p = this.trackPoints[idx];
      const nextP = this.trackPoints[(idx + 1) % total];
      const fwd = new THREE.Vector3().subVectors(nextP, p).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();

      return {
        id: i,
        pos: p,
        normal: fwd,     // Direction of travel
        tangent: right,  // Across the track
        isFinish: (i === 0)
      };
    });
  }

  checkLapProgress(carPos) {
    for (let cp of this.checkpoints) {
      // Vector from checkpoint center to car
      const delta = new THREE.Vector3().subVectors(carPos, cp.pos);
      // Distance along gate plane (normal)
      const distAlongNormal = Math.abs(delta.dot(cp.normal));
      // Distance across track (tangent)
      const distAcrossTrack = Math.abs(delta.dot(cp.tangent));

      // Car is crossing the gate if within 4m of the plane and within track width
      if (distAlongNormal < 4.0 && distAcrossTrack < (this.trackWidth / 2 + 6.0)) {
        return cp;
      }
    }
    return null;
  }

  checkOffRoad(carPos) {
    // Finds nearest point on track spline
    let minDistSq = Infinity;
    for (let i = 0; i < this.trackPoints.length; i += 4) {
      const d = carPos.distanceToSquared(this.trackPoints[i]);
      if (d < minDistSq) minDistSq = d;
    }
    return Math.sqrt(minDistSq) > (this.trackWidth / 2 + 1.0);
  }
}

window.Track = Track;
