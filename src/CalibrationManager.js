import * as THREE from 'three';

export class CalibrationManager {
    constructor(handManager, pianoManager, uiManager, controllerManager) {
        this.hands = handManager;
        this.piano = pianoManager;
        this.ui = uiManager;
        this.controllers = controllerManager;

        this.state = 'IDLE'; // IDLE, WAIT_LEFT, WAIT_RIGHT
        this.leftPoint = new THREE.Vector3();
        this.rightPoint = new THREE.Vector3();

        // Markers
        this.markerL = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        this.markerR = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
        this.markerL.visible = this.markerR.visible = false;

        // Active "ghost" marker following controller
        this.ghostMarker = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 }));
        this.ghostMarker.visible = false;

        this.piano.scene.add(this.markerL, this.markerR, this.ghostMarker);

        // State tracking
        this.buttonStates = new Map(); // Key: "handedness-buttonIndex", Value: boolean
        this.calibrationCooldown = 0;

        window.addEventListener('voice-calibrate', () => this.startCalibration());
    }

    stopCalibration() {
        this.state = 'IDLE';
        this.markerL.visible = false;
        this.markerR.visible = false;
        this.ghostMarker.visible = false;
        this.ui.showNotification("Kalibracja ANULOWANA", false);
        console.log("Calibration stopped by user command.");
    }

    startCalibration() {
        console.log("Calibration: Starting flow (Pinch Mode)...");
        this.state = 'WAIT_LEFT';
        this.ui.showNotification("KALIBRACJA: Zrób 'PINCH' lewą ręką na LEWYM skraju", true);
        this.markerL.visible = this.markerR.visible = false;
        this.ghostMarker.visible = true;
        this.wasPinching = false;
    }

    update() {
        const now = Date.now();
        
        // --- Controller Input Check (For Start/Stop) ---
        const session = this.controllers.renderer.xr.getSession();
        if (session) {
            for (const inputSource of session.inputSources) {
                if (!inputSource.gamepad) continue;
                
                // We only care about Right Controller for the Menu/Action button
                if (inputSource.handedness === 'right') {
                    const gamepad = inputSource.gamepad;
                    // B button (or Y/Menu depending on mapping) - usually index 4 or 5
                    const btn1 = gamepad.buttons[4];
                    const btn2 = gamepad.buttons[5];
                    
                    const isPressed = (btn1 && btn1.pressed) || (btn2 && btn2.pressed);
                    
                    if (isPressed && !this.lastBPressed) {
                        // Toggle calibration
                        if (this.state === 'IDLE') {
                            console.log("Button B Pressed: Starting Calibration");
                            this.startCalibration();
                        } else {
                            console.log("Button B Pressed: Stopping Calibration");
                            this.stopCalibration();
                        }
                    }
                    this.lastBPressed = isPressed;
                    break; // Found right controller, no need to check others
                }
            }
        }

        // --- Hand Pinch Logic (For Calibration Steps) ---
        if (this.state === 'IDLE') return;

        // Determine which hand is active based on state
        const handIndex = (this.state === 'WAIT_LEFT') ? 0 : 1;
        
        const pinchData = this.hands.getPinchData(handIndex);
        
        if (!pinchData) {
            // Hand not tracked or joints missing
            return;
        }

        // Update Ghost Marker to show where the system thinks the pinch is
        this.ghostMarker.position.copy(pinchData.position);
        
        // Visual feedback for "almost pinching" vs "pinching"
        if (pinchData.isPinching) {
            this.ghostMarker.material.color.setHex(0x00ff00); // Green when pinching
            this.ghostMarker.scale.setScalar(1.2);
        } else {
            this.ghostMarker.material.color.setHex(0xffff00); // Yellow when tracking
            this.ghostMarker.scale.setScalar(1.0);
        }

        // Logic: Detect rising edge of pinch (Pinch Start)
        if (pinchData.isPinching && !this.wasPinching) {
             console.log(`Calibration: Pinch detected for ${this.state} at`, pinchData.position);
             this.confirmHandPoint(pinchData.position);
        }

        this.wasPinching = pinchData.isPinching;
    }

    confirmHandPoint(position) {
        if (this.state === 'WAIT_LEFT') {
            this.leftPoint.copy(position);
            this.markerL.position.copy(position);
            this.markerL.visible = true;
            
            this.state = 'WAIT_RIGHT';
            this.wasPinching = true; // Prevent immediate trigger
            this.ui.showNotification("Zapisano LEWY. Teraz 'PINCH' prawą ręką na PRAWYM skraju", true);
            
        } else if (this.state === 'WAIT_RIGHT') {
            this.rightPoint.copy(position);
            this.markerR.position.copy(position);
            this.markerR.visible = true;
            this.ghostMarker.visible = false;
            
            this.applyCalibration();
            
            this.state = 'IDLE';
            this.ui.showNotification("KALIBRACJA ZAKOŃCZONA!", true);

            setTimeout(() => {
                this.markerL.visible = this.markerR.visible = false;
            }, 5000);
        }
    }

    // Legacy method kept if needed, but unused in new flow
    confirmControllerPoint(controller) { }

    confirmPoint() {
        // Voice fallback - not used currently but kept for compatibility
    }

    applyCalibration() {
        // 1. Get Physical Data
        const realCenter = new THREE.Vector3().lerpVectors(this.leftPoint, this.rightPoint, 0.5);
        const realDirection = new THREE.Vector3().subVectors(this.rightPoint, this.leftPoint);
        const realWidth = realDirection.length();
        const realAngle = Math.atan2(realDirection.x, realDirection.z);

        // 2. Get Virtual Data
        const pianoData = this.piano.getCalibrationData();
        let scale = 1.0;
        let localOffset = new THREE.Vector3(0, 0, 0);

        if (pianoData) {
            const { leftLocal, rightLocal } = pianoData;
            const virtualWidth = leftLocal.distanceTo(rightLocal);
            const virtualCenter = new THREE.Vector3().lerpVectors(leftLocal, rightLocal, 0.5);
            
            // Prevent division by zero or negative
            if (virtualWidth > 0.001 && realWidth > 0.001) {
                scale = realWidth / virtualWidth;
            } else {
                console.warn("Calibration: Invalid width detected (Virtual or Real is ~0). Defaulting scale.");
            }
            
            localOffset.copy(virtualCenter).multiplyScalar(scale);
        } else {
            console.warn("Calibration: Could not get piano key data. Using fallback center/scale.");
            scale = realWidth / 1.22; 
        }

        console.log(`Calibration: Scale=${scale.toFixed(3)}, RealWidth=${realWidth.toFixed(3)}m`);

        // 3. Apply Transform
        const rotation = new THREE.Euler(0, realAngle - Math.PI / 2, 0); 
        
        const offsetVec = localOffset.clone().applyEuler(rotation);
        const finalPosition = realCenter.clone().sub(offsetVec);

        this.piano.updatePose(finalPosition, rotation, scale);
    }
}
