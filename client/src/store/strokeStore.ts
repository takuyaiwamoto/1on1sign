import { Stroke, StrokeEvent } from '../lib/types';

export interface StrokeState {
  strokes: Stroke[];
  undone: Stroke[];
}

export class StrokeStore {
  private state: StrokeState = { strokes: [], undone: [] };

  get snapshot(): StrokeState {
    return {
      strokes: this.state.strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] })),
      undone: this.state.undone.map((stroke) => ({ ...stroke, points: [...stroke.points] }))
    };
  }

  apply(event: StrokeEvent) {
    switch (event.type) {
      case 'stroke:start':
        this.state.strokes = [...this.state.strokes, cloneStroke(event.stroke)];
        this.state.undone = [];
        break;
      case 'stroke:move':
      case 'stroke:end':
        this.state.strokes = this.state.strokes.map((stroke) =>
          stroke.id === event.stroke.id ? cloneStroke(event.stroke) : stroke
        );
        break;
      case 'undo': {
        const stroke = this.state.strokes.find((item) => item.id === event.stroke.id);
        if (stroke) {
          this.state.strokes = this.state.strokes.filter((item) => item.id !== stroke.id);
          this.state.undone = [...this.state.undone, cloneStroke(stroke)];
        }
        break;
      }
      case 'redo': {
        const stroke = this.state.undone.find((item) => item.id === event.stroke.id);
        if (stroke) {
          this.state.undone = this.state.undone.filter((item) => item.id !== stroke.id);
          this.state.strokes = [...this.state.strokes, cloneStroke(stroke)];
        }
        break;
      }
      case 'clear':
        this.state.undone = [...this.state.undone, ...this.state.strokes.map((stroke) => cloneStroke(stroke))];
        this.state.strokes = [];
        break;
      default:
        break;
    }
  }
}

function cloneStroke(stroke: Stroke): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point }))
  };
}
