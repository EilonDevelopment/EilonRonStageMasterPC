import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { IonButton, IonModal } from '@ionic/react';
import { Rnd } from 'react-rnd';
import { useTranslation } from 'react-i18next';

const PREVIEW_W = 400;
const PREVIEW_H = 300;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const MIN_CROP = 40;

export interface BackgroundImageEditorResult {
  dataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
}

interface BackgroundImageEditorModalProps {
  visible: boolean;
  imageDataUrl: string | null;
  initialCanvasWidth?: number;
  initialCanvasHeight?: number;
  onClose: () => void;
  onSave: (result: BackgroundImageEditorResult) => void;
}

const BackgroundImageEditorModal: FC<BackgroundImageEditorModalProps> = ({
  visible,
  imageDataUrl,
  initialCanvasWidth = 400,
  initialCanvasHeight = 300,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 20, y: 20, w: PREVIEW_W - 40, h: PREVIEW_H - 40 });
  const [canvasW, setCanvasW] = useState<number | string>(initialCanvasWidth);
  const [canvasH, setCanvasH] = useState<number | string>(initialCanvasHeight);
  const [saving, setSaving] = useState(false);

  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth) {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setCrop({ x: 20, y: 20, w: PREVIEW_W - 40, h: PREVIEW_H - 40 });
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setCanvasW(initialCanvasWidth);
      setCanvasH(initialCanvasHeight);
      setZoom(1);
      setCrop({ x: 20, y: 20, w: PREVIEW_W - 40, h: PREVIEW_H - 40 });
    }
  }, [initialCanvasWidth, initialCanvasHeight, visible]);

  const getImageDisplayInfo = useCallback(() => {
    const { w: iw, h: ih } = naturalSize;
    if (iw <= 0 || ih <= 0) return null;
    const scaleFit = Math.min(PREVIEW_W / iw, PREVIEW_H / ih) * zoom;
    const displayW = iw * scaleFit;
    const displayH = ih * scaleFit;
    const offsetX = (PREVIEW_W - displayW) / 2;
    const offsetY = (PREVIEW_H - displayH) / 2;
    return { displayW, displayH, offsetX, offsetY, scaleFit };
  }, [naturalSize, zoom]);

  const applyCrop = useCallback(() => {
    if (!imageDataUrl || !imgRef.current) return;
    const info = getImageDisplayInfo();
    if (!info) return;
    const { offsetX, offsetY, scaleFit } = info;
    const { x: cx, y: cy, w: cw, h: ch } = crop;
    const nx = Math.max(0, (cx - offsetX) / scaleFit);
    const ny = Math.max(0, (cy - offsetY) / scaleFit);
    const nw = Math.min(naturalSize.w - nx, cw / scaleFit);
    const nh = Math.min(naturalSize.h - ny, ch / scaleFit);
    if (nw < 1 || nh < 1) return;

    const img = imgRef.current;
    const canvas = document.createElement('canvas');
    const MAX_OUT = 8000;
    // Export at crop's native resolution (so image stays sharp when displayed large), capped at MAX_OUT
    let outW = Math.round(nw);
    let outH = Math.round(nh);
    const needsScaleDown = Math.max(outW, outH) > MAX_OUT;
    if (needsScaleDown) {
      const scale = MAX_OUT / Math.max(outW, outH);
      outW = Math.max(1, Math.round(outW * scale));
      outH = Math.max(1, Math.round(outH * scale));
    }
    // Integer source rect for pixel-perfect copy (avoids subpixel sampling blur)
    const sx = Math.floor(nx);
    const sy = Math.floor(ny);
    const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(nw)));
    const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(nh)));
    if (sw < 1 || sh < 1) return;
    if (!needsScaleDown) {
      outW = sw;
      outH = sh;
    }
    outW = Math.max(80, outW);
    outH = Math.max(80, outH);
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = needsScaleDown;
    if (needsScaleDown) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL('image/png');
    const displayW = Math.round(Math.max(80, Number(canvasW) || 80));
    const displayH = Math.round(Math.max(80, Number(canvasH) || 80));
    onSave({ dataUrl, canvasWidth: displayW, canvasHeight: displayH });
  }, [imageDataUrl, crop, naturalSize, canvasW, canvasH, getImageDisplayInfo, onSave]);

  const handleSave = () => {
    setSaving(true);
    try {
      applyCrop();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!imageDataUrl) return null;

  const info = getImageDisplayInfo();
  const scaleFit = info ? info.scaleFit : 1;
  const offsetX = info ? info.offsetX : 0;
  const offsetY = info ? info.offsetY : 0;

  return (
    <IonModal
      isOpen={visible}
      onDidDismiss={onClose}
      className="background-image-editor-modal"
    >
      <div className="flex flex-col h-full bg-background p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">{t('Project.EditBackgroundImage') || 'Edit background image'}</h2>
          <IonButton fill="clear" onClick={onClose}>{t('Common.Cancel') || 'Cancel'}</IonButton>
        </div>

        <div className="mb-2">
          <label className="block text-sm mb-1">{t('Project.Zoom') || 'Zoom'}</label>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-xs">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="relative overflow-hidden rounded border border-gray-400 bg-black flex-shrink-0" style={{ width: PREVIEW_W, height: PREVIEW_H }}>
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt=""
            onLoad={onImageLoad}
            className="absolute max-w-none"
            style={{
              width: naturalSize.w * scaleFit,
              height: naturalSize.h * scaleFit,
              left: offsetX,
              top: offsetY,
              pointerEvents: 'none',
            }}
            crossOrigin="anonymous"
          />
          <Rnd
            size={{ width: crop.w, height: crop.h }}
            position={{ x: crop.x, y: crop.y }}
            onDragStop={(_e, d) => setCrop(prev => ({ ...prev, x: d.x, y: d.y }))}
            onResizeStop={(_e, _dir, ref, _delta, pos) => {
              setCrop(prev => ({
                ...prev,
                x: pos.x,
                y: pos.y,
                w: Math.max(MIN_CROP, ref.offsetWidth),
                h: Math.max(MIN_CROP, ref.offsetHeight),
              }));
            }}
            minWidth={MIN_CROP}
            minHeight={MIN_CROP}
            bounds="parent"
            className="cursor-move"
            style={{
              zIndex: 10,
              border: '2px dashed black',
              outline: '2px dashed white',
              outlineOffset: '2px',
            }}
          >
            <div className="w-full h-full bg-transparent" />
          </Rnd>
        </div>
        <p className="text-xs text-gray-500 mt-1">{t('Project.CropHint') || 'Drag to move, drag edges to resize crop area.'}</p>
        <div className="flex gap-2 mt-4">
          <IonButton onClick={onClose} fill="outline">{t('Common.Cancel') || 'Cancel'}</IonButton>
          <IonButton onClick={handleSave} disabled={saving}>{t('Common.Apply') || 'Apply'}</IonButton>
        </div>
      </div>
    </IonModal>
  );
};

export default BackgroundImageEditorModal;
