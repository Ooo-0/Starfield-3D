(function () {
  "use strict";

  const canvas = document.querySelector("#space");
  const cursorStar = document.querySelector(".cursor-star");
  const ctx = canvas.getContext("2d", { alpha: false });
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let pointerActive = false;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  const starCount = window.matchMedia("(max-width: 760px)").matches ? 950 : 1650;
  const dustCount = window.matchMedia("(max-width: 760px)").matches ? 120 : 210;
  const stars = [];
  const dust = [];
  const palette = [
    [248, 251, 255],
    [102, 239, 255],
    [159, 140, 255],
    [255, 141, 200],
    [255, 225, 150],
    [168, 255, 208]
  ];

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function smoothstep(edge0, edge1, value) {
    const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }

  function makeStar(isDust) {
    const arm = Math.floor(Math.random() * 5);
    const radius = Math.pow(Math.random(), isDust ? 0.5 : 0.58) * (isDust ? 2.4 : 1.8);
    const angle = arm / 5 * TAU + radius * 2.2 + randomBetween(-0.7, 0.7);
    const color = palette[Math.floor(Math.random() * palette.length)];

    return {
      x: Math.cos(angle) * radius + randomBetween(-0.18, 0.18),
      y: Math.sin(angle) * radius * 0.38 + randomBetween(isDust ? -0.7 : -0.28, isDust ? 0.7 : 0.28),
      z: randomBetween(0.08, 1),
      size: isDust ? randomBetween(0.7, 2.4) : randomBetween(0.7, 2.8) * Math.pow(Math.random(), 0.35),
      speed: isDust ? randomBetween(0.016, 0.034) : randomBetween(0.026, 0.072),
      seed: Math.random(),
      twinkle: randomBetween(0.4, 1.6),
      color,
      dust: isDust
    };
  }

  function resetStar(star, far) {
    star.z = far ? randomBetween(0.78, 1) : randomBetween(0.08, 1);
    star.seed = Math.random();
    const arm = Math.floor(Math.random() * 5);
    const radius = Math.pow(Math.random(), star.dust ? 0.5 : 0.58) * (star.dust ? 2.4 : 1.8);
    const angle = arm / 5 * TAU + radius * 2.2 + randomBetween(-0.7, 0.7);
    star.x = Math.cos(angle) * radius + randomBetween(-0.18, 0.18);
    star.y = Math.sin(angle) * radius * 0.38 + randomBetween(star.dust ? -0.7 : -0.28, star.dust ? 0.7 : 0.28);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cx = width * 0.5;
    cy = height * 0.5;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function onPointerMove(event) {
    const point = event.touches ? event.touches[0] : event;
    const x = Math.max(0, Math.min(width, point.clientX));
    const y = Math.max(0, Math.min(height, point.clientY));

    targetX = x / width * 2 - 1;
    targetY = -(y / height * 2 - 1);
    pointerActive = true;

    cursorStar.classList.add("is-active");
    cursorStar.style.left = `${x}px`;
    cursorStar.style.top = `${y}px`;
  }

  function drawParticle(star, introTime, reveal, dt) {
    const baseSpeed = prefersReducedMotion ? 0.18 : 1;
    star.z -= star.speed * baseSpeed * dt;
    if (star.z < 0.035) {
      resetStar(star, true);
    }

    const revealStart = star.seed * (star.dust ? 12 : 8.5);
    const ownReveal = smoothstep(revealStart, revealStart + (star.dust ? 4.8 : 3.1), introTime);
    const alphaBase = reveal * ownReveal;
    if (alphaBase <= 0.002) {
      return;
    }

    const driftX = Math.sin(elapsed * 0.07) * 0.14;
    const driftY = Math.cos(elapsed * 0.055) * 0.08;
    const lookX = pointerX * 0.36 + driftX;
    const lookY = pointerY * 0.22 + driftY;
    const depth = 1 / Math.max(star.z, 0.035);
    const focal = Math.min(width, height) * 0.38;
    const sx = cx + (star.x + lookX * star.z) * focal * depth;
    const sy = cy + (star.y - lookY * star.z) * focal * depth;

    if (sx < -80 || sx > width + 80 || sy < -80 || sy > height + 80) {
      return;
    }

    const pulse = 0.74 + Math.sin(elapsed * star.twinkle + star.seed * TAU) * 0.26;
    const size = star.size * depth * (star.dust ? 0.62 : 0.86);
    const streak = Math.min(42, depth * star.speed * 330);
    const alpha = alphaBase * pulse * (star.dust ? 0.16 : 0.84);
    const [r, g, b] = star.color;

    if (!star.dust && streak > 5) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.22})`;
      ctx.lineWidth = Math.max(0.55, size * 0.18);
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - (star.x + lookX) * streak * 0.22, sy - (star.y - lookY) * streak * 0.22);
      ctx.stroke();
    }

    const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, size * 3.2));
    gradient.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
    gradient.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, ${alpha * 0.58})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.6, size * 3.2), 0, TAU);
    ctx.fill();
  }

  function drawNebula(reveal) {
    const nebulaReveal = smoothstep(4.8, 15, elapsed) * reveal;
    if (nebulaReveal <= 0.001) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const glowA = ctx.createRadialGradient(cx - width * 0.12, cy - height * 0.04, 0, cx - width * 0.12, cy - height * 0.04, Math.min(width, height) * 0.52);
    glowA.addColorStop(0, `rgba(90, 230, 255, ${0.08 * nebulaReveal})`);
    glowA.addColorStop(0.42, `rgba(160, 140, 255, ${0.04 * nebulaReveal})`);
    glowA.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, width, height);

    const glowB = ctx.createRadialGradient(cx + width * 0.18, cy + height * 0.1, 0, cx + width * 0.18, cy + height * 0.1, Math.min(width, height) * 0.46);
    glowB.addColorStop(0, `rgba(255, 225, 150, ${0.045 * nebulaReveal})`);
    glowB.addColorStop(0.38, `rgba(255, 141, 200, ${0.035 * nebulaReveal})`);
    glowB.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }

  function render(now) {
    requestAnimationFrame(render);

    const dt = Math.min((now - lastTime) / 1000, 0.034);
    lastTime = now;
    elapsed += dt;
    frameCount += 1;

    pointerX += (targetX - pointerX) * (pointerActive ? 0.04 : 0.018);
    pointerY += (targetY - pointerY) * (pointerActive ? 0.04 : 0.018);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    const introTime = Math.max(0, elapsed - 0.55);
    const reveal = smoothstep(0.6, 11.5, elapsed);
    if (introTime > 0) {
      ctx.globalCompositeOperation = "lighter";
      drawNebula(reveal);
      for (let i = 0; i < dust.length; i += 1) {
        drawParticle(dust[i], Math.max(0, introTime - 2.4), reveal, dt);
      }
      for (let i = 0; i < stars.length; i += 1) {
        drawParticle(stars[i], introTime, reveal, dt);
      }
    }

    window.__starfield = {
      canvasHeight: canvas.height,
      canvasWidth: canvas.width,
      cursorActive: pointerActive,
      elapsed,
      frameCount,
      lookX: pointerX,
      lookY: pointerY,
      reveal
    };

    if (new URLSearchParams(window.location.search).has("verify")) {
      canvas.dataset.buffer = `${canvas.width}x${canvas.height}`;
      canvas.dataset.cursorActive = String(pointerActive);
      canvas.dataset.elapsed = elapsed.toFixed(3);
      canvas.dataset.frames = String(frameCount);
      canvas.dataset.look = `${pointerX.toFixed(3)},${pointerY.toFixed(3)}`;
      canvas.dataset.reveal = reveal.toFixed(3);
    }
  }

  for (let i = 0; i < starCount; i += 1) {
    stars.push(makeStar(false));
  }

  for (let i = 0; i < dustCount; i += 1) {
    dust.push(makeStar(true));
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  requestAnimationFrame(render);
}());
