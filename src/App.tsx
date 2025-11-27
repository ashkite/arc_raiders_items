import { useState, useCallback } from 'react';
import './App.css';
import { createWorker, RecognizeResult } from 'tesseract.js';
import { InventoryImageInput } from './components/InventoryImageInput';
import { ModelLoader } from './components/ModelLoader';
import { ResultTable } from './components/ResultTable';
import { useAiVision } from './hooks/useAiVision';
import { findItemBlobs } from './logic/blobDetector';
import { classifyItems } from './logic/classify';
import { ClassifiedItem } from './types';

function App() {
  const [status, setStatus] = useState('Idle');
  const [results, setResults] = useState<ClassifiedItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading_model' | 'ready' | 'analyzing' | 'error'>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const { analyzeImage, isReady: isVisionReady } = useAiVision();

  // Sync vision readiness with UI status
  if (isVisionReady && modelStatus === 'idle') {
      setModelStatus('ready');
  }

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

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    setResults([]);
    setProgress(0);
    setModelStatus('analyzing');
    
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      const ocrResult = await runGlobalOcr(imageUrl);
      const ocrWords = ocrResult?.data.words || [];

      setStatus('Detecting Inventory Grid...');
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const blobs = findItemBlobs(imageData);
      
      if (blobs.length === 0) {
        setStatus('No items detected. Try a clearer image.');
        setModelStatus('ready');
        return;
      }

      setStatus(`Found ${blobs.length} slots. Analyzing...`);
      
      const rawItems = [];
      let processedCount = 0;

      for (const blob of blobs) {
        const itemCanvas = document.createElement('canvas');
        itemCanvas.width = blob.width;
        itemCanvas.height = blob.height;
        const itemCtx = itemCanvas.getContext('2d')!;
        itemCtx.drawImage(
          canvas, 
          blob.x, blob.y, blob.width, blob.height,
          0, 0, blob.width, blob.height
        );

        const matchedWords = ocrWords.filter(w => {
          const wx = (w.bbox.x0 + w.bbox.x1) / 2;
          const wy = (w.bbox.y0 + w.bbox.y1) / 2;
          return (
            wx >= blob.x && wx <= blob.x + blob.width &&
            wy >= blob.y && wy <= blob.y + blob.height
          );
        });
        
        const hintText = matchedWords.map(w => w.text).join(' ');
        const blobData = await new Promise<Blob | null>(resolve => itemCanvas.toBlob(resolve));
        
        if (blobData) {
          const visionResult = await analyzeImage(blobData, hintText);
          
          if (visionResult) {
            // 수량 파싱 로직은 나중에 고도화 (지금은 1로 고정 혹은 OCR에서 숫자 찾기 시도 가능)
            // 임시로 OCR 힌트에서 숫자 추출 시도
            const qtyMatch = hintText.match(/(\d+)/);
            const qty = qtyMatch ? parseInt(qtyMatch[0], 10) : 1;

            rawItems.push({
              name: visionResult.label,
              qty: qty
            });
          }
        }

        processedCount++;
        setProgress((processedCount / blobs.length) * 100);
      }

      const classified = classifyItems(rawItems);
      setResults(classified);
      setStatus('Analysis Complete');
      setModelStatus('ready');
    };

    img.src = imageUrl;
  }, [isVisionReady, analyzeImage]);

  return (
    <div className="app-container">
      <h1>ARC Raiders Inventory Sorter (Hybrid AI)</h1>
      
      <ModelLoader status={modelStatus} progress={null} />

      <InventoryImageInput 
        file={selectedFile}
        previewUrl={previewUrl}
        loading={modelStatus === 'analyzing'}
        progress={progress / 100}
        onFileSelect={handleFileSelect}
        onReanalyze={() => { console.log("Reanalyze not implemented in simplified App"); }} 
      />

      <div className="status-bar">
        <p>Status: {status}</p>
        {progress > 0 && progress < 100 && (
          <progress value={progress} max="100" />
        )}
      </div>

      <ResultTable items={results} />
    </div>
  );
}

export default App;
