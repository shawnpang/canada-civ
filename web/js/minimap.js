// An overview of the same classified cells as the main map; no additional data.
export function setupMinimap({getWorld, getCamera, moveTo}) {
  const canvas = document.querySelector('#minimap');
  const context = canvas.getContext('2d');
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const paint = base.getContext('2d');
  let cachedWorld = null;
  let active = false;
  let fit;
  const colors = ['#8b927a', '#92a879', '#456d50', '#688b60', '#a0a77b', '#c3b982', '#b7b27e', '#cfbd77', '#8fa88c', '#bcb39a', '#b6b5a4', '#e5e9db'];

  function prepare(world) {
    cachedWorld = world;
    const pad = 3;
    const scale = Math.min((base.width - pad * 2) / world.width, (base.height - pad * 2) / world.height);
    fit = {scale, x: (base.width - world.width * scale) / 2, y: (base.height - world.height * scale) / 2};
    paint.fillStyle = '#173a50';
    paint.fillRect(0, 0, base.width, base.height);
    const dx = Math.sqrt(3) * 25;
    const size = Math.max(1, 25 * scale * 1.8);
    for (let i = 0; i < world.owner.length; i++) {
      const row = Math.floor(i / world.grid.cols), col = i % world.grid.cols;
      const water = world.water[i], owner = world.owner[i];
      if (water === 1) continue;
      paint.fillStyle = water ? (water === 3 ? '#76aebb' : '#457d91') : owner === -2 ? '#727c6f' : colors[world.cover[i]];
      paint.fillRect(fit.x + (col + .5 * (row & 1)) * dx * scale - size / 2, fit.y + row * 37.5 * scale - size / 2, size, size);
    }
  }
  function draw() {
    const world = getWorld();
    if (!world) return;
    if (world !== cachedWorld) prepare(world);
    context.drawImage(base, 0, 0);
    const {scale, ox, oy} = getCamera();
    const x = fit.x - ox / scale * fit.scale;
    const y = fit.y - oy / scale * fit.scale;
    const width = innerWidth / scale * fit.scale;
    const height = innerHeight / scale * fit.scale;
    context.strokeStyle = '#fae4a8';
    context.lineWidth = 1;
    context.strokeRect(x + .5, y + .5, width, height);
    canvas.setAttribute('aria-label', document.documentElement.lang === 'fr' ? 'Carte générale; glissez pour naviguer' : 'Overview map; drag to navigate');
  }
  function jump(event) {
    if (!fit) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    moveTo((x - fit.x) / fit.scale, (y - fit.y) / fit.scale);
  }
  canvas.addEventListener('pointerdown', event => { active = true; canvas.setPointerCapture(event.pointerId); jump(event); });
  canvas.addEventListener('pointermove', event => { if (active) jump(event); });
  canvas.addEventListener('pointerup', () => { active = false; });
  canvas.addEventListener('pointercancel', () => { active = false; });
  canvas.addEventListener('keydown', event => {
    const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    const direction = directions[event.key];
    if (!direction || !fit) return;
    event.preventDefault();
    const {scale, ox, oy} = getCamera();
    moveTo((innerWidth / 2 - ox) / scale + direction[0] * innerWidth / (4 * scale), (innerHeight / 2 - oy) / scale + direction[1] * innerHeight / (4 * scale));
  });
  return draw;
}
