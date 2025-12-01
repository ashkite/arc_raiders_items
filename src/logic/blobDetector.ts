/**
 * Inventory Item Detector (Advanced)
 * 목표: 다중 임계값(Multi-Threshold) 스캔과 NMS(비최대 억제)를 통해
 * 1. 어두운 아이템과 밝은 아이템 모두 감지
 * 2. 중복되거나 내부에 포함된 박스 제거
 * 3. 조각난 아이템 최소화
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundingBox = Rect;

// Morphological Dilation (팽창)
const dilate = (data: Uint8Array, width: number, height: number, kernelSize: number) => {
  const output = new Uint8Array(data.length);
  const offset = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] === 1) {
        for (let ky = -offset; ky <= offset; ky++) {
          for (let kx = -offset; kx <= offset; kx++) {
            const ny = y + ky;
            const nx = x + kx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              output[ny * width + nx] = 1;
            }
          }
        }
      }
    }
  }
  return output;
};

export const detectInventorySlots = (imageData: ImageData, _threshold = 50): Rect[] => {
  const { width, height } = imageData;
  const size = width * height;
  
  let allCandidates: Rect[] = [];

  // 1. 다중 Threshold 루프 (어두운 아이템 ~ 밝은 아이템 모두 포착)
  // 30: 어두운 아이템, 60: 중간, 90: 밝은 하이라이트
  const thresholds = [30, 60, 90]; 

  for (const th of thresholds) {
    const binary = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      const r = imageData.data[i * 4];
      const g = imageData.data[i * 4 + 1];
      const b = imageData.data[i * 4 + 2];
      // BT.601 Grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      binary[i] = gray > th ? 1 : 0;
    }

    // Dilation: 8 (조각난 아이템을 하나로 합치기 위해 더 키움)
    const dilated = dilate(binary, width, height, 8);

    // CCL (Connected Component Labeling)
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
        if (dilated[idx] === 0) continue;
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

    const blobs = new Map<number, Rect>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (labels[idx] === 0) continue;
        const root = find(labels[idx]);
        const blob = blobs.get(root);
        if (!blob) {
          blobs.set(root, { x: x, y: y, width: 1, height: 1 });
        } else {
          blob.x = Math.min(blob.x, x);
          blob.width = Math.max(blob.width, x); // width as maxX
          blob.y = Math.min(blob.y, y);
          blob.height = Math.max(blob.height, y); // height as maxY
        }
      }
    }

    // Blob 1차 필터링 (크기/비율)
    const minArea = size * 0.001; 
    const maxArea = size * 0.4;

    blobs.forEach((b) => {
      const realX = b.x;
      const realY = b.y;
      const realW = b.width - b.x + 1;
      const realH = b.height - b.y + 1;
      const area = realW * realH;
      const aspect = realW / realH;

      if (area < minArea || area > maxArea) return;
      
      // 비율: 정사각형(1.0) 근처 선호하지만 가로로 긴 것(3.5)도 허용
      if (aspect < 0.4 || aspect > 3.5) return; 

      // 가장자리 제외
      const margin = 2;
      if (realX <= margin || realY <= margin || 
          realX + realW >= width - margin || realY + realH >= height - margin) return;

      allCandidates.push({ x: realX, y: realY, width: realW, height: realH });
    });
  }

  // 2. 중복 제거 및 포함 관계 정리 (NMS 유사 로직)
  // 면적이 큰 순서대로 정렬 -> 큰 박스가 우선권 가짐
  allCandidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const finalSlots: Rect[] = [];

  for (const candidate of allCandidates) {
    let shouldAdd = true;

    for (const existing of finalSlots) {
      // 두 사각형의 교차 영역 계산
      const x1 = Math.max(candidate.x, existing.x);
      const y1 = Math.max(candidate.y, existing.y);
      const x2 = Math.min(candidate.x + candidate.width, existing.x + existing.width);
      const y2 = Math.min(candidate.y + candidate.height, existing.y + existing.height);

      if (x2 > x1 && y2 > y1) {
        const intersection = (x2 - x1) * (y2 - y1);
        const candidateArea = candidate.width * candidate.height;
        
        // 교차 영역이 후보(작은 박스) 면적의 50% 이상이면 중복/포함으로 간주하고 버림
        if (intersection / candidateArea > 0.5) {
          shouldAdd = false;
          break;
        }
      }
    }

    if (shouldAdd) {
      finalSlots.push(candidate);
    }
  }

  // 3. 정렬 (상단 -> 하단, 좌 -> 우)
  finalSlots.sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < height * 0.05) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  return finalSlots;
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