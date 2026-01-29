import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class HandManager {
    constructor(renderer, scene, uiManager) {
        this.renderer = renderer;
        this.scene = scene;
        this.ui = uiManager;

        this.handModelFactory = new XRHandModelFactory();
        this.hands = [];

        this.init();
    }

    init() {
        // High-visibility material
        this.glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00f2ff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });

        // Left Hand
        this.hand1 = this.renderer.xr.getHand(0);
        // Right Hand
        this.hand2 = this.renderer.xr.getHand(1);

        // Create Hand Models
        this.handModel1 = this.handModelFactory.createHandModel(this.hand1, 'mesh');
        this.handModel2 = this.handModelFactory.createHandModel(this.hand2, 'mesh');

        this.hand1.add(this.handModel1);
        this.hand2.add(this.handModel2);

        // Reset scale to 1.0 (baseline)
        this.handModel1.scale.setScalar(1.0);
        this.handModel2.scale.setScalar(1.0);

        this.scene.add(this.hand1);
        this.scene.add(this.hand2);

        this.hands = [this.hand1, this.hand2];

        // Persistent material application
        this.hands.forEach((hand, i) => {
            hand.addEventListener('connected', () => {
                // Scale the model added by XRHandModelFactory
                try {
                    const handModel = hand.children.find(c => c.type === 'Object3D' || c.type === 'Group') || hand.children[0];
                    if (handModel) {
                        // Reverting to 1.0 scale
                        handModel.scale.setScalar(1.0);
                        
                        // HIDE the mismatching white mesh, keeping only the accurate markers
                        handModel.visible = false; 
                        
                        const side = hand.xrInputSource ? hand.xrInputSource.handedness : (i === 0 ? 'left' : 'right');
                        console.log(`Hidden hand model for ${side}. Markers only.`);
                    } else {
                        console.log(`BŁĄD: Nie znaleziono modelu dla dłoni ${i} (jeszcze...)`);
                    }
                } catch (err) {
                    console.log(`Hand scaling error: ${err.message}`);
                }

                // Add visual markers to fingertips for debug/alignment
                this.addFingertipMarkers(hand);

                /* 
                // Disabled Glow Material as per user request
                if (hand.userData.isApplyingMaterial) return;
                hand.userData.isApplyingMaterial = true;

                console.log(`Hand ${i} connected, monitoring for meshes...`);
                let checks = 0;
                const checkInterval = setInterval(() => {
                    hand.traverse(child => {
                        if (child.isMesh) {
                            child.material = this.glowMaterial;
                        }
                    });
                    if (++checks > 20) {
                        clearInterval(checkInterval);
                        hand.userData.isApplyingMaterial = false;
                    }
                }, 500);
                */
            });
        });
    }

    addFingertipMarkers(hand) {
        const tips = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
        const geometry = new THREE.SphereGeometry(0.007); // 7mm radius
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        // We need to wait a bit or check if joints are available. 
        // Three.js XRHand creates joints on demand or immediately.
        // Let's try to access them. If missing, we might need a retry or they are not yet populated.
        
        // Use a small interval to ensure joints are created if they aren't immediate
        let attempts = 0;
        const interval = setInterval(() => {
            if (!hand.joints) return;

            let allFound = true;
            tips.forEach(tipName => {
                const joint = hand.joints[tipName];
                if (joint) {
                    if (!joint.userData.hasMarker) {
                        const marker = new THREE.Mesh(geometry, material);
                        joint.add(marker);
                        joint.userData.hasMarker = true;
                    }
                } else {
                    allFound = false;
                }
            });

            attempts++;
            if (allFound || attempts > 20) {
                clearInterval(interval);
                if (allFound) console.log("Fingertip markers added.");
            }
        }, 100);
    }

    getFingertip(handIndex, jointName = 'index-finger-tip') {
        const hand = this.hands[handIndex];
        if (!hand) return null;

        // Find the joint by name (Three.js WebXR joint structure)
        // Joints are added as children to the hand object
        return hand.joints[jointName] || null;
    }

    getJoint(handIndex, jointName) {
        const hand = this.hands[handIndex];
        if (!hand || !hand.joints) return null;
        return hand.joints[jointName] || null;
    }

    getPinchData(handIndex) {
        const hand = this.hands[handIndex];
        if (!hand || !hand.joints) return null;

        const thumb = hand.joints['thumb-tip'];
        const index = hand.joints['index-finger-tip'];

        if (!thumb || !index) return null;

        // Check visibility / tracking confidence
        if (!thumb.visible || !index.visible) return null;

        const thumbPos = new THREE.Vector3();
        const indexPos = new THREE.Vector3();
        
        thumb.getWorldPosition(thumbPos);
        index.getWorldPosition(indexPos);

        const distance = thumbPos.distanceTo(indexPos);
        const midpoint = new THREE.Vector3().lerpVectors(thumbPos, indexPos, 0.5);

        // Threshold for "pinch" usually around 2cm
        const isPinching = distance < 0.02;

        return {
            position: midpoint,
            isPinching: isPinching,
            distance: distance
        };
    }

    update() {
        // Could be used for collision detection logic later
    }
}
