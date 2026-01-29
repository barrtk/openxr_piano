import * as Tone from 'tone';

export class AudioManager {
    constructor(uiManager) {
        this.ui = uiManager;
        this.sampler = null;
        this.reverb = null;
        this.meter = new Tone.Meter();
        this.mic = new Tone.UserMedia();
        this.isLoaded = false;

        // Track active notes to prevent re-triggering
        this.activeNotes = new Set();

        this.init();
        console.log("AudioManager V806 Loaded (With Reverb & Sustain)");
    }

    init() {
        // Create reverb for natural piano sound
        this.reverb = new Tone.Reverb({
            decay: 2.5,    // 2.5 second reverb tail
            wet: 0.25      // 25% wet signal
        }).toDestination();

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
            release: 1.5, // 1.5 second release envelope for sustain
            onload: () => {
                this.isLoaded = true;
                console.log("Samples loaded with reverb!");
                this.ui.showNotification("Dźwięki załadowane.", true);
            },
            onerror: (err) => {
                console.error("Sampler Error:", err);
            }
        });

        // Connect sampler -> reverb -> destination
        this.sampler.connect(this.reverb);
        // Also direct connection for clarity
        this.sampler.toDestination();
    }

    midiToNote(midi) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const noteName = notes[midi % 12];
        return noteName + octave;
    }

    playNote(noteNum, velocity = 0.7) {
        if (!this.isLoaded) return;

        // Prevent re-triggering already active notes
        if (this.activeNotes.has(noteNum)) return;

        try {
            const note = this.midiToNote(noteNum);
            this.sampler.triggerAttack(note, Tone.now(), velocity);
            this.activeNotes.add(noteNum);
        } catch (e) {
            console.error("Audio trigger error:", e);
        }
    }

    stopNote(noteNum) {
        if (!this.isLoaded) return;

        // Only release if note was active
        if (!this.activeNotes.has(noteNum)) return;

        try {
            const note = this.midiToNote(noteNum);
            // triggerRelease will use the 'release' time we set (1.5s)
            // This creates a natural fade-out/sustain effect
            this.sampler.triggerRelease(note, Tone.now());
            this.activeNotes.delete(noteNum);
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

            // Diagnostics & Raw Analyzer (Nested try-catch to prevent blocking success)
            try {
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
            } catch (diagnosticErr) {
                console.warn("AudioManager: Diagnostics/RawAnalyzer failed (non-critical):", diagnosticErr);
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
