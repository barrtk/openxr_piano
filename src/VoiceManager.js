export class VoiceManager {
    constructor(uiManager, audioManager) {
        this.ui = uiManager;
        this.audio = audioManager;

        this.recognition = null;
        this.micStream = null;

        this.isListening = false;
        this.isStarting = false;
        this.lastPeak = 0;

        this.commands = {
            'kalibruj': () => this.onCalibrate(),
            'kalibracja': () => this.onCalibrate(),
            'zapisz': () => this.onSave(),
            'start': () => this.onStart(),
            'graj': () => this.onStart(),
            'stop': () => this.onStop(),
            'wyłącz kalibrację': () => this.onStopCalibration(),
            'koniec kalibracji': () => this.onStopCalibration()
        };

        this.init();
        console.log("VoiceManager V798 Loaded (Pinch Calibration)");
    }

    init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            this.ui.showNotification("Speech API niewspierane (Chrome/HTTPS)", false);
            return;
        }

        this.recognition = new SR();
        this.recognition.lang = 'pl-PL';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            console.log("🎤 SpeechRecognition START");
            this.isStarting = false;
            this.ui.updateVoiceStatus("Słucham...");
            this.ui.showNotification("Mikrofon aktywny", true);
        };

        this.recognition.onresult = (e) => {
            let text = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                text += e.results[i][0].transcript;
            }

            const cleaned = text.trim().toLowerCase();
            if (cleaned) console.log("VoiceManager DEBUG Słyszę:", cleaned);
            this.ui.updateVoiceStatus("Słyszę: " + cleaned);

            if (e.results[e.results.length - 1].isFinal) {
                console.log("FINAL:", cleaned);
                this.handleCommand(cleaned);
            }
        };

        this.recognition.onerror = (e) => {
            console.error("Speech ERROR:", e.error);
            this.ui.showNotification("Błąd głosu: " + e.error, false);
            this.isListening = false;
        };

        this.recognition.onend = () => {
            console.warn("Speech END");
            if (this.isListening) {
                setTimeout(() => this.safeRestart(), 300);
            }
        };
    }

    async start() {
        if (this.isStarting || this.isListening) return;

        this.isStarting = true;

        // 1️⃣ HARD MIC OPEN VIA TONE.JS (HTTPS SAFE)
        try {
            const ok = await this.audio.openMic();
            if (!ok) {
                this.ui.showNotification("Brak dostępu do mikrofonu", false);
                this.isStarting = false;
                return;
            }
            // Analyzer setup moved down to ensure isListening is true
        } catch (e) {
            console.error("Mic blocked", e);
            this.isStarting = false;
            return;
        }

        // 2️⃣ START SPEECH ENGINE (RE-ENABLED V785)
        try {
            this.isListening = true;
            this.setupVolumeAnalyzer(); // Start analyzer AFTER setting isListening

            console.log("V785: Restarting SpeechRecognition...");
            this.recognition.abort(); // HARD RESET
            this.recognition.start();
        } catch (e) {
            console.error("Recognition start failed", e);
            this.isStarting = false;
            this.isListening = false;
        }
    }

    safeRestart() {
        if (!this.isListening) return;
        if (this.restarting) return;
        this.restarting = true;

        console.log("VoiceManager: Attempting safe restart...");
        setTimeout(() => {
            try {
                this.recognition.start();
                console.log("VoiceManager: Speech restarted successfully");
            } catch (e) {
                console.log("VoiceManager: Restart failed (busy)");
            }
            this.restarting = false;
        }, 500);
    }

    setupVolumeAnalyzer() {
        // Assuming audio.openMic() already sets up the metering or
        // audio.setupMicMetering() can be called without a stream argument
        // if the stream is managed internally by audioManager.
        // If audio.setupMicMetering() still requires a stream,
        // it should be retrieved from audioManager's internal state.
        // For now, removing the argument as per instruction.
        // this.audio.setupMicMetering(stream); // This line would need adjustment based on audioManager's implementation

        const loop = () => {
            const level = this.audio.getVolumeLevel();
            this.ui.updateVolume(level);

            if (level > 0.04 && Date.now() - this.lastPeak > 800) {
                console.log("📊 MIC LEVEL:", level.toFixed(2));
                this.lastPeak = Date.now();
            }
            if (this.isListening) requestAnimationFrame(loop);
        };
        loop();
    }

    handleCommand(text) {
        for (const cmd in this.commands) {
            if (text.includes(cmd)) {
                this.ui.showNotification(`Komenda: ${cmd}`, true);
                this.commands[cmd]();
                return;
            }
        }
    }

    onCalibrate() {
        window.dispatchEvent(new CustomEvent('voice-calibrate'));
        if (this.onCalibrateCallback) this.onCalibrateCallback();
    }

    onStopCalibration() {
        if (this.onStopCalibrationCallback) this.onStopCalibrationCallback();
    }

    onSave() { if (this.onSaveCallback) this.onSaveCallback(); }

    onStart() { if (this.onStartCallback) this.onStartCallback(); }

    onStop() {
        this.isListening = false;
        this.recognition.abort();
        this.ui.showNotification("Nasłuch zatrzymany");
    }
}
