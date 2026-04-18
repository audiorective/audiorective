import { useEffect, useRef } from "react";
import * as THREE from "three";
import { attach, PannerAnchor } from "@audiorective/threejs";
import { engine } from "../audio/engine";
import type { Track } from "../audio/trackConfig";

interface SpatialPannerProps {
  tracks: readonly Track[];
  selectedTrackId: string;
  onSelectTrack: (track: Track) => void;
}

const FLOOR_Y = 0;
const SPHERE_Y = 0.3;
const SPHERE_RADIUS = 0.4;

export function SpatialPanner({ tracks, selectedTrackId, onSelectTrack }: SpatialPannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep a live ref so the pointerdown handler (registered once) reads the current value.
  const selectedIdRef = useRef(selectedTrackId);
  const onSelectRef = useRef(onSelectTrack);
  useEffect(() => {
    selectedIdRef.current = selectedTrackId;
  }, [selectedTrackId]);
  useEffect(() => {
    onSelectRef.current = onSelectTrack;
  }, [onSelectTrack]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0a0a, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 7);
    camera.lookAt(0, 0, 0);

    const detachEngine = attach(engine, renderer);

    const listener = new THREE.AudioListener();
    camera.add(listener);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 8, 4);
    scene.add(dir);

    const grid = new THREE.GridHelper(10, 20, 0x333333, 0x1f1f1f);
    grid.position.y = FLOOR_Y;
    scene.add(grid);

    const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16);
    type TrackEntry = {
      track: Track;
      anchor: PannerAnchor;
      mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
      ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    };
    const entries: TrackEntry[] = tracks.map((track, i) => {
      const color = new THREE.Color(track.color);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.userData["trackId"] = track.id;

      const anchor = new PannerAnchor(track.seq.spatial.panner);
      const x = (i - (tracks.length - 1) / 2) * 1.5;
      anchor.position.set(x, SPHERE_Y, 0);
      anchor.add(mesh);
      scene.add(anchor);

      const ringGeometry = new THREE.RingGeometry(SPHERE_RADIUS * 1.2, SPHERE_RADIUS * 1.5, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -SPHERE_Y + 0.01;
      anchor.add(ring);

      return { track, anchor, mesh, ring };
    });

    const syncSelection = () => {
      for (const e of entries) {
        const isSelected = e.track.id === selectedIdRef.current;
        e.mesh.material.emissiveIntensity = isSelected ? 0.9 : 0.35;
        e.ring.material.opacity = isSelected ? 0.75 : 0;
      }
    };
    syncSelection();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SPHERE_Y);
    const hitPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let dragging: TrackEntry | null = null;

    const setPointerFromEvent = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      const meshes = entries.map((entry) => entry.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;
      const hitMesh = hits[0]!.object as THREE.Mesh;
      const entry = entries.find((x) => x.mesh === hitMesh);
      if (!entry) return;
      dragging = entry;
      renderer.domElement.setPointerCapture(e.pointerId);

      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        dragOffset.copy(hitPoint).sub(entry.anchor.position);
      } else {
        dragOffset.set(0, 0, 0);
      }

      if (entry.track.id !== selectedIdRef.current) {
        onSelectRef.current(entry.track);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        dragging.anchor.position.x = hitPoint.x - dragOffset.x;
        dragging.anchor.position.z = hitPoint.z - dragOffset.z;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      renderer.domElement.releasePointerCapture(e.pointerId);
      dragging = null;
    };

    const dom = renderer.domElement;
    dom.style.display = "block";
    dom.style.width = "100%";
    dom.style.height = "100%";
    dom.style.touchAction = "none";
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);

    // Keep the selection ref-driven visuals in sync each frame — avoids a React effect round-trip.
    let prevSelectedId = selectedIdRef.current;
    let rafId = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (selectedIdRef.current !== prevSelectedId) {
        prevSelectedId = selectedIdRef.current;
        syncSelection();
      }
      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      detachEngine();

      for (const e of entries) {
        scene.remove(e.anchor);
        e.mesh.material.dispose();
        e.ring.geometry.dispose();
        e.ring.material.dispose();
      }
      sphereGeometry.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (dom.parentNode === container) container.removeChild(dom);
    };
  }, [tracks]);

  return <div ref={containerRef} style={styles.container} />;
}

const styles = {
  container: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    position: "relative" as const,
    background: "#0a0a0a",
  },
};
