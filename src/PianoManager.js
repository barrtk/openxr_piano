import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class PianoManager {
    constructor(scene, uiManager) {
        this.scene = scene;
        this.ui = uiManager;
        this.audio = null; // Set after init
        this.model = null;
        this.keys = new Map(); // Note number -> Mesh

        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load('piano.glb', (gltf) => {
            this.model = gltf.scene;

            // Initial positioning for visibility before calibration
            this.model.position.set(0, 0.7, -0.5);
            this.model.rotation.y = Math.PI; // Face the user

            this.scene.add(this.model);

            // Map keys
            this.model.traverse((child) => {
                if (child.isMesh) {
                    // Make sure materials are visible
                    if (child.material) {
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                    }

                    if (child.name.startsWith('Note')) {
                        const noteNum = parseInt(child.name.replace('Note', ''));
                        this.keys.set(noteNum, child);
                    }
                }
            });

            this.ui.showNotification("Model pianina załadowany.", true);
            console.log("Piano keys mapped:", this.keys.size);
        }, undefined, (error) => {
            console.error("Błąd ładowania piano.glb:", error);
            this.ui.showNotification("Błąd ładowania modelu!", false);
        });
    }

    updatePose(position, rotation, scale) {
        if (!this.model) return;
        this.model.position.copy(position);
        this.model.rotation.copy(rotation);
        this.model.scale.setScalar(scale);
    }

    pressKey(noteNum) {
        const key = this.keys.get(noteNum);
        if (key) {
            // Audio
            if (this.audio) this.audio.playNote(noteNum);

            // Apply rotation for key press (around back axis)
            key.rotation.x = 0.1; // Adjust based on model orientation
            if (key.material && key.material.emissive) {
                key.material.emissive.setHex(0x00f2ff);
                key.material.emissiveIntensity = 2.0;
            }
        }
    }

    releaseKey(noteNum) {
        const key = this.keys.get(noteNum);
        if (key) {
            if (this.audio) this.audio.stopNote(noteNum);

            key.rotation.x = 0;
            if (key.material && key.material.emissive) {
                key.material.emissive.setHex(0x000000);
            }
        }
    }
}
