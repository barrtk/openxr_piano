import * as THREE from 'three';

export class FallingBlockManager {
    constructor(scene, pianoManager) {
        this.scene = scene;
        this.piano = pianoManager;
        this.blocks = []; // Array of { mesh, note, startTime, duration }
        this.blockPool = [];

        // Settings
        this.fallSpeed = 0.5; // meters per second
        this.fallHeight = 2.0; // from where they start falling
        this.lookAheadTime = 3.0; // seconds before they hit

        this.blockGeometry = new THREE.BoxGeometry(0.015, 1, 0.04);
        this.blockGeometry.translate(0, 0.5, 0); // Move pivot to bottom face
        this.blockMaterial = new THREE.MeshStandardMaterial({
            color: 0x00f2ff,
            emissive: 0x00f2ff,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });
    }

    spawnBlocks(notes) {
        // Clear existing
        this.blocks.forEach(b => this.scene.remove(b.mesh));
        this.blocks = [];

        notes.forEach(note => {
            const mesh = new THREE.Mesh(this.blockGeometry, this.blockMaterial.clone());

            // Color based on note type (simple version)
            if (this.isSharp(note.midi)) {
                mesh.material.color.setHex(0x222222);
                mesh.material.emissive.setHex(0x222222);
            }

            // Scale Y by duration * speed
            const blockLength = note.duration * this.fallSpeed;
            mesh.scale.y = blockLength;

            this.blocks.push({
                mesh: mesh,
                note: note.midi,
                time: note.time,
                duration: note.duration,
                length: blockLength,
                spawned: false
            });
        });
    }

    isSharp(midi) {
        const n = midi % 12;
        return [1, 3, 6, 8, 10].includes(n);
    }

    update(currentTime) {
        if (!this.piano.model) return;

        this.blocks.forEach(block => {
            // Should we show it?
            const timeUntilHit = block.time - currentTime;

            if (timeUntilHit < this.lookAheadTime && timeUntilHit > -block.duration) {
                if (!block.spawned) {
                    this.scene.add(block.mesh);
                    block.spawned = true;
                }

                // Vertical position: height = timeUntilHit * fallSpeed
                // Plus half the length because box is centered
                const yPos = (timeUntilHit * this.fallSpeed) + (block.length / 2);

                // Horizontal position: Find the piano key
                const keyMesh = this.piano.keys.get(block.note);
                if (keyMesh) {
                    const worldPos = new THREE.Vector3();
                    keyMesh.getWorldPosition(worldPos);

                    block.mesh.position.set(worldPos.x, worldPos.y + yPos, worldPos.z);
                    block.mesh.rotation.copy(this.piano.model.rotation);
                }

                // Visual feedback when hitting
                if (timeUntilHit < 0 && timeUntilHit > -0.1) {
                    block.mesh.material.emissiveIntensity = 2.0;
                } else {
                    block.mesh.material.emissiveIntensity = 0.5;
                }

            } else {
                if (block.spawned) {
                    this.scene.remove(block.mesh);
                    block.spawned = false;
                }
            }
        });
    }
}
