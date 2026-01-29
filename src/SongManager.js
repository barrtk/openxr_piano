import * as MIDI_MODULE from '@tonejs/midi';
const MidiConstructor = MIDI_MODULE.Midi || MIDI_MODULE.default;


export class SongManager {
    constructor() {
        this.midiData = null;
        this.tracks = [];
        this.bestTrackIndex = -1;
    }

    async loadMidi(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.midiData = new MidiConstructor(arrayBuffer);

            console.log("MIDI Loaded:", this.midiData.name);
            console.log("Tracks:", this.midiData.tracks.length);

            // Filter out empty tracks or those without notes
            this.tracks = this.midiData.tracks.filter(track => track.notes.length > 0);

            // Try to find a track that looks like a piano (name or instrument)
            this.bestTrackIndex = this.tracks.findIndex(t =>
                t.name.toLowerCase().includes('piano') ||
                (t.instrument && t.instrument.family === 'piano')
            );

            if (this.bestTrackIndex === -1) {
                // Default to track with most notes
                this.bestTrackIndex = 0;
                let maxNotes = 0;
                this.tracks.forEach((t, i) => {
                    if (t.notes.length > maxNotes) {
                        maxNotes = t.notes.length;
                        this.bestTrackIndex = i;
                    }
                });
            }

            return this.midiData;
        } catch (e) {
            console.error("Error loading MIDI:", e);
            return null;
        }
    }

    getNotesForTrack(trackIndex = -1) {
        const index = trackIndex === -1 ? this.bestTrackIndex : trackIndex;
        if (!this.tracks[index]) return [];
        return this.tracks[index].notes;
    }

    getDuration() {
        return this.midiData ? this.midiData.duration : 0;
    }
}
