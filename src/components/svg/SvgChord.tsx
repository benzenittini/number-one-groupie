
import { ReactElement } from "react";
import { Accidental, Clef, Letter, RhythmicValue } from "../../datatypes/BasicTypes";
import { Note } from "../../datatypes/ComplexTypes";

/** Starting with the ledger line below the staff and going upwards for one octave, the Treble Clef's letters. */
const TREBLE_CLEF: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NOTE_COLOR = 'var(--gray-light)';

// Relative to the staffLineHeight
const NOTE_WIDTH_RATIO  = 7/12;
const NOTE_HEIGHT_RATIO = 5/12;

type Params = {
    x: number;
    staffLineHeight: number;
    strokeWidth: number;
    labeledNoteGroup: Note[];
    clef: Clef;
    stemTo?: number; // If set, will draw a stem to the given height. Used for beamed chords where the stem has a variable length.
    accidentals: Record<Letter, Accidental>;
};

function createNoteHead(x: number, y: number, staffLineHeight: number, strokeWidth: number, note: Note) {
    return (<ellipse
        key={ `note-${y}` }
        cx={ x }
        cy={ y }
        rx={ NOTE_WIDTH_RATIO * staffLineHeight }
        ry={ NOTE_HEIGHT_RATIO * staffLineHeight }
        transform={ `rotate(-5 ${staffLineHeight/2} ${staffLineHeight/2}) `}
        style={{ transformOrigin: `${x}px ${y}px`}}
        strokeWidth={ 2*strokeWidth }
        stroke={ NOTE_COLOR }
        fill={ [RhythmicValue.WHOLE, RhythmicValue.HALF].includes(note.rhythmicValue) ? 'transparent' : NOTE_COLOR }
    ></ellipse>);
}
function createNoteStem(noteX: number, noteY: number, stemTo: number | undefined, staffLineHeight: number, strokeWidth: number) {
    // If stemTo is set, use that to determine if it points up/down.
    // Otherwise:
    //     If note is on middle staff line or above, stem is on the left side of the note and points down.
    //     If note is below the middle staff line, stem is on the right side of the note and points up.
    let pointsDown = false;
    if      (stemTo !== undefined)      pointsDown = stemTo > noteY;
    else if (noteY < 2*staffLineHeight) pointsDown = true;

    // Based on the direction of pointing, determine the stem's x, y, and y2 locations.
    let stemX = pointsDown ? noteX - NOTE_WIDTH_RATIO * staffLineHeight : noteX + NOTE_WIDTH_RATIO * staffLineHeight;
    let stemY = noteY;
    let stemY2 = stemTo ?? (pointsDown ? stemY + 3*staffLineHeight : stemY - 3*staffLineHeight);

    return (<line
        key={ `stem-${stemX}-${stemY}` }
        x1={ stemX }
        x2={ stemX }
        y1={ stemY }
        y2={ stemY2 }
        strokeWidth={ 2*strokeWidth }
        stroke={ NOTE_COLOR }
    ></line>)
}

// TODO-ben : Pull this into a separate React SVG file..? Could be useful for displaying the key signature.
function createAccidental(noteX: number, noteY: number, staffLineHeight: number, accidental: Accidental) {
    // Each symbol needs to be moved up or down slightly to properly center them.
    let budge = 0;
    switch (accidental) {
        case Accidental.FLAT:    budge = -3; break;
        case Accidental.NATURAL: budge = 5;  break;
        case Accidental.SHARP:   budge = 3;  break;
    }

    return (<text
        key={ `accidental-${noteX}-${noteY}` }
        x={ noteX - NOTE_WIDTH_RATIO*staffLineHeight - 3 } // -3 is an arbitrary budge factor.
        y={ noteY + budge }
        fill={ NOTE_COLOR }
        fontSize={ 2*staffLineHeight }
        dominantBaseline="middle"
        textAnchor="end"
    >{ accidental }</text>);
}

function getNoteY(labeledNote: Note, clef: Clef, staffLineHeight: number) {
    const baseClefOctave = clef === Clef.BASS ? 2 : 4;
    const label = labeledNote.getLabel();

    // Determine the line/gap the note goes into by:
    // 1.) Using the letter and the clef to determine the base position for this clef. Bass clef is 2 spots lower.
    let basePosition = TREBLE_CLEF.indexOf(label.letter) + ((Clef.BASS === clef) ? -2 : 0);

    // 2.) Adjust based on the "Octave borderline" notes.
    //     Cb should be rendered one octave higher to go with the B below it.
    //     B# should be rendered one octave lower to go with the C above it.
    let octaveAdjustment = 0;
    if (label.letter === 'C' && label.accidental === Accidental.FLAT)  octaveAdjustment = 1;
    if (label.letter === 'B' && label.accidental === Accidental.SHARP) octaveAdjustment = -1;

    // 3.) Use the octave to determine the final shift
    basePosition += ((labeledNote.getOctave() - baseClefOctave + octaveAdjustment) * 7);

    // Determine the y height by using the line/gap for this note
    return (5*staffLineHeight) - (basePosition * staffLineHeight/2);
}

export default function SvgChord({ x, staffLineHeight, strokeWidth, labeledNoteGroup, clef, stemTo, accidentals }: Params) {

    let elements: ReactElement[] = [];
    for (let labeledNote of labeledNoteGroup) {
        const y = getNoteY(labeledNote, clef, staffLineHeight);

        // -- Note Head --
        elements.push(createNoteHead(x, y, staffLineHeight, strokeWidth, labeledNote));

        // -- Note Stem --
        if (labeledNote.rhythmicValue !== RhythmicValue.WHOLE) {
            elements.push(createNoteStem(x, y, stemTo, staffLineHeight, strokeWidth));
        }

        // -- Accidental --
        const displayedAccidental = labeledNote.getLabel().getDisplayedAccidental(accidentals);
        if (displayedAccidental) {
            elements.push(createAccidental(x, y, staffLineHeight, displayedAccidental));
        }
    }

    return (
        <>
            { elements }
        </>
    )
}