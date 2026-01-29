import * as Tone from 'tone';

export class AudioManager {
    constructor(uiManager) {
        this.ui = uiManager;
        this.sampler = null;
        this.meter = new Tone.Meter();
        this.mic = new Tone.UserMedia();
        this.isLoaded = false;

        this.init();
        console.log("AudioManager V785 Loaded (Raw Diagnostics)");
    }

    init() {
        // Create a mapping from MIDI notes to sample files
        // We'll map every few notes for performance, Tone.js will pitch shift the rest
        const samples = {};
        for (let i = 21; i <= 108; i += 3) {
            const noteName = this.midiToNote(i);
            const fileName = `Clean Grand Mistral - GDCGM ${String(i).padStart(3, '0')}L.wav`;
            samples[noteName] = fileName;
        }

        this.sampler = new Tone.Sampler({
            urls: samples,
            baseUrl: "samples/",
            onload: () => {
                this.isLoaded = true;
                console.log("Samples loaded!");
                this.ui.showNotification("Dźwięki załadowane.", true);
            },
            onerror: (err) => {
                console.error("Sampler Error:", err);
            }
        }).toDestination();
    }

    midiToNote(midi) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const noteName = notes[midi % 12];
        return noteName + octave;
    }

    playNote(noteNum, velocity = 0.7) {
        if (!this.isLoaded) return;

        try {
            const note = this.midiToNote(noteNum);
            this.sampler.triggerAttack(note, Tone.now(), velocity);
        } catch (e) {
            console.error("Audio trigger error:", e);
        }
    }

    stopNote(noteNum) {
        if (!this.isLoaded) return;

        try {
            const note = this.midiToNote(noteNum);
            this.sampler.triggerRelease(note, Tone.now());
        } catch (e) {
            // Silently fail on release
        }
    }

    async startAudioContext() {
        console.log("AudioManager: Starting Tone.js AudioContext...");
        await Tone.start();
        console.log("AudioManager: AudioContext state:", Tone.getContext().state);
    }

    async openMic() {
        if (this.mic.state === 'started') return true;

        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };

        try {
            console.log("AudioManager: Requesting Tone.UserMedia with constraints (V785)...");
            
            // Correctly pass constraints to Tone.UserMedia
            await this.mic.open(constraints);
            this.mic.connect(this.meter);

            console.log("AudioManager: Mic status:", this.mic.state);

            // Attempt to access the underlying stream for diagnostics and raw analyzer
            // Tone.js usually exposes it as .stream or we can try to find it
            // If not available, we skip the raw analyzer specific setup that relies on MediaStreamSource
            // and instead connect mic node to analyzer directly if possible.
            
            // Try to find stream (UserMedia in Tone usually has a '_mediaStream' or 'stream')
            const stream = this.mic.stream || this.mic._mediaStream;

            if (stream) {
                const track = stream.getAudioTracks()[0];
                if (track) {
                    console.log(`V785 Mic Track: label="${track.label}", state="${track.readyState}", muted=${track.muted}, enabled=${track.enabled}`);
                    try {
                        const settings = track.getSettings();
                        console.log("V785 Mic Settings:", JSON.stringify(settings));
                    } catch (e) { console.log("Could not get track settings"); }
                }

                // Raw Analyser Setup
                const rawContext = Tone.getContext().rawContext;
                this.rawAnalyzer = rawContext.createAnalyser();
                // Create source from the stream we got from Tone
                const source = rawContext.createMediaStreamSource(stream);
                source.connect(this.rawAnalyzer);
                this.rawDataArray = new Uint8Array(this.rawAnalyzer.frequencyBinCount);
            } else {
                console.warn("AudioManager: Could not access internal stream for diagnostics. Connecting mic node directly to analyzer.");
                // Fallback: connect Tone node to native analyzer
                const rawContext = Tone.getContext().rawContext;
                this.rawAnalyzer = rawContext.createAnalyser();
                this.mic.connect(this.rawAnalyzer);
                this.rawDataArray = new Uint8Array(this.rawAnalyzer.frequencyBinCount);
            }

            return true;
        } catch (e) {
            console.error("AudioManager: Failed to open mic:", e);
            return false;
        }
    }

    getVolumeLevel() {
        const db = this.meter.getValue();

        // Raw Analyser Check
        let rawMax = 0;
        if (this.rawAnalyzer) {
            this.rawAnalyzer.getByteFrequencyData(this.rawDataArray);
            for (let i = 0; i < this.rawDataArray.length; i++) {
                if (this.rawDataArray[i] > rawMax) rawMax = this.rawDataArray[i];
            }
        }

        // Log raw values every few seconds
        const now = Date.now();
        if (!this.lastDbLog || now - this.lastDbLog > 3000) {
            console.log(`V785 DEBUG: Meter dB=${db.toFixed(2)}, Raw Max=${rawMax}`);
            this.lastDbLog = now;
        }

        if (db === -Infinity && rawMax === 0) return 0;

        const level = Tone.dbToGain(db);
        return Math.min(1.0, level * 50); // Massive boost for testing
    }
}
