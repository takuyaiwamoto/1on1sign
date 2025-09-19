import { PDFDocument, rgb } from 'pdf-lib';
import phoneFrameUrl from '../assets/phone-frame.svg';
import { Stroke } from './types';

interface RenderOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  paperColor?: string;
}

const DEFAULT_WIDTH = 2160;
const DEFAULT_HEIGHT = 1440;
const INSET_RATIO = 0.12;

export async function renderSignatureCanvas(strokes: Stroke[], options: RenderOptions = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const backgroundColor = options.backgroundColor ?? '#0f172a';
  const paperColor = options.paperColor ?? '#fef3c7';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const frame = await loadImage(phoneFrameUrl);
  const frameScale = Math.min(width * 0.65 / frame.width, height * 0.9 / frame.height);
  const frameDrawWidth = frame.width * frameScale;
  const frameDrawHeight = frame.height * frameScale;
  const frameX = (width - frameDrawWidth) / 2;
  const frameY = (height - frameDrawHeight) / 2;

  ctx.drawImage(frame, frameX, frameY, frameDrawWidth, frameDrawHeight);

  const innerX = frameX + frameDrawWidth * INSET_RATIO;
  const innerY = frameY + frameDrawHeight * INSET_RATIO;
  const innerWidth = frameDrawWidth * (1 - INSET_RATIO * 2);
  const innerHeight = frameDrawHeight * (1 - INSET_RATIO * 2);

  ctx.fillStyle = paperColor;
  ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

  ctx.save();
  ctx.translate(innerX, innerY);
  drawStrokes(ctx, strokes, innerWidth, innerHeight);
  ctx.restore();

  return { canvas, innerBounds: { x: innerX, y: innerY, width: innerWidth, height: innerHeight } };
}

export async function exportSignaturePng(strokes: Stroke[], options?: RenderOptions) {
  const { canvas } = await renderSignatureCanvas(strokes, options);
  return new Promise<Blob>((resolve) => canvas.toBlob((blob) => blob && resolve(blob), 'image/png', 0.95));
}

export async function exportSignaturePdf(strokes: Stroke[], options?: RenderOptions) {
  const { canvas, innerBounds } = await renderSignatureCanvas(strokes, options);
  const pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => blob && resolve(blob), 'image/png', 0.95));
  if (!pngBlob) throw new Error('PNG出力に失敗しました');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait in points

  const pngArrayBuffer = await pngBlob.arrayBuffer();
  const pngImage = await pdfDoc.embedPng(pngArrayBuffer);
  const maxWidth = 460;
  const scale = Math.min(maxWidth / canvas.width, 1);
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;
  const marginX = (page.getWidth() - drawWidth) / 2;
  const marginY = (page.getHeight() - drawHeight) / 2;

  page.drawRectangle({
    x: marginX,
    y: marginY,
    width: drawWidth,
    height: drawHeight,
    color: rgb(15 / 255, 23 / 255, 42 / 255)
  });

  page.drawImage(pngImage, {
    x: marginX,
    y: marginY,
    width: drawWidth,
    height: drawHeight
  });

  const pdfBytes = await pdfDoc.save();
  const pdfCopy = new Uint8Array(pdfBytes);
  return new Blob([pdfCopy.buffer], { type: 'application/pdf' });
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    const widthScale = width / 800;
    ctx.lineWidth = Math.max(2, stroke.width * widthScale);
    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    ctx.moveTo(first.x * width, first.y * height);
    rest.forEach((point, index) => {
      const prev = index === 0 ? first : rest[index - 1];
      const midX = ((prev?.x ?? first.x) + point.x) / 2 * width;
      const midY = ((prev?.y ?? first.y) + point.y) / 2 * height;
      ctx.quadraticCurveTo((prev?.x ?? first.x) * width, (prev?.y ?? first.y) * height, midX, midY);
    });
    const last = rest[rest.length - 1] ?? first;
    ctx.lineTo(last.x * width, last.y * height);
    ctx.stroke();
    ctx.restore();
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
