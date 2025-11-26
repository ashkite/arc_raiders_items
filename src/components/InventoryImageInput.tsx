import { ChangeEvent, useEffect, useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Loader2, Settings2, RefreshCw, Scan } from 'lucide-react';
import clsx from 'clsx';
import { getItemSlots, BoundingBox } from '../logic/blobDetector';

interface Props {
  file: File | null;
  previewUrl: string | null;
  loading: boolean;
  progress: number;
  onFileSelect: (file: File) => void;
  onReanalyze: (options: { threshold: number; invert: boolean }) => void;
}

export function InventoryImageInput({ file, previewUrl, loading, progress, onFileSelect, onReanalyze }: Props) {
  const [threshold, setThreshold] = useState(100); // 슬롯 감지 임계값
  const [showControls, setShowControls] = useState(true);
  const [detectedBlobs, setDetectedBlobs] = useState<BoundingBox[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [invert, setInvert] = useState(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
      setShowControls(true);
    }
  };

  // 파일이나 설정이 바뀌면 슬롯 다시 찾기 (시각화용)
  useEffect(() => {
    if (!file || !previewUrl) return;

    const detect = async () => {
      setDetecting(true);
      try {
        // 시각화용이므로 빠르고 단순하게
        const blobs = await getItemSlots(file, threshold);
        setDetectedBlobs(blobs);
      } catch (e) {
        console.error(e);
      } finally {
        setDetecting(false);
      }
    };
    
    // 디바운싱
    const timer = setTimeout(detect, 300);
    return () => clearTimeout(timer);
  }, [file, threshold]);

  // 캔버스에 박스 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !detectedBlobs.length) return;

    // 이미지 로드 완료 후 실행되어야 함
    if (!img.complete) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기를 이미지 표시 크기에 맞춤
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ef4444'; // red-500
    ctx.lineWidth = 4;
    
    detectedBlobs.forEach(box => {
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // 반투명 채우기
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.fillRect(box.x, box.y, box.width, box.height);
    });

  }, [detectedBlobs, previewUrl]); // previewUrl이 바뀌면 다시 그림

  const handleAnalyzeClick = () => {
    onReanalyze({ threshold, invert });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-6 flex flex-col items-center gap-4 relative overflow-hidden">
        {previewUrl ? (
          <div className="relative w-full bg-neutral-950 flex justify-center rounded-md overflow-hidden border border-neutral-800 group">
            <div className="relative max-h-80 w-full flex justify-center">
               <img 
                ref={imgRef}
                src={previewUrl} 
                alt="Inventory Preview" 
                className="object-contain max-h-80 w-auto opacity-90" 
                onLoad={() => setThreshold(t => t)} // 로드 후 리렌더링 트리거
              />
              <canvas 
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                style={{ width: 'auto', height: '100%' }} // 이미지와 동일한 비율 유지
              />
            </div>
            
            {loading && (
              <div className="absolute inset-0 bg-neutral-900/70 flex flex-col items-center justify-center text-amber-500 gap-2 backdrop-blur-sm z-10">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-medium tracking-wider">AI 정밀 분석 중... {Math.round(progress * 100)}%</span>
              </div>
            )}
            
            {/* 감지 상태 표시 */}
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-white flex items-center gap-2 border border-white/10">
              <Scan className={clsx("w-3 h-3", detecting && "animate-pulse text-amber-400")} />
              {detecting ? '스캔 중...' : `${detectedBlobs.length}개 슬롯 감지됨`}
            </div>
          </div>
        ) : (
          <div className="w-full h-40 border-2 border-dashed border-neutral-700 rounded-lg flex flex-col items-center justify-center text-neutral-500 gap-2 hover:border-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer relative bg-neutral-900/30">
            <ImageIcon className="w-8 h-8" />
            <span className="text-sm">여기를 클릭하거나 스크린샷을 드래그하세요</span>
            <input 
              type="file" 
              accept="image/*" 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              onChange={handleChange}
            />
          </div>
        )}

        {/* 컨트롤 패널 */}
        {file && !loading && (
          <div className="w-full flex flex-col gap-3 mt-2">
            <div className="bg-neutral-900/80 p-4 rounded-lg border border-neutral-700 space-y-4">
               <div className="flex items-center justify-between">
                 <h3 className="text-sm font-medium text-neutral-200 flex items-center gap-2">
                   <Settings2 className="w-4 h-4" />
                   슬롯 감지 설정 (빨간 박스를 아이템에 맞추세요)
                 </h3>
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>감도 (Threshold): {threshold}</span>
                    <span>{detecting ? '조정 중...' : '완료'}</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="240" 
                    step="5"
                    value={threshold} 
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <p className="text-xs text-neutral-500">
                    * 슬라이더를 움직여 빨간 박스가 아이템 칸을 정확히 감싸도록 조절하세요.
                  </p>
                </div>

                <button 
                  onClick={handleAnalyzeClick}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-900/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  이 영역으로 분석 시작 ({detectedBlobs.length}개)
                </button>
            </div>

             <label className="flex-1 btn-secondary text-center cursor-pointer py-2 text-neutral-500 hover:text-neutral-300 text-xs flex items-center justify-center gap-1">
                <Upload className="w-3 h-3" />
                다른 이미지 선택
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleChange}
                />
              </label>
          </div>
        )}
      </div>
    </div>
  );
}