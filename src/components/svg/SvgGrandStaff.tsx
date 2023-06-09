
import { ReactElement, useState } from "react";

import { useSightReadingConfig } from "../sight-reading/SightReadingConfigContext";

import SvgStaff from "./SvgStaff";
import SvgBarLine from "./SvgBarLine";
import SvgStaffDefinition from "./SvgStaffDefinition";
import SvgChord, { NOTE_WIDTH_RATIO } from "./SvgChord";
import { LabeledChord, LabeledMusic } from "../../utilities/MusicStream";
import { Key, Note } from "../../datatypes/ComplexTypes";
import { TimeSignature, Clef, Accidental, Letter, RhythmicValue } from "../../datatypes/BasicTypes";
import { average, averageSlope } from "../../utilities/NumberUtils";
import { getPositionByNote, positionToY } from "../../utilities/MusicUtils";
import SvgBrace from "./SvgBrace";


// ==========================
// Beam Functions / Variables
// --------------------------

// Either positive or negative, this is how steep the beams are when they're not horizontal.
const BEAM_SLOPE = 0.20;

function getAveragePitch(chord: LabeledChord): number {
    return average(chord.map(n => n.pitch));
}

function isEighth(chord: LabeledChord): boolean {
    return chord[0].rhythmicValue === RhythmicValue.EIGHTH;
}

/**
 * Splits a measure into groups, where each group is a series of notes/chords that should be beamed together. Each group
 * has at least one note/chord, and a maximum of 4. If a group has only one note/chord, then no beam should be shown.
 * 
 * Notes should be grouped if they are:
 *  (1) of the same rhythmic value
 *  (2) within an octave of the note preceeding it
 */
function groupBeamGroups(measure: LabeledChord[]): LabeledChord[][] {
    const beamGroups: LabeledChord[][] = [];

    for (let labeledChord of measure) {
        // Starting case
        if (beamGroups.length === 0) {
            beamGroups.push([labeledChord]);
            continue;
        }

        const latestBeamGroup = beamGroups[beamGroups.length-1];
        if (latestBeamGroup.length === 0) {
            // If our latest beam group is empty, we have nothing to compare that would rule it out. Add it!
            latestBeamGroup.push(labeledChord);
        } else if (latestBeamGroup.length >= 4 || !isEighth(labeledChord) || !isEighth(latestBeamGroup[0])) {
            // If our latest beam group is full OR if this (or the last group) isn't an eighth note, start a new group!
            beamGroups.push([labeledChord]);
        } else {
            // Otherwise, check if this chord is close enough to the other chords in this beam group
            const currentChordPitch = getAveragePitch(labeledChord);
            const pitchDistances    = latestBeamGroup.map(chord => Math.abs(getAveragePitch(chord) - currentChordPitch));
            const closeEnough       = Math.max(...pitchDistances) <= 12;

            if (closeEnough) latestBeamGroup.push(labeledChord);
            else             beamGroups.push([labeledChord]);
        }
    }

    return beamGroups;
}

type BeamLine = {
    isAbove: boolean,            // Whether the beam is drawn above (or below) the notes.
    getY: (x: number) => number, // An equation where, given an x, returns the associated y value of this beam.
};

/**
 * Calculates and returns a function which computes the beam's y-value given an x location, along with whether the beam goes
 * above or below the notes. If there aren't at least 2 notes in the provided beamGroup, this returns undefined.
 *
 * @param beamGroup A group of LabeledChords that should be joined by a beam.
 * @param clef Which clef these notes belong to.
 * @param startingX The x location of the start of this beam group.
 * @param noteWidth The width of the notes in this beam group including their padding. It's assumed all notes in a group have the same width.
 * @param staffLineHeight The height of one staff line.
 */
function getBeamLine(beamGroup: LabeledChord[], clef: Clef, startingX: number, noteWidth: number, staffLineHeight: number): BeamLine | undefined {
    // Can't make a beam if there's just one note. (Should never have zero notes, but we're being safe.)
    if (beamGroup.length <= 1)
        return undefined;

    // Determine the displayed slope of the beam.
    const averagePitches = beamGroup.map(chord => average(chord.map(c => c.pitch)));
    const actualSlope = averageSlope(averagePitches);
    const displayedSlope = actualSlope === 0 ? 0 : (actualSlope > 0 ? BEAM_SLOPE : -BEAM_SLOPE);

    // If the average pitch is above the middle line on the staff, the beam should be above the notes.
    const middlePitch = (clef === Clef.TREBLE) ? 71 : 50;
    const shouldBeAbove = 0 > averagePitches.reduce((delta, pitch) => delta + pitch - middlePitch, 0);

    // Figure out the y location of the note closest to our beam
    let closestNoteY = shouldBeAbove ? Infinity : -Infinity;
    for (let i = 0; i < beamGroup.length; i++) {
        // Find the Y value of each chord of this beam group
        const chordYVals = beamGroup[i].map(note => positionToY(getPositionByNote(note, clef), staffLineHeight))
        // ...then the closest of those
        const closestYVal = (shouldBeAbove ? Math.min : Math.max)(...chordYVals);
        // ...and adjust its value based on the slope of the beam.
        const adjustedChordY = closestYVal - displayedSlope * i * noteWidth;

        if (shouldBeAbove
            ? (adjustedChordY < closestNoteY)
            : (adjustedChordY > closestNoteY)) {
            closestNoteY = adjustedChordY;
        }
    }

    // Convert that to y location of the first note in this beam group.
    let firstY = closestNoteY - displayedSlope * startingX + (shouldBeAbove ? -2 : 2) * staffLineHeight;

    // Lastly create the line equation (y = mx + b)
    return {
        getY: (x: number) => displayedSlope*x + firstY,
        isAbove: shouldBeAbove,
    };
}


