/**
 * Inventory Item Detector (Dynamic)
 * 목표: 고정된 그리드(7x4)가 아닌, 화면에 존재하는 개별 아이템 슬롯들을 유연하게 감지.
 * 1x1, 2x2, 7x4 등 어떤 배열이든 상관없이 아이템이 있는 영역(Blob)을 각각 추출함.
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

/**
 * 개별 아이템 영역 감지
 */
export const detectInventorySlots = (imageData: ImageData, _threshold = 50): Rect[] => {
  const { width, height } = imageData;
  const size = width * height;
  
  // 1. 이진화 (Thresholding)
  // 여러 임계값을 시도하는 대신, 중간값 하나를 사용하거나 적응형으로 가는 게 좋지만,
  // 여기서는 밝은 아이템을 잡기 위해 약간 높은 값을 기본으로 사용.
  const th = 60; 
  const binary = new Uint8Array(size);
  
  for (let i = 0; i < size; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    binary[i] = gray > th ? 1 : 0;
  }

  // 2. Dilation (팽창) - 아주 작게 적용
  // 아이템 내부의 빈 공간은 메우되, 아이템끼리는 붙지 않도록 커널 크기를 2~3으로 설정.
  const dilated = dilate(binary, width, height, 5);

  // 3. CCL (Connected Component Labeling)
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

  // 1-Pass
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
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        labels[idx] = Math.min(left, top);
        unite(left, top);
      }
    }
  }

  // 2-Pass (Resolve Labels & Build Blobs)
  const blobs = new Map<number, Rect>();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (labels[idx] === 0) continue;
      
      const root = find(labels[idx]);
      const blob = blobs.get(root);
      
      if (!blob) {
        blobs.set(root, { x: x, y: y, width: 1, height: 1 }); // width/height를 max값 추적용으로 잠시 사용
      } else {
        // x, y는 minX, minY
        // width, height는 maxX, maxY로 사용하여 업데이트
        blob.x = Math.min(blob.x, x);
        blob.width = Math.max(blob.width, x); // 임시로 maxX 저장
        blob.y = Math.min(blob.y, y);
        blob.height = Math.max(blob.height, y); // 임시로 maxY 저장
      }
    }
  }

  // 4. Blob 필터링 및 변환
  let candidateSlots: Rect[] = [];
  const minArea = size * 0.001; // 최소 크기 하향 조정 (작은 조각도 일단 수집)
  const maxArea = size * 0.4;

  blobs.forEach((b) => {
    const realX = b.x;
    const realY = b.y;
    const realW = b.width - b.x + 1;
    const realH = b.height - b.y + 1;

    const area = realW * realH;
    if (area < minArea || area > maxArea) return;

    candidateSlots.push({
      x: realX,
      y: realY,
      width: realW,
      height: realH
    });
  });

  // 5. 가까운 영역 병합 (Merge nearby rects)
  // 하나의 아이템이 여러 조각으로 나뉜 경우를 하나로 합침
  const mergeDistance = Math.max(width, height) * 0.02; // 화면 크기의 2% 이내면 병합

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < candidateSlots.length; i++) {
      for (let j = i + 1; j < candidateSlots.length; j++) {
        const r1 = candidateSlots[i];
        const r2 = candidateSlots[j];

        // 두 사각형 사이의 거리 계산 (겹치거나 가까우면)
        const intersectX = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x) + mergeDistance);
        const intersectY = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y) + mergeDistance);

        if (intersectX > 0 && intersectY > 0) {
          // 병합 실행
          const newX = Math.min(r1.x, r2.x);
          const newY = Math.min(r1.y, r2.y);
          const newW = Math.max(r1.x + r1.width, r2.x + r2.width) - newX;
          const newH = Math.max(r1.y + r1.height, r2.y + r2.height) - newY;

          candidateSlots[i] = { x: newX, y: newY, width: newW, height: newH };
          candidateSlots.splice(j, 1); // r2 제거
          merged = true;
          break; // 배열이 변경되었으므로 다시 시작
        }
      }
      if (merged) break;
    }
  }

  // 6. 최종 필터링 (병합 후 모양 검증)
  const validSlots = candidateSlots.filter(r => {
    const aspect = r.width / r.height;
    // 병합 후에도 비율이 너무 이상하면 제거 (1x1 아이템 위주이므로 정사각형에 가까워야 함)
    // 가로로 긴 2칸짜리 아이템도 있을 수 있으므로 2.5까지 허용
    return aspect > 0.5 && aspect < 2.5;
  });

  // 7. 정렬 (상단 -> 하단, 좌 -> 우 순서)
  validSlots.sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < height * 0.05) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  return validSlots;
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
