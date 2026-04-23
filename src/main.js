// ═══════════════════════════════════════════════════════════════
// VrPiano554 — 3D Viewer + MIDI Playback + Practice Mode
// ver: 1.5.1
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

// ─── DOM refs ────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingProgress = document.getElementById('loading-progress');
const posX = document.getElementById('pos-x');
const posY = document.getElementById('pos-y');
const posZ = document.getElementById('pos-z');
const activeNoteEl = document.getElementById('active-note');
const midiStatusEl = document.getElementById('midi-status');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnPractice = document.getElementById('btn-practice');
const practiceIndicator = document.getElementById('practice-indicator');
const timelineEl = document.getElementById('timeline');
const timelineFill = document.getElementById('timeline-fill');
const currentTimeEl = document.getElementById('player-current-time');
const totalTimeEl = document.getElementById('player-total-time');
const songSelector = document.getElementById('song-selector');
const noteCountEl = document.getElementById('player-note-count');
const midiFileInput = document.getElementById('midi-file-input');

// ─── Three.js Core ───────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false,
    powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070714);
scene.fog = new THREE.FogExp2(0x070714, 0.012);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, 2.0, 3);

let elapsedTime = 0; // global for animations

// ─── Lighting ────────────────────────────────────────────────
(function setupLighting() {
    scene.add(new THREE.AmbientLight(0x404060, 0.6));
    scene.add(new THREE.HemisphereLight(0x8899cc, 0x443322, 0.5));
    const kl = new THREE.DirectionalLight(0xffe8d0, 1.8);
    kl.position.set(5, 8, 4); kl.castShadow = true;
    kl.shadow.mapSize.set(2048, 2048);
    kl.shadow.camera.near = 0.1; kl.shadow.camera.far = 30;
    kl.shadow.camera.left = -8; kl.shadow.camera.right = 8;
    kl.shadow.camera.top = 8; kl.shadow.camera.bottom = -8;
    kl.shadow.bias = -0.001; scene.add(kl);
    const rl = new THREE.DirectionalLight(0x4488ff, 0.6);
    rl.position.set(-3, 4, -5); scene.add(rl);
    const pc = new THREE.PointLight(0x00f2ff, 0.5, 15); pc.position.set(-3, 2, 2); scene.add(pc);
    const pp = new THREE.PointLight(0xa855f7, 0.4, 15); pp.position.set(3, 2, -2); scene.add(pp);
})();

