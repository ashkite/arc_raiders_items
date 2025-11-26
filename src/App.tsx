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
      // AI가 찾은 아이템들을 "Item Name x1" 형식의 문자열로 변환
      // 신뢰도(score)가 0.2 이상인 것만 필터링
      const formattedText = aiResults
        .filter(r => r.score > 0.2)
        .map(r => `${r.topLabel} x1`) // 수량은 기본 1로 설정 (이미지 분류로는 수량 파악 불가)
        .join('\n');
      
      if (formattedText) {
        setText(prev => {
          // 기존 텍스트가 있다면 구분선 추가해서 AI 결과 덧붙이기
          // 또는, OCR 결과가 너무 쓰레기라면 아예 덮어쓰는 게 나을 수 있음
          // 사용자 경험상 "깨진 글자"를 보는 것보다 "깔끔한 목록"을 보는 게 나으므로 덮어씁니다.
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
    analyzeImage(selectedFile);
  };

  const handleReanalyze = async (options: { threshold: number; invert: boolean }) => {
    if (!file) return;

    const newPreviewUrl = await getPreview(file, options);
    setPreviewUrl(newPreviewUrl);

    const result = await processImage(file, options);
    if (result) {
      setText(result.rawText);
    }
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