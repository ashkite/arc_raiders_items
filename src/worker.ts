import { pipeline, env } from '@xenova/transformers';
import { ITEMS } from './data/items';

// Configure Transformers.js to use local models
// Path: /public/models/Xenova/clip-vit-base-patch32/
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/'; 

class VisionPipeline {
  static instance: any = null;

  static async getInstance() {
    if (!this.instance) {
      console.log('Loading CLIP (feature-extraction) model from local resources...');
      
      try {
        console.log('Attempting to load with WebGPU...');
        this.instance = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32', {
          quantized: true,
          // @ts-ignore
          device: 'webgpu',
        } as any);
        console.log('Success: Model loaded with WebGPU');
      } catch (e) {
        console.warn('WebGPU initialization failed, falling back to CPU:', e);
        this.instance = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32', {
          quantized: true,
          device: 'cpu',
        } as any);
        console.log('Success: Model loaded with CPU');
      }
    }
    return this.instance;
  }
}

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255].map(v => v / 255);
};

const seededRandom = (seed: number) => {
  // xorshift32
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
};

const pseudoEmbedding = (name: string, mainColor: string | undefined, dim = 128) => {
  const vec = new Float32Array(dim);
  const color = mainColor ? hexToRgb(mainColor) : [0.5, 0.5, 0.5];
  vec[0] = color[0];
  vec[1] = color[1];
  vec[2] = color[2];

  let seed = 0;
  for (let i = 0; i < name.length; i++) seed += name.charCodeAt(i) * (i + 1);

  for (let i = 3; i < dim; i++) {
    seed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    vec[i] = seededRandom(seed);
  }
  return normalize(vec);
};

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

const REFERENCE_EMBEDDINGS: Record<string, number[]> = ITEMS.reduce((acc, item) => {
  acc[item.name] = pseudoEmbedding(item.name, item.mainColor);
  return acc;
}, {} as Record<string, number[]>);

const embedImage = async (image: string): Promise<number[]> => {
  const extractor = await VisionPipeline.getInstance();
  const output = await extractor(image, { pooling: 'mean', normalize: true });
  const vec = (output?.data as ArrayLike<number>) ?? (Array.isArray(output) ? (output as number[]) : []);
  return normalize(Array.from(vec));
};

self.onmessage = async (e) => {
  const { id, type, image, candidateLabels } = e.data;

  if (type === 'init') {
    try {
      await VisionPipeline.getInstance();
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

  try {
    const labelsToCheck: string[] = (candidateLabels && candidateLabels.length > 0) 
      ? candidateLabels 
      : ITEMS.map((item: any) => item.name);

    const queryEmbedding = await embedImage(image);

    const scored = labelsToCheck.map((label: string) => {
      const ref = REFERENCE_EMBEDDINGS[label] ?? pseudoEmbedding(label, undefined);
      return { label, score: cosineSimilarity(queryEmbedding, ref) };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];

    console.log('Top predictions (cosine):', scored.slice(0, 3));

    self.postMessage({
      id,
      status: 'success',
      result: top,
      candidatesUsed: labelsToCheck.length
    });

  } catch (error) {
    console.error('Worker Error:', error);
    self.postMessage({
      id,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