// ─── Ground ──────────────────────────────────────────────────
(function() {
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 64),
        new THREE.MeshStandardMaterial({ color: 0x0a0a1a, metalness: 0.8, roughness: 0.25 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -0.01; g.receiveShadow = true; scene.add(g);
    const gr = new THREE.GridHelper(40, 80, 0x00f2ff, 0x151530);
    gr.material.opacity = 0.12; gr.material.transparent = true; scene.add(gr);
})();

// ─── Particles ───────────────────────────────────────────────
const particles = (function() {
    const N = 400, pos = new Float32Array(N*3), col = new Float32Array(N*3);
    const cA = new THREE.Color(0x00f2ff), cB = new THREE.Color(0xa855f7);
    for (let i = 0; i < N; i++) {
        const i3 = i*3;
        pos[i3]=(Math.random()-0.5)*50; pos[i3+1]=Math.random()*25; pos[i3+2]=(Math.random()-0.5)*50;
        const c = cA.clone().lerp(cB, Math.random());
        col[i3]=c.r; col[i3+1]=c.g; col[i3+2]=c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.06, vertexColors: true, transparent: true, opacity: 0.5,
        sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(p); return p;
})();

// ═══════════════════════════════════════════════════════════════
// PIANO KEY SYSTEM
// ═══════════════════════════════════════════════════════════════
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiName(m) { return `${NOTE_NAMES[m%12]}${Math.floor(m/12)-1}`; }
function isBlackKey(m) { return [1,3,6,8,10].includes(m%12); }

const pianoKeys = new Map();
const keyAnimations = new Map();
const noteRefCount = new Map();
const pressedNotes = new Set();
const userNotes = new Set(); // Notes pressed by user (keyboard/HW MIDI)

const KEY_PRESS_ANGLE = 0.06;
const KEY_ANIM_SPEED = 14.0;
const glowCyan = new THREE.Color(0x00f2ff);
const glowPurple = new THREE.Color(0xa855f7);
const glowHit = new THREE.Color(0x22ff88);   // correct hit green
const glowWait = new THREE.Color(0xffaa00);  // waiting gold

const KB_MIDI = {
    'KeyZ':48,'KeyS':49,'KeyX':50,'KeyD':51,'KeyC':52,
    'KeyV':53,'KeyG':54,'KeyB':55,'KeyH':56,'KeyN':57,'KeyJ':58,'KeyM':59,
    'KeyQ':60,'Digit2':61,'KeyW':62,'Digit3':63,'KeyE':64,
    'KeyR':65,'Digit5':66,'KeyT':67,'Digit6':68,'KeyY':69,'Digit7':70,'KeyU':71,
    'KeyI':72,'Digit9':73,'KeyO':74,'Digit0':75,'KeyP':76,
    'BracketLeft':77,'Equal':78,'BracketRight':79,
};

// ─── noteOn / noteOff with ref counting ──────────────────────
function noteOn(midi) {
    noteRefCount.set(midi, (noteRefCount.get(midi)||0) + 1);
    if (!pianoKeys.has(midi)) return;
    pressedNotes.add(midi);
    const a = keyAnimations.get(midi);
    if (a) a.target = 1;
}
function noteOff(midi) {
    const c = Math.max(0, (noteRefCount.get(midi)||0) - 1);
    noteRefCount.set(midi, c);
    if (c === 0) {
        pressedNotes.delete(midi);
        const a = keyAnimations.get(midi);
        if (a) a.target = 0;
    }
}

// ─── User input API (keyboard + HW MIDI) ────────────────────
function handleUserNoteOn(midi) {
    userNotes.add(midi);
    noteOn(midi);
    // Sparks on user key press
    const kp = keyWorldPos.get(midi);
    if (kp) emitSparks(kp.cx, kp.topY, kp.cz, isBlackKey(midi));
    // Practice mode: pressing ANY correct key triggers the whole chord
    if (practiceWaiting && waitingMidiSet.has(midi)) {
        // Trigger ALL waiting notes at once (one key = whole chord)
        for (const wn of waitingForNotes) {
            triggerSongNote(wn);
        }
        practiceWaiting = false;
        waitingForNotes = [];
        waitingMidiSet.clear();
        if (practiceIndicator) practiceIndicator.classList.remove('waiting');
    }
}
function handleUserNoteOff(midi) {
    userNotes.delete(midi);
    noteOff(midi);
}

function updateActiveNotesHUD() {
    if (!activeNoteEl) return;
    if (pressedNotes.size === 0) {
        activeNoteEl.textContent = '—'; activeNoteEl.style.opacity = '0.4';
    } else {
        activeNoteEl.style.opacity = '1';
        activeNoteEl.textContent = [...pressedNotes].sort((a,b)=>a-b).map(midiName).join('  ');
    }
}

function updatePianoKeyVisuals(dt) {
    const lf = 1 - Math.exp(-KEY_ANIM_SPEED * dt);
    for (const [midi, anim] of keyAnimations) {
        const kd = pianoKeys.get(midi);
        if (!kd) continue;
        anim.current += (anim.target - anim.current) * lf;
        if (Math.abs(anim.current - anim.target) < 0.001) anim.current = anim.target;
        kd.mesh.rotation.x = kd.originalRotationX + anim.current * KEY_PRESS_ANGLE;

        // Determine glow state
        const songActive = activeSongNotes.some(a => a.midi === midi);
        const userActive = userNotes.has(midi);
        const isWaiting = practiceWaiting && waitingMidiSet.has(midi);

        if (isWaiting) {
            // Pulsing gold for keys waiting in practice mode
            const pulse = 0.4 + 0.6 * Math.sin(elapsedTime * 5);
            kd.mesh.material.emissive.copy(glowWait);
            kd.mesh.material.emissiveIntensity = pulse * 0.6;
            // Also visually depress slightly to indicate target key
            kd.mesh.rotation.x = kd.originalRotationX + 0.015 * Math.sin(elapsedTime * 3);
        } else if (songActive && userActive) {
            // CORRECT HIT — bright green
            kd.mesh.material.emissive.copy(glowHit);
            kd.mesh.material.emissiveIntensity = 0.7;
        } else if (anim.current > 0.01) {
            kd.mesh.material.emissive.copy(kd.isBlack ? glowPurple : glowCyan);
            kd.mesh.material.emissiveIntensity = anim.current * 0.5;
        } else {
            kd.mesh.material.emissive.setHex(0x000000);
            kd.mesh.material.emissiveIntensity = 0;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// LOAD GLB MODEL
// ═══════════════════════════════════════════════════════════════
const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(draco);

let model = null, modelReady = false;
const orbitTarget = new THREE.Vector3(0, 0.8, 0);
const keyWorldPos = new Map();

gltfLoader.load('./piano.glb', (gltf) => {
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 3 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(s);
    model.position.sub(center.multiplyScalar(s));
    model.position.y = 0.75;

    model.traverse((ch) => {
        if (!ch.isMesh) return;
        ch.castShadow = true; ch.receiveShadow = true;
        if (ch.material) ch.material.envMapIntensity = 0.8;
        const m = ch.name.match(/^Note(\d+)$/);
        if (m) {
            const midi = parseInt(m[1], 10);
            ch.material = ch.material.clone(); // CRITICAL: clone so each key has independent emissive
            ch.geometry.computeBoundingBox();
            pianoKeys.set(midi, { mesh: ch, originalRotationX: ch.rotation.x, isBlack: isBlackKey(midi) });
            keyAnimations.set(midi, { current: 0, target: 0 });
        }
    });

    scene.add(model);
    scene.updateMatrixWorld(true);
    for (const [midi, kd] of pianoKeys) {
        const bb = new THREE.Box3().setFromObject(kd.mesh);
        const c = bb.getCenter(new THREE.Vector3());
        const sz = bb.getSize(new THREE.Vector3());
        keyWorldPos.set(midi, { cx: c.x, cz: c.z, topY: bb.max.y, w: sz.x, d: sz.z });
    }

    const nbox = new THREE.Box3().setFromObject(model);
    nbox.getCenter(orbitTarget);
    camera.position.set(0, orbitTarget.y + 1.8, orbitTarget.z + size.z * s + 2.5);
    camera.lookAt(orbitTarget);

    modelReady = true;
    setTimeout(() => loadingOverlay.classList.add('hidden'), 400);
    console.log(`Model: ${pianoKeys.size} keys`);
    tryInitBlocks();
}, (p) => {
    if (p.total > 0) loadingProgress.textContent = `${Math.round(p.loaded/p.total*100)}%`;
}, (err) => {
    console.error('Model error:', err);
    loadingProgress.textContent = 'Błąd!';
});

// ═══════════════════════════════════════════════════════════════
// BLENDER-STYLE ORBIT CAMERA
// ═══════════════════════════════════════════════════════════════
let orbitAz = 0, orbitEl = 0.35, orbitDist = 5.5;
let isOrbiting = false, isPanning = false;

function updateOrbitCamera() {
    camera.position.set(
        orbitTarget.x + orbitDist * Math.cos(orbitEl) * Math.sin(orbitAz),
        orbitTarget.y + orbitDist * Math.sin(orbitEl),
        orbitTarget.z + orbitDist * Math.cos(orbitEl) * Math.cos(orbitAz),
    );
    camera.lookAt(orbitTarget);
}
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        if (e.shiftKey) isPanning = true; else isOrbiting = true;
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 1 || e.button === 2) { isOrbiting = false; isPanning = false; }
});
window.addEventListener('mousemove', (e) => {
    if (isOrbiting) {
        orbitAz -= e.movementX * 0.005;
        orbitEl = Math.max(-1.5, Math.min(1.5, orbitEl + e.movementY * 0.005));
        updateOrbitCamera();
    } else if (isPanning) {
        const r = new THREE.Vector3(), u = new THREE.Vector3();
        r.setFromMatrixColumn(camera.matrixWorld, 0);
        u.setFromMatrixColumn(camera.matrixWorld, 1);
        orbitTarget.addScaledVector(r, -e.movementX * orbitDist * 0.004);
        orbitTarget.addScaledVector(u, e.movementY * orbitDist * 0.004);
        updateOrbitCamera();
    }
});
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbitDist = Math.max(0.3, Math.min(50, orbitDist * (e.deltaY > 0 ? 1.15 : 0.85)));
    updateOrbitCamera();
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ═══════════════════════════════════════════════════════════════
// KEYBOARD & HW MIDI INPUT
// ═══════════════════════════════════════════════════════════════
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlayback(); return; }
    const m = KB_MIDI[e.code];
    if (m !== undefined) handleUserNoteOn(m);
});
window.addEventListener('keyup', (e) => {
    const m = KB_MIDI[e.code];
    if (m !== undefined) handleUserNoteOff(m);
});

