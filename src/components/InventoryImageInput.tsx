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
  onReanalyze: (options: { threshold: number; invert: boolean; manualBlobs?: BoundingBox[] }) => void;
}

export function InventoryImageInput({ file, previewUrl, loading, progress, onFileSelect, onReanalyze }: Props) {
  const [threshold, setThreshold] = useState(100); // 슬롯 감지 임계값
  const [detectedBlobs, setDetectedBlobs] = useState<BoundingBox[]>([]);
  const [detecting, setDetecting] = useState(false);
  const invert = false;
  
  // 수동 편집을 위한 상태
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [currentDragBox, setCurrentDragBox] = useState<BoundingBox | null>(null);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  // 파일이나 설정이 바뀌면 슬롯 다시 찾기 (시각화용)
  // 단, 사용자가 수동으로 편집 중일 때는 자동 감지가 덮어쓰지 않도록 주의해야 하지만,
  // 여기서는 threshold를 건드리면 "다시 찾겠다"는 의도로 간주하고 초기화합니다.
  useEffect(() => {
    if (!file || !previewUrl) return;

    const detect = async () => {
      setDetecting(true);
      try {
        const blobs = await getItemSlots(file, threshold);
        setDetectedBlobs(blobs);
      } catch (e) {
        console.error(e);
      } finally {
        setDetecting(false);
      }
    };
    
    const timer = setTimeout(detect, 300);
    return () => clearTimeout(timer);
  }, [file, threshold]);

  // 좌표 변환 헬퍼: 캔버스 클릭 좌표(Display) -> 이미지 원본 좌표(Natural)
  const getImgCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // 마우스 핸들러 (박스 그리기)
  const handleMouseDown = (e: React.MouseEvent) => {
    // 좌클릭만 허용
    if (e.button !== 0) return;
    
    const coords = getImgCoords(e);
    if (!coords) return;

    setIsDrawing(true);
    setStartPos(coords);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) return;

    const coords = getImgCoords(e);
    if (!coords) return;

    const width = coords.x - startPos.x;
    const height = coords.y - startPos.y;

    // 드래그 중인 박스 임시 표시
    setCurrentDragBox({
      x: width > 0 ? startPos.x : coords.x,
      y: height > 0 ? startPos.y : coords.y,
      width: Math.abs(width),
      height: Math.abs(height)
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentDragBox) {
      setIsDrawing(false);
      setStartPos(null);
      setCurrentDragBox(null);
      return;
    }

    // 너무 작은 박스는 무시 (오클릭 방지)
    if (currentDragBox.width > 10 && currentDragBox.height > 10) {
      setDetectedBlobs(prev => [...prev, currentDragBox]);
    }

    setIsDrawing(false);
    setStartPos(null);
    setCurrentDragBox(null);
  };

  // 우클릭 핸들러 (박스 삭제)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // 브라우저 메뉴 막기

    const coords = getImgCoords(e);
    if (!coords) return;

    // 클릭한 위치에 있는 박스 찾아서 삭제 (맨 위에 있는 것부터)
    const clickedIndex = detectedBlobs.findIndex(box => 
      coords.x >= box.x && coords.x <= box.x + box.width &&
      coords.y >= box.y && coords.y <= box.y + box.height
    );

    if (clickedIndex !== -1) {
      setDetectedBlobs(prev => prev.filter((_, idx) => idx !== clickedIndex));
    }
  };

  // 캔버스 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // 이미지 로드 완료 체크
    if (!img.complete) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 4;
    
    // 1. 확정된 박스들
    detectedBlobs.forEach(box => {
      ctx.strokeStyle = '#ef4444'; // Red
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.fillRect(box.x, box.y, box.width, box.height);
    });

    // 2. 드래그 중인 임시 박스
    if (currentDragBox) {
      ctx.strokeStyle = '#fbbf24'; // Amber (그리는 중)
      ctx.setLineDash([10, 10]); // 점선
      ctx.strokeRect(currentDragBox.x, currentDragBox.y, currentDragBox.width, currentDragBox.height);
      ctx.setLineDash([]); // 초기화
      ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
      ctx.fillRect(currentDragBox.x, currentDragBox.y, currentDragBox.width, currentDragBox.height);
    }

  }, [detectedBlobs, currentDragBox, previewUrl]);

  const handleAnalyzeClick = () => {
    // 여기서 detectedBlobs(사용자가 편집한 최종 박스들)를 상위 컴포넌트로 넘겨줘야 함.
    // 하지만 현재 인터페이스는 onReanalyze(options) 형태임.
    // -> App.tsx의 handleReanalyze를 수정하거나, 
    // -> onReanalyze에 blobs를 직접 넘길 수 있게 확장해야 함.
    
    // 현재 구조상 가장 빠른 방법:
    // onReanalyze의 시그니처를 무시하고, 추가 데이터로 blobs를 보냄. (타입 수정 필요하지만 JS라서 동작은 함)
    // 혹은, 상위 컴포넌트 수정 없이 진행하려면: 
    // blobDetector.ts에 "강제 오버라이드" 기능을 넣어야 하는데 복잡함.
    
    // 정석: Props 인터페이스 수정 후 전달
    onReanalyze({ threshold, invert, manualBlobs: detectedBlobs });
  };

  const handleFullImageSelect = () => {
    const img = imgRef.current;
    if (!img) return;
    setDetectedBlobs([{
      x: 0,
      y: 0,
      width: img.naturalWidth,
      height: img.naturalHeight
    }]);
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
                className="object-contain max-h-80 w-auto opacity-90 select-none" 
                onLoad={() => setThreshold(t => t)} // 로드 후 리렌더링 트리거
              />
              <canvas 
                ref={canvasRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                style={{ width: 'auto', height: '100%' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleContextMenu}
              />
            </div>
            
            {loading && (
              <div className="absolute inset-0 bg-neutral-900/70 flex flex-col items-center justify-center text-amber-500 gap-2 backdrop-blur-sm z-10 pointer-events-none">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-medium tracking-wider">AI 정밀 분석 중... {Math.round(progress * 100)}%</span>
              </div>
            )}
            
            {/* 감지 상태 표시 */}
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-white flex items-center gap-2 border border-white/10 pointer-events-none">
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
                   슬롯 편집 모드
                 </h3>
               </div>

               <div className="p-3 bg-black/40 rounded text-xs text-neutral-400 space-y-1 border border-neutral-800">
                  <p>• <span className="text-amber-500 font-bold">드래그</span>: 누락된 아이템 박스 직접 그리기</p>
                  <p>• <span className="text-red-500 font-bold">우클릭</span>: 잘못된 박스 삭제</p>
                  <p>• <span className="text-neutral-300 font-bold">슬라이더</span>: 전체 감도 재설정 (초기화)</p>
                  <p>• <span className="text-amber-400 font-bold">전체 영역</span>: 슬롯 자동 분할이 답답할 때 한 번에 분석</p>
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>자동 감지 감도: {threshold}</span>
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
                </div>

                <button
                  onClick={handleFullImageSelect}
                  className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded text-xs font-semibold border border-neutral-700 transition-colors"
                >
                  이미지 전체를 단일 영역으로 지정
                </button>

                <button 
                  onClick={handleAnalyzeClick}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-900/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  현재 설정({detectedBlobs.length}개)으로 분석 시작
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
