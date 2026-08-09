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
  deriveRindProjection,
  rindSubdivisionsForNodeCount,
  type RindNodePlacement,
} from "@/lib/rindProjection";

type SphereProjection = WorkspaceDocument["projections"]["sphere"];

interface RindCanvasProps {
  nodes: Record<string, HexNode>;
  projection: SphereProjection;
  selectedNodeId: string | null;
  loadingNodes: Set<string>;
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
  sprite.scale.set(selected ? 2.55 : 2.3, selected ? 0.64 : 0.58, 1);
  return sprite;
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
  theme,
  onNodeClick,
  onNodeInspect,
  onProjectionChange,
}: RindCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const subdivisions = rindSubdivisionsForNodeCount(
    Object.keys(nodes).length,
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
  const nodeByTileIndex = useMemo(() => {
    const keyBySemanticId = new Map(
      Object.entries(nodes).map(([key, node]) => [
        node.semanticId ?? `tile:${node.q}:${node.r}`,
        key,
      ])
    );
    const result = new Map<number, string>();
    Object.entries(placements).forEach(([semanticId, placement]) => {
      const key = keyBySemanticId.get(semanticId);
      if (key) result.set(placement.tileIndex, key);
    });
    return result;
  }, [nodes, placements]);
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
    const labels: THREE.Sprite[] = [];
    hexasphere.tiles.forEach(tile => {
      const nodeKey = nodeByTileIndex.get(tile.index);
      const node = nodeKey ? nodes[nodeKey] : null;
      const selected = !!nodeKey && nodeKey === selectedNodeId;
      const loading = !!nodeKey && loadingNodes.has(nodeKey);
      const color = node
        ? (NODE_COLORS[node.type] ?? NODE_COLORS.default)
        : dark
          ? 0x171d2b
          : 0xcbd5e1;
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: node ? color : dark ? 0x05070c : 0x64748b,
        emissiveIntensity: loading
          ? 0.62
          : selected
            ? 0.42
            : node
              ? 0.14
              : 0.03,
        metalness: 0.04,
        roughness: 0.8,
        transparent: !node,
        opacity: node ? 1 : dark ? 0.48 : 0.62,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(tileGeometry(tile), material);
      mesh.userData = { nodeKey, tileIndex: tile.index };
      if (selected) {
        mesh.scale.setScalar(1.025);
        mesh.position.copy(
          tile.centerPoint.clone().normalize().multiplyScalar(0.05)
        );
      }
      scene.add(mesh);
      meshes.push(mesh);
      if (node) {
        const label = nodeLabel(node, tile, dark, selected);
        scene.add(label);
        labels.push(label);
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
      const key =
        typeof mesh?.userData.nodeKey === "string"
          ? mesh.userData.nodeKey
          : null;
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
      if (typeof key === "string") onNodeInspect(key);
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
        const material = label.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      });
      renderer.dispose();
    };
  }, [
    hexasphere,
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
