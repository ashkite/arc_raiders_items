import { env, pipeline } from '@xenova/transformers';
import { ITEMS } from './data/items';

// Configure Transformers.js to use local models
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/'; 

class VisionPipeline {
  static pipePromise: Promise<any> | null = null;

  static async getInstance() {
    if (!this.pipePromise) {
      console.log('Loading CLIP image-feature-extraction pipeline (Xenova/clip-vit-base-patch32)...');
      this.pipePromise = pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', {
        quantized: true,
      });
    }
    return this.pipePromise;
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
    embeddingsPromise = (async () => {
      const res = await fetch('/embeddings.json');
      const json = await res.json() as Record<string, number[]>;
      const normalized: Record<string, number[]> = {};
      Object.entries(json).forEach(([name, vec]) => {
        if (!Array.isArray(vec)) return;
        normalized[name] = normalize(vec as number[]);
      });
      return normalized;
    })();
  }
  return embeddingsPromise;
};

const embedImage = async (image: string | Blob): Promise<number[]> => {
  const extractor = await VisionPipeline.getInstance();
  let imgInput: any = image;
  if (typeof image === 'string') {
    const res = await fetch(image);
    imgInput = await res.blob();
  }

  // Blob -> Uint8Array로 변환해 processor가 이해할 수 있는 포맷으로 전달
  if (imgInput instanceof Blob) {
    const buf = await imgInput.arrayBuffer();
    imgInput = new Uint8Array(buf);
  }

  const inputs = await extractor.processor(imgInput, { return_tensors: 'pt' });
  const { image_embeds } = await extractor.model(inputs);
  const output = { data: image_embeds.data };
  const vec = Array.from(output.data as ArrayLike<number>);
  return normalize(vec);
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

    const embeddings = await loadEmbeddings();
    const queryEmbedding = await embedImage(image);

    const scored = labelsToCheck
      .map((label: string) => {
        const ref = embeddings[label];
        if (!ref) return null;
        return { label, score: cosineSimilarity(queryEmbedding, ref) };
      })
      .filter(Boolean) as { label: string; score: number }[];

    if (scored.length === 0) {
      throw new Error('No embeddings available for candidate labels.');
    }

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
