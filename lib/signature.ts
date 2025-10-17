import {
  DEFAULT_SIGNATURE_BACKGROUND
} from "@/types/signature";
import type { SignatureBackground, SignatureStroke } from "@/types/signature";

type StrokeState = {
  color: string;
  width: number;
  active: boolean;
};

export class SignatureRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private current: StrokeState | null = null;
  private background: SignatureBackground = DEFAULT_SIGNATURE_BACKGROUND;
  private backgroundImage: HTMLImageElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("CanvasRenderingContext2D を取得できませんでした");
    }
    this.ctx = ctx;
    this.reset();
  }

  reset() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyBackground();
    this.current = null;
  }

  draw(stroke: SignatureStroke) {
    const { type, x, y, color, width } = stroke;
    this.configureStroke(color, width);
    switch (type) {
      case "begin": {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.current = { color, width, active: true };
        break;
      }
      case "draw": {
        if (!this.current?.active) {
          this.ctx.beginPath();
          this.ctx.moveTo(x, y);
        }
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.current = { color, width, active: true };
        break;
      }
      case "end": {
        if (this.current?.active) {
          this.ctx.lineTo(x, y);
          this.ctx.stroke();
          this.ctx.closePath();
        }
        this.current = null;
        break;
      }
      default:
        break;
    }
  }

  renderAll(strokes: SignatureStroke[]) {
    this.reset();
    strokes.forEach((stroke) => this.draw(stroke));
    this.current = null;
  }

  drawImageBase64(imageBase64: string) {
    const image = new Image();
    image.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    };
    image.src = imageBase64;
  }

  async setBackground(background: SignatureBackground | null) {
    const target = background ?? DEFAULT_SIGNATURE_BACKGROUND;
    this.background = target;
    this.backgroundImage = null;

    if (target.kind === "image") {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          this.backgroundImage = image;
          this.reset();
          resolve();
        };
        image.onerror = (error) => {
          console.error("背景画像の読み込みに失敗しました", error);
          this.background = DEFAULT_SIGNATURE_BACKGROUND;
          this.backgroundImage = null;
          this.reset();
          reject(error);
        };
        image.src = target.value;
      }).catch(() => {});
    } else {
      this.reset();
    }
  }

  exportPng() {
    return this.canvas.toDataURL("image/png");
  }

  private configureStroke(color: string, width: number) {
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
  }

  private applyBackground() {
    if (this.background.kind === "color") {
      this.ctx.fillStyle = this.background.value;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.backgroundImage) {
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawImageContain(this.backgroundImage);
    } else {
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawImageContain(image: HTMLImageElement) {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const widthRatio = canvasWidth / image.width;
    const heightRatio = canvasHeight / image.height;
    const ratio = Math.min(widthRatio, heightRatio);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    const offsetX = (canvasWidth - drawWidth) / 2;
    const offsetY = (canvasHeight - drawHeight) / 2;
    this.ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  }
}

export function createSignatureRenderer(canvas: HTMLCanvasElement) {
  return new SignatureRenderer(canvas);
}