// =======================
// SVG Component Utilities
// -----------------------

type SizingData = {
    staffHeight: number;
    staffLineHeight: number;
    staffThickness: number;
}

function createSvgChord(sizes: SizingData, labeledNoteGroup: Note[], x: number, clef: Clef, accidentals: Record<Letter, Accidental>, stemTo?: number) {
    return (<SvgChord
        key={ `chord-${x}` }
        clef={ clef }
        x={ x }
        staffLineHeight={ sizes.staffLineHeight }
        strokeWidth={ sizes.staffThickness }
        labeledNoteGroup={ labeledNoteGroup }
        accidentals={ accidentals }
        stemTo={ stemTo }
    ></SvgChord>);
}

function createSvgBeam(sizes: SizingData, beamLine: (x: number) => number, x1: number, x2: number) {
    return (
        <line
            key={ `beam-${x1}-${x2}` }
            x1={ x1 }
            x2={ x2 }
            y1={ beamLine(x1) }
            y2={ beamLine(x2) }
            strokeWidth={ 7*sizes.staffThickness }
            stroke={ 'var(--gray-light)' }
        />
    )
}

function getDisplayedAccidentals(noteGroup: Note[], accidentals: Record<Letter, Accidental>) {
    return noteGroup
        .reduce((obj, note) => {
            const {letter, accidental} = note.getLabel();
            if (accidentals[letter] !== accidental) {
                obj[letter] = accidental;
            }
            return obj;
        }, {} as Record<Letter, Accidental>)
}

/**
 * Computes all beams, notes, and accidentals for the given clef, creating HTML/SVG elements, and adding them to the
 * provided "elements to display" array. Returns the final "x" location after all the elements have been added.
 */
function createClefNotes(sizes: SizingData, clef: Clef, measureClef: Note[][], elementsToDisplay: ReactElement[], currentX: number, originalKeyLetters: Record<Letter, Accidental>): number {
    // For each measure, we need to track which notes are flats/naturals/sharps so we know what to label them.
    // At the start of each measure, they get reset to the flats/naturals/sharps in our key.
    let accidentals = {...originalKeyLetters};

    groupBeamGroups(measureClef).forEach(beamGroup => {
        // Calculate our beam data. If a beam isn't needed, then this data doesn't get used.
        const beamNoteWidth = BASE_NOTE_GAP_RATIO * sizes.staffHeight * beamGroup[0][0].rhythmicValue;
        const beamLine = getBeamLine(beamGroup, clef, currentX, beamNoteWidth, sizes.staffLineHeight);
        let beamStartX = currentX;
        let beamStopX  = currentX;

        // Convert each group to notes and accidentals
        beamGroup.forEach(noteGroup => {
            beamStopX = currentX;
            let chord = createSvgChord(sizes, noteGroup, currentX, clef, accidentals, (beamLine ? beamLine.getY(currentX) : undefined));
            currentX += BASE_NOTE_GAP_RATIO * sizes.staffHeight * noteGroup[0].rhythmicValue;
            elementsToDisplay.push(chord);

            // Update our displayed accidentals for this measure
            let chordAccidentals = getDisplayedAccidentals(noteGroup, accidentals);
            accidentals = {...accidentals, ...chordAccidentals};
        });

        // Render the beam line (if applicable)
        if (beamLine) {
            const noteHeadWidth = NOTE_WIDTH_RATIO * sizes.staffLineHeight;
            beamStartX += (beamLine.isAbove) ? noteHeadWidth : -noteHeadWidth;
            beamStopX  += (beamLine.isAbove) ? noteHeadWidth : -noteHeadWidth;
            elementsToDisplay.push(createSvgBeam(sizes, beamLine.getY, beamStartX, beamStopX));
        }
    });

    return currentX;
}


// ===================
// Our React Component
// -------------------

