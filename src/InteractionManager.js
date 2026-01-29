import * as THREE from 'three';

export class InteractionManager {
    constructor(handManager, pianoManager, uiManager, calibrationManager, camera) {
        this.hands = handManager;
        this.piano = pianoManager;
        this.ui = uiManager;
        this.calibration = calibrationManager;
        this.camera = camera;

        this.activeNotes = new Set();
        this.noteCooldowns = new Map(); // Map<noteNum, timestamp>
        this.menuCooldown = 0;

        // Configuration
        this.pressThreshold = 0.035; // 3.5cm to activate
        this.releaseThreshold = 0.05; // 5.0cm to deactivate (Hysteresis)
        this.debounceTime = 100; // 100ms cooldown after release
        
        this.tipJoints = ['index-finger-tip', 'middle-finger-tip', 'thumb-tip', 'ring-finger-tip', 'pinky-finger-tip'];
        
        this.tempVec = new THREE.Vector3();
    }

    update() {
        this.updatePianoInteraction();
        this.updateWristMenuInteraction();
    }

    updateWristMenuInteraction() {
        if (!this.hands || !this.ui || !this.camera) return;

        // 1. Get Left Hand Wrist
        const wrist = this.hands.getJoint(0, 'wrist'); // 0 = Left
        if (!wrist || !wrist.visible) {
            this.ui.updateWristMenu(false);
            return;
        }

        // 2. Check "Look at Palm" Gesture
        const wristPos = new THREE.Vector3();
        const wristRot = new THREE.Quaternion();
        wrist.getWorldPosition(wristPos);
        wrist.getWorldQuaternion(wristRot);

        // Get Right Index for interaction
        const rightIndex = this.hands.getFingertip(1, 'index-finger-tip');
        
        // Calculate menu position: 10cm above wrist
        const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(wristRot);
        const menuPos = wristPos.clone().add(upVector.clone().multiplyScalar(0.1)); 
        
        // Make menu look at camera
        const lookAtRot = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(menuPos, this.camera.position, new THREE.Vector3(0, 1, 0))
        );

        // Check distance to Right Index
        let isHovered = false;
        
        if (rightIndex && rightIndex.visible) {
            const indexPos = new THREE.Vector3();
            rightIndex.getWorldPosition(indexPos);
            const dist = indexPos.distanceTo(menuPos);
            
            if (dist < 0.04) isHovered = true;
            if (dist < 0.02 && Date.now() > this.menuCooldown) {
                this.menuCooldown = Date.now() + 2000;
                
                // Toggle Calibration
                if (this.calibration.state === 'IDLE') {
                    console.log("Wrist Menu: Start Calibration");
                    this.calibration.startCalibration();
                } else {
                    console.log("Wrist Menu: Stop Calibration");
                    this.calibration.stopCalibration();
                }
            }
        }

        this.ui.updateWristMenu(true, menuPos, lookAtRot, isHovered);
    }

    updatePianoInteraction() {
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

                // Check collision with piano keys front edge
                this.piano.keys.forEach((mesh, noteNum) => {
                    const frontPos = this.piano.getKeyFrontWorldPosition(noteNum, this.tempVec);
                    if (!frontPos) return;

                    const dist = tipPos.distanceTo(frontPos);
                    
                    // Hysteresis: Require finger to move further away to release the key
                    // than to press it. This prevents flickering at the boundary.
                    const threshold = this.activeNotes.has(noteNum) ? this.releaseThreshold : this.pressThreshold;

                    if (dist < threshold) {
                        currentFrameNotes.add(noteNum);
                        // Store debug info about which finger pressed it
                        if (!this.activeNotes.has(noteNum)) {
                             // console.log(`Piano Interaction: Key ${noteNum} ...`); // Reduced log spam
                        }
                    }
                });
            });
        });

        // Trigger press for new collisions
        currentFrameNotes.forEach(noteNum => {
            if (!this.activeNotes.has(noteNum)) {
                // Debounce: Prevent rapid re-triggering after release
                const lastRelease = this.noteCooldowns.get(noteNum) || 0;
                if (Date.now() - lastRelease > this.debounceTime) {
                    console.log(`Piano Interaction: Press Key ${noteNum}`);
                    this.piano.pressKey(noteNum);
                    this.activeNotes.add(noteNum);
                }
            }
        });

        // Trigger release for lost collisions
        this.activeNotes.forEach(noteNum => {
            if (!currentFrameNotes.has(noteNum)) {
                this.piano.releaseKey(noteNum);
                this.activeNotes.delete(noteNum);
                this.noteCooldowns.set(noteNum, Date.now()); // Start cooldown
            }
        });
    }
}
