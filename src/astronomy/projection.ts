const DEG = Math.PI / 180;

type Vec3 = [number, number, number];

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Unit vector of a horizontal direction.
 * X = East, Y = Up (zenith), Z = North. Azimuth from north toward east.
 */
export function directionVector(
  azimuthDeg: number,
  altitudeDeg: number,
): Vec3 {
  const az = azimuthDeg * DEG;
  const alt = altitudeDeg * DEG;
  const cosAlt = Math.cos(alt);
  return [cosAlt * Math.sin(az), Math.sin(alt), cosAlt * Math.cos(az)];
}

export interface CameraFrame {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

/**
 * Builds an orthonormal camera frame looking at (azimuth, altitude),
 * using the zenith as the natural "up" direction in the image.
 */
export function cameraFrame(
  azimuthDeg: number,
  altitudeDeg: number,
): CameraFrame {
  const forward = directionVector(azimuthDeg, altitudeDeg);
  const worldUp: Vec3 = [0, 1, 0];
  const k = dot(worldUp, forward);
  let up: Vec3 = [worldUp[0] - k * forward[0], worldUp[1] - k * forward[1], worldUp[2] - k * forward[2]];
  let upLen = Math.hypot(up[0], up[1], up[2]);
  if (upLen < 1e-6) {
    // Looking straight up (or down): pick north as the image up.
    up = [0, 0, 1];
    upLen = 1;
  } else {
    up = [up[0] / upLen, up[1] / upLen, up[2] / upLen];
  }
  const right = cross(up, forward);
  return { right, up, forward };
}

/**
 * Perspective (gnomonic) projection of a horizontal direction into screen
 * pixels centered on the canvas. The vertical FOV spans the canvas height,
 * so changing the FOV rescales the positions naturally.
 */
export function project(
  frame: CameraFrame,
  dir: Vec3,
  fovDeg: number,
  width: number,
  height: number,
): { x: number; y: number; depth: number } {
  const depth = dot(dir, frame.forward);
  const focal = height / 2 / Math.tan((fovDeg * DEG) / 2);
  const x = width / 2 + (focal * dot(dir, frame.right)) / depth;
  const y = height / 2 - (focal * dot(dir, frame.up)) / depth;
  return { x, y, depth };
}

/** Angular separation between two horizontal directions, in degrees. */
export function angularSeparation(
  az1: number,
  alt1: number,
  az2: number,
  alt2: number,
): number {
  const d = dot(directionVector(az1, alt1), directionVector(az2, alt2));
  return Math.acos(Math.min(1, Math.max(-1, d))) / DEG;
}
