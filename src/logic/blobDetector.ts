/**
 * Inventory grid detector
 * 목표: 항상 7x4(28칸)의 균일한 슬롯을 반환.
 * 절차: 다중 Threshold 이진화 -> 후보 사각형 추출 -> 비율/크기 점수 평가 -> 최적 바운딩 박스 -> 7x4 분할
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundingBox = Rect;

const COLS = 7;
const ROWS = 4;
const PADDING_PX = 8;
const TARGET_ASPECT = COLS / ROWS; // 1.75

/**
 * 다중 Threshold를 사용하여 가장 적합한 인벤토리 영역을 찾는다.
 * 점수 기준: 
 * 1. 비율(Aspect Ratio): 7:4 (1.75)에 가까울수록 높은 점수
 * 2. 크기(Area): 너무 작지 않고 화면을 적절히 채우는 크기
 */
const findBestBounds = (imageData: ImageData): Rect => {
  const { width, height } = imageData;
  const size = width * height;
  
  let bestRect: Rect = { x: 0, y: 0, width, height };
  let bestScore = -Infinity;

  // 1. 다양한 임계값 시도 (더 촘촘하게)
  const thresholds = [10, 30, 50, 70, 90, 110, 130, 150, 180, 210];

  for (const th of thresholds) {
    const binary = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const r = imageData.data[i * 4];
      const g = imageData.data[i * 4 + 1];
      const b = imageData.data[i * 4 + 2];
      // 단순 평균보다 ITU-R BT.601 공식 사용
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      binary[i] = gray > th ? 1 : 0;
    }

    // ... (CCL 로직은 동일하므로 생략 가능하지만, replace tool 특성상 전체 문맥 유지 필요) ...
    // 간단한 CCL (Connected Component Labeling)
    const labels = new Int32Array(size).fill(0);
    let nextLabel = 1;
    const parent: number[] = [];
    const find = (x: number): number => {
      if (parent[x] === x) return x;
      return parent[x] = find(parent[x]);
    };
    const unite = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binary[idx] === 0) continue;
        const left = x > 0 ? labels[idx - 1] : 0;
        const top = y > 0 ? labels[idx - width] : 0;
        if (left === 0 && top === 0) {
          labels[idx] = nextLabel;
          parent[nextLabel] = nextLabel;
          nextLabel++;
        } else if (left !== 0 && top === 0) labels[idx] = left;
        else if (left === 0 && top !== 0) labels[idx] = top;
        else {
          labels[idx] = Math.min(left, top);
          unite(left, top);
        }
      }
    }

    const blobs = new Map<number, { minX: number; maxX: number; minY: number; maxY: number; area: number }>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (labels[idx] === 0) continue;
        const root = find(labels[idx]);
        const blob = blobs.get(root);
        if (!blob) blobs.set(root, { minX: x, maxX: x, minY: y, maxY: y, area: 1 });
        else {
          blob.minX = Math.min(blob.minX, x);
          blob.maxX = Math.max(blob.maxX, x);
          blob.minY = Math.min(blob.minY, y);
          blob.maxY = Math.max(blob.maxY, y);
          blob.area++;
        }
      }
    }

    // 후보 평가
    blobs.forEach(b => {
      const w = b.maxX - b.minX + 1;
      const h = b.maxY - b.minY + 1;
      const area = w * h;
      
      // 조건 완화: 화면의 2% 이상이면 후보로 인정 (작은 인벤토리 대응)
      if (area < size * 0.02 || area > size * 0.98) return;

      const aspect = w / h;
      const aspectScore = 1 - Math.abs(aspect - TARGET_ASPECT) / TARGET_ASPECT; 
      const areaScore = area / size;

      // 비율 조건 완화: 1.3 ~ 2.5 허용 (7:4 = 1.75)
      if (aspect < 1.3 || aspect > 2.5) return;

      // 점수 계산: 비율 점수 가중치 강화
      const score = aspectScore * 3.0 + areaScore;

      if (score > bestScore) {
        bestScore = score;
        bestRect = { x: b.minX, y: b.minY, width: w, height: h };
      }
    });
  }

  // Fallback 조건 완화: 0.3점 이상이면 인정
  if (bestScore < 0.3) {
    return { x: 0, y: 0, width, height };
  }

  return bestRect;
};

const sliceIntoGrid = (bounds: Rect): Rect[] => {
  const cellW = bounds.width / COLS;
  const cellH = bounds.height / ROWS;
  const insetX = Math.min(PADDING_PX, cellW / 4);
  const insetY = Math.min(PADDING_PX, cellH / 4);

  const slots: Rect[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = bounds.x + c * cellW;
      const y = bounds.y + r * cellH;
      slots.push({
        x: x + insetX,
        y: y + insetY,
        width: Math.max(1, cellW - insetX * 2),
        height: Math.max(1, cellH - insetY * 2),
      });
    }
  }
  return slots;
};

export const detectInventorySlots = (imageData: ImageData, threshold = 50): Rect[] => {
  // threshold 파라미터는 이제 무시하고 내부적으로 다중 threshold 사용
  const bounds = findBestBounds(imageData);
  return sliceIntoGrid(bounds);
};

export const getItemSlots = async (file: File, threshold: number): Promise<BoundingBox[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(detectInventorySlots(imageData, threshold));
    };
    img.src = URL.createObjectURL(file);
  });
};