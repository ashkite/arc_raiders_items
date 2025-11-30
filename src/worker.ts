import { env, RawImage, CLIPVisionModel, AutoProcessor } from '@xenova/transformers';
// import { ITEMS } from './data/items'; // Removed to fix worker import error

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

// Configure Transformers.js to use local models
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = true;

class VisionPipeline {
  static modelPromise: Promise<any> | null = null;
  static processorPromise: Promise<any> | null = null;

  static async getInstance() {
    if (!this.modelPromise) {
      console.time('Loading Model');
      console.log(`Loading CLIP vision model (${MODEL_ID})...`);
      this.modelPromise = CLIPVisionModel.from_pretrained(MODEL_ID, {
        quantized: true,
      });
      this.processorPromise = AutoProcessor.from_pretrained(MODEL_ID);
      await Promise.all([this.modelPromise, this.processorPromise]);
      console.timeEnd('Loading Model');
    }
    return Promise.all([this.modelPromise, this.processorPromise]);
  }
}

const normalize = (arr: ArrayLike<number>): number[] => {
  let norm = 0;
  for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(arr, (v) => v / norm);
};

const cosineSimilarity = (a: number[], b: number[]) => {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
};

let embeddingsPromise: Promise<Record<string, number[]>> | null = null;

const loadEmbeddings = async () => {
  if (!embeddingsPromise) {
    console.log('[Worker] Loading embeddings.json...');
    embeddingsPromise = (async () => {
      try {
        const res = await fetch('/embeddings.json');
        if (!res.ok) throw new Error(`Failed to fetch embeddings: ${res.status}`);
        const json = await res.json() as Record<string, number[]>;
        const normalized: Record<string, number[]> = {};
        Object.entries(json).forEach(([name, vec]) => {
          if (!Array.isArray(vec)) return;
          normalized[name] = normalize(vec as number[]);
        });
        console.log(`[Worker] Loaded ${Object.keys(normalized).length} embeddings.`);
        return normalized;
      } catch (e) {
        console.error('[Worker] Failed to load embeddings:', e);
        throw e;
      }
    })();
  }
  return embeddingsPromise;
};

// ... embedBatch function ...

self.onmessage = async (e) => {
  const { id, type, images, candidatesList } = e.data;
  console.log(`[Worker] Received message: ${type} (ID: ${id})`);

  if (type === 'init') {
    // ... existing init logic ...
    try {
      await VisionPipeline.getInstance();
      
      // Warm-up: Run inference on a dummy image to compile shaders/WASM
      try {
        console.time('Warm-up');
        console.log('[Worker] Starting warm-up...');
        // 1x1 pixel black image (base64 png)
        const dummyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        await embedBatch([dummyImage]);
        console.timeEnd('Warm-up');
        console.log('[Worker] Warm-up complete.');
      } catch (e) {
        console.warn('Warm-up failed (non-fatal):', e);
      }

      self.postMessage({ id, status: 'ready' });
    } catch (error) {
      console.error('Worker Init Error:', error);
      self.postMessage({ 
        id, 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Initialization failed' 
      });
    }
    return;
  }

  if (type === 'analyze_batch') {
    // ... existing analyze_batch logic ...
    try {
      console.time(`BatchInference-${id}`);
      console.log('[Worker] Start loading embeddings for batch...');
      const embeddings = await loadEmbeddings();
      console.log('[Worker] Embeddings loaded. Starting batch embedding...');
      const batchVectors = await embedBatch(images);
      console.timeEnd(`BatchInference-${id}`);
      // ... rest of the logic


      const results = batchVectors.map((queryVec, idx) => {
        // Use specific candidates if provided for this image, otherwise use all available embeddings
        const labelsToCheck: string[] = (candidatesList && candidatesList[idx] && candidatesList[idx].length > 0)
          ? candidatesList[idx]
          : Object.keys(embeddings);

        const scored = labelsToCheck
          .map((label: string) => {
            const ref = embeddings[label];
            if (!ref) return null;
            return { label, score: cosineSimilarity(queryVec, ref) };
          })
          .filter(Boolean) as { label: string; score: number }[];

        if (scored.length === 0) return { label: "Unknown", score: 0 };

        scored.sort((a, b) => b.score - a.score);
        return scored[0];
      });

      self.postMessage({
        id,
        status: 'success',
        results: results
      });

    } catch (error) {
      console.error('Worker Batch Error:', error);
      self.postMessage({
        id,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    return;
  }
};
