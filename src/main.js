import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js'; // Added this line
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UIManager } from './UIManager.js?v=805';
import { HandManager } from './HandManager.js?v=805';
import { VoiceManager } from './VoiceManager.js?v=805';
import { PianoManager } from './PianoManager.js?v=805';
import { CalibrationManager } from './CalibrationManager.js?v=805';
import { ControllerManager } from './ControllerManager.js?v=805';
import { InteractionManager } from './InteractionManager.js?v=805';
import { AudioManager } from './AudioManager.js?v=805';
import { FallingBlockManager } from './FallingBlockManager.js?v=805';
import { SongManager } from './SongManager.js?v=805';

class App {
    constructor() {
        this.container = document.getElementById('canvas');
        this.ui = new UIManager();

        this.scene = new THREE.Scene();
        this.scene.background = null; // Essential for Passthrough

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.container,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true // Some AR devices prefer this
        });
        // Forced transparency for Passthrough
        this.renderer.setClearAlpha(0);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.xr.enabled = true;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Add strong lighting for gltf materials
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0);
        directionalLight.position.set(1, 2, 1);
        this.scene.add(directionalLight);

        // Setup AR Button (prioritized for Passthrough)
        const sessionInit = {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['hand-tracking', 'hit-test', 'layers']
        };

        document.body.appendChild(ARButton.createButton(this.renderer, sessionInit));

        // Initialize Managers
        this.hands = new HandManager(this.renderer, this.scene, this.ui);
        this.controllers = new ControllerManager(this.renderer, this.scene);
        this.audio = new AudioManager(this.ui);

        this.hands.hands.forEach((hand, i) => {
            hand.addEventListener('connected', () => console.log(`Hand ${i} Connected`));
            hand.addEventListener('disconnected', () => console.log(`Hand ${i} Disconnected`));
        });

        this.piano = new PianoManager(this.scene, this.ui);
        this.piano.audio = this.audio; // Link audio to piano

        this.fallingBlocks = new FallingBlockManager(this.scene, this.piano);
        this.songs = new SongManager();

        this.voice = new VoiceManager(this.ui, this.audio);
        this.calibration = new CalibrationManager(this.hands, this.piano, this.ui, this.controllers);
        this.interaction = new InteractionManager(this.hands, this.piano, this.ui, this.calibration, this.camera);

        // Link voice commands to actions
        this.voice.onStartCallback = () => this.startSong();
        this.voice.onCalibrateCallback = () => this.calibration.startCalibration();
        this.voice.onSaveCallback = () => this.calibration.confirmPoint();
        this.voice.onStopCalibrationCallback = () => this.calibration.stopCalibration();

        this.songStartTime = 0;
        this.isSongPlaying = false;
        this.isSessionStarting = false; // Lock for XR session

        const voiceBtn = document.getElementById('voice-trigger');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', async () => {
                console.log("Button clicked: Activating Microphone & Audio...");
                this.audio.startAudioContext();

                if (!this.voice.isListening) {
                    await this.voice.start();
                    voiceBtn.innerHTML = "🎤 Słucham... (kliknij ponownie by Start)";
                    voiceBtn.style.background = "linear-gradient(45deg, #004411, #008800)";
                } else if (!this.isSongPlaying) {
                    console.log("Manual song start triggered via button");
                    this.startSong();
                }
            });
        }

        // Add commands to voice manager
        this.voice.commands['zapisz'] = () => this.calibration.confirmPoint();
        this.voice.commands['start'] = () => this.startSong();
        this.voice.commands['graj'] = () => this.startSong();
        this.voice.commands['kalibruj'] = () => this.calibration.startCalibration();

        this.init();
        this.ui.init3D(this.scene, this.camera);

        window.addEventListener('resize', () => this.onWindowResize());

        // Start listening after user gesture (WebXR session start is a good time)
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log("XR Session Started!");
            this.isSessionStarting = false;
            const session = this.renderer.xr.getSession();
            console.log("Session Mode:", session.visibilityState);
            this.ui.showNotification("TRYB VR AKTYWNY", true);

            // Check mic again in VR
            if (this.voice.isListening) {
                console.log("Voice was active, re-syncing analyzer...");
                this.voice.start();
            } else {
                this.voice.start();
            }
        });

        this.renderer.xr.addEventListener('sessionend', () => {
            console.log("XR Session Ended");
            this.isSessionStarting = false;
        });

        this.isSessionStarting = false;
        console.log("Finalizing renderer setup...");

        this.renderer.setAnimationLoop(() => this.render());

        console.log("Bridge Ping: Próba połączenia...");
    }

    async init() {
        console.log("App V790 Initializing (Calibration Update)...");
        this.ui.showNotification("System VR Piano Inicjalizuje...", true);

        // Load Piano Model (Placeholder logical start)
        const loader = new GLTFLoader();
        // loader.load('piano.glb', (gltf) => { ... });

        console.log("App Initialized");
        const secure = window.isSecureContext ? "TAK" : "NIE";
        console.log("Secure Context:", secure);
        this.ui.showNotification("Secure: " + secure, secure === "TAK");
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    async startSong() {
        this.ui.showNotification("Ładowanie utworu...");
        const midi = await this.songs.loadMidi('midi/song.mid');
        if (midi) {
            const notes = this.songs.getNotesForTrack(); // Uses best track found
            this.fallingBlocks.spawnBlocks(notes);
            this.ui.showNotification("Gramy!", true);
            this.songStartTime = this.renderer.xr.getFrameData ? performance.now() / 1000 : 0;
            this.isSongPlaying = true;
        }
    }

    render() {
        const time = performance.now() / 1000;

        if (this.isSongPlaying) {
            const songTime = time - this.songStartTime;
            this.fallingBlocks.update(songTime);
        }

        // Pass controller array to calibration manager
        if (this.controllers && this.controllers.controllers) {
            this.calibration.update(this.controllers.controllers);
        }

        this.ui.update3D(this.camera);
        this.interaction.update();
        this.renderer.render(this.scene, this.camera);
    }
}

new App();
