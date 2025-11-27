import { useState, useEffect, useCallback, useRef } from 'react';
import { ITEMS } from '../data/items';

interface AnalysisResult {
  label: string;
  score: number;
}

// Levenshtein Distance Helper
function levenshteinDistance(a: string, b: string): number {
  const matrix = [];
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
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export const useAiVision = () => {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const pendingPromises = useRef<Map<string, (result: any) => void>>(new Map());

  useEffect(() => {
    const w = new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module',
    });

    w.onmessage = (e) => {
      const { id, status, result, error } = e.data;
      const resolver = pendingPromises.current.get(id);
      
      if (resolver) {
        if (status === 'success') {
          resolver(result);
        } else {
          console.error(error);
          resolver(null);
        }
        pendingPromises.current.delete(id);
      }
    };

    setWorker(w);
    setIsReady(true);

    return () => w.terminate();
  }, []);

  const analyzeImage = useCallback(async (
    imageBlob: Blob, 
    hintText: string = ''
  ): Promise<AnalysisResult | null> => {
    if (!worker || !isReady) return null;

    const id = Math.random().toString(36).substring(7);
    const imageUrl = URL.createObjectURL(imageBlob);

    // --- Candidate Filtering Logic ---
    let candidateLabels: string[] = [];
    
    if (hintText && hintText.length > 2) {
      const cleanHint = hintText.toLowerCase().trim();
      
      // Calculate similarity for all items
      const scoredItems = ITEMS.map(item => {
        const dist = levenshteinDistance(cleanHint, item.name.toLowerCase());
        // Normalize score: lower distance is better. 
        // Simple heuristic: match if distance is small relative to string length
        return { name: item.name, dist };
      });

      // Sort by distance (ascending)
      scoredItems.sort((a, b) => a.dist - b.dist);

      // Strategy:
      // 1. Exact/Near Match: If dist <= 2, trust it highly.
      // 2. Ambiguous: Take top 10 closest matches.
      // 3. No Match: If all distances are high, fallback to full list (empty array)
      
      if (scoredItems[0].dist <= 2) {
        // Very strong match, limit to top 3 to verify
        candidateLabels = scoredItems.slice(0, 3).map(i => i.name);
      } else {
        // Fuzzy match, try top 10
        candidateLabels = scoredItems.slice(0, 10).map(i => i.name);
      }
      
      console.log(`[Optimization] OCR Hint: "${hintText}" -> Candidates:`, candidateLabels);
    }
    // -------------------------------

    return new Promise((resolve) => {
      pendingPromises.current.set(id, resolve);
      worker.postMessage({ 
        id, 
        image: imageUrl,
        candidateLabels // Pass filtered list to worker
      });
    });
  }, [worker, isReady]);

  return { analyzeImage, isReady };
};