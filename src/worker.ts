// Removed local import to avoid Vite bundling issues with worker
// import { env, RawImage, CLIPVisionModel, AutoProcessor } from '@xenova/transformers';

// Load from CDN (ES Module) to bypass bundling
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

let transformers: any = null;

async function loadTransformers() {
  if (!transformers) {
    console.log('[Worker] Importing transformers from CDN...');
    try {
      transformers = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
      
      // Configure Transformers.js
      transformers.env.allowLocalModels = true;
      transformers.env.allowRemoteModels = false;
      transformers.env.localModelPath = '/models/';
      transformers.env.useBrowserCache = true;
      console.log('[Worker] Transformers loaded and configured.');
    } catch (e) {
      console.error('[Worker] Failed to load transformers from CDN:', e);
      throw e;
    }
  }
  return transformers;
}

class VisionPipeline {
  static modelPromise: Promise<any> | null = null;
  static processorPromise: Promise<any> | null = null;

  static async getInstance() {
    const { CLIPVisionModel, AutoProcessor } = await loadTransformers();

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

const embedBatch = async (images: string[]): Promise<number[][]> => {
  console.log(`[Worker] embedBatch: Processing ${images.length} images...`);
  
  // Ensure transformers is loaded
  const { RawImage } = await loadTransformers();
  const [model, processor] = await VisionPipeline.getInstance();

  // Read all images
  console.log('[Worker] Reading images...');
  const processedImages = await Promise.all(images.map(img => RawImage.read(img)));

  // Preprocess images (batch)
  console.log('[Worker] Preprocessing images...');
  const imageInputs = await processor(processedImages);

  // Run model (batch)
  console.log('[Worker] Running model inference...');
  const { image_embeds } = await model(imageInputs);
  console.log('[Worker] Inference complete.');
  
  // Process output
  if (!image_embeds || !image_embeds.data) {
    throw new Error('Model output (image_embeds) is missing or invalid.');
  }

  const rawData = image_embeds.data as Float32Array; 
  const dims = image_embeds.dims;
  
  if (!dims || dims.length < 2) {
    throw new Error(`Invalid output dimensions: ${dims}`);
  }

  const batchSize = dims[0];
  const hiddenSize = dims[1];
  console.log(`[Worker] Output dims: [${batchSize}, ${hiddenSize}]`);
  
  const vectors: number[][] = [];
  for (let i = 0; i < batchSize; i++) {
    const start = i * hiddenSize;
    const end = start + hiddenSize;
    const vec = Array.from(rawData.slice(start, end));
    vectors.push(normalize(vec));
  }
  
  return vectors;
};

self.onmessage = async (e) => {
  const { id, type, images, candidatesList } = e.data;
  console.log(`[Worker] Received message: ${type} (ID: ${id})`);

  if (type === 'init') {
    try {
      // Ensure transformers is loaded first
      await loadTransformers();
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
    try {
      console.time(`BatchInference-${id}`);
      console.log('[Worker] Start loading embeddings for batch...');
      const embeddings = await loadEmbeddings();
      console.log('[Worker] Embeddings loaded. Starting batch embedding...');
      const batchVectors = await embedBatch(images);
      console.timeEnd(`BatchInference-${id}`);

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