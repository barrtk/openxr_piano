export class UIManager {
    constructor() {
        this.container = document.getElementById('notification-container');
        this.console = document.getElementById('debug-console');
        this.voiceStatus = document.getElementById('voice-status');
        this.volumeBar = this.createVolumeBar();
        this.setupLogger();
        this.setupGlobalErrorCatching();
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
    }
}
