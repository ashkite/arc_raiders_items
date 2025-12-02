/**
 * Inventory Item Detector (Advanced Edge-based)
 * 목표: Sobel Edge Detection과 Grid Inference를 통해
 * 1. 아이템 색상에 상관없이 슬롯의 '테두리'를 감지
 * 2. 끊어진 격자선을 복원하여 누락 최소화
 * 3. 격자 패턴을 분석하여 감지되지 않은 빈 슬롯도 추론하여 복원
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundingBox = Rect;

// Grayscale 변환
const toGrayscale = (data: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
};

// Sobel Edge Detection
const sobel = (gray: Uint8Array, width: number, height: number) => {
  const output = new Uint8Array(width * height);
  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      let i = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const val = gray[(y + ky) * width + (x + kx)];
          gx += val * kernelX[i];
          gy += val * kernelY[i];
          i++;
        }
      }
      
      const mag = Math.sqrt(gx * gx + gy * gy);
      output[y * width + x] = Math.min(255, mag);
    }
  }
  return output;
};

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

// Morphological Erosion (침식)
const erode = (data: Uint8Array, width: number, height: number, kernelSize: number) => {
  const output = new Uint8Array(data.length);
  const offset = Math.floor(kernelSize / 2);

  for (let y = offset; y < height - offset; y++) {
    for (let x = offset; x < width - offset; x++) {
      let keep = true;
      // 커널 내의 모든 픽셀이 1이어야 1 유지
      for (let ky = -offset; ky <= offset; ky++) {
        for (let kx = -offset; kx <= offset; kx++) {
          if (data[(y + ky) * width + (x + kx)] === 0) {
            keep = false;
            break;
          }
        }
        if (!keep) break;
      }
      output[y * width + x] = keep ? 1 : 0;
    }
  }
  return output;
};

const morphClose = (data: Uint8Array, width: number, height: number, size: number) => {
  return erode(dilate(data, width, height, size), width, height, size);
};

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// 격자 추론 및 채우기 (Grid Inference)
const fillMissingGridSlots = (slots: Rect[], imgWidth: number, imgHeight: number): Rect[] => {
  if (slots.length < 3) return slots;

  // 1. 통계 분석
  const unitW = getMedian(slots.map(s => s.width));
  const unitH = getMedian(slots.map(s => s.height));

  // X, Y 좌표들의 군집(Cluster)을 찾아서 행/열 가이드라인을 만듦
  const xCenters = slots.map(s => s.x + s.width / 2).sort((a, b) => a - b);
  const yCenters = slots.map(s => s.y + s.height / 2).sort((a, b) => a - b);

  // 비슷한 좌표끼리 묶음 (Tolerance: unit size * 0.3)
  const groupCoords = (coords: number[], tolerance: number) => {
    const groups: number[] = [];
    if (coords.length === 0) return groups;
    
    let currentGroup = [coords[0]];
    for (let i = 1; i < coords.length; i++) {
      if (coords[i] - coords[i-1] < tolerance) {
        currentGroup.push(coords[i]);
      } else {
        groups.push(getMedian(currentGroup));
        currentGroup = [coords[i]];
      }
    }
    groups.push(getMedian(currentGroup));
    return groups;
  };

  const colGuides = groupCoords(xCenters, unitW * 0.5);
  const rowGuides = groupCoords(yCenters, unitH * 0.5);

  // 2. 가상 격자 생성 및 누락 확인
  const finalSlots = [...slots];
  
  rowGuides.forEach(cy => {
    colGuides.forEach(cx => {
      // (cx, cy) 위치에 기존 슬롯이 있는지 확인
      const exists = slots.some(s => {
        const sx = s.x + s.width / 2;
        const sy = s.y + s.height / 2;
        return Math.abs(sx - cx) < unitW * 0.4 && Math.abs(sy - cy) < unitH * 0.4;
      });

      if (!exists) {
        // 누락된 슬롯 추가
        // 이미지 경계 체크
        const newX = cx - unitW / 2;
        const newY = cy - unitH / 2;
        
        if (newX >= 0 && newY >= 0 && newX + unitW <= imgWidth && newY + unitH <= imgHeight) {
          finalSlots.push({
            x: newX,
            y: newY,
            width: unitW,
            height: unitH
          });
        }
      }
    });
  });

  return finalSlots;
};

export const detectInventorySlots = (imageData: ImageData, threshold = 40): Rect[] => {
  const { width, height } = imageData;
  const size = width * height;
  
  // 1. 전처리: Grayscale -> Sobel Edge
  const gray = toGrayscale(imageData.data, width, height);
  const edges = sobel(gray, width, height);

  // 2. 이진화 (Edge Thresholding)
  const binary = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    binary[i] = edges[i] > threshold ? 1 : 0;
  }

  // 3. Morphological Closing (끊어진 테두리 연결 및 내부 노이즈 채우기)
  // Grid 선을 굵게 만들어서 박스 내부를 채우는 것이 아니라, 박스 테두리를 연결함
  // 여기서는 Kernel Size 5~7 정도로 Closing하여 박스 형태를 복원
  const closed = morphClose(binary, width, height, 5);

  // 4. CCL (Connected Component Labeling)
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
      if (closed[idx] === 0) continue;
      
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

  // 5. Blob 추출
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
        blob.width = Math.max(blob.width, x); 
        blob.y = Math.min(blob.y, y);
        blob.height = Math.max(blob.height, y); 
      }
    }
  }

  // 6. 1차 필터링
  const minArea = size * 0.0015; // 너무 작은 노이즈 제거
  const maxArea = size * 0.5;
  const candidates: Rect[] = [];

  blobs.forEach((b) => {
    const w = b.width - b.x + 1;
    const h = b.height - b.y + 1;
    const area = w * h;

    if (area < minArea || area > maxArea) return;
    // Edge 기반이므로 박스 내부가 비어있을 수 있음 -> Aspect Ratio로만 주로 판단
    const aspect = w / h;
    if (aspect < 0.5 || aspect > 3.0) return;

    candidates.push({ x: b.x, y: b.y, width: w, height: h });
  });

  // 7. NMS (겹치는 박스 정리 - 내부 포함 관계 위주)
  candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  let uniqueSlots: Rect[] = [];

  for (const cand of candidates) {
    let isDuplicate = false;
    for (const exist of uniqueSlots) {
      const x1 = Math.max(cand.x, exist.x);
      const y1 = Math.max(cand.y, exist.y);
      const x2 = Math.min(cand.x + cand.width, exist.x + exist.width);
      const y2 = Math.min(cand.y + cand.height, exist.y + exist.height);

      if (x2 > x1 && y2 > y1) {
        const intersection = (x2 - x1) * (y2 - y1);
        // 겹치는 영역이 후보 면적의 60% 이상이면 중복으로 처리
        if (intersection / (cand.width * cand.height) > 0.6) {
          isDuplicate = true;
          break;
        }
      }
    }
    if (!isDuplicate) uniqueSlots.push(cand);
  }

  // 8. Grid Inference (누락된 슬롯 복원)
  const refinedSlots = fillMissingGridSlots(uniqueSlots, width, height);

  return refinedSlots.sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < height * 0.05) return a.x - b.x;
    return a.y - b.y;
  });
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
      // 기본 Threshold는 Sobel Magnitude 기준이므로 보통 30~50 사이가 적절
      // 사용자가 조절하는 threshold 값(0~255)을 그대로 쓰거나 스케일링
      resolve(detectInventorySlots(imageData, Math.max(20, threshold / 2)));
    };
    img.src = URL.createObjectURL(file);
  });
};
