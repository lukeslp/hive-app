/**
 * Rind's geodesic hexasphere geometry, adapted for the Idea Tiles renderer.
 * Original TypeScript implementation by Luke Steuber, inspired by
 * Rob Scanlon's MIT-licensed hexasphere.js.
 */

import * as THREE from "three";

export interface SphereTile {
  index: number;
  centerPoint: THREE.Vector3;
  boundary: THREE.Vector3[];
  neighborIndices: number[];
  isPentagon: boolean;
}

export interface HexasphereData {
  tiles: SphereTile[];
  radius: number;
  subdivisions: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_VERTICES: [number, number, number][] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];
const ICOSAHEDRON_FACES: [number, number, number][] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

function onSphere(value: THREE.Vector3, radius: number): THREE.Vector3 {
  return value.clone().normalize().multiplyScalar(radius);
}

function vectorKey(value: THREE.Vector3, precision = 6): string {
  return `${value.x.toFixed(precision)},${value.y.toFixed(precision)},${value.z.toFixed(precision)}`;
}

function subdivideIcosahedron(subdivisions: number, radius: number) {
  const base = ICOSAHEDRON_VERTICES.map(([x, y, z]) =>
    onSphere(new THREE.Vector3(x, y, z), radius)
  );
  const vertexMap = new Map<string, number>();
  const vertices: THREE.Vector3[] = [];
  const faces: [number, number, number][] = [];

  const vertexIndex = (value: THREE.Vector3) => {
    const projected = onSphere(value, radius);
    const key = vectorKey(projected);
    const found = vertexMap.get(key);
    if (found !== undefined) return found;
    const index = vertices.length;
    vertices.push(projected);
    vertexMap.set(key, index);
    return index;
  };

  for (const [aIndex, bIndex, cIndex] of ICOSAHEDRON_FACES) {
    const a = base[aIndex];
    const b = base[bIndex];
    const c = base[cIndex];
    const rows: number[][] = [];
    for (let rowIndex = 0; rowIndex <= subdivisions; rowIndex += 1) {
      const row: number[] = [];
      for (
        let columnIndex = 0;
        columnIndex <= subdivisions - rowIndex;
        columnIndex += 1
      ) {
        const u = rowIndex / subdivisions;
        const v = columnIndex / subdivisions;
        const w = 1 - u - v;
        row.push(
          vertexIndex(
            new THREE.Vector3(
              a.x * w + b.x * u + c.x * v,
              a.y * w + b.y * u + c.y * v,
              a.z * w + b.z * u + c.z * v
            )
          )
        );
      }
      rows.push(row);
    }
    for (let row = 0; row < subdivisions; row += 1) {
      for (let column = 0; column < subdivisions - row; column += 1) {
        const first = rows[row][column];
        const second = rows[row + 1][column];
        const third = rows[row][column + 1];
        faces.push([first, second, third]);
        if (column < subdivisions - row - 1) {
          faces.push([second, rows[row + 1][column + 1], third]);
        }
      }
    }
  }

  return { vertices, faces };
}

function buildDual(
  vertices: THREE.Vector3[],
  faces: [number, number, number][],
  radius: number
): SphereTile[] {
  const centroids = faces.map(([a, b, c]) =>
    onSphere(
      new THREE.Vector3()
        .add(vertices[a])
        .add(vertices[b])
        .add(vertices[c])
        .divideScalar(3),
      radius
    )
  );
  const vertexFaces = new Map<number, number[]>();
  faces.forEach((face, faceIndex) => {
    face.forEach(vertexIndex => {
      const connected = vertexFaces.get(vertexIndex) ?? [];
      connected.push(faceIndex);
      vertexFaces.set(vertexIndex, connected);
    });
  });

  const tiles: SphereTile[] = [];
  vertexFaces.forEach((faceIndices, vertexIndex) => {
    const vertex = vertices[vertexIndex];
    const normal = vertex.clone().normalize();
    let right = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.dot(right)) > 0.9) right = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3().crossVectors(normal, right).normalize();
    right = new THREE.Vector3().crossVectors(forward, normal).normalize();
    const boundary = faceIndices
      .map(faceIndex => {
        const centroid = centroids[faceIndex];
        const difference = centroid.clone().sub(vertex);
        return {
          centroid,
          angle: Math.atan2(difference.dot(forward), difference.dot(right)),
        };
      })
      .sort((left, rightValue) => left.angle - rightValue.angle)
      .map(value => value.centroid);
    tiles.push({
      index: tiles.length,
      centerPoint: onSphere(vertex, radius),
      boundary,
      neighborIndices: [],
      isPentagon: boundary.length === 5,
    });
  });

  const tilesByEdge = new Map<string, number[]>();
  tiles.forEach(tile => {
    tile.boundary.forEach((point, index) => {
      const next = tile.boundary[(index + 1) % tile.boundary.length];
      const edge = [vectorKey(point), vectorKey(next)].sort().join("|");
      const connected = tilesByEdge.get(edge) ?? [];
      connected.push(tile.index);
      tilesByEdge.set(edge, connected);
    });
  });
  tilesByEdge.forEach(connected => {
    if (connected.length !== 2) return;
    const [first, second] = connected;
    tiles[first].neighborIndices.push(second);
    tiles[second].neighborIndices.push(first);
  });
  return tiles;
}

export function generateHexasphere(
  radius = 5,
  subdivisions = 6
): HexasphereData {
  const normalizedSubdivisions = Math.max(1, Math.floor(subdivisions));
  const { vertices, faces } = subdivideIcosahedron(
    normalizedSubdivisions,
    radius
  );
  return {
    tiles: buildDual(vertices, faces, radius),
    radius,
    subdivisions: normalizedSubdivisions,
  };
}

export function findFrontFacingTile(tiles: SphereTile[], radius: number) {
  const front = new THREE.Vector3(0, 0, radius);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  tiles.forEach(tile => {
    const score =
      front.distanceToSquared(tile.centerPoint) + (tile.isPentagon ? 0.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = tile.index;
    }
  });
  return bestIndex;
}
