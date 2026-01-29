import * as THREE from 'three';

export class UIManager {
    constructor() {
        this.container = document.getElementById('notification-container');
        this.console = document.getElementById('debug-console');
        this.voiceStatus = document.getElementById('voice-status');
        this.volumeBar = this.createVolumeBar();
        this.setupLogger();
        this.setupGlobalErrorCatching();

        // 3D UI Elements
        this.camera = null; // Needs to be assigned by main app
        this.scene = null;  // Needs to be assigned by main app
        this.vrNotificationMesh = null;
        this.vrNotificationCanvas = null;
        this.vrNotificationCtx = null;
    }

    init3D(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.createVRNotificationPanel();
    }

    createVRNotificationPanel() {
        this.vrNotificationCanvas = document.createElement('canvas');
        this.vrNotificationCanvas.width = 512;
        this.vrNotificationCanvas.height = 128;
        this.vrNotificationCtx = this.vrNotificationCanvas.getContext('2d');

        const texture = new THREE.CanvasTexture(this.vrNotificationCanvas);
        const material = new THREE.MeshBasicMaterial({ 
            map: texture, 
            transparent: true, 
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        const geometry = new THREE.PlaneGeometry(0.5, 0.125);

        this.vrNotificationMesh = new THREE.Mesh(geometry, material);
        this.vrNotificationMesh.position.set(0, 0, -1); // Default, will update
        this.vrNotificationMesh.visible = false;
        this.vrNotificationMesh.renderOrder = 999; // Always on top
        this.vrNotificationMesh.material.depthTest = false; // Always on top

        // Add to scene but typically we might want to attach it to camera or update its position
        // Attaching to camera directly in WebXR can be tricky if camera is updated by XR.
        // Better to update position in a loop or add to a HUD group.
        // For simplicity, let's try attaching to camera (if it's a child of scene, works)
        // or just update it in render loop.
        if (this.scene) this.scene.add(this.vrNotificationMesh);
        
        this.createWristMenu();
    }

    createWristMenu() {
        // Simple "Calibrate" Button Mesh
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Draw Button Style
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 256, 128);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#00f2ff';
        ctx.strokeRect(0, 0, 256, 128);
        ctx.fillStyle = '#ffffff';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("KALIBRUJ", 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({ 
            map: texture, 
            transparent: true, 
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        const geometry = new THREE.PlaneGeometry(0.08, 0.04); // 8cm x 4cm button

        this.wristMenuMesh = new THREE.Mesh(geometry, material);
        this.wristMenuMesh.scale.x = -1; // Fix mirrored text
        this.wristMenuMesh.visible = false;
        if (this.scene) this.scene.add(this.wristMenuMesh);
    }

    updateWristMenu(visible, position, rotation, isHovered = false) {
        if (!this.wristMenuMesh) return;
        
        this.wristMenuMesh.visible = visible;
        if (visible && position && rotation) {
            this.wristMenuMesh.position.copy(position);
            this.wristMenuMesh.quaternion.copy(rotation);
            
            // Highlight on hover
            this.wristMenuMesh.material.color.setHex(isHovered ? 0x00ff00 : 0xffffff);
        }
    }

    update3D(camera) {
        if (!this.vrNotificationMesh || !camera) return;

        // Position 1 meter in front of camera
        const vector = new THREE.Vector3(0, 0, -0.7);
        vector.applyQuaternion(camera.quaternion);
        this.vrNotificationMesh.position.copy(camera.position).add(vector);
        this.vrNotificationMesh.lookAt(camera.position);
    }

    updateVRText(text, glow = false) {
        if (!this.vrNotificationCtx || !this.vrNotificationMesh) return;

        const ctx = this.vrNotificationCtx;
        ctx.clearRect(0, 0, 512, 128);

        // Background
        ctx.fillStyle = glow ? 'rgba(0, 50, 0, 0.8)' : 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 512, 128);
        ctx.lineWidth = 4;
        ctx.strokeStyle = glow ? '#00ff00' : '#00f2ff';
        ctx.strokeRect(0, 0, 512, 128);

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);

        this.vrNotificationMesh.material.map.needsUpdate = true;
        this.vrNotificationMesh.visible = true;

        // Auto hide 3D text too
        if (this.vrTimeout) clearTimeout(this.vrTimeout);
        this.vrTimeout = setTimeout(() => {
            if (this.vrNotificationMesh) this.vrNotificationMesh.visible = false;
        }, 5000);
    }

    createVolumeBar() {
        const bar = document.createElement('div');
        bar.id = 'volume-meter';
        bar.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            height: 20px;
            background: rgba(0,0,0,0.8);
            border: 2px solid #00f2ff;
            border-radius: 10px;
            overflow: hidden;
            display: block; /* Always visible for debug */
            z-index: 10000;
            box-shadow: 0 0 20px rgba(0, 242, 255, 0.5);
        `;
        const inner = document.createElement('div');
        inner.id = 'volume-inner';
        inner.style.cssText = `
            width: 0%;
            height: 100%;
            background: #00ff00;
            transition: width 0.1s;
        `;
        bar.appendChild(inner);
        document.body.appendChild(bar);
        return { bar, inner };
    }

    updateVolume(level) {
        if (!this.volumeBar) return;
        this.volumeBar.bar.style.display = 'block'; // Force visibility

        const width = Math.min(100, level * 100);
        this.volumeBar.inner.style.width = width + '%';

        // Brighter colors for better contrast in AR
        if (width > 70) this.volumeBar.inner.style.background = '#ff0055';
        else if (width > 5) this.volumeBar.inner.style.background = '#00f2ff';
        else this.volumeBar.inner.style.background = '#003344';
    }

    setupLogger() {
        const originalLog = console.log;
        const originalError = console.error;

        console.log = (...args) => {
            this.log('LOG: ' + args.map(p => typeof p === 'object' ? JSON.stringify(p) : p).join(' '));
            originalLog(...args);
        };

        console.error = (...args) => {
            this.log('ERR: ' + args.map(p => typeof p === 'object' ? JSON.stringify(p) : p).join(' '), true);
            originalError(...args);
        };
    }

    setupGlobalErrorCatching() {
        window.onerror = (msg, url, lineNo, columnNo, error) => {
            const message = `[GLOBAL ERR] ${msg} at ${lineNo}:${columnNo}`;
            this.log(message, true);
            return false;
        };

        window.onunhandledrejection = (event) => {
            this.log(`[PROMISE REJ] ${event.reason}`, true);
        };
    }

    log(message, error = false) {
        if (!this.console) return;
        const div = document.createElement('div');
        if (error) div.style.color = '#f00';
        div.textContent = `> ${message}`;
        this.console.appendChild(div);
        this.console.scrollTop = this.console.scrollHeight;

        // Relay to bridge
        const logUrl = `${window.location.origin}/log`;
        fetch(logUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: message
        }).catch(err => {
            // Optional: only show bridge failure once to avoid spam
            if (!this.bridgeErrorShown) {
                console.error("Bridge Relay Failed:", err); // Use console.error which is already wrapped by setupLogger
                this.bridgeErrorShown = true;
            }
        });
    }

    updateVoiceStatus(text) {
        if (this.voiceStatus) {
            this.voiceStatus.textContent = text || "Słucham...";
        }
    }

    showNotification(message, glow = false) {
        // Desktop / 2D Overlay
        const div = document.createElement('div');
        div.className = `notification ${glow ? 'glow' : ''}`;
        div.innerHTML = `
            <div class="icon">🎹</div>
            <div class="content">${message}</div>
        `;

        this.container.appendChild(div);

        // Auto remove after 5 seconds
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateY(-20px)';
            setTimeout(() => div.remove(), 300);
        }, 5000);

        // 3D Overlay
        this.updateVRText(message, glow);
    }
}