// HW MIDI
let midiInputs = [];
function setMidiStatus(t, ok=false) {
    if (!midiStatusEl) return;
    midiStatusEl.textContent = t;
    midiStatusEl.classList.toggle('connected', ok);
}
function onHwMIDI(ev) {
    const [st, note, vel] = ev.data;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && vel > 0) handleUserNoteOn(note);
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) handleUserNoteOff(note);
}
function connectInputs(acc) {
    midiInputs.forEach(i => { i.onmidimessage = null; }); midiInputs = [];
    const names = [];
    for (const inp of acc.inputs.values()) { inp.onmidimessage = onHwMIDI; midiInputs.push(inp); names.push(inp.name); }
    setMidiStatus(names.length ? `🎹 ${names.join(', ')}` : 'Brak urządzeń MIDI', names.length > 0);
}
(async () => {
    if (!navigator.requestMIDIAccess) { setMidiStatus('MIDI niedostępne'); return; }
    try { const a = await navigator.requestMIDIAccess({sysex:false}); connectInputs(a); a.onstatechange = () => connectInputs(a); }
    catch { setMidiStatus('Brak dostępu MIDI'); }
})();

// ═══════════════════════════════════════════════════════════════
// MIDI SONG PLAYBACK + FALLING BLOCKS + PRACTICE MODE
// ═══════════════════════════════════════════════════════════════
let midiData = null;
let allNotes = [];
let songDuration = 0;
let songPlaying = false;
let playbackTime = 0;
let nextNoteIdx = 0;
let activeSongNotes = [];
let blocksMesh = null;
let synth = null;
let synthReady = false;
let midiLoaded = false;
let blocksReady = false;

