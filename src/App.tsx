import { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { InventoryImageInput } from './components/InventoryImageInput';
import { InventoryTextInput } from './components/InventoryTextInput';
import { ResultTable } from './components/ResultTable';
import { useOcr } from './hooks/useOcr';
import { useAiVision } from './hooks/useAiVision'; // AI 훅 추가
import { ModelLoader } from './components/ModelLoader'; // 로더 추가
import { classifyItems } from './logic/classify';
import { findKnownItems } from './logic/findItems';
import { ChevronRight } from 'lucide-react';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  
  // 기존 OCR (빠른 분석용)
  const { processImage, getPreview, loading: ocrLoading, progress: ocrProgress, error: ocrError } = useOcr();
  
  // 신규 AI Vision (무거운 모델 로딩 및 정밀 분석용)
  const { analyzeImage, status: aiStatus, progress: aiProgress, results: aiResults } = useAiVision();

  // AI 분석 결과가 나오면 텍스트 입력창에 반영
  useEffect(() => {
    if (aiResults && aiResults.length > 0) {
      // 1. 신뢰도 필터링
      const validResults = aiResults.filter(r => r.score > 0.2);

      // 2. 같은 아이템 합치기 (Aggregation)
      const itemCounts: Record<string, number> = {};
      
      validResults.forEach(r => {
        const name = r.topLabel;
        itemCounts[name] = (itemCounts[name] || 0) + 1;
      });

      // 3. 텍스트로 변환
      const formattedText = Object.entries(itemCounts)
        .map(([name, count]) => `${name} x${count}`)
        .join('\n');
      
      if (formattedText) {
        setText(prev => {
          return `--- AI Visual Analysis ---\n${formattedText}`;
        });
      }
    }
  }, [aiResults]);

  // 텍스트가 변경되면 자동으로 "스마트 탐색" 및 분류 수행
  const classifiedItems = useMemo(() => {
    const rawItems = findKnownItems(text);
    return classifyItems(rawItems);
  }, [text]);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    
    // 원본 프리뷰 생성
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    // 기본 설정으로 OCR 실행 (AI 모델이 준비되는 동안 빠른 결과 제공)
    const result = await processImage(selectedFile, { threshold: 160, invert: false });
    if (result) {
      // OCR 결과는 임시로 보여줌
      setText(result.rawText);
    }

    // ★ AI 비전 분석 시작 (이미지 자체를 분석)
    // 텍스트 창에 분석 중임을 표시
    setText("🔄 AI가 이미지를 정밀 분석 중입니다...\n\n잠시만 기다려주세요.\n(처음 실행 시 모델 다운로드로 인해 10초 이상 소요될 수 있습니다)");
    
    // 기본 threshold 100으로 시작 (사용자가 나중에 조절 가능)
    analyzeImage(selectedFile, 100);
  };

  const handleReanalyze = async (options: { threshold: number; invert: boolean }) => {
    if (!file) return;

    // 사용자가 슬라이더로 조절한 threshold로 AI 재분석 요청
    setText(`🔄 재설정된 감도(${options.threshold})로 슬롯을 다시 찾고 있습니다...`);
    analyzeImage(file, options.threshold);
  };

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (previewUrl && !previewUrl.startsWith('data:')) {
         URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <Layout>
      {/* AI 모델 로딩 스크린 */}
      <ModelLoader status={aiStatus} progress={aiProgress} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input */}
        <div className="flex flex-col gap-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-500 text-neutral-950 flex items-center justify-center text-xs font-bold">1</div>
              스크린샷 업로드 및 조정
            </h2>
            <InventoryImageInput 
              file={file}
              previewUrl={previewUrl}
              loading={ocrLoading} // OCR 로딩 상태 사용
              progress={ocrProgress}
              onFileSelect={handleFileSelect}
              onReanalyze={handleReanalyze}
            />
            {ocrError && (
              <div className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 p-3 rounded">
                {ocrError}
              </div>
            )}
          </section>

          <div className="flex justify-center text-neutral-600">
            <ChevronRight className="rotate-90 lg:rotate-0" />
          </div>

          <section className="space-y-3 flex-1">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-neutral-700 text-neutral-300 flex items-center justify-center text-xs font-bold">2</div>
              텍스트 확인
            </h2>
            <InventoryTextInput 
              text={text} 
              onChange={setText} 
            />

            {/* AI 분석 상세 결과 (디버그 뷰) */}
            {aiResults.length > 0 && (
              <div className="mt-4 border-t border-neutral-800 pt-4">
                <h3 className="text-sm font-medium text-neutral-400 mb-2">AI Vision Analysis ({aiResults.length} slots)</h3>
                <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2">
                  {aiResults.map((res, idx) => (
                    <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded p-2 flex flex-col gap-1">
                      <div className="aspect-square bg-black rounded overflow-hidden flex items-center justify-center">
                        {res.imageUrl ? (
                          <img src={res.imageUrl} alt="Slot" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-neutral-800 animate-pulse" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-neutral-300 truncate" title={res.topLabel}>
                          {res.topLabel}
                        </p>
                        <p className="text-[10px] text-neutral-500">
                          {(res.score * 100).toFixed(0)}% confidence
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Result */}
        <div className="flex flex-col gap-6">
          <section className="space-y-3 h-full flex flex-col">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-neutral-700 text-neutral-300 flex items-center justify-center text-xs font-bold">3</div>
              분석 결과
            </h2>
            <div className="flex-1">
              <ResultTable items={classifiedItems} />
            </div>
          </section>
        </div>

      </div>
    </Layout>
  );
}

export default App;