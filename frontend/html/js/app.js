const CONFIG = {
    globeRadius: 5,
    pointLifetime: 11000,
    pointFadeTime: 3000,
    pulseDuration: 2500,
    normalArcDuration: 2000,
    suspiciousArcDuration: 5000,
    serverLat: 40.7128,
    serverLon: -74.0060,
    normalColor: 0x00ff88,
    suspiciousColor: 0xff3344,
    serverColor: 0x4499ff,
};

let scene, camera, renderer, controls, globe, pointGroup, serverGroup;
let points = [];
let animations = [];
let showSuspiciousOnly = false;
let activityBuckets = new Array(60).fill(0);
let lastBucketSecond = 0;

const socket = io();

function latLonToVec3(lat, lon, radius) {
    const phi   = (90 - lat)  * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -(radius) * Math.sin(phi) * Math.cos(theta),
         (radius) * Math.cos(phi),
         (radius) * Math.sin(phi) * Math.sin(theta)
    );
}

function init() {
    const container = document.getElementById('globe-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 2, 14);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.minDistance     = 7.5;
    controls.maxDistance     = 25;
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.4;
    controls.enablePan       = false;

    scene.add(new THREE.AmbientLight(0x334466, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    createStarfield();
    createGlobe();
    createAtmosphere();
    createServerMarker();

    pointGroup = new THREE.Group();
    scene.add(pointGroup);

    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    animate();
}

function createStarfield() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < 3000; i++) {
        positions.push((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 })));
}

function createGlobe() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#081020'); grad.addColorStop(0.5, '#0c1830'); grad.addColorStop(1, '#081020');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0,100,255,0.10)'; ctx.lineWidth = 1;
    for (let lat = -80; lat <= 80; lat += 10) { const y = (90 - lat) / 180 * canvas.height; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    for (let lon = -180; lon <= 180; lon += 10) { const x = (lon + 180) / 360 * canvas.width; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,140,255,0.22)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    globe = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.globeRadius, 64, 64), new THREE.MeshPhongMaterial({ map: tex, shininess: 15 }));
    scene.add(globe);

    new THREE.TextureLoader().load('https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg', t => { globe.material.map = t; globe.material.needsUpdate = true; });
}

function createAtmosphere() {
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(CONFIG.globeRadius * 1.015, 64, 64), new THREE.MeshPhongMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08 })));
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(CONFIG.globeRadius * 1.18, 64, 64), new THREE.MeshBasicMaterial({ color: 0x2266dd, transparent: true, opacity: 0.045, side: THREE.BackSide })));
}

function createServerMarker() {
    serverGroup = new THREE.Group();
    const pos = latLonToVec3(CONFIG.serverLat, CONFIG.serverLon, CONFIG.globeRadius + 0.04);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshBasicMaterial({ color: CONFIG.serverColor }));
    core.position.copy(pos); serverGroup.add(core);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshBasicMaterial({ color: CONFIG.serverColor, transparent: true, opacity: 0.25 }));
    glow.position.copy(pos); serverGroup.add(glow);
    scene.add(serverGroup);
}

function addTrafficPoint(lat, lon, suspicious, ip) {
    if (showSuspiciousOnly && !suspicious) return;
    const pos = latLonToVec3(lat, lon, CONFIG.globeRadius + 0.015);
    const color = suspicious ? CONFIG.suspiciousColor : CONFIG.normalColor;
    const size = suspicious ? 0.055 : 0.04;

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 }));
    mesh.position.copy(pos);
    mesh.userData = { ip, lat, lon, suspicious };
    mesh.add(new THREE.Mesh(new THREE.SphereGeometry(size * 3, 10, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })));
    pointGroup.add(mesh);
    points.push({ mesh, createdAt: Date.now(), suspicious, ip, lat, lon });

    addPulseRing(pos, color);

    if (suspicious) {
        addArc(lat, lon, color, 5000);
    } else {
        addArc(lat, lon, color, 2000);
    }
}

function addPulseRing(position, color) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.06, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.position.copy(position); ring.lookAt(new THREE.Vector3(0, 0, 0)); pointGroup.add(ring);
    animations.push({ mesh: ring, startTime: Date.now(), duration: CONFIG.pulseDuration, update(prog) { const s = 1 + prog * 10; this.mesh.scale.set(s, s, s); this.mesh.material.opacity = 0.7 * (1 - prog); }, complete() { pointGroup.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); } });
}

