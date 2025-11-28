import { useState, useCallback } from 'react';
import { OcrResult } from '../types';
import { getSharedOcrWorker } from '../logic/ocrWorker';

interface PreprocessOptions {
  scale: number;        // 확대 배율 (2~3 추천)
  blockSize: number;    // Adaptive threshold window size (홀수)
  offset: number;       // 지역 평균 대비 감산 값
  invert: boolean;      // 색상 반전 여부
}

function preprocessImage(file: File, options: PreprocessOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = Math.min(Math.max(options.scale, 1), 4); // 1~4 배 확대 제한
      const blockSize = Math.max(3, options.blockSize | 1); // 홀수 유지
      const offset = options.offset;

      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const gray = new Uint8ClampedArray(canvas.width * canvas.height);

      // 1) Grayscale 변환
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }

      // 2) Integral Image 생성 (빠른 지역 합산)
      const w = canvas.width;
      const h = canvas.height;
      const integral = new Float32Array((w + 1) * (h + 1));
      for (let y = 1; y <= h; y++) {
        let rowSum = 0;
        for (let x = 1; x <= w; x++) {
          const idx = (y - 1) * w + (x - 1);
          rowSum += gray[idx];
          const integralIdx = y * (w + 1) + x;
          integral[integralIdx] = integral[integralIdx - (w + 1)] + rowSum;
        }
      }

      // 3) Adaptive Thresholding (Sauvola/mean 기반 단순 버전)
      const half = Math.floor(blockSize / 2);
      const getIntegral = (x: number, y: number) => integral[y * (w + 1) + x];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const x1 = Math.max(0, x - half);
          const y1 = Math.max(0, y - half);
          const x2 = Math.min(w - 1, x + half);
          const y2 = Math.min(h - 1, y + half);
          const area = (x2 - x1 + 1) * (y2 - y1 + 1);

          const sum =
            getIntegral(x2 + 1, y2 + 1) -
            getIntegral(x1, y2 + 1) -
            getIntegral(x2 + 1, y1) +
            getIntegral(x1, y1);
          const mean = sum / area;

          let val = gray[y * w + x] > mean - offset ? 255 : 0;
          if (options.invert) val = 255 - val;

          const idx = (y * w + x) * 4;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function useOcr() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const processImage = useCallback(async (file: File, options: PreprocessOptions = { scale: 2.5, blockSize: 15, offset: 12, invert: false }): Promise<OcrResult | null> => {
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      const preprocessedImageUrl = await preprocessImage(file, options);

      const worker = await getSharedOcrWorker((m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          setProgress(m.progress);
        }
      });

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await worker.setParameters?.({ tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:xX()[]/-. ' });
      const result = await worker.recognize(preprocessedImageUrl);

      return {
        rawText: result.data.text,
        lines: result.data.lines.map(l => l.text)
      };

    } catch (err) {
      console.error("OCR Error:", err);
      setError("이미지 처리에 실패했습니다.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPreview = useCallback((file: File, options: PreprocessOptions): Promise<string> => {
    return preprocessImage(file, options);
  }, []);

  return { processImage, getPreview, loading, error, progress };
}
