import { useState, useEffect, useCallback } from 'react';
import { ITEMS } from '../data/items';
// @ts-ignore
import VisionWorker from '../worker?worker';

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

// Helper to convert Blob to Data URL (Base64)
const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Worker Singleton ---
let globalWorker: Worker | null = null;
const workerPendingPromises = new Map<string, (result: any) => void>();

function getWorker(): Worker {
  if (!globalWorker) {
    globalWorker = new VisionWorker();

    globalWorker!.onerror = (error) => {
      console.error("[AiVision] Worker Error Details:", {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        error: error.error
      });
    };

  // Update worker message handler to handle 'results' property
    globalWorker!.onmessage = (e) => {
      const { id, status, result, results, error } = e.data;

      // Handle initialization ready message
      if (status === 'ready') {
        console.log("[AiVision] Model pre-loaded and ready.");
        return;
      }

      const resolver = workerPendingPromises.get(id);
      
      if (resolver) {
        if (status === 'success') {
          // Support both single result and batch results
          resolver(results || result);
        } else {
          console.error(error);
          resolver(null);
        }
        workerPendingPromises.delete(id);
      }
    };
    
    console.log("[AiVision] Worker initialized (Singleton)");
  }
  return globalWorker as Worker;
}

type ReadyState = 'idle' | 'loading' | 'ready' | 'error';

export const useAiVision = () => {
  const [readyState, setReadyState] = useState<ReadyState>('idle');
  const [readyError, setReadyError] = useState<string | null>(null);

  useEffect(() => {
    const w = getWorker();
    setReadyState('loading');
    setReadyError(null);
    const handleReady = (e: MessageEvent) => {
      if (e.data?.status === 'ready') {
        setReadyState('ready');
      }
      if (e.data?.status === 'error') {
        console.error('[AiVision] Worker failed to initialize', e.data.error);
        setReadyState('error');
        setReadyError(e.data.error || 'Unknown initialization error');
      }
    };

    // Listen for worker readiness (separate from RPC responses)
    w.addEventListener('message', handleReady);
    w.postMessage({ type: 'init', id: 'init-sequence' });

    return () => {
      w.removeEventListener('message', handleReady);
    };
  }, []);

  const analyzeBatch = useCallback(async (
    items: { imageBlob: Blob; hintText?: string }[]
  ): Promise<(AnalysisResult | null)[]> => {
    
    // 1. Pre-process: Check OCR shortcuts first
    const results: (AnalysisResult | null)[] = new Array(items.length).fill(null);
    const pendingIndices: number[] = [];
    const pendingImages: string[] = [];
    const pendingCandidatesList: string[][] = [];

    for (let i = 0; i < items.length; i++) {
      const { imageBlob, hintText } = items[i];
      
      // --- Fast Path: OCR-based Bypass ---
      if (hintText && hintText.length >= 3) {
        const cleanHint = hintText.toLowerCase().trim();
        
        // A. Exact/Alias Match
        const exactMatch = ITEMS.find(item => 
          item.name.toLowerCase() === cleanHint || (item.aliases || []).some((a: string) => a.toLowerCase() === cleanHint)
        );
        if (exactMatch) {
          results[i] = { label: exactMatch.name, score: 1.0 };
          continue;
        }

        // B. Levenshtein Distance
        const scoredItems = ITEMS.map((item: any) => {
          const candidates = [item.name.toLowerCase(), ...(item.aliases || []).map((a: string) => a.toLowerCase())];
          const dist = Math.min(...candidates.map((c: string) => levenshteinDistance(cleanHint, c)));
          return { name: item.name, dist };
        });
        scoredItems.sort((a: any, b: any) => a.dist - b.dist);

        // High confidence match
        if (scoredItems[0].dist <= 2) {
           const len = scoredItems[0].name.length;
           if (len > 4 || scoredItems[0].dist <= 1) {
              results[i] = { label: scoredItems[0].name, score: 0.95 };
              continue;
           }
        }
      }

      // If no OCR shortcut, add to pending for AI
      pendingIndices.push(i);
      
      // Convert Blob to Base64
      try {
        const base64 = await blobToDataURL(imageBlob);
        pendingImages.push(base64);
        
        // Generate candidates for AI if hint exists but wasn't strong enough
        let candidates: string[] = [];
        if (hintText && hintText.length > 2) {
          const cleanHint = hintText.toLowerCase().trim();
          const scoredItems = ITEMS.map((item: any) => {
            const cands = [item.name.toLowerCase(), ...(item.aliases || []).map((a: string) => a.toLowerCase())];
            const dist = Math.min(...cands.map((c: string) => levenshteinDistance(cleanHint, c)));
            return { name: item.name, dist };
          });
          scoredItems.sort((a: any, b: any) => a.dist - b.dist);
          candidates = scoredItems.slice(0, 10).map((item: any) => item.name);
        }
        pendingCandidatesList.push(candidates);

      } catch (e) {
        console.error(`Failed to convert image at index ${i}`, e);
        // result[i] stays null
      }
    }

    // If nothing to process via AI, return immediately
    if (pendingIndices.length === 0) {
      return results;
    }

    // 2. Batch Process via Worker
    const worker = getWorker();
    const id = Math.random().toString(36).substring(7);

    const workerResult = await new Promise<AnalysisResult[]>((resolve) => {
      workerPendingPromises.set(id, resolve);
      worker.postMessage({ 
        id, 
        type: 'analyze_batch',
        images: pendingImages,
        candidatesList: pendingCandidatesList 
      });
    });

    // 3. Merge results back
    if (workerResult && Array.isArray(workerResult)) {
      workerResult.forEach((res: any, idx) => {
        const originalIndex = pendingIndices[idx];
        // Worker returns array of candidates, take the top one
        if (Array.isArray(res) && res.length > 0) {
            results[originalIndex] = res[0];
        } else if (res && !Array.isArray(res)) {
             // Fallback for legacy/single object return
            results[originalIndex] = res;
        }
      });
    }

    return results;
  }, []);

  return { analyzeBatch, isReady: readyState === 'ready', readyState, readyError };
};