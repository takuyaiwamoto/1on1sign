import { CANVAS_HEIGHT, CANVAS_WIDTH, type SignatureStreamMessage, type StrokeCommand } from '../types/signature';

type Point = { x: number; y: number };

function getStrokeKey(stroke: StrokeCommand): string {
  return stroke.strokeId;
}

export class SignatureRenderer {
  private ctx: CanvasRenderingContext2D;
  private lastPoints = new Map<string, Point>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('CanvasRenderingContext2D unavailable');
    }

    this.ctx = ctx;
    this.hydrateCanvas();
  }

  hydrateCanvas(): void {
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.ctx.scale(1, 1);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  handleEvent(event: SignatureStreamMessage): void {
    if (event.kind === 'clear') {
      this.clear();
      return;
    }

    this.drawStroke(event);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.lastPoints.clear();
  }

  private drawStroke(stroke: StrokeCommand): void {
    const key = getStrokeKey(stroke);
    const last = this.lastPoints.get(key);

    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;

    if (stroke.type === 'begin' || !last) {
      this.ctx.beginPath();
      this.ctx.moveTo(stroke.x, stroke.y);
      this.lastPoints.set(key, { x: stroke.x, y: stroke.y });
      return;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(last.x, last.y);
    this.ctx.lineTo(stroke.x, stroke.y);
    this.ctx.stroke();

    if (stroke.type === 'end') {
      this.lastPoints.delete(key);
    } else {
      this.lastPoints.set(key, { x: stroke.x, y: stroke.y });
    }
  }

  exportToDataUrl(): string {
    return this.canvas.toDataURL('image/png');
  }

  async drawImage(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        this.ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        this.lastPoints.clear();
        resolve();
      };
      img.onerror = (error) => reject(error);
      img.src = dataUrl;
    });
  }

  unmount(): void {
    this.lastPoints.clear();
  }
}

export function normalizePointerPosition(
  event: PointerEvent,
  canvas: HTMLCanvasElement
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

export function downloadDataUrlPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
