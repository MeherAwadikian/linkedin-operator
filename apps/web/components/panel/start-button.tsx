'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import * as THREE from 'three';
import { toast } from './toast.tsx';

/** Draw the button-top texture: flame-yellow cap with a bold START legend. */
function makeTopTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    grad.addColorStop(0, '#ffd83d');
    grad.addColorStop(1, '#e6a800');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#8f0e13';
    ctx.font = '900 110px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', 256, 266);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The dashboard centerpiece: a yellow 3D ignition button in continuous
 * rotation, rendered with Three.js. Clicking anywhere on it fires the passed
 * server action (the main run). Purely visual on top of the normal action
 * plumbing: the server still authenticates and enqueues through RLS.
 */
export function StartButton({ action }: { action: () => Promise<void> }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(0.012);
  const [pending, startTransition] = useTransition();
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 2.2, 7.5);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 8, 6);
    scene.add(key);
    const glow = new THREE.PointLight(0xd7141a, 30, 20);
    glow.position.set(-4, 2, 3);
    scene.add(glow);

    const group = new THREE.Group();
    group.rotation.x = 0.42;
    scene.add(group);

    const disposables: Array<{ dispose(): void }> = [];
    const add = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T => {
      disposables.push(x);
      return x;
    };

    // Candy-apple housing plate under everything.
    const housing = new THREE.Mesh(
      add(new THREE.CylinderGeometry(2.45, 2.65, 0.4, 64)),
      add(new THREE.MeshStandardMaterial({ color: 0xb31217, metalness: 0.7, roughness: 0.25 })),
    );
    housing.position.y = -0.55;
    group.add(housing);

    // Chrome bezel ring.
    const bezel = new THREE.Mesh(
      add(new THREE.TorusGeometry(2.0, 0.24, 24, 96)),
      add(new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.15 })),
    );
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = -0.1;
    group.add(bezel);

    // The yellow START button itself.
    const topTexture = add(makeTopTexture());
    const side = add(
      new THREE.MeshStandardMaterial({
        color: 0xffc400,
        metalness: 0.35,
        roughness: 0.3,
        emissive: 0x332200,
      }),
    );
    const cap = add(new THREE.MeshStandardMaterial({ map: topTexture, roughness: 0.35 }));
    const button = new THREE.Mesh(add(new THREE.CylinderGeometry(1.6, 1.72, 0.75, 64)), [
      side, // side wall
      cap, // top cap (shows START)
      side, // bottom cap
    ]);
    button.position.y = 0.15;
    group.add(button);

    let frame = 0;
    let running = false;
    let inViewport = true;
    let tabVisible = document.visibilityState === 'visible';
    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.y += speedRef.current;
      group.position.y = Math.sin(Date.now() / 900) * 0.08;
      renderer.render(scene, camera);
    };
    // Pause the loop when the button scrolls offscreen or the tab is hidden,
    // so the GPU idles whenever nobody can see the scene.
    const sync = () => {
      const shouldRun = inViewport && tabVisible;
      if (shouldRun && !running) {
        running = true;
        animate();
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting ?? true;
      sync();
    });
    io.observe(mount);
    const onVisibility = () => {
      tabVisible = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    renderer.render(scene, camera);
    sync();

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    return () => {
      observer.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frame);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const ignite = () => {
    if (pending) return;
    speedRef.current = 0.09; // rev the animation while the run is firing
    startTransition(async () => {
      try {
        await action();
        setFired(true);
        toast('success', 'Run ignited. Staged campaigns are rolling.');
      } catch {
        toast('error', 'Ignition failed. Check the worker and try again.');
      } finally {
        speedRef.current = 0.025;
      }
    });
  };

  return (
    <button
      type="button"
      onClick={ignite}
      disabled={pending}
      aria-label="Start the main run"
      data-testid="start-button"
      className="group block w-full cursor-pointer rounded-xl border-0 bg-transparent p-0 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-flame-500"
    >
      <div ref={mountRef} className="mx-auto h-[340px] w-full max-w-xl" />
      <span className="mt-2 inline-block text-sm font-semibold uppercase tracking-[0.3em]">
        {pending ? (
          <span className="text-flame-500">Firing the engine...</span>
        ) : fired ? (
          <span className="text-flame-400">Run ignited. Queued campaigns are rolling.</span>
        ) : (
          <span className="text-chrome-400 group-hover:text-white">Push to start the main run</span>
        )}
      </span>
    </button>
  );
}