// Practice mode
let practiceMode = false;
let practiceWaiting = false;
let waitingForNotes = [];
let waitingMidiSet = new Set();
const CHORD_TOLERANCE = 0.05; // 50ms: notes within this are grouped as chord

// Falling blocks config
const FALL_SPEED = 2.5;
const FALL_HEIGHT = 12;
const MIN_BLOCK_H = 0.06;

// ─── Apply MIDI data (shared by selector, file picker, etc.) ─
function applyMidiData(midi, filename) {
    stopSong();
    midiData = midi;
    allNotes = [];
    midi.tracks.forEach((tr, ti) => {
        tr.notes.forEach(n => {
            allNotes.push({ midi: n.midi, time: n.time, dur: n.duration, vel: n.velocity, tr: ti });
        });
    });
    allNotes.sort((a, b) => a.time - b.time);
    songDuration = 0;
    if (allNotes.length > 0) {
        const last = allNotes[allNotes.length - 1];
        songDuration = last.time + last.dur;
    }
    midiLoaded = true;

    if (noteCountEl) noteCountEl.textContent = `${allNotes.length} nut`;
    if (totalTimeEl) totalTimeEl.textContent = fmtTime(songDuration);
    if (timelineEl) timelineEl.max = Math.ceil(songDuration * 10);

    // Reinit blocks
    if (blocksMesh) { scene.remove(blocksMesh); blocksMesh.geometry.dispose(); blocksMesh.material.dispose(); blocksMesh = null; }
    blocksReady = false;
    tryInitBlocks();
    console.log(`MIDI: ${filename}, ${allNotes.length} notes, ${fmtTime(songDuration)}, ${midi.tracks.length} tracks`);
}