function addArc(srcLat, srcLon, color, duration) {
    const start = latLonToVec3(srcLat, srcLon, CONFIG.globeRadius + 0.02);
    const end = latLonToVec3(CONFIG.serverLat, CONFIG.serverLon, CONFIG.globeRadius + 0.02);

    const startNorm = start.clone().normalize();
    let endNorm = end.clone().normalize();

    let angle = startNorm.angleTo(endNorm);

    if (angle < 0.01) return;

    if (angle > 3.1) {
        endNorm.y += 0.01;
        endNorm.normalize();
        angle = startNorm.angleTo(endNorm);
    }

    const pts = [];
    const segments = 30;

    const maxArcHeight = (angle / Math.PI) * 3.5 + 0.2;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;

        const sinAngle = Math.sin(angle);
        const a = Math.sin((1 - t) * angle) / sinAngle;
        const b = Math.sin(t * angle) / sinAngle;

        const point = new THREE.Vector3(
            a * startNorm.x + b * endNorm.x,
            a * startNorm.y + b * endNorm.y,
            a * startNorm.z + b * endNorm.z
        );

        const height = CONFIG.globeRadius + Math.sin(t * Math.PI) * maxArcHeight;

        point.multiplyScalar(height);
        pts.push(point);
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    pointGroup.add(line);

    animations.push({
        mesh: line,
        startTime: Date.now(),
        duration: duration,
        update(prog) {
            this.mesh.material.opacity = 0.8 * (1 - prog);
        },
        complete() {
            pointGroup.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    });
}

function updatePoints() {
    const now = Date.now();
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i], age = now - p.createdAt;
        if (age > CONFIG.pointLifetime + CONFIG.pointFadeTime) { pointGroup.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); points.splice(i, 1); }
        else if (age > CONFIG.pointLifetime) { const o = 1 - (age - CONFIG.pointLifetime) / CONFIG.pointFadeTime; p.mesh.material.opacity = o; if (p.mesh.children[0]) p.mesh.children[0].material.opacity = 0.25 * o; }
    }
}

function updateAnimations() {
    const now = Date.now();
    for (let i = animations.length - 1; i >= 0; i--) {
        const a = animations[i], p = (now - a.startTime) / a.duration;
        if (p >= 1) { a.complete.call(a); animations.splice(i, 1); }
        else { a.update.call(a, p); }
    }
}

function updateUI(stats) { document.getElementById('total-packages').textContent = stats.total_packages; document.getElementById('suspicious-count').textContent = stats.suspicious_count; document.getElementById('activity-rate').textContent = stats.rate; document.getElementById('unique-locations').textContent = stats.unique_locations; }
function updateTopLocations(locs) { const ul = document.getElementById('top-locations'); ul.innerHTML = ''; if (!locs || locs.length === 0) { ul.innerHTML = '<li class="empty">Waiting for data…</li>'; return; } locs.forEach(l => { const li = document.createElement('li'); li.innerHTML = `<span class="loc">${l.location}</span><span class="cnt">${l.count}</span>`; ul.appendChild(li); }); }

function recordActivity() { const sec = Math.floor(Date.now() / 1000); if (sec !== lastBucketSecond) { const d = Math.min(sec - lastBucketSecond, 60); for (let i = 0; i < d; i++) { activityBuckets.shift(); activityBuckets.push(0); } lastBucketSecond = sec; } activityBuckets[59]++; drawActivityChart(); }
function drawActivityChart() { const c = document.getElementById('activity-chart'), ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = 'rgba(6,10,19,0.6)'; ctx.fillRect(0, 0, c.width, c.height); const mx = Math.max(...activityBuckets, 1), bw = c.width / 60; for (let i = 0; i < 60; i++) { if (!activityBuckets[i]) continue; const bh = (activityBuckets[i] / mx) * (c.height - 4); ctx.fillStyle = `rgba(0,255,136,${(0.3 + 0.5 * (i / 59)).toFixed(2)})`; ctx.fillRect(i * bw, c.height - bh, bw - 1, bh); } ctx.fillStyle = '#556677'; ctx.font = '9px monospace'; ctx.fillText('pkg/s ← 60s →', 4, 10); }

const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2(), tooltip = document.getElementById('tooltip');
function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(points.map(p => p.mesh));
    if (hits.length > 0) {
        const d = hits[0].object.userData; tooltip.style.display = 'block'; tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px';
        tooltip.querySelector('.tt-ip').textContent = d.ip; tooltip.querySelector('.tt-coords').textContent = `Lat: ${d.lat.toFixed(4)}, Lon: ${d.lon.toFixed(4)}`;
        const s = tooltip.querySelector('.tt-status'); if (d.suspicious) { s.textContent = '⚠️ SUSPICIOUS'; s.className = 'tt-status suspicious'; } else { s.textContent = '✓ Normal'; s.className = 'tt-status normal'; }
    } else { tooltip.style.display = 'none'; }
}

socket.on('connect', () => console.log('Connected to server'));
socket.on('disconnect', () => console.log('Disconnected'));
socket.on('init', data => { updateUI(data.stats); updateTopLocations(data.top_locations); data.packages.forEach(p => addTrafficPoint(p.latitude, p.longitude, p.suspicious === 1, p.ip)); });
socket.on('new_package', data => { updateUI(data.stats); updateTopLocations(data.top_locations); addTrafficPoint(data.package.latitude, data.package.longitude, data.package.suspicious === 1, data.package.ip); recordActivity(); });

function onResize() { const c = document.getElementById('globe-container'); camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(c.clientWidth, c.clientHeight); }

function toggleRotation() { controls.autoRotate = !controls.autoRotate; document.getElementById('btn-rotate').classList.toggle('active'); }
function toggleSuspiciousFilter() { showSuspiciousOnly = !showSuspiciousOnly; document.getElementById('btn-suspicious').classList.toggle('active'); points.forEach(p => p.mesh.visible = showSuspiciousOnly && !p.suspicious ? false : true); }
window.toggleRotation = toggleRotation; window.toggleSuspiciousFilter = toggleSuspiciousFilter;

function animate() { requestAnimationFrame(animate); controls.update(); updatePoints(); updateAnimations(); renderer.render(scene, camera); }
init();