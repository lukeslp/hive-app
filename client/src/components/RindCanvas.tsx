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
import { selectRindLabelIds } from "@/lib/rindLabelLayout";

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

const NODE_COLORS: Record<string, number> = {
  root: 0xfacc15,
  concept: 0xf59e0b,
  action: 0xf43f5e,
  technical: 0x22d3ee,
  question: 0xa78bfa,
  risk: 0xef4444,
  default: 0x94a3b8,
};

const EMPTY_TILE_COLORS = {
  dark: { color: 0x1e293b, emissive: 0x1e293b },
  light: { color: 0xe2e8f0, emissive: 0xcbd5e1 },
};
const LABEL_MIN_FACING = 0.18;
const LABEL_COLLISION_PADDING = 10;
const MAX_VISIBLE_LABELS = 8;

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
    geometry.computeVertexNormals();
  }
  return geometry;
}

function nodeLabel(
  node: HexNode,
  tile: SphereTile,
  dark: boolean,
  selected: boolean
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const color = NODE_COLORS[node.type] ?? NODE_COLORS.default;
  context.fillStyle = dark ? "rgba(2,6,23,0.92)" : "rgba(255,255,255,0.94)";
  context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.lineWidth = selected ? 8 : 5;
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 28);
  context.fill();
  context.stroke();
  context.fillStyle = dark ? "#f8fafc" : "#0f172a";
  context.font = `${selected || node.isKeyTheme ? 700 : 600} 38px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const label =
    node.text.length > 25 ? `${node.text.slice(0, 24).trimEnd()}…` : node.text;
  context.fillText(label, 256, 66, 455);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    })
  );
  sprite.position.copy(
    tile.centerPoint
      .clone()
      .normalize()
      .multiplyScalar(tile.centerPoint.length() + 0.17)
  );
  sprite.scale.set(selected ? 1.82 : 1.62, selected ? 0.48 : 0.43, 1);
  return sprite;
}

function spriteScreenBounds(
  sprite: THREE.Sprite,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
) {
  const center = sprite.getWorldPosition(new THREE.Vector3());
  const cameraRight = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 0)
    .multiplyScalar(sprite.scale.x / 2);
  const cameraUp = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 1)
    .multiplyScalar(sprite.scale.y / 2);
  const corners = [
    center.clone().sub(cameraRight).sub(cameraUp),
    center.clone().add(cameraRight).sub(cameraUp),
    center.clone().add(cameraRight).add(cameraUp),
    center.clone().sub(cameraRight).add(cameraUp),
  ].map(point => point.project(camera));
  const xs = corners.map(point => (point.x * 0.5 + 0.5) * width);
  const ys = corners.map(point => (-point.y * 0.5 + 0.5) * height);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
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
  const hoveredNodeIdRef = useRef<string | null>(null);
  hoveredNodeIdRef.current = hoveredNodeId;
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
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(dark ? 0x080b12 : 0xeef2f7);
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

    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.65 : 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, dark ? 1.15 : 1.35);
    keyLight.position.set(10, 10, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    fillLight.position.set(-8, 2, -7);
    scene.add(fillLight);

    const meshes: THREE.Mesh[] = [];
    const labels: {
      sprite: THREE.Sprite;
      tile: SphereTile;
      nodeKey: string;
      priority: number;
      generating: boolean;
    }[] = [];
    const emptyTileColors = dark
      ? EMPTY_TILE_COLORS.dark
      : EMPTY_TILE_COLORS.light;
    hexasphere.tiles.forEach(tile => {
      const nodeKey = nodeByTileIndex.get(tile.index);
      const node = nodeKey ? displayNodes[nodeKey] : null;
      const selected = !!nodeKey && nodeKey === selectedNodeId;
      const generating = !!nodeKey && generatingNeighbors.has(nodeKey);
      const loading = !!nodeKey && (loadingNodes.has(nodeKey) || generating);
      const color = node
        ? (NODE_COLORS[node.type] ?? NODE_COLORS.default)
        : emptyTileColors.color;
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: node ? color : emptyTileColors.emissive,
        emissiveIntensity: loading
          ? 0.62
          : selected
            ? 0.42
            : node
              ? 0.14
              : 0.03,
        metalness: 0.04,
        roughness: 0.8,
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
      if (selected) {
        mesh.position.copy(
          tile.centerPoint.clone().normalize().multiplyScalar(0.05)
        );
      }
      scene.add(mesh);
      meshes.push(mesh);
      if (node) {
        const label = nodeLabel(node, tile, dark, selected);
        label.visible = false;
        scene.add(label);
        labels.push({
          sprite: label,
          tile,
          nodeKey: nodeKey!,
          priority: generating
            ? 5
            : selected
              ? 4
              : node.type === "root" || node.isKeyTheme
                ? 2
                : 0,
          generating,
        });
      }
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
      meshes.forEach(mesh => {
        if (!mesh.userData.generating) return;
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
          0.42 + generationPulse * 0.48;
      });
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const visibleLabelIds = new Set(
        selectRindLabelIds(
          labels.map(label => {
            const bounds = spriteScreenBounds(
              label.sprite,
              camera,
              width,
              height
            );
            const normal = label.tile.centerPoint.clone().normalize();
            const towardCamera = camera.position
              .clone()
              .sub(label.tile.centerPoint)
              .normalize();
            const centerX = (bounds.left + bounds.right) / 2;
            const centerY = (bounds.top + bounds.bottom) / 2;
            return {
              id: label.nodeKey,
              ...bounds,
              facing: normal.dot(towardCamera),
              priority:
                hoveredNodeIdRef.current === label.nodeKey
                  ? Math.max(3, label.priority)
                  : label.priority,
              centerDistance: Math.hypot(
                centerX - width / 2,
                centerY - height / 2
              ),
            };
          }),
          {
            minFacing: LABEL_MIN_FACING,
            collisionPadding: LABEL_COLLISION_PADDING,
            maxVisible: MAX_VISIBLE_LABELS,
          }
        )
      );
      labels.forEach(label => {
        label.sprite.visible = visibleLabelIds.has(label.nodeKey);
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
            {node.text}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default RindCanvas;
