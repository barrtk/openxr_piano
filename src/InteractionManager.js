import * as THREE from 'three';

export class InteractionManager {
    constructor(handManager, pianoManager) {
        this.hands = handManager;
        this.piano = pianoManager;
        this.activeNotes = new Set();

        // Configuration
        this.pressThreshold = 0.02; // 2cm distance for a "press"
        this.tipJoints = ['index-finger-tip', 'middle-finger-tip', 'thumb-tip', 'ring-finger-tip', 'pinky-finger-tip'];
    }

    update() {
        if (!this.piano.model) return;

        const currentFrameNotes = new Set();

        // Check each hand
        this.hands.hands.forEach((hand, handIdx) => {
            if (!hand.joints) return;

            // Check each fingertip
            this.tipJoints.forEach(jointName => {
                const tip = hand.joints[jointName];
                if (!tip || tip.visible === false) return;

                const tipPos = new THREE.Vector3();
                tip.getWorldPosition(tipPos);

                // Check collision with piano keys
                // Optimally, we use a spatial hash or just check local distance since keys are close together
                this.piano.keys.forEach((mesh, noteNum) => {
                    const meshPos = new THREE.Vector3();
                    mesh.getWorldPosition(meshPos);

                    const dist = tipPos.distanceTo(meshPos);

                    if (dist < this.pressThreshold) {
                        currentFrameNotes.add(noteNum);
                    }
                });
            });
        });

        // Trigger press for new collisions
        currentFrameNotes.forEach(noteNum => {
            if (!this.activeNotes.has(noteNum)) {
                this.piano.pressKey(noteNum);
                this.activeNotes.add(noteNum);
            }
        });

        // Trigger release for lost collisions
        this.activeNotes.forEach(noteNum => {
            if (!currentFrameNotes.has(noteNum)) {
                this.piano.releaseKey(noteNum);
                this.activeNotes.delete(noteNum);
            }
        });
    }
}
