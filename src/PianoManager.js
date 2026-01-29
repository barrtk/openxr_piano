import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class PianoManager {
    constructor(scene, uiManager) {
        this.scene = scene;
        this.ui = uiManager;
        this.audio = null; // Set after init
        this.model = null;
        this.keys = new Map(); // Note number -> Mesh
        this.keyOffsets = new Map(); // Note number -> Vector3 (Local Front Offset)

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

            // Map keys and compute offsets
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
                        
                        // Pre-calculate Front Edge Offset
                        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                        const bbox = child.geometry.boundingBox;
                        const centerX = (bbox.min.x + bbox.max.x) / 2;
                        const maxZ = bbox.max.z; 
                        const centerY = (bbox.min.y + bbox.max.y) / 2;
                        this.keyOffsets.set(noteNum, new THREE.Vector3(centerX, centerY, maxZ));
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

    getKeyFrontWorldPosition(noteNum, target) {
        const key = this.keys.get(noteNum);
        const offset = this.keyOffsets.get(noteNum);
        if (!key || !offset) return null;

        // Apply local offset to key world position
        // Since keys might be rotated/scaled within the group, 
        // we use localToWorld on the key mesh.
        target.copy(offset);
        key.localToWorld(target);
        return target;
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

    getCalibrationData() {
        if (this.keys.size === 0) return null;

        let minNote = 999, maxNote = -1;
        this.keys.forEach((_, note) => {
            if (note < minNote) minNote = note;
            if (note > maxNote) maxNote = note;
        });

        const keyL = this.keys.get(minNote);
        const keyR = this.keys.get(maxNote);
        const offL = this.keyOffsets.get(minNote);
        const offR = this.keyOffsets.get(maxNote);

        if (!keyL || !keyR || !offL || !offR) return null;

        return {
            leftLocal: keyL.position.clone().add(offL),
            rightLocal: keyR.position.clone().add(offR),
            noteL: minNote,
            noteR: maxNote
        };
    }
}
