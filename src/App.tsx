import { useState, useCallback, useEffect } from 'react';
import { ChevronRight, Activity } from 'lucide-react';
import { createWorker, RecognizeResult } from 'tesseract.js';
import { Layout } from './components/Layout';
import { InventoryImageInput } from './components/InventoryImageInput';
import { InventoryTextInput } from './components/InventoryTextInput';
import { ModelLoader } from './components/ModelLoader';
import { ResultTable } from './components/ResultTable';
import { useAiVision } from './hooks/useAiVision';
import { findItemBlobs } from './logic/blobDetector';
import { classifyItems } from './logic/classify';
import { ClassifiedItem } from './types';

function App() {
  const [status, setStatus] = useState('준비됨');
  const [results, setResults] = useState<ClassifiedItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading_model' | 'ready' | 'analyzing' | 'error'>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string>(""); // 진행 상황 로그

  const { analyzeImage, isReady: isVisionReady } = useAiVision();

  // Sync vision readiness
  if (isVisionReady && modelStatus === 'idle') {
      setModelStatus('ready');
  }

  const addLog = (msg: string) => {
    setDebugLog(prev => prev + `[${new Date().toLocaleTimeString()}] ${msg}\n`);
    setStatus(msg);
  };

  const runGlobalOcr = async (imageUrl: string): Promise<RecognizeResult | null> => {
    addLog('전체 OCR 실행 중...');
    try {
      const worker = await createWorker('eng');
      const ret = await worker.recognize(imageUrl);
      await worker.terminate();
      return ret;
    } catch (e) {
      console.error("OCR Failed", e);
      addLog('OCR 실패');
      return null;
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!isVisionReady) {
      alert('AI 모델 로딩 중입니다. 잠시만 기다려주세요.');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    setResults([]);
    setProgress(0);
    setModelStatus('analyzing');
    setDebugLog("---\n");
    
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      // 1. OCR
      const ocrResult = await runGlobalOcr(imageUrl);
      const ocrWords = ocrResult?.data.words || [];
      addLog(`OCR 완료: ${ocrWords.length}개 단어 감지`);

      // 2. Grid Detection
      addLog('인벤토리 그리드 감지 중...');
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const blobs = findItemBlobs(imageData);
      
      if (blobs.length === 0) {
        addLog('아이템 슬롯 감지 실패. 이미지가 너무 어둡거나 작습니다.');
        setModelStatus('ready');
        return;
      }

      addLog(`${blobs.length}개 슬롯 감지됨. AI 정밀 분석 시작...`);
      
      const rawItems = [];
      let processedCount = 0;

      // 3. Hybrid Analysis
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

        // Find hint text
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
            const qtyMatch = hintText.match(/(\d+)/);
            const qty = qtyMatch ? parseInt(qtyMatch[0], 10) : 1;

            rawItems.push({
              name: visionResult.label,
              qty: qty
            });
          }
        }

        processedCount++;
        const currentProgress = (processedCount / blobs.length) * 100;
        setProgress(currentProgress);
      }

      // 4. Finalize
      const classified = classifyItems(rawItems);
      setResults(classified);
      
      // Generate summary log
      const summary = classified.map(i => `- ${i.name} (x${i.qty}) : ${i.action}`).join('\n');
      addLog(`분석 완료. ${classified.length}개 아이템 식별됨.\n\n[결과 요약]\n${summary}`);
      
      setStatus('분석 완료');
      setModelStatus('ready');
    };

    img.src = imageUrl;
  }, [isVisionReady, analyzeImage]);

  return (
    <Layout>
      <ModelLoader status={modelStatus} progress={null} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input & Log */}
        <div className="flex flex-col gap-6">
          
          {/* Section 1: Upload */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-500 text-neutral-950 flex items-center justify-center text-xs font-bold">1</div>
              스크린샷 업로드
            </h2>
            <InventoryImageInput 
              file={selectedFile}
              previewUrl={previewUrl}
              loading={modelStatus === 'analyzing'}
              progress={progress / 100}
              onFileSelect={handleFileSelect}
              onReanalyze={() => alert('재분석 기능은 준비 중입니다.')} 
            />
          </section>

          <div className="flex justify-center text-neutral-600">
            <ChevronRight className="rotate-90 lg:rotate-0 w-6 h-6" />
          </div>

          {/* Section 2: Process Log */}
          <section className="space-y-3 flex-1">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-neutral-700 text-neutral-300 flex items-center justify-center text-xs font-bold">2</div>
              분석 로그
            </h2>
            <InventoryTextInput 
              text={debugLog} 
              onChange={setDebugLog} 
            />
             <div className="text-xs text-neutral-500 flex items-center gap-2 mt-2">
               <Activity className="w-4 h-4" />
               <span>상태: {status}</span>
               {progress > 0 && progress < 100 && (
                 <span className="text-amber-500 font-mono">({Math.round(progress)}%)</span>
               )}
             </div>
          </section>
        </div>

        {/* Right Column: Result */}
        <div className="flex flex-col gap-6">
          <section className="space-y-3 h-full flex flex-col">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-neutral-700 text-neutral-300 flex items-center justify-center text-xs font-bold">3</div>
              분류 결과
            </h2>
            <div className="flex-1">
              <ResultTable items={results} />
            </div>
          </section>
        </div>

      </div>
    </Layout>
  );
}

export default App;