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
      console.log('Loading CLIP model from local resources...');
      
      // 이 모델 이름이 '/models/' + 'Xenova/clip-vit-base-patch32' 경로와 매핑됨
      this.instance = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
          quantized: true,
      });
    }
    return this.instance;
  }
}

self.onmessage = async (e) => {
  const { id, image, candidateLabels } = e.data;

  try {
    const classifier = await VisionPipeline.getInstance();

    const labelsToCheck = (candidateLabels && candidateLabels.length > 0) 
      ? candidateLabels 
      : ITEMS.map((item: any) => item.name);

    const output = await classifier(image, labelsToCheck);

    const sorted = output.sort((a: any, b: any) => b.score - a.score);

    self.postMessage({
      id,
      status: 'success',
      result: sorted[0], 
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