import { useState, useEffect, useRef, useCallback } from 'react';
import { ITEMS_DB } from '../data/items';
import { getItemSlots, cropItemSlots } from '../logic/blobDetector';

interface AnalysisResult {
  imageUrl: string;
  topLabel: string;
  score: number;
}

export function useAiVision() {
  const [status, setStatus] = useState<'idle' | 'loading_model' | 'ready' | 'analyzing' | 'error'>('idle');
  const [progress, setProgress] = useState<{ file: string; progress: number; status: string } | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const workerRef = useRef<Worker | null>(null);

  // CLIP에게 물어볼 후보군 (DB에 있는 모든 아이템 이름)
  const labels = Object.keys(ITEMS_DB);

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
        // result: [{ label: "Assorted Seeds", score: 0.95 }, ...]
        if (Array.isArray(result) && result.length > 0) {
          const topMatch = result[0];
          
          setResults(prev => {
            // id는 인덱스로 사용됨
            const newResults = [...prev];
            if (newResults[id]) {
              newResults[id] = {
                ...newResults[id], // 이미 imageUrl은 있음
                topLabel: topMatch.label,
                score: topMatch.score
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

  const analyzeImage = useCallback(async (file: File, threshold: number = 100) => {
    if (!workerRef.current) return;
    
    setStatus('analyzing');
    setResults([]); // 초기화

    try {
      // 1. 이미지에서 아이템 슬롯(Blob) 좌표를 찾습니다.
      const blobs = await getItemSlots(file, threshold);
      
      if (blobs.length === 0) {
        console.warn("No items detected via blob detection.");
        setStatus('ready');
        return;
      }
      
      console.log(`Detected ${blobs.length} item slots with threshold ${threshold}. analyzing...`);

      // 2. 좌표대로 이미지를 자릅니다.
      const itemImages = await cropItemSlots(file, blobs);

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
