import * as THREE from 'three';

export class CalibrationManager {
    constructor(handManager, pianoManager, uiManager) {
        this.hands = handManager;
        this.piano = pianoManager;
        this.ui = uiManager;

        this.state = 'IDLE'; // IDLE, WAIT_LEFT, WAIT_RIGHT
        this.leftPoint = new THREE.Vector3();
        this.rightPoint = new THREE.Vector3();

        window.addEventListener('voice-calibrate', () => {
            console.log("Otrzymano event voice-calibrate");
            this.startCalibration();
        });
    }

    startCalibration() {
        console.log("Startujemy kalibrację...");
        this.state = 'WAIT_LEFT';
        this.ui.showNotification("KALIBRACJA: Dotknij LEWEGO krańca (Note 36)", true);

        // Add visual spheres for calibration points
        this.markerL = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        this.markerR = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
        this.markerL.visible = this.markerR.visible = false;
        this.piano.scene.add(this.markerL, this.markerR);
    }

    confirmPoint() {
        console.log("Próba potwierdzenia punktu, stan:", this.state);
        if (this.state === 'IDLE') return;

        // Try to get ANY hand tip that is active
        const leftHandTip = this.hands.getFingertip(0);
        const rightHandTip = this.hands.getFingertip(1);
        const activeTip = rightHandTip || leftHandTip;

        if (!activeTip) {
            console.error("Brak aktywnego kończaka palca!");
            this.ui.showNotification("Błąd: Nie widzę Twoich dłoni!");
            return;
        }

        const pos = new THREE.Vector3();
        activeTip.getWorldPosition(pos);
        console.log("Punkt złapany w:", pos);

        if (this.state === 'WAIT_LEFT') {
            this.leftPoint.copy(pos);
            this.markerL.position.copy(pos);
            this.markerL.visible = true;
            this.state = 'WAIT_RIGHT';
            this.ui.showNotification("Punkt LEWY zapisany. Teraz PRAWY (Note 96)", true);
        } else if (this.state === 'WAIT_RIGHT') {
            this.rightPoint.copy(pos);
            this.markerR.position.copy(pos);
            this.markerR.visible = true;
            this.applyCalibration();
            this.state = 'IDLE';
            this.ui.showNotification("Kalibracja zakończona pomyślnie!", true);

            // Hide markers after success
            setTimeout(() => {
                this.markerL.visible = this.markerR.visible = false;
            }, 3000);
        }
    }

    applyCalibration() {
        // Calculate mid-point, distance, and rotation
        const center = new THREE.Vector3().lerpVectors(this.leftPoint, this.rightPoint, 0.5);
        const direction = new THREE.Vector3().subVectors(this.rightPoint, this.leftPoint);
        const distance = direction.length();

        // Horizontal rotation (y-axis)
        const angle = Math.atan2(direction.x, direction.z);

        // Base scale calculation (36 to 96 is 60 keys, approx width)
        // We might need to adjust this based on the actual model width in blender
        const baseWidth = 0.844; // Example width of 61-key section in model units
        const scale = distance / baseWidth;

        const rotation = new THREE.Euler(0, angle - Math.PI / 2, 0);

        this.piano.updatePose(center, rotation, scale);
    }
}
