import { useState, useEffect, useRef, useCallback } from 'react';
import { ITEMS_DB } from '../data/items';
import { detectItemSlots } from '../logic/blobDetector';

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

  const analyzeImage = useCallback(async (file: File) => {
    if (!workerRef.current) return;
    
    setStatus('analyzing');
    setResults([]); // 초기화

    try {
      // 1. 이미지에서 아이템 슬롯(Blob)들을 잘라냅니다.
      const itemImages = await detectItemSlots(file);
      
      if (itemImages.length === 0) {
        console.warn("No items detected via blob detection.");
        setStatus('ready');
        return;
      }

      console.log(`Detected ${itemImages.length} item slots. analyzing...`);

      // 2. 각 조각 이미지를 워커(CLIP)에게 보냅니다.
      itemImages.forEach((imgUrl, idx) => {
        // 결과 매핑을 위해 임시 저장소를 쓸 수도 있지만, 
        // 워커 메시지(id)를 인덱스로 써서 나중에 합치는 방식이 간단함.
        // 하지만 여기서는 setResults에서 imgUrl을 참조할 수 없으므로, 
        // 워커에게 imgUrl을 보냈다가 다시 돌려받거나(비효율적),
        // 별도 상태로 관리해야 함.
        // 가장 쉬운 방법: results 상태에 미리 placeholder를 만들어두고 채워넣기.
        
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

  // 워커 메시지 핸들러 수정 필요: id(idx)를 이용해서 results 업데이트
  // 하지만 useEffect 안이라서 itemImages에 접근 불가.
  // 따라서, 위에서 setResults로 이미지를 미리 넣어두고, 여기서는 id(인덱스)로 찾아서 업데이트하는 방식 사용.
  
  return { analyzeImage, status, progress, results };
}
