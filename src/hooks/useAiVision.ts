import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoundingBox, getItemSlots, cropItemSlots } from '../logic/blobDetector';
import { ITEMS_DB } from '../data/items';

interface AnalysisResult {
  imageUrl: string;
  topLabel: string;
  score: number;
  candidates?: { label: string; score: number }[];
}

export function useAiVision() {
  // ... (state definitions)
  const [status, setStatus] = useState<'idle' | 'loading_model' | 'ready' | 'analyzing' | 'error'>('idle');
  const [progress, setProgress] = useState<{ file: string; progress: number; status: string } | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const workerRef = useRef<Worker | null>(null);

  const labels = useMemo(() => Object.keys(ITEMS_DB), []);

  // ... (useEffect worker setup)
  useEffect(() => {
    const worker = new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module'
    });

    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, data, result, id } = e.data;

      if (type === 'progress') {
        setStatus('loading_model');
        setProgress(data);
      } else if (type === 'ready') {
        setStatus('ready');
        setProgress(null);
      } else if (type === 'result') {
        if (Array.isArray(result) && result.length > 0) {
          const topMatch = result[0];
          setResults(prev => {
            const newResults = [...prev];
            if (newResults[id]) {
              newResults[id] = {
                ...newResults[id],
                topLabel: topMatch.label,
                score: topMatch.score,
                candidates: result
              };
            }
            return newResults;
          });
        }
        setStatus('ready');
      } else if (type === 'error') {
        console.error("AI Worker Error:", e.data.error);
        setStatus('error');
      }
    };

    worker.postMessage({ type: 'load' });

    return () => {
      worker.terminate();
    };
  }, []);

  // analyzeImage 수정: threshold 또는 manualBlobs를 받음
  const analyzeImage = useCallback(async (file: File, options?: { threshold?: number, manualBlobs?: BoundingBox[] }) => {
    if (!workerRef.current) return;
    
    setStatus('analyzing');
    setResults([]); // 초기화

    try {
      let blobs: BoundingBox[] = [];

      if (options?.manualBlobs && options.manualBlobs.length > 0) {
        // 수동 박스가 있으면 그것만 사용
        blobs = options.manualBlobs;
        console.log(`Using ${blobs.length} manual slots.`);
      } else {
        // 없으면 자동 감지
        const threshold = options?.threshold ?? 100;
        blobs = await getItemSlots(file, threshold);
        console.log(`Detected ${blobs.length} item slots (Auto, threshold ${threshold}).`);
      }
      
      if (blobs.length === 0) {
        console.warn("No items detected.");
        setStatus('ready');
        return;
      }

      // 2. 좌표대로 이미지를 자릅니다.
      const itemImages = await cropItemSlots(file, blobs, 168); // 다운스케일로 속도 개선

      // 3. 각 조각 이미지를 워커(CLIP)에게 보냅니다.
      itemImages.forEach((imgUrl, idx) => {
        setResults(prev => [...prev, { imageUrl: imgUrl, topLabel: "Analyzing...", score: 0 }]);

        workerRef.current?.postMessage({
          type: 'analyze',
          image: imgUrl,
          labels: labels,
          id: idx
        });
      });

    } catch (err) {
      console.error("Vision Analysis Failed:", err);
      setStatus('error');
    }
  }, [labels]);

  return { analyzeImage, status, progress, results };
}
