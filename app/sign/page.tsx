"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignToolbar } from '../../components/SignToolbar';
import { SignaturePreview } from '../../components/SignaturePreview';
import { type SignatureStreamMessage, type StrokeCommand } from '../../types/signature';
import { downloadDataUrlPng, normalizePointerPosition, SignatureRenderer } from '../../lib/signature';
import { useSignaling } from '../../lib/signaling';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  SignatureEventMessage
} from '../../types/signaling';

const ROLE = 'sign';

function createStrokeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function SignPageContent() {
  const params = useSearchParams();
  const roomId = params.get('room') ?? '';
  const token = params.get('token') ?? '';

  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(6);
  const [statusMessage, setStatusMessage] = useState('接続準備中…');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const rendererRef = useRef<SignatureRenderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendRef = useRef<(message: ClientToServerMessage) => void>(() => {});
  const pointers = useRef<Map<number, string>>(new Map());

  const canConnect = Boolean(roomId) && Boolean(token) && rendererReady;

  const emitSignatureEvent = useCallback(
    (event: SignatureStreamMessage) => {
      sendRef.current({
        kind: 'signature-event',
        roomId,
        event
      } satisfies SignatureEventMessage);
    },
    [roomId]
  );

  const handleMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.kind) {
        case 'joined':
          setStatusMessage('接続済み - サインを開始できます');
          break;
        case 'peer-joined':
          setStatusMessage('接続済み');
          break;
        case 'signature-event':
          if (rendererRef.current && message.source !== ROLE) {
            rendererRef.current.handleEvent(message.event);
          }
          break;
        case 'final-sign':
          if (rendererRef.current && message.source !== ROLE) {
            await rendererRef.current.drawImage(message.image);
          }
          break;
        case 'error':
          setStatusMessage(`エラー: ${message.message}`);
          break;
        default:
          break;
      }
    },
    []
  );

  const { send } = useSignaling({
    roomId,
    token,
    role: ROLE,
    onMessage: handleMessage,
    enabled: canConnect
  });

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    return () => {
      if (canConnect) {
        sendRef.current({ kind: 'leave', roomId, role: ROLE });
      }
      rendererRef.current?.unmount();
    };
  }, [canConnect, roomId]);

  const attachPointerHandlers = useCallback(() => {
    if (!rendererReady || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rendererRef.current) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const strokeId = createStrokeId();
      pointers.current.set(event.pointerId, strokeId);
      const point = normalizePointerPosition(event, canvas);
      const payload: StrokeCommand = {
        kind: 'stroke',
        strokeId,
        type: 'begin',
        x: point.x,
        y: point.y,
        color,
        width
      };
      rendererRef.current.handleEvent(payload);
      emitSignatureEvent(payload);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const strokeId = pointers.current.get(event.pointerId);
      if (!strokeId || !rendererRef.current) return;
      event.preventDefault();
      const point = normalizePointerPosition(event, canvas);
      const payload: StrokeCommand = {
        kind: 'stroke',
        strokeId,
        type: 'draw',
        x: point.x,
        y: point.y,
        color,
        width
      };
      rendererRef.current.handleEvent(payload);
      emitSignatureEvent(payload);
    };

    const endStroke = (event: PointerEvent) => {
      const strokeId = pointers.current.get(event.pointerId);
      if (!strokeId || !rendererRef.current) return;
      event.preventDefault();
      const point = normalizePointerPosition(event, canvas);
      const payload: StrokeCommand = {
        kind: 'stroke',
        strokeId,
        type: 'end',
        x: point.x,
        y: point.y,
        color,
        width
      };
      rendererRef.current.handleEvent(payload);
      emitSignatureEvent(payload);
      pointers.current.delete(event.pointerId);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerout', endStroke);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', endStroke);
      canvas.removeEventListener('pointercancel', endStroke);
      canvas.removeEventListener('pointerout', endStroke);
    };
  }, [color, width, emitSignatureEvent, rendererReady]);

  useEffect(() => {
    const detach = attachPointerHandlers();
    return () => {
      detach && detach();
    };
  }, [attachPointerHandlers]);

  const clearCanvas = useCallback(() => {
    if (!rendererRef.current) return;
    rendererRef.current.clear();
    emitSignatureEvent({ kind: 'clear' });
  }, [emitSignatureEvent]);

  const submitFinal = useCallback(async () => {
    if (!rendererRef.current) return;
    setIsSubmitting(true);
    try {
      const dataUrl = rendererRef.current.exportToDataUrl();
      sendRef.current({
        kind: 'final-sign',
        roomId,
        image: dataUrl
      });
      setStatusMessage('確定版を送信しました');
    } finally {
      setIsSubmitting(false);
    }
  }, [roomId]);

  const downloadPreview = useCallback(() => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.exportToDataUrl();
    const filename = `sign_${roomId}_${Date.now()}.png`;
    downloadDataUrlPng(dataUrl, filename);
  }, [roomId]);

  if (!roomId || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
        <h1 className="text-2xl font-semibold">アクセスエラー</h1>
        <p className="text-gray-600">正しいURLでアクセスしてください。</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-gray-50 p-6 shadow-inner">
          <SignaturePreview
            className="max-w-md"
            onRendererReady={(renderer, canvas) => {
              rendererRef.current = renderer;
              canvasRef.current = canvas;
              setRendererReady(Boolean(renderer));
            }}
          />
          <div className="text-sm text-gray-700">{statusMessage}</div>
          <button
            type="button"
            onClick={downloadPreview}
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            PNGプレビュー保存
          </button>
        </div>
        <SignToolbar
          color={color}
          width={width}
          onColorChange={setColor}
          onWidthChange={setWidth}
          onClear={clearCanvas}
          onSubmitFinal={submitFinal}
          isSubmitting={isSubmitting}
        />
      </main>
    </div>
  );
}

export default function SignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-gray-600">
          読み込み中…
        </div>
      }
    >
      <SignPageContent />
    </Suspense>
  );
}
