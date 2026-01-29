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
                        handModel.scale.setScalar(1.0);
                        const side = hand.xrInputSource ? hand.xrInputSource.handedness : (i === 0 ? 'left' : 'right');
                        const profile = hand.xrInputSource ? JSON.stringify(hand.xrInputSource.profiles) : "null";
                        console.log(`Applied 1.0x scale to hand model for ${side}. Children: ${hand.children.length}. Profile: ${profile}`);
                    } else {
                        console.log(`BŁĄD: Nie znaleziono modelu dla dłoni ${i} (jeszcze...)`);
                    }
                } catch (err) {
                    console.log(`Hand scaling error: ${err.message}`);
                }

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
            });
        });
    }

    getFingertip(handIndex, jointName = 'index-finger-tip') {
        const hand = this.hands[handIndex];
        if (!hand) return null;

        // Find the joint by name (Three.js WebXR joint structure)
        // Joints are added as children to the hand object
        return hand.joints[jointName] || null;
    }

    update() {
        // Could be used for collision detection logic later
    }
}