// These need to add up to 100
const PADDING_RATIO = 20/100; // x2 because top and bottom
const STAFF_RATIO   = 20/100; // x2 because 2 staffs
const GAP_RATIO     = 20/100; // Gap between staffs

// This is relative to the overall grand staff height. Determines gap between WHOLE notes.
const BASE_NOTE_GAP_RATIO = 5 * STAFF_RATIO;

// This is relative to the overall grand staff height.
const BRACE_WIDTH_RATIO = 0.05;

type Params = {
    width: number;
    height: number;
    musicKey: Key;
    timeSignature: TimeSignature;
    music: LabeledMusic[]; // Each element of the array is one measure
};

export default function GrandStaff({ width, height, musicKey, timeSignature, music }: Params) {
    const [ musicXShift, setMusicXShift ] = useState(200);

    const sizes: SizingData = {
        staffHeight: height,
        staffLineHeight: STAFF_RATIO * height / 4,    // The height of one line on the staff.
        staffThickness: 1/100 * STAFF_RATIO * height, // The base thickness of our lines.
    }

    /** Map of a letter to its accidental. */
    const originalKeyLetters: Record<Letter, Accidental> = musicKey.getNoteLabelsInKey()
        .reduce((obj, label) => {
            if (label) obj[label.letter] = label.accidental;
            return obj;
        }, {} as Record<Letter, Accidental>);

    let trebleX = 40;
    let bassX = 40;
    const trebleMusic: ReactElement[] = [];
    const bassMusic: ReactElement[] = [];
    const barLines: ReactElement[] = [];
    music.forEach(measure => {

        // -- Clefs w/ Notes --
        trebleX = createClefNotes(sizes, Clef.TREBLE, measure.trebleClef, trebleMusic, trebleX, originalKeyLetters);
        bassX   = createClefNotes(sizes, Clef.BASS,   measure.bassClef,   bassMusic,   bassX,   originalKeyLetters);

        // -- Bar Lines --
        let barX = Math.max(trebleX, bassX); // treble/bass should be equal, but in case they're not...
        barLines.push((<SvgBarLine
            key={ `bar-${barX}` }
            x={ barX }
            y={ height * PADDING_RATIO }
            height={ height * (2*STAFF_RATIO + GAP_RATIO)}
            strokeWidth={ sizes.staffThickness }
        ></SvgBarLine>));

        // Increment trebleX/bassX to account for the bar line
        trebleX = bassX = barX + 50;
    });

    return (
        <svg viewBox={ `0 0 ${width} ${height}` } style={{ width: `${width}px`, height: `${height}px` }}>
            {/* Brace (to connect the two staffs) */}
            <g transform={ `translate(0 ${height * PADDING_RATIO})` }>
                <SvgBrace
                x={ 0 }
                y={ 0 }
                height={ height * (2*STAFF_RATIO + GAP_RATIO) }
                color="var(--gray-dark)"
                ></SvgBrace>
            </g>

            {/* Treble */}
            <g transform={ `translate(${height * BRACE_WIDTH_RATIO} ${height * PADDING_RATIO})` }>
                <SvgStaff width={ width } height={ height * STAFF_RATIO } strokeWidth={ sizes.staffThickness }></SvgStaff>
                <SvgStaffDefinition
                    clef={ Clef.TREBLE }
                    musicKey={ musicKey }
                    timeSignature={ timeSignature }
                    staffLineHeight={ sizes.staffLineHeight }
                    ></SvgStaffDefinition>

                <g style={{ transform: `translateX(${musicXShift}px)` }}>
                    { trebleMusic }
                </g>
            </g>

            {/* Bass */}
            <g transform={ `translate(${height * BRACE_WIDTH_RATIO} ${height * (PADDING_RATIO + STAFF_RATIO + GAP_RATIO)})` }>
                <SvgStaff width={ width } height={ height * STAFF_RATIO } strokeWidth={ sizes.staffThickness }></SvgStaff>
                <SvgStaffDefinition
                    clef={ Clef.BASS }
                    musicKey={ musicKey }
                    timeSignature={ timeSignature }
                    staffLineHeight={ sizes.staffLineHeight }
                    ></SvgStaffDefinition>

                <g style={{ transform: `translateX(${musicXShift}px)` }}>
                    { bassMusic }
                </g>
            </g>

            {/* Initial, left-most bar line */}
            <g transform={ `translate(${height * BRACE_WIDTH_RATIO} 0)` }>
                <SvgBarLine x={ 0 }
                    y={ height * PADDING_RATIO }
                    height={ height * (2*STAFF_RATIO + GAP_RATIO)}
                    strokeWidth={ sizes.staffThickness }></SvgBarLine>

                {/* Bar lines to separate measures */}
                <g style={{ transform: `translateX(${musicXShift}px)` }}>
                    { barLines }
                </g>
            </g>
        </svg>
    )
}