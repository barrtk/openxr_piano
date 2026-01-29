import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class HandManager {
    constructor(renderer, scene, uiManager) {
        this.renderer = renderer;
        this.scene = scene;
        this.ui = uiManager;

        this.handModelFactory = new XRHandModelFactory();
        this.hands = [];

        // Glove configuration
        this.gloveScale = 1.25; // 25% larger than default hands
        this.jointRadius = 0.010;  // 10mm for joints
        this.tipRadius = 0.006;    // 6mm for fingertips (smaller for precision)
        this.fingerSegmentRadius = 0.008; // 8mm for finger segments
        this.palmSegmentRadius = 0.012; // 12mm for palm area

        // Glove visual elements storage
        this.gloveElements = new Map(); // hand -> { joints: [], segments: [] }

        this.init();
    }

    init() {
        // Glove material - semi-transparent blue
        this.gloveMaterial = new THREE.MeshStandardMaterial({
            color: 0x3366cc,
            metalness: 0.2,
            roughness: 0.7,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });

        // Fingertip material - slightly different color for visibility
        this.tipMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff88,
            metalness: 0.3,
            roughness: 0.5,
            transparent: true,
            opacity: 0.9,
            emissive: 0x00ff88,
            emissiveIntensity: 0.3
        });

        // Left Hand
        this.hand1 = this.renderer.xr.getHand(0);
        // Right Hand
        this.hand2 = this.renderer.xr.getHand(1);

        // Create Hand Models (hidden, but needed for joint tracking)
        this.handModel1 = this.handModelFactory.createHandModel(this.hand1, 'mesh');
        this.handModel2 = this.handModelFactory.createHandModel(this.hand2, 'mesh');

        this.hand1.add(this.handModel1);
        this.hand2.add(this.handModel2);

        // Hide default models
        this.handModel1.visible = false;
        this.handModel2.visible = false;

        this.scene.add(this.hand1);
        this.scene.add(this.hand2);

        this.hands = [this.hand1, this.hand2];

        // Setup glove building on hand connect
        this.hands.forEach((hand, i) => {
            hand.addEventListener('connected', () => {
                const side = hand.xrInputSource ? hand.xrInputSource.handedness : (i === 0 ? 'left' : 'right');
                console.log(`Hand ${side} connected - building glove model...`);

                // Hide factory-created mesh
                hand.children.forEach(child => {
                    if (child.type === 'Object3D' || child.type === 'Group') {
                        child.visible = false;
                    }
                });

                // Build glove with retry (joints may not be immediately available)
                this.initGloveForHand(hand, side);
            });

            hand.addEventListener('disconnected', () => {
                this.removeGloveForHand(hand);
            });
        });
    }

    initGloveForHand(hand, side) {
        let attempts = 0;
        const maxAttempts = 30;

        const tryBuild = () => {
            attempts++;
            if (hand.joints && Object.keys(hand.joints).length > 0) {
                this.buildGloveModel(hand);
                console.log(`Glove built for ${side} hand after ${attempts} attempts`);
            } else if (attempts < maxAttempts) {
                setTimeout(tryBuild, 100);
            } else {
                console.warn(`Failed to build glove for ${side} - no joints available`);
            }
        };

        tryBuild();
    }

    buildGloveModel(hand) {
        // Remove existing glove if any
        this.removeGloveForHand(hand);

        const elements = { joints: [], segments: [] };

        // Joint names from WebXR Hand Input spec
        const allJoints = [
            'wrist',
            'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
            'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
            'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
            'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
            'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'
        ];

        const tipJoints = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];

        // Finger segment connections (from -> to)
        const fingerSegments = [
            // Thumb
            ['wrist', 'thumb-metacarpal'],
            ['thumb-metacarpal', 'thumb-phalanx-proximal'],
            ['thumb-phalanx-proximal', 'thumb-phalanx-distal'],
            ['thumb-phalanx-distal', 'thumb-tip'],
            // Index
            ['wrist', 'index-finger-metacarpal'],
            ['index-finger-metacarpal', 'index-finger-phalanx-proximal'],
            ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate'],
            ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal'],
            ['index-finger-phalanx-distal', 'index-finger-tip'],
            // Middle
            ['wrist', 'middle-finger-metacarpal'],
            ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal'],
            ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate'],
            ['middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal'],
            ['middle-finger-phalanx-distal', 'middle-finger-tip'],
            // Ring
            ['wrist', 'ring-finger-metacarpal'],
            ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal'],
            ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate'],
            ['ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal'],
            ['ring-finger-phalanx-distal', 'ring-finger-tip'],
            // Pinky
            ['wrist', 'pinky-finger-metacarpal'],
            ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal'],
            ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate'],
            ['pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal'],
            ['pinky-finger-phalanx-distal', 'pinky-finger-tip']
        ];

        // Create spheres for each joint
        allJoints.forEach(jointName => {
            const joint = hand.joints[jointName];
            if (!joint) return;

            const isTip = tipJoints.includes(jointName);
            const isMetacarpal = jointName.includes('metacarpal');
            const isWrist = jointName === 'wrist';

            let radius = this.jointRadius;
            let material = this.gloveMaterial;

            if (isTip) {
                radius = this.tipRadius;
                material = this.tipMaterial;
            } else if (isMetacarpal || isWrist) {
                radius = this.palmSegmentRadius;
            }

            radius *= this.gloveScale;

            const geometry = new THREE.SphereGeometry(radius, 8, 6);
            const sphere = new THREE.Mesh(geometry, material);

            joint.add(sphere);
            elements.joints.push({ joint, mesh: sphere });
        });

        // Create cylinders for finger segments
        fingerSegments.forEach(([fromName, toName]) => {
            const fromJoint = hand.joints[fromName];
            const toJoint = hand.joints[toName];
            if (!fromJoint || !toJoint) return;

            const isFromWrist = fromName === 'wrist';
            const radius = (isFromWrist ? this.palmSegmentRadius : this.fingerSegmentRadius) * this.gloveScale;

            // Create cylinder - will be updated each frame
            const geometry = new THREE.CylinderGeometry(radius, radius, 1, 8);
            const cylinder = new THREE.Mesh(geometry, this.gloveMaterial);

            this.scene.add(cylinder);
            elements.segments.push({ fromJoint, toJoint, mesh: cylinder });
        });

        this.gloveElements.set(hand, elements);
        console.log(`Glove model created with ${elements.joints.length} joints and ${elements.segments.length} segments`);
    }

    removeGloveForHand(hand) {
        const elements = this.gloveElements.get(hand);
        if (!elements) return;

        // Remove joint spheres
        elements.joints.forEach(({ joint, mesh }) => {
            joint.remove(mesh);
            mesh.geometry.dispose();
        });

        // Remove segment cylinders
        elements.segments.forEach(({ mesh }) => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        });

        this.gloveElements.delete(hand);
    }

    getFingertip(handIndex, jointName = 'index-finger-tip') {
        const hand = this.hands[handIndex];
        if (!hand) return null;
        return hand.joints?.[jointName] || null;
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
        if (!thumb.visible || !index.visible) return null;

        const thumbPos = new THREE.Vector3();
        const indexPos = new THREE.Vector3();

        thumb.getWorldPosition(thumbPos);
        index.getWorldPosition(indexPos);

        const distance = thumbPos.distanceTo(indexPos);
        const midpoint = new THREE.Vector3().lerpVectors(thumbPos, indexPos, 0.5);

        const isPinching = distance < 0.02;

        return {
            position: midpoint,
            isPinching: isPinching,
            distance: distance
        };
    }

    update() {
        // Update cylinder segments to follow joints
        this.gloveElements.forEach((elements, hand) => {
            if (!hand.joints) return;

            const fromPos = new THREE.Vector3();
            const toPos = new THREE.Vector3();

            elements.segments.forEach(({ fromJoint, toJoint, mesh }) => {
                if (!fromJoint.visible || !toJoint.visible) {
                    mesh.visible = false;
                    return;
                }

                mesh.visible = true;

                fromJoint.getWorldPosition(fromPos);
                toJoint.getWorldPosition(toPos);

                // Position cylinder at midpoint
                mesh.position.lerpVectors(fromPos, toPos, 0.5);

                // Scale cylinder to match distance
                const distance = fromPos.distanceTo(toPos);
                mesh.scale.y = distance;

                // Orient cylinder to point from -> to
                mesh.lookAt(toPos);
                mesh.rotateX(Math.PI / 2);
            });
        });
    }
}
