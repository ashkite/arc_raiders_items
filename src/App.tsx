import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, Activity } from 'lucide-react';
import { RecognizeResult } from 'tesseract.js';
import { Layout } from './components/Layout';
import { InventoryImageInput } from './components/InventoryImageInput';
import { InventoryTextInput } from './components/InventoryTextInput';
import { ModelLoader } from './components/ModelLoader';
import { ResultTable } from './components/ResultTable';
import { useAiVision } from './hooks/useAiVision';
import { Rect } from './logic/blobDetector';
import { classifyItems } from './logic/classify';
import { ClassifiedItem } from './types';
import { getSharedOcrWorker } from './logic/ocrWorker';

function App() {
  const [status, setStatus] = useState('준비됨');
  const [results, setResults] = useState<ClassifiedItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading_model' | 'ready' | 'analyzing' | 'error'>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string>("");

  // 재분석을 위해 OCR 결과와 이미지 엘리먼트를 보관
  const ocrResultRef = useRef<RecognizeResult | null>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);

  const { analyzeBatch, isReady: isVisionReady, readyState, readyError } = useAiVision();

  const addLog = useCallback((msg: string) => {
    setDebugLog(prev => prev + `[${new Date().toLocaleTimeString()}] ${msg}\n`);
    setStatus(msg);
  }, []);

  // Sync vision readiness
  useEffect(() => {
    if (readyState === 'ready') {
      setModelStatus('ready');
    } else if (readyState === 'loading' && modelStatus === 'idle') {
      setModelStatus('loading_model');
    } else if (readyState === 'error') {
      setModelStatus('error');
      if (readyError) {
        addLog(`AI 모델 초기화 실패: ${readyError}`);
      }
    }
  }, [addLog, readyError, readyState, modelStatus]);

  // 공통 분석 로직 (Blob 리스트 -> AI 분석) with batch parallelism + progressive rendering
  const runAnalysisLoop = async (blobs: Rect[], img: HTMLImageElement, ocrWords: any[]) => {
    if (blobs.length === 0) {
      addLog('분석할 영역이 없습니다.');
      setModelStatus('ready');
      return;
    }

    setModelStatus('analyzing');
    addLog(`${blobs.length}개 슬롯 이미지 추출 및 분석 준비...`);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // 1. Prepare all blob data first
    const preparePromises = blobs.map(async (blob) => {
      // Inner Crop Logic: Crop 12% from each side to remove slot borders
      const cropX = blob.width * 0.12;
      const cropY = blob.height * 0.12;
      const cropW = blob.width - cropX * 2;
      const cropH = blob.height - cropY * 2;

      const itemCanvas = document.createElement('canvas');
      itemCanvas.width = cropW;
      itemCanvas.height = cropH;
      const itemCtx = itemCanvas.getContext('2d')!;
      
      // Draw only the center part of the slot
      itemCtx.drawImage(
        canvas, 
        blob.x + cropX, blob.y + cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      // For OCR search, we still use the original blob area
      const searchMarginBottom = blob.height * 0.6;
      const matchedWords = ocrWords.filter((w: any) => {
        const wx = (w.bbox.x0 + w.bbox.x1) / 2;
        const wy = (w.bbox.y0 + w.bbox.y1) / 2;
        const inX = wx >= blob.x && wx <= blob.x + blob.width;
        const inY = wy >= blob.y && wy <= (blob.y + blob.height + searchMarginBottom);
        return inX && inY;
      });
      
      const hintText = matchedWords.map((w: any) => w.text).join(' ');
      const blobData = await new Promise<Blob | null>(resolve => itemCanvas.toBlob(resolve));
      
      if (!blobData) return null;
      return { imageBlob: blobData, hintText };
    });

    const preparedItems = (await Promise.all(preparePromises)).filter((item): item is { imageBlob: Blob; hintText: string } => item !== null);

    addLog(`${preparedItems.length}개 슬롯 이미지 추출 완료. 분석 시작...`);

    const rawItems: { name: string; qty: number }[] = [];
    let processedCount = 0;
    const BATCH_SIZE = 4; // Reduced batch size for stability

    for (let i = 0; i < preparedItems.length; i += BATCH_SIZE) {
      const chunk = preparedItems.slice(i, i + BATCH_SIZE);
      addLog(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 전송 중 (${chunk.length}개)...`);
      
      try {
        const chunkResults = await analyzeBatch(chunk);
        addLog(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 응답 수신 완료.`);

        chunkResults.forEach((res, idx) => {
          if (!res) return;
          
          const { hintText } = chunk[idx];
          let qty = 1;
          const xMatch = hintText.match(/x\s*(\d+)/i);
          if (xMatch) {
            qty = parseInt(xMatch[1], 10);
          } else {
            const allNumbers = hintText.match(/(\d+)/g);
            if (allNumbers && allNumbers.length > 0) {
              qty = parseInt(allNumbers[allNumbers.length - 1], 10);
            }
          }
          
          rawItems.push({ name: res.label, qty });
        });
      } catch (e) {
        console.error(e);
        addLog(`오류: 배치 ${Math.floor(i / BATCH_SIZE) + 1} 처리 실패`);
      }

      processedCount += chunk.length;
      setProgress((processedCount / preparedItems.length) * 100);

      const classified = classifyItems(rawItems);
      setResults(classified);
    }

    const summary = classifyItems(rawItems).map(i => `- ${i.name} (x${i.qty}) : ${i.action}`).join('\n');
    addLog(`분석 완료.\n[결과 요약]\n${summary}`);
    setStatus('분석 완료');
    setModelStatus('ready');
  };

  const runGlobalOcr = async (imageUrl: string): Promise<RecognizeResult | null> => {
    addLog('전체 OCR 실행 중...');
    try {
      const worker = await getSharedOcrWorker();
      const ret = await worker.recognize(imageUrl);
      return ret as RecognizeResult;
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
    setDebugLog("--- 새 이미지 분석 시작 ---\n");
    setModelStatus('analyzing');
    
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      imgElementRef.current = img; // 저장

      // 1. OCR
      const ocrResult = await runGlobalOcr(imageUrl);
      ocrResultRef.current = ocrResult; // 저장
      const ocrWords = ocrResult?.data.words || [];
      addLog(`OCR 완료: ${ocrWords.length}개 텍스트 영역 감지`);

      // 2. Stop Auto-Run
      // 사용자가 그리드를 확인하고 직접 실행하도록 변경 (정확도 이슈 해결)
      addLog('--------------------------------');
      addLog('이미지 로드가 완료되었습니다.');
      addLog('왼쪽 미리보기에서 [빨간색 박스]가 아이템을 정확히 감싸는지 확인해주세요.');
      addLog('박스가 맞지 않으면 드래그하여 수정하거나 [슬롯 편집 모드]를 사용하세요.');
      addLog("준비가 되면 '현재 설정으로 분석 시작' 버튼을 눌러주세요.");
      addLog('--------------------------------');
      
      setModelStatus('ready');
    };

    img.src = imageUrl;
  }, [isVisionReady, analyzeBatch]);

  // 재분석 핸들러
  const handleReanalyze = useCallback(async (options: { threshold?: number; invert?: boolean; manualBlobs?: Rect[] }) => {
    if (!imgElementRef.current) {
        addLog('오류: 분석할 원본 이미지가 없습니다.');
        return;
    }

    if (options.manualBlobs) {
        addLog(`사용자 정의 영역(${options.manualBlobs.length}개)으로 재분석 시작...`);
        const ocrWords = ocrResultRef.current?.data.words || [];
        await runAnalysisLoop(options.manualBlobs, imgElementRef.current, ocrWords);
    } else {
        addLog('이 설정 변경은 아직 지원되지 않습니다. (수동 영역 지정만 가능)');
    }
  }, [analyzeBatch]);

  return (
    <Layout>
      <ModelLoader status={modelStatus} progress={null} message={status} />

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
              onReanalyze={handleReanalyze} 
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