async function loadMidiByName(filename) {
    try {
        const res = await fetch(`./midi/${encodeURIComponent(filename)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        applyMidiData(new Midi(buf), filename);
    } catch (e) {
        console.error('MIDI load error:', e);
    }
}

// ─── Song Selector — fetch list from server ──────────────────
(async () => {
    try {
        const res = await fetch('/api/midi-list');
        const files = await res.json();
        if (songSelector && files.length > 0) {
            songSelector.innerHTML = '';
            for (const f of files) {
                const opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f.replace(/\.(mid|midi)$/i, '');
                songSelector.appendChild(opt);
            }
            // Load first song
            await loadMidiByName(files[0]);
        }
    } catch (e) {
        console.error('Song list error:', e);
        if (songSelector) songSelector.innerHTML = '<option>Błąd listy</option>';
    }
})();

// Song selector change
songSelector?.addEventListener('change', () => {
    if (songSelector.value) loadMidiByName(songSelector.value);
});

// File picker (custom MIDI from disk)
midiFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const buf = await file.arrayBuffer();
        applyMidiData(new Midi(buf), file.name);
        // Add as option
        if (songSelector) {
            const opt = document.createElement('option');
            opt.value = '__custom__';
            opt.textContent = `📂 ${file.name.replace(/\.(mid|midi)$/i, '')}`;
            songSelector.appendChild(opt);
            songSelector.value = '__custom__';
        }
    } catch (err) {
        console.error('MIDI file error:', err);
    }
    e.target.value = '';
});

// ─── Tone.js Sampler (real piano samples) ────────────────────
// Use every 3rd note for fast loading; Sampler pitch-shifts between
function buildSampleMap() {
    const map = {};
    // Load every 3 semitones from 21 to 108
    for (let midi = 21; midi <= 108; midi += 3) {
        const num = midi.toString().padStart(3, '0');
        const noteName = midiName(midi); // e.g. 'C4'
        map[noteName] = `samples/Clean Grand Mistral - GDCGM ${num}L.wav`;
    }
    return map;
}

async function ensureSynth() {
    if (synthReady) return;
    await Tone.start();
    return new Promise((resolve) => {
        synth = new Tone.Sampler({
            urls: buildSampleMap(),
            baseUrl: './',
            release: 1.2,
            onload: () => {
                console.log('Piano samples loaded');
                synth.volume.value = -6;
                synthReady = true;
                resolve();
            },
        }).toDestination();
    });
}

// ─── InstancedMesh for blocks ────────────────────────────────
function tryInitBlocks() {
    if (!modelReady || !midiLoaded || blocksReady || allNotes.length === 0) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.45, transparent: true, opacity: 0.88 });
    blocksMesh = new THREE.InstancedMesh(geo, mat, allNotes.length);
    blocksMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blocksMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(allNotes.length * 3), 3);
    blocksMesh.count = 0;
    scene.add(blocksMesh);
    blocksReady = true;
}

// ─── Playback Control ────────────────────────────────────────
function togglePlayback() { if (songPlaying) pauseSong(); else playSong(); }

async function playSong() {
    if (!midiLoaded) return;
    await ensureSynth();
    songPlaying = true;
    if (btnPlay) btnPlay.textContent = '⏸';
}

function pauseSong() {
    songPlaying = false;
    practiceWaiting = false;
    waitingForNotes = [];
    waitingMidiSet.clear();
    for (const an of activeSongNotes) {
        noteOff(an.midi);
        if (synth) try { synth.triggerRelease(an.noteName, Tone.now()); } catch {}
    }
    activeSongNotes = [];
    if (btnPlay) btnPlay.textContent = '▶';
    if (practiceIndicator) practiceIndicator.classList.remove('waiting');
}

function stopSong() { pauseSong(); seekSong(0); }

function seekSong(t) {
    playbackTime = Math.max(0, Math.min(t, songDuration));
    let lo = 0, hi = allNotes.length;
    while (lo < hi) { const mid = (lo+hi)>>1; if (allNotes[mid].time < playbackTime) lo = mid+1; else hi = mid; }
    nextNoteIdx = lo;
    practiceWaiting = false;
    waitingForNotes = [];
    waitingMidiSet.clear();
    for (const an of activeSongNotes) {
        noteOff(an.midi);
        if (synth) try { synth.triggerRelease(an.noteName, Tone.now()); } catch {}
    }
    activeSongNotes = [];
    if (practiceIndicator) practiceIndicator.classList.remove('waiting');
}

// ─── Trigger a song note (sound + visual + sparks) ───────────
function triggerSongNote(n) {
    noteOn(n.midi);
    if (synth) {
        const noteName = Tone.Frequency(n.midi, 'midi').toNote();
        try { synth.triggerAttack(noteName, Tone.now(), n.vel * 0.7); } catch {}
        activeSongNotes.push({ midi: n.midi, noteName, endTime: n.time + n.dur });
    }
    // Emit sparks at key position
    const kp = keyWorldPos.get(n.midi);
    if (kp) emitSparks(kp.cx, kp.topY, kp.cz, isBlackKey(n.midi));
}

// ─── Process Playback Each Frame ─────────────────────────────
function processPlayback(dt) {
    if (!songPlaying || !midiLoaded) return;

    // In practice mode waiting: freeze time but still release ended notes
    if (practiceMode && practiceWaiting) {
        releaseEndedNotes();
        return;
    }

    playbackTime += dt;
    if (playbackTime >= songDuration + 0.5) { stopSong(); return; }

    // ALWAYS release ended notes first (before new notes can trigger return)
    releaseEndedNotes();

    // Collect new notes
    const newNotes = [];
    while (nextNoteIdx < allNotes.length && allNotes[nextNoteIdx].time <= playbackTime) {
        newNotes.push(allNotes[nextNoteIdx]);
        nextNoteIdx++;
    }

    if (practiceMode && newNotes.length > 0) {
        // Also grab chord notes within tolerance
        const groupTime = newNotes[0].time;
        while (nextNoteIdx < allNotes.length && allNotes[nextNoteIdx].time - groupTime <= CHORD_TOLERANCE) {
            newNotes.push(allNotes[nextNoteIdx]);
            nextNoteIdx++;
        }
        // Separate waitable (on-keyboard) and auto-play (out of range)
        const waitable = newNotes.filter(n => keyWorldPos.has(n.midi));
        const autoPlay = newNotes.filter(n => !keyWorldPos.has(n.midi));

        // Auto-play notes without matching keys
        for (const n of autoPlay) triggerSongNote(n);

        if (waitable.length > 0) {
            practiceWaiting = true;
            waitingForNotes = newNotes;
            waitingMidiSet = new Set(waitable.map(n => n.midi));
            playbackTime = groupTime; // Snap time
            if (practiceIndicator) practiceIndicator.classList.add('waiting');

            // If user already holds ANY waiting key, trigger all & resume
            for (const midi of waitingMidiSet) {
                if (userNotes.has(midi)) {
                    for (const wn of waitingForNotes) triggerSongNote(wn);
                    practiceWaiting = false;
                    waitingForNotes = [];
                    waitingMidiSet.clear();
                    if (practiceIndicator) practiceIndicator.classList.remove('waiting');
                    break;
                }
            }
            return;
        }
    } else {
        for (const n of newNotes) triggerSongNote(n);
    }
}

// ─── Release ended song notes ────────────────────────────────
function releaseEndedNotes() {
    for (let i = activeSongNotes.length - 1; i >= 0; i--) {
        if (playbackTime >= activeSongNotes[i].endTime) {
            const an = activeSongNotes[i];
            noteOff(an.midi);
            if (synth) try { synth.triggerRelease(an.noteName, Tone.now()); } catch {}
            activeSongNotes.splice(i, 1);
        }
    }
}

// ─── Update Falling Blocks ───────────────────────────────────
const _dm = new THREE.Object3D();
const _tc = new THREE.Color();

function updateBlocks() {
    if (!blocksReady || !blocksMesh) return;
    let vi = 0;
    for (let i = 0; i < allNotes.length; i++) {
        const n = allNotes[i];
        const kp = keyWorldPos.get(n.midi);
        if (!kp) continue;

        const td = n.time - playbackTime;
        const botY = kp.topY + FALL_SPEED * td;
        const bh = Math.max(FALL_SPEED * n.dur, MIN_BLOCK_H);
        const topY = botY + bh;

        if (topY < kp.topY - 1.5 || botY > kp.topY + FALL_HEIGHT) continue;

        _dm.position.set(kp.cx, botY + bh / 2, kp.cz);
        _dm.scale.set(kp.w * 0.88, bh, kp.d * 0.45);
        _dm.rotation.set(0, 0, 0);
        _dm.updateMatrix();
        blocksMesh.setMatrixAt(vi, _dm.matrix);

        const playing = botY <= kp.topY && topY >= kp.topY;
        const past = topY < kp.topY;
        const bk = isBlackKey(n.midi);
        const isWait = practiceWaiting && waitingMidiSet.has(n.midi) && Math.abs(td) < 0.15;

        // Correct hit: block playing AND user pressing
        const correctHit = playing && userNotes.has(n.midi);

        if (isWait) {
            // Pulsing gold for waiting
            const pulse = 0.6 + 0.4 * Math.sin(elapsedTime * 5);
            _tc.setRGB(1.0, 0.75 * pulse, 0.05);
        } else if (correctHit) {
            // Green for correct hit
            _tc.setRGB(0.13, 1.0, 0.53);
        } else if (playing) {
            _tc.setHex(bk ? 0xe0a0ff : 0x88ffff);
        } else if (past) {
            _tc.setHex(bk ? 0x3a1060 : 0x004455);
        } else {
            _tc.setHex(bk ? 0x9333ea : 0x00c8d6);
        }
        blocksMesh.setColorAt(vi, _tc);
        vi++;
    }
    blocksMesh.count = vi;
    blocksMesh.instanceMatrix.needsUpdate = true;
    if (blocksMesh.instanceColor) blocksMesh.instanceColor.needsUpdate = true;
}

// ─── Player UI ───────────────────────────────────────────────
let timelineDragging = false;

function updatePlayerUI() {
    if (currentTimeEl) currentTimeEl.textContent = fmtTime(playbackTime);
    if (timelineEl && !timelineDragging) timelineEl.value = playbackTime * 10;
    if (timelineFill) timelineFill.style.width = `${songDuration > 0 ? playbackTime / songDuration * 100 : 0}%`;
}

function fmtTime(s) { const m = Math.floor(s/60); return `${m}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

// Wire buttons
btnPlay?.addEventListener('click', togglePlayback);
btnStop?.addEventListener('click', stopSong);

// Practice mode toggle
btnPractice?.addEventListener('click', () => {
    practiceMode = !practiceMode;
    btnPractice.classList.toggle('active', practiceMode);
    if (practiceIndicator) practiceIndicator.classList.toggle('hidden', !practiceMode);
    if (!practiceMode) {
        practiceWaiting = false;
        waitingForNotes = [];
        waitingMidiSet.clear();
        if (practiceIndicator) practiceIndicator.classList.remove('waiting');
    }
    console.log(`Practice mode: ${practiceMode ? 'ON' : 'OFF'}`);
});

// Timeline
if (timelineEl) {
    timelineEl.addEventListener('mousedown', () => { timelineDragging = true; });
    timelineEl.addEventListener('touchstart', () => { timelineDragging = true; });
    timelineEl.addEventListener('input', () => seekSong(parseFloat(timelineEl.value) / 10));
    const endDrag = () => { timelineDragging = false; seekSong(parseFloat(timelineEl.value) / 10); };
    timelineEl.addEventListener('mouseup', endDrag);
    timelineEl.addEventListener('touchend', endDrag);
}


// ═══════════════════════════════════════════════════════════════
// SPARK PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════
const SPARK_POOL_SIZE = 300;
const SPARK_LIFETIME = 0.6;
const sparkPool = [];
let sparkMesh = null;

(function initSparks() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(SPARK_POOL_SIZE * 3);
    const col = new Float32Array(SPARK_POOL_SIZE * 3);
    const sizes = new Float32Array(SPARK_POOL_SIZE);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
        size: 0.04, vertexColors: true, transparent: true,
        opacity: 0.9, sizeAttenuation: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    sparkMesh = new THREE.Points(geo, mat);
    scene.add(sparkMesh);

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
        sparkPool.push({
            alive: false, age: 0,
            x: 0, y: 0, z: 0,
            vx: 0, vy: 0, vz: 0,
            r: 1, g: 1, b: 1,
        });
    }
})();

function emitSparks(x, y, z, bk) {
    const count = 6 + Math.floor(Math.random() * 6);
    for (let i = 0, spawned = 0; i < SPARK_POOL_SIZE && spawned < count; i++) {
        const s = sparkPool[i];
        if (s.alive) continue;
        s.alive = true; s.age = 0;
        s.x = x + (Math.random() - 0.5) * 0.15;
        s.y = y;
        s.z = z + (Math.random() - 0.5) * 0.1;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 1.5;
        s.vx = Math.cos(angle) * speed * 0.3;
        s.vy = 1.0 + Math.random() * 2.0;
        s.vz = Math.sin(angle) * speed * 0.3;
        if (bk) {
            s.r = 0.66 + Math.random() * 0.34;
            s.g = 0.33 + Math.random() * 0.3;
            s.b = 0.93 + Math.random() * 0.07;
        } else {
            s.r = 0.0 + Math.random() * 0.2;
            s.g = 0.85 + Math.random() * 0.15;
            s.b = 0.9 + Math.random() * 0.1;
        }
        spawned++;
    }
}

function updateSparks(dt) {
    if (!sparkMesh) return;
    const pa = sparkMesh.geometry.attributes.position.array;
    const ca = sparkMesh.geometry.attributes.color.array;
    const sa = sparkMesh.geometry.attributes.size.array;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
        const s = sparkPool[i];
        const i3 = i * 3;
        if (!s.alive) {
            pa[i3] = pa[i3+1] = pa[i3+2] = 0;
            sa[i] = 0;
            continue;
        }
        s.age += dt;
        if (s.age >= SPARK_LIFETIME) { s.alive = false; sa[i] = 0; continue; }
        s.vy -= 4.0 * dt; // gravity
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        pa[i3] = s.x; pa[i3+1] = s.y; pa[i3+2] = s.z;
        const life = 1 - s.age / SPARK_LIFETIME;
        ca[i3] = s.r * life; ca[i3+1] = s.g * life; ca[i3+2] = s.b * life;
        sa[i] = 0.04 * life;
    }
    sparkMesh.geometry.attributes.position.needsUpdate = true;
    sparkMesh.geometry.attributes.color.needsUpdate = true;
    sparkMesh.geometry.attributes.size.needsUpdate = true;
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════
const clock = new THREE.Clock();
updateOrbitCamera();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsedTime = clock.getElapsedTime();

    processPlayback(dt);
    updateBlocks();
    updatePlayerUI();
    updateActiveNotesHUD();
    updatePianoKeyVisuals(dt);
    updateSparks(dt);

    if (particles) {
        particles.rotation.y = elapsedTime * 0.015;
        const pa = particles.geometry.attributes.position.array;
        for (let i = 1; i < pa.length; i += 3) pa[i] += Math.sin(elapsedTime + i) * 0.0002;
        particles.geometry.attributes.position.needsUpdate = true;
    }

    posX.textContent = `X: ${camera.position.x.toFixed(2)}`;
    posY.textContent = `Y: ${camera.position.y.toFixed(2)}`;
    posZ.textContent = `Z: ${camera.position.z.toFixed(2)}`;

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
console.log('VrPiano554 v1.5.1');
