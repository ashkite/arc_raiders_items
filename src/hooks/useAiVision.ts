import { useState, useEffect, useCallback } from 'react';
import { ITEMS } from '../data/items';

interface AnalysisResult {
  label: string;
  score: number;
}

// Levenshtein Distance Helper
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, 
          Math.min(
            matrix[i][j - 1] + 1, 
            matrix[i - 1][j] + 1 
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// --- Worker Singleton ---
let globalWorker: Worker | null = null;
const workerPendingPromises = new Map<string, (result: any) => void>();

function getWorker(): Worker {
  if (!globalWorker) {
    globalWorker = new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module',
    });

    globalWorker.onmessage = (e) => {
      const { id, status, result, error } = e.data;

      // Handle initialization ready message
      if (status === 'ready') {
        console.log("[AiVision] Model pre-loaded and ready.");
        return;
      }

      const resolver = workerPendingPromises.get(id);
      
      if (resolver) {
        if (status === 'success') {
          resolver(result);
        } else {
          console.error(error);
          resolver(null);
        }
        workerPendingPromises.delete(id);
      }
    };
    
    console.log("[AiVision] Worker initialized (Singleton)");
  }
  return globalWorker;
}

export const useAiVision = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const w = getWorker();
    // Pre-load model immediately
    w.postMessage({ type: 'init', id: 'init-sequence' });
    setIsReady(true);
  }, []);

  const analyzeImage = useCallback(async (
    imageBlob: Blob, 
    hintText: string = ''
  ): Promise<AnalysisResult | null> => {
    
    // --- 1. Fast Path: OCR-based Bypass ---
    // 텍스트가 명확하면 무거운 AI Vision 모델을 돌리지 않고 바로 결과를 반환합니다.
    if (hintText && hintText.length >= 3) {
      const cleanHint = hintText.toLowerCase().trim();
      
      // A. 단순 포함/일치 검색 (이름 + 별칭)
      const exactMatch = ITEMS.find(item => 
        item.name.toLowerCase() === cleanHint || (item.aliases || []).some((a: string) => a.toLowerCase() === cleanHint)
      );
      if (exactMatch) {
        return { label: exactMatch.name, score: 1.0 };
      }

      // B. Levenshtein 거리 계산 (오타 보정)
      const scoredItems = ITEMS.map((item: any) => {
        const candidates = [item.name.toLowerCase(), ...(item.aliases || []).map((a: string) => a.toLowerCase())];
        const dist = Math.min(...candidates.map((c: string) => levenshteinDistance(cleanHint, c)));
        return { name: item.name, dist };
      });

      scoredItems.sort((a: any, b: any) => a.dist - b.dist);

      // 거리가 2 이하(매우 유사)면 신뢰하고 반환
      if (scoredItems[0].dist <= 2) {
         const len = scoredItems[0].name.length;
         if (len > 4 || scoredItems[0].dist <= 1) {
            return { label: scoredItems[0].name, score: 0.95 };
         }
      }
    }
    // ---------------------------------------

    // --- 2. Slow Path: AI Vision Model ---
    const worker = getWorker();
    const id = Math.random().toString(36).substring(7);
    const imageUrl = URL.createObjectURL(imageBlob);

    let candidateLabels: string[] = [];
    
    // AI에게 줄 후보군을 OCR 텍스트로 좁힘 (속도 향상)
    if (hintText && hintText.length > 2) {
      const cleanHint = hintText.toLowerCase().trim();
      const scoredItems = ITEMS.map((item: any) => {
        const candidates = [item.name.toLowerCase(), ...(item.aliases || []).map((a: string) => a.toLowerCase())];
        const dist = Math.min(...candidates.map((c: string) => levenshteinDistance(cleanHint, c)));
        return { name: item.name, dist };
      });
      scoredItems.sort((a: any, b: any) => a.dist - b.dist);
      
      // 상위 5~10개만 후보로 전달
      candidateLabels = scoredItems.slice(0, 10).map((i: any) => i.name);
    }

    return new Promise((resolve) => {
      workerPendingPromises.set(id, resolve);
      worker.postMessage({ 
        id, 
        image: imageUrl,
        candidateLabels 
      });
    });
  }, []);

  return { analyzeImage, isReady };
};
