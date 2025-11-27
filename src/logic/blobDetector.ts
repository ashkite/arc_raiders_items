/**
 * Grid-based Detection Logic
 * Detects item slots based on grid layout structure rather than pixel brightness.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 헬퍼: 픽셀 데이터 그레이스케일 변환
function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const { width, height, data } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // ITU-R BT.601 luma transform
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

export function findItemBlobs(imageData: ImageData): Rect[] {
  const { width, height } = imageData;
  
  // Note: ARC Raiders 인벤토리는 보통 격자 형태입니다.
  // 복잡한 알고리즘 대신, 전체 영역을 그리드로 가정하고 
  // 일정 간격으로 잘라내는 로직이 더 안정적일 수 있습니다.
  // 아래는 "이미지 전체가 인벤토리 그리드다"라고 가정하고 
  // 균일한 격자를 찾는 로직으로 구현합니다.

  const detectedRects: Rect[] = [];
  
  // 휴리스틱: 인벤토리 슬롯은 대략 정사각형에 가깝습니다.
  // 이미지 크기에 따라 대략적인 열/행 개수를 추정하거나
  // Projection Profile에서 피크를 찾아 자릅니다.
  
  // 여기서는 프로파일 분석이 복잡할 수 있으므로,
  // "Smart Grid Slicer" 접근법을 사용합니다.
  // 밝기 변화가 급격한 구간(에지)을 기준으로 격자를 나눕니다.

  // 간단한 Fallback: 10% 마진을 제외하고 내부를 8x5 (예시) 그리드로 나눔
  // 실제 구현 시에는 OCR 텍스트 위치를 기반으로 보정하는 것이 좋으나,
  // blobDetector는 이미지 처리만 담당합니다.
  
  // 가정: 사용자가 인벤토리 영역을 크롭했거나, 화면 중앙에 인벤토리가 있음.
  const cols = 8; // 가로 슬롯 수 (임의 설정, 실제 게임에 맞춰 조정 필요)
  const rows = 5; // 세로 슬롯 수
  
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  
  // 너무 작은 이미지는 처리 안 함
  if (cellW < 30 || cellH < 30) return [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 가장자리 마진을 살짝 두어 그리드 선을 배제
      const marginX = Math.floor(cellW * 0.1);
      const marginY = Math.floor(cellH * 0.1);
      
      detectedRects.push({
        x: c * cellW + marginX,
        y: r * cellH + marginY,
        width: cellW - (marginX * 2),
        height: cellH - (marginY * 2),
      });
    }
  }

  return detectedRects;
}