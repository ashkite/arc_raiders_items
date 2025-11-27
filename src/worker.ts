import { pipeline, env } from '@xenova/transformers';
import { ITEMS } from './data/items';

// Skip local model checks for browser usage
env.allowLocalModels = false;

// Singleton for the pipeline
class VisionPipeline {
  static instance: any = null;

  static async getInstance() {
    if (!this.instance) {
      console.log('Loading CLIP model...');
      // Using a smaller, faster model suitable for browser
      this.instance = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
    }
    return this.instance;
  }
}

self.onmessage = async (e) => {
  const { id, image, candidateLabels } = e.data;

  try {
    const classifier = await VisionPipeline.getInstance();

    // Optimization: Use provided candidate labels if available and valid,
    // otherwise fallback to the full database.
    const labelsToCheck = (candidateLabels && candidateLabels.length > 0) 
      ? candidateLabels 
      : ITEMS.map(item => item.name);

    // Run inference
    const output = await classifier(image, labelsToCheck);

    // Sort results by score
    const sorted = output.sort((a: any, b: any) => b.score - a.score);

    // Send back the best match
    self.postMessage({
      id,
      status: 'success',
      result: sorted[0], // { label: string, score: number }
      candidatesUsed: labelsToCheck.length // Debug info
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
