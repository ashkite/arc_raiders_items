import { useState, useCallback } from 'react';
import './App.css';
import { createWorker, RecognizeResult } from 'tesseract.js';
import { InventoryImageInput } from './components/InventoryImageInput';
import { ModelLoader } from './components/ModelLoader';
import { ResultTable } from './components/ResultTable';
import { useAiVision } from './hooks/useAiVision';
import { findItemBlobs } from './logic/blobDetector';
import { ItemResult } from './types';

function App() {
  const [status, setStatus] = useState('Idle');
  const [results, setResults] = useState<ItemResult[]>([]);
  const [progress, setProgress] = useState(0);
  
  const { analyzeImage, isReady: isVisionReady } = useAiVision();

  // Global OCR Helper
  const runGlobalOcr = async (imageUrl: string): Promise<RecognizeResult | null> => {
    setStatus('Running Global OCR...');
    try {
      const worker = await createWorker('eng');
      const ret = await worker.recognize(imageUrl);
      await worker.terminate();
      return ret;
    } catch (e) {
      console.error("OCR Failed", e);
      return null;
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!isVisionReady) {
      alert('AI Model is still loading. Please wait.');
      return;
    }

    setResults([]);
    setProgress(0);
    
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      // 1. Run Global OCR to get text context
      const ocrResult = await runGlobalOcr(imageUrl);
      const ocrWords = ocrResult?.data.words || [];

      setStatus('Detecting Inventory Grid...');
      
      // Create canvas to extract pixel data for blob detector
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // 2. Detect Grid Slots (Blobs)
      const blobs = findItemBlobs(imageData);
      
      if (blobs.length === 0) {
        setStatus('No items detected. Try a clearer image.');
        return;
      }

      setStatus(`Found ${blobs.length} slots. Analyzing...`);
      
      const newResults: ItemResult[] = [];
      let processedCount = 0;

      // 3. Hybrid Analysis Loop
      for (const blob of blobs) {
        // A. Crop the slot
        const itemCanvas = document.createElement('canvas');
        itemCanvas.width = blob.width;
        itemCanvas.height = blob.height;
        const itemCtx = itemCanvas.getContext('2d')!;
        itemCtx.drawImage(
          canvas, 
          blob.x, blob.y, blob.width, blob.height,
          0, 0, blob.width, blob.height
        );

        // B. Find OCR Hint for this slot
        // Check which OCR words fall inside this blob's bounding box
        const matchedWords = ocrWords.filter(w => {
          const wx = (w.bbox.x0 + w.bbox.x1) / 2;
          const wy = (w.bbox.y0 + w.bbox.y1) / 2;
          return (
            wx >= blob.x && wx <= blob.x + blob.width &&
            wy >= blob.y && wy <= blob.y + blob.height
          );
        });
        
        const hintText = matchedWords.map(w => w.text).join(' ');

        // C. Convert to Blob for AI
        const blobData = await new Promise<Blob | null>(resolve => itemCanvas.toBlob(resolve));
        
        if (blobData) {
          // D. Run AI with OCR Hint
          const visionResult = await analyzeImage(blobData, hintText);
          
          if (visionResult) {
            newResults.push({
              id: Math.random().toString(),
              name: visionResult.label,
              confidence: visionResult.score,
              // Visual debug: Add detected text
              details: hintText ? `OCR Hint: "${hintText}"` : 'Pure Vision'
            });
          }
        }

        processedCount++;
        setProgress((processedCount / blobs.length) * 100);
        // Update UI iteratively (optional, doing it in batch here for performance)
      }

      setResults(newResults);
      setStatus('Analysis Complete');
    };

    img.src = imageUrl;
  }, [isVisionReady, analyzeImage]);

  return (
    <div className="app-container">
      <h1>ARC Raiders Inventory Sorter (Hybrid AI)</h1>
      
      {!isVisionReady && <ModelLoader />}

      <InventoryImageInput onImageSelect={handleFileSelect} />

      <div className="status-bar">
        <p>Status: {status}</p>
        {progress > 0 && progress < 100 && (
          <progress value={progress} max="100" />
        )}
      </div>

      <ResultTable results={results} />
    </div>
  );
}

export default App;