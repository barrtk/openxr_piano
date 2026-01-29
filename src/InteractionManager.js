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
        this.noteActivationTime = new Map(); // Map<noteNum, timestamp> - when note was first pressed
        this.menuCooldown = 0;

        // Configuration - STABLE MODE with large hysteresis
        this.pressThreshold = 0.025; // 2.5cm to activate (easier to trigger)
        this.releaseThreshold = 0.045; // 4.5cm to deactivate (large hysteresis gap = 2cm)
        this.debounceTime = 200; // 200ms cooldown after release
        this.minHoldTime = 80; // Minimum 80ms hold before allowing release

        // Only use index and middle fingers for piano (most precise)
        this.tipJoints = ['index-finger-tip', 'middle-finger-tip'];

        this.tempVec = new THREE.Vector3();
        this.tipPos = new THREE.Vector3();
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
        const now = Date.now();

        // Track which finger is pressing which note (to avoid conflicts)
        const fingerToNote = new Map(); // "handIndex-jointName" -> { noteNum, distance }

        // Phase 1: Find the CLOSEST key for each fingertip
        this.hands.hands.forEach((hand, handIdx) => {
            if (!hand.joints) return;

            this.tipJoints.forEach(jointName => {
                const tip = hand.joints[jointName];
                if (!tip || tip.visible === false) return;

                tip.getWorldPosition(this.tipPos);

                let closestNote = null;
                let closestDist = Infinity;

                // Find the closest key to this fingertip
                this.piano.keys.forEach((mesh, noteNum) => {
                    const frontPos = this.piano.getKeyFrontWorldPosition(noteNum, this.tempVec);
                    if (!frontPos) return;

                    const dist = this.tipPos.distanceTo(frontPos);

                    if (dist < closestDist) {
                        closestDist = dist;
                        closestNote = noteNum;
                    }
                });

                // Store the closest key for this finger
                if (closestNote !== null) {
                    const fingerKey = `${handIdx}-${jointName}`;
                    fingerToNote.set(fingerKey, { noteNum: closestNote, distance: closestDist });
                }
            });
        });

        // Phase 2: For each note, only activate if CLOSEST finger is within threshold
        // This prevents multiple fingers from activating the same note
        const noteToFingers = new Map(); // noteNum -> [{ fingerKey, distance }]

        fingerToNote.forEach(({ noteNum, distance }, fingerKey) => {
            if (!noteToFingers.has(noteNum)) {
                noteToFingers.set(noteNum, []);
            }
            noteToFingers.get(noteNum).push({ fingerKey, distance });
        });

        // For each potential note, pick the closest finger
        noteToFingers.forEach((fingers, noteNum) => {
            // Sort by distance
            fingers.sort((a, b) => a.distance - b.distance);
            const closest = fingers[0];

            // Apply hysteresis
            const threshold = this.activeNotes.has(noteNum)
                ? this.releaseThreshold
                : this.pressThreshold;

            if (closest.distance < threshold) {
                // Check debounce
                const lastRelease = this.noteCooldowns.get(noteNum) || 0;
                if (now - lastRelease > this.debounceTime || this.activeNotes.has(noteNum)) {
                    currentFrameNotes.add(noteNum);
                }
            }
        });

        // Phase 3: Trigger press for new collisions
        currentFrameNotes.forEach(noteNum => {
            if (!this.activeNotes.has(noteNum)) {
                console.log(`Piano: Press Key ${noteNum}`);
                this.piano.pressKey(noteNum);
                this.activeNotes.add(noteNum);
                this.noteActivationTime.set(noteNum, now); // Track when note was pressed
            }
        });

        // Phase 4: Trigger release for lost collisions (with minimum hold time)
        this.activeNotes.forEach(noteNum => {
            if (!currentFrameNotes.has(noteNum)) {
                // Check minimum hold time before releasing
                const activationTime = this.noteActivationTime.get(noteNum) || 0;
                if (now - activationTime >= this.minHoldTime) {
                    this.piano.releaseKey(noteNum);
                    this.activeNotes.delete(noteNum);
                    this.noteActivationTime.delete(noteNum);
                    this.noteCooldowns.set(noteNum, now);
                }
                // If minHoldTime not met, keep the note active for next frame
            }
        });
    }
}
