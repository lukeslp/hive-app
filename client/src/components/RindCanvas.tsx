import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { HexNode } from "@/types/hivemind";
import type { WorkspaceDocument } from "@shared/workspaceDocument";
import {
  findFrontFacingTile,
  generateHexasphere,
  type SphereTile,
} from "@/lib/hexasphere";
import {
  buildRindDisplayNodes,
  deriveRindProjection,
  rindSubdivisionsForNodeCount,
  type RindNodePlacement,
} from "@/lib/rindProjection";
import {
  rindNodeVisualSpec,
  type RindNodeIcon,
  type RindNodeVisualSpec,
} from "@/lib/rindNodeVisual";
import {
  RIND_NODE_INDICATOR_SEGMENTS,
  RIND_SURFACE_STYLES,
  RIND_TILE_CONTENT_OPTIONS,
} from "@/lib/rindVisualStyle";

type SphereProjection = WorkspaceDocument["projections"]["sphere"];

interface RindCanvasProps {
  nodes: Record<string, HexNode>;
  projection: SphereProjection;
  selectedNodeId: string | null;
  loadingNodes: Set<string>;
  generatingNeighbors: Set<string>;
  theme: string;
  onNodeClick: (key: string, node: HexNode) => void;
  onNodeInspect: (key: string) => void;
  onProjectionChange: (projection: SphereProjection) => void;
}

function tileGeometry(tile: SphereTile): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  tile.boundary.forEach(point => positions.push(point.x, point.y, point.z));
  positions.push(tile.centerPoint.x, tile.centerPoint.y, tile.centerPoint.z);
  const centerIndex = tile.boundary.length;
  tile.boundary.forEach((_, index) => {
    indices.push(centerIndex, index, (index + 1) % tile.boundary.length);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const outward = tile.centerPoint.clone().normalize();
  if (
    normal.getX(0) * outward.x +
      normal.getY(0) * outward.y +
      normal.getZ(0) * outward.z <
    0
  ) {
    for (let index = 0; index < indices.length; index += 3) {
      [indices[index + 1], indices[index + 2]] = [
        indices[index + 2],
        indices[index + 1],
      ];
    }
    geometry.setIndex(indices);
  }
  const radialNormals = positions.flatMap((_, index) => {
    if (index % 3 !== 0) return [];
    return new THREE.Vector3(
      positions[index],
      positions[index + 1],
      positions[index + 2]
    )
      .normalize()
      .toArray();
  });
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(radialNormals, 3)
  );
  return geometry;
}

function tileSeamGeometry(tile: SphereTile): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(
    tile.boundary.map(point =>
      point
        .clone()
        .normalize()
        .multiplyScalar(point.length() + 0.012)
    )
  );
}

function insetTilePoints(
  tile: SphereTile,
  inset: number,
  lift: number
): THREE.Vector3[] {
  const radius = tile.centerPoint.length() + lift;
  return tile.boundary.map(point =>
    point
      .clone()
      .lerp(tile.centerPoint, inset)
      .normalize()
      .multiplyScalar(radius)
  );
}

function insetTileGeometry(
  tile: SphereTile,
  inset: number,
  lift: number
): THREE.BufferGeometry {
  const boundary = insetTilePoints(tile, inset, lift);
  const center = tile.centerPoint
    .clone()
    .normalize()
    .multiplyScalar(tile.centerPoint.length() + lift);
  const positions = boundary.flatMap(point => point.toArray());
  positions.push(...center.toArray());
  const centerIndex = boundary.length;
  const indices = boundary.flatMap((_, index) => [
    centerIndex,
    index,
    (index + 1) % boundary.length,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      positions.flatMap((_, index) => {
        if (index % 3 !== 0) return [];
        return new THREE.Vector3(
          positions[index],
          positions[index + 1],
          positions[index + 2]
        )
          .normalize()
          .toArray();
      }),
      3
    )
  );
  return geometry;
}

function insetTileOutlineGeometry(
  tile: SphereTile,
  inset: number,
  lift: number
): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(
    insetTilePoints(tile, inset, lift)
  );
}

