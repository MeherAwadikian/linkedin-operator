'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * GPU-light 3D backdrop for the dashboard hero: a slow-drifting particle field
 * plus a rotating wireframe torus, in the hot-rod palette. Renders behind the
 * hero copy at low opacity.
 *
 * Budget rules:
 * - ~700 points and one low-poly wireframe; no postprocessing, no shadows.
 * - The render loop pauses whenever the canvas scrolls offscreen
 *   (IntersectionObserver) or the tab is hidden (visibilitychange).
 * - Under prefers-reduced-motion it renders a single static frame.
 *
 * This module is heavy (imports three); only load it through
 * `HeroBackground` (next/dynamic, ssr:false) so it never blocks first paint.
 */
export default function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      60,
    );
    camera.position.set(0, 0, 11);

    // Particle field: scattered embers in red/yellow/chrome.
    const COUNT = 700;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const palette = [
      new THREE.Color('#d7141a'),
      new THREE.Color('#ffc400'),
      new THREE.Color('#8a919c'),
    ];
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pointsMat = new THREE.PointsMaterial({
      size: 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const points = new THREE.Points(pointsGeo, pointsMat);
    scene.add(points);

    // Wireframe torus: the "engine" motif, barely-there chrome red.
    const torusGeo = new THREE.TorusKnotGeometry(3.4, 0.9, 110, 14);
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0xd7141a,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.position.set(4.5, -0.5, -3);
    scene.add(torus);

    let frame = 0;
    let running = false;
    let visibleInViewport = true;
    let tabVisible = document.visibilityState === 'visible';

    const renderOnce = () => renderer.render(scene, camera);
    const loop = () => {
      frame = requestAnimationFrame(loop);
      points.rotation.y += 0.0006;
      points.rotation.x += 0.0002;
      torus.rotation.y += 0.0014;
      torus.rotation.z += 0.0006;
      renderOnce();
    };
    const sync = () => {
      const shouldRun = !reduced && visibleInViewport && tabVisible;
      if (shouldRun && !running) {
        running = true;
        loop();
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      visibleInViewport = entry?.isIntersecting ?? true;
      sync();
    });
    io.observe(mount);
    const onVisibility = () => {
      tabVisible = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
      if (!running) renderOnce();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    renderOnce(); // static frame for reduced motion / before the loop starts
    sync();

    return () => {
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frame);
      pointsGeo.dispose();
      pointsMat.dispose();
      torusGeo.dispose();
      torusMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} aria-hidden="true" className="absolute inset-0" />;
}