function drawOctagon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
) {
  context.beginPath();
  for (let index = 0; index < RIND_NODE_INDICATOR_SEGMENTS; index += 1) {
    const angle =
      -Math.PI / 2 + (index * Math.PI * 2) / RIND_NODE_INDICATOR_SEGMENTS;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function drawNodeIcon(
  context: CanvasRenderingContext2D,
  icon: RindNodeIcon,
  x: number,
  y: number,
  size: number
) {
  const half = size / 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 5;
  context.beginPath();
  switch (icon) {
    case "hexagon":
      for (let index = 0; index < 6; index += 1) {
        const angle = -Math.PI / 2 + (index * Math.PI) / 3;
        const px = x + Math.cos(angle) * half;
        const py = y + Math.sin(angle) * half;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.stroke();
      break;
    case "lightbulb":
      context.arc(x, y - 7, half * 0.58, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(x - 9, y + 12);
      context.lineTo(x + 9, y + 12);
      context.moveTo(x - 6, y + 21);
      context.lineTo(x + 6, y + 21);
      context.stroke();
      break;
    case "activity":
      context.moveTo(x - half, y);
      context.lineTo(x - 13, y);
      context.lineTo(x - 4, y - 20);
      context.lineTo(x + 7, y + 20);
      context.lineTo(x + 15, y);
      context.lineTo(x + half, y);
      context.stroke();
      break;
    case "terminal":
      context.moveTo(x - 20, y - 13);
      context.lineTo(x - 7, y);
      context.lineTo(x - 20, y + 13);
      context.moveTo(x + 1, y + 13);
      context.lineTo(x + 20, y + 13);
      context.stroke();
      break;
    case "question":
      context.arc(x, y, half, 0, Math.PI * 2);
      context.stroke();
      context.font = "700 36px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("?", x, y + 1);
      break;
    case "target":
      context.arc(x, y, half, 0, Math.PI * 2);
      context.moveTo(x + half * 0.45, y);
      context.arc(x, y, half * 0.45, 0, Math.PI * 2);
      context.stroke();
      break;
    case "spinner":
      context.arc(x, y, half, -Math.PI * 0.2, Math.PI * 1.35);
      context.stroke();
      break;
    case "ellipsis":
      [-17, 0, 17].forEach(offset => {
        context.moveTo(x + offset + 5, y);
        context.arc(x + offset, y, 5, 0, Math.PI * 2);
      });
      context.fill();
      break;
    case "box":
      context.rect(x - half, y - half, size, size);
      context.stroke();
      break;
  }
}

function nodeTileContent(
  tile: SphereTile,
  visual: RindNodeVisualSpec
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const iconColor = `#${visual.iconColor.toString(16).padStart(6, "0")}`;
  const textColor = `#${visual.textColor.toString(16).padStart(6, "0")}`;
  context.strokeStyle = iconColor;
  context.fillStyle = iconColor;
  drawOctagon(context, 128, 74, 42);
  context.globalAlpha = 0.3;
  context.fill();
  context.globalAlpha = 1;
  context.stroke();
  drawNodeIcon(context, visual.icon, 128, 74, 48);
  context.fillStyle = textColor;
  context.font = `${visual.emphasis === "ordinary" ? 600 : 700} 24px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  visual.lines.forEach((line, index) =>
    context.fillText(line, 128, 153 + index * 29, 232)
  );
  if (visual.badge === "sparkles") {
    context.fillStyle = "#facc15";
    context.font = "700 30px system-ui, sans-serif";
    context.fillText("✦", 207, 45);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
  );
  sprite.position.copy(
    tile.centerPoint
      .clone()
      .normalize()
      .multiplyScalar(tile.centerPoint.length() + 0.09)
  );
  sprite.scale.setScalar(1.05 * visual.scale);
  sprite.renderOrder = 4;
  return sprite;
}

function sphericalConnectionGeometry(
  start: SphereTile,
  end: SphereTile,
  lift: number
): THREE.BufferGeometry {
  const from = start.centerPoint.clone().normalize();
  const to = end.centerPoint.clone().normalize();
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1);
  const angle = Math.acos(dot);
  const radius = start.centerPoint.length() + lift;
  const points = Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    if (angle < 0.0001) return from.clone().multiplyScalar(radius);
    const sinAngle = Math.sin(angle);
    return from
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / sinAngle)
      .add(to.clone().multiplyScalar(Math.sin(t * angle) / sinAngle))
      .normalize()
      .multiplyScalar(radius);
  });
  return new THREE.BufferGeometry().setFromPoints(points);
}

function sameProjection(
  left: SphereProjection,
  right: SphereProjection
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function RindCanvas({
  nodes,
  projection,
  selectedNodeId,
  loadingNodes,
  generatingNeighbors,
  theme,
  onNodeClick,
  onNodeInspect,
  onProjectionChange,
}: RindCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pendingNodeCount = Array.from(generatingNeighbors).filter(
    key => !nodes[key]
  ).length;
  const subdivisions = rindSubdivisionsForNodeCount(
    Object.keys(nodes).length + pendingNodeCount,
    projection.subdivisions
  );
  const hexasphere = useMemo(
    () => generateHexasphere(5, subdivisions),
    [subdivisions]
  );
  const topology = useMemo(
    () =>
      hexasphere.tiles.map(tile => ({
        index: tile.index,
        neighborIndices: tile.neighborIndices,
        position: tile.centerPoint.toArray() as [number, number, number],
      })),
    [hexasphere]
  );
  const placements = useMemo(
    () =>
      deriveRindProjection(
        nodes,
        topology,
        projection.nodes as Record<string, RindNodePlacement>,
        findFrontFacingTile(hexasphere.tiles, hexasphere.radius)
      ),
    [hexasphere, nodes, projection.nodes, topology]
  );
  const displayNodes = useMemo(
    () => buildRindDisplayNodes(nodes, generatingNeighbors, loadingNodes),
    [generatingNeighbors, loadingNodes, nodes]
  );
  const displayPlacements = useMemo(
    () =>
      deriveRindProjection(
        displayNodes,
        topology,
        placements,
        findFrontFacingTile(hexasphere.tiles, hexasphere.radius)
      ),
    [displayNodes, hexasphere, placements, topology]
  );
  const nodeByTileIndex = useMemo(() => {
    const keyBySemanticId = new Map(
      Object.entries(displayNodes).map(([key, node]) => [
        node.semanticId ?? `tile:${node.q}:${node.r}`,
        key,
      ])
    );
    const result = new Map<number, string>();
    Object.entries(displayPlacements).forEach(([semanticId, placement]) => {
      const key = keyBySemanticId.get(semanticId);
      if (key) result.set(placement.tileIndex, key);
    });
    return result;
  }, [displayNodes, displayPlacements]);
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;
  const hoveredNode = hoveredNodeId ? nodes[hoveredNodeId] : null;

  useEffect(() => {
    const next = { ...projection, nodes: placements, subdivisions };
    if (!sameProjection(projection, next)) onProjectionChange(next);
  }, [onProjectionChange, placements, projection, subdivisions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRenderError(null);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      setRenderError(
        error instanceof Error ? error.message : "3D rendering is unavailable"
      );
      return;
    }

    const dark = theme === "dark";
    const surface = RIND_SURFACE_STYLES[dark ? "dark" : "light"];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(surface.background);
    const camera = new THREE.PerspectiveCamera(
      projection.camera.fov,
      1,
      0.1,
      200
    );
    camera.position.fromArray(projection.camera.position);
    if (camera.position.length() < 2) camera.position.set(0, 0, 15);
    camera.zoom = projection.camera.zoom;
    camera.updateProjectionMatrix();
    const controls = new OrbitControls(camera, canvas);
    controls.target.fromArray(projection.camera.target);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 7.5;
    controls.maxDistance = 25;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, surface.ambientIntensity));
    const keyLight = new THREE.DirectionalLight(0xffffff, surface.keyIntensity);
    keyLight.position.set(10, 10, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    fillLight.position.set(-8, 2, -7);
    scene.add(fillLight);

    const meshes: THREE.Mesh[] = [];
    const seams: THREE.LineLoop[] = [];
    const nodeFaces: {
      mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      generating: boolean;
      loading: boolean;
    }[] = [];
    const nodeOutlines: THREE.LineLoop[] = [];
    const connectionLines: THREE.Line[] = [];
    const labels: {
      sprite: THREE.Sprite;
      tile: SphereTile;
      generating: boolean;
    }[] = [];
    hexasphere.tiles.forEach(tile => {
      const nodeKey = nodeByTileIndex.get(tile.index);
      const node = nodeKey ? displayNodes[nodeKey] : null;
      const selected = !!nodeKey && nodeKey === selectedNodeId;
      const generating = !!nodeKey && generatingNeighbors.has(nodeKey);
      const loading = !!nodeKey && loadingNodes.has(nodeKey);
      const visual = node
        ? rindNodeVisualSpec(node, {
            dark,
            selected,
            hovered: false,
            loading,
            generating,
          })
        : null;
      const material = new THREE.MeshStandardMaterial({
        color: visual && !generating ? visual.borderColor : surface.shell,
        emissive:
          visual && !generating ? visual.borderColor : surface.shellEmissive,
        emissiveIntensity: 0.12,
        metalness: 0.02,
        roughness: 0.92,
        // The rind must be opaque: a translucent near hemisphere exposes
        // far-side occupied faces as concave pits and triangular slivers.
        transparent: false,
        opacity: 1,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(tileGeometry(tile), material);
      mesh.userData = { nodeKey, tileIndex: tile.index, generating };
      scene.add(mesh);
      meshes.push(mesh);
      const seam = new THREE.LineLoop(
        tileSeamGeometry(tile),
        new THREE.LineBasicMaterial({
          color: surface.seam,
          transparent: true,
          opacity: surface.seamOpacity,
          depthTest: true,
          depthWrite: false,
        })
      );
      seam.renderOrder = 1;
      scene.add(seam);
      seams.push(seam);
      if (node && visual) {
        const inset = selected
          ? 0.13
          : node.isKeyTheme
            ? 0.11
            : generating
              ? 0.1
              : 0.075;
        const faceMaterial = new THREE.MeshBasicMaterial({
          color: visual.faceFill,
          transparent: generating || loading,
          opacity: 1,
          depthTest: true,
          depthWrite: true,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        });
        const face = new THREE.Mesh(
          insetTileGeometry(tile, inset, 0.025),
          faceMaterial
        );
        face.renderOrder = 2;
        scene.add(face);
        nodeFaces.push({ mesh: face, generating, loading });

        const outlineMaterial = visual.dashed
          ? new THREE.LineDashedMaterial({
              color: visual.borderColor,
              transparent: true,
              opacity: 0.95,
              dashSize: 0.1,
              gapSize: 0.07,
              depthTest: true,
              depthWrite: false,
            })
          : new THREE.LineBasicMaterial({
              color: visual.borderColor,
              transparent: true,
              opacity: selected || node.isKeyTheme ? 1 : 0.78,
              depthTest: true,
              depthWrite: false,
            });
        const outline = new THREE.LineLoop(
          insetTileOutlineGeometry(tile, inset, 0.04),
          outlineMaterial
        );
        if (outlineMaterial instanceof THREE.LineDashedMaterial) {
          outline.computeLineDistances();
        }
        outline.renderOrder = 3;
        scene.add(outline);
        nodeOutlines.push(outline);

        const label = nodeTileContent(tile, visual);
        label.visible = false;
        scene.add(label);
        labels.push({
          sprite: label,
          tile,
          generating,
        });
      }
    });

    const tileIndexByNodeKey = new Map<string, number>();
    nodeByTileIndex.forEach((key, tileIndex) =>
      tileIndexByNodeKey.set(key, tileIndex)
    );
    const tilesByIndex = new Map(
      hexasphere.tiles.map(tile => [tile.index, tile])
    );
    const connectionKeys = new Set<string>();
    const addConnection = (
      leftKey: string,
      rightKey: string,
      related: boolean
    ) => {
      const id = [leftKey, rightKey].sort().join("|");
      if (connectionKeys.has(id)) return;
      const left = tilesByIndex.get(tileIndexByNodeKey.get(leftKey) ?? -1);
      const right = tilesByIndex.get(tileIndexByNodeKey.get(rightKey) ?? -1);
      if (!left || !right) return;
      connectionKeys.add(id);
      const lineMaterial = related
        ? new THREE.LineDashedMaterial({
            color: 0x60a5fa,
            transparent: true,
            opacity: 0.5,
            dashSize: 0.12,
            gapSize: 0.08,
            depthTest: true,
            depthWrite: false,
          })
        : new THREE.LineBasicMaterial({
            color: dark ? 0xcbd5e1 : 0x64748b,
            transparent: true,
            opacity: 0.38,
            depthTest: true,
            depthWrite: false,
          });
      const line = new THREE.Line(
        sphericalConnectionGeometry(left, right, 0.045),
        lineMaterial
      );
      if (lineMaterial instanceof THREE.LineDashedMaterial) {
        line.computeLineDistances();
      }
      line.renderOrder = 2;
      scene.add(line);
      connectionLines.push(line);
    };
    Object.entries(displayNodes).forEach(([key, node]) => {
      if (node.parentId) addConnection(node.parentId, key, false);
      node.relatedNodeKeys?.forEach(relatedKey =>
        addConnection(key, relatedKey, true)
      );
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const intersect = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(meshes, false)[0]?.object as
        | THREE.Mesh
        | undefined;
    };
    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const mesh = intersect(event);
      const candidateKey =
        typeof mesh?.userData.nodeKey === "string"
          ? mesh.userData.nodeKey
          : null;
      const key = candidateKey && nodes[candidateKey] ? candidateKey : null;
      setHoveredNodeId(key);
      canvas.style.cursor = key ? "pointer" : "grab";
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerDown) return;
      const moved = Math.hypot(
        event.clientX - pointerDown.x,
        event.clientY - pointerDown.y
      );
      pointerDown = null;
      if (moved > 5) return;
      const mesh = intersect(event);
      const key = mesh?.userData.nodeKey;
      if (typeof key === "string" && nodes[key]) onNodeClick(key, nodes[key]);
    };
    const handleDoubleClick = (event: MouseEvent) => {
      const mesh = intersect(event as unknown as PointerEvent);
      const key = mesh?.userData.nodeKey;
      if (typeof key === "string" && nodes[key]) onNodeInspect(key);
    };
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("dblclick", handleDoubleClick);

    const handleControlsEnd = () => {
      const next: SphereProjection = {
        ...projection,
        nodes: placements,
        subdivisions,
        camera: {
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
          fov: camera.fov,
          zoom: camera.zoom,
        },
      };
      onProjectionChange(next);
    };
    controls.addEventListener("end", handleControlsEnd);

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    let frame = 0;
    const animate = () => {
      controls.update();
      camera.updateMatrixWorld();
      const generationPulse =
        0.5 + 0.5 * Math.sin(window.performance.now() / 220);
      nodeFaces.forEach(face => {
        if (face.generating) {
          face.mesh.material.opacity = 0.46 + generationPulse * 0.34;
        } else if (face.loading) {
          face.mesh.material.opacity = 0.82 + generationPulse * 0.18;
        }
      });
      labels.forEach(label => {
        const normal = label.tile.centerPoint.clone().normalize();
        const towardCamera = camera.position
          .clone()
          .sub(label.tile.centerPoint)
          .normalize();
        label.sprite.visible =
          RIND_TILE_CONTENT_OPTIONS.showAllFrontFacing &&
          normal.dot(towardCamera) >= RIND_TILE_CONTENT_OPTIONS.minFacing;
        if (label.generating) {
          (label.sprite.material as THREE.SpriteMaterial).opacity =
            0.72 + generationPulse * 0.28;
        }
      });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.removeEventListener("end", handleControlsEnd);
      controls.dispose();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      meshes.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      seams.forEach(seam => {
        seam.geometry.dispose();
        (seam.material as THREE.Material).dispose();
      });
      nodeFaces.forEach(face => {
        face.mesh.geometry.dispose();
        face.mesh.material.dispose();
      });
      nodeOutlines.forEach(outline => {
        outline.geometry.dispose();
        (outline.material as THREE.Material).dispose();
      });
      connectionLines.forEach(line => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      labels.forEach(label => {
        const material = label.sprite.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      });
      renderer.dispose();
    };
  }, [
    hexasphere,
    displayNodes,
    generatingNeighbors,
    loadingNodes,
    nodeByTileIndex,
    nodes,
    onNodeClick,
    onNodeInspect,
    onProjectionChange,
    placements,
    projection,
    selectedNodeId,
    subdivisions,
    theme,
  ]);

  if (renderError) {
    return (
      <div className="absolute inset-0 grid place-items-center p-8 text-center">
        <div className="max-w-md rounded-2xl border border-destructive/40 bg-card p-6 shadow-xl">
          <h2 className="font-semibold">Rind could not start</h2>
          <p className="mt-2 text-sm text-muted-foreground">{renderError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0" data-testid="rind-workspace">
      <canvas
        ref={canvasRef}
        className="h-full w-full outline-none"
        aria-label="Rind spatial idea workspace. Drag to rotate and scroll to zoom."
      />
      {generatingNeighbors.size > 0 && (
        <div className="sr-only" role="status" aria-live="polite">
          Generating {generatingNeighbors.size} idea tiles on the sphere
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border/70 bg-card/85 px-4 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur-xl">
        {hoveredNode?.text ??
          selectedNode?.text ??
          "Drag to orbit · Scroll to zoom · Double-click to inspect"}
      </div>
      <nav className="sr-only" aria-label="Ideas in Rind workspace">
        {Object.entries(nodes).map(([key, node]) => (
          <button
            key={key}
            type="button"
            onClick={() => onNodeClick(key, node)}
            onDoubleClick={() => onNodeInspect(key)}
            aria-current={selectedNodeId === key ? "true" : undefined}
          >
            {node.text}, {node.type} tile
            {node.isKeyTheme ? ", key theme" : ""}
            {loadingNodes.has(key) ? ", generating neighbors" : ""}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default RindCanvas;
