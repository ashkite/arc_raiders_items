/**
 * Inventory grid detector
 * 목표: 항상 7x4(28칸)의 균일한 슬롯을 반환.
 * 절차: 이진화 -> 후보 사각형 추출 -> 유효 슬롯 필터 -> 전체 바운딩 박스 -> 7x4 분할
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
const PADDING_PX = 6; // 슬롯 간격을 위해 안쪽으로 줄일 픽셀 값

/**
 * 이미지에서 가장 큰 외곽선 바운딩 박스를 찾는다.
 * 없다면 전체 이미지를 반환.
 */
const findLargestContourBounds = (imageData: ImageData, threshold: number): Rect => {
  const { width, height, data } = imageData;
  const size = width * height;
  const binary = new Uint8Array(size);

  // 그레이스케일 + 이진화
  for (let i = 0; i < size; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    binary[i] = gray > threshold ? 1 : 0;
  }

  const labels = new Int32Array(size).fill(0);
  let nextLabel = 1;
  const parent: number[] = [];
  const find = (x: number): number => {
    if (parent[x] === x) return x;
    parent[x] = find(parent[x]);
    return parent[x];
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // CCL (간단한 연결 요소 라벨링)
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
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        labels[idx] = Math.min(left, top);
        if (left !== top) unite(left, top);
      }
    }
  }

  const blobs = new Map<number, { minX: number; maxX: number; minY: number; maxY: number; area: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const label = labels[idx];
      if (label === 0) continue;
      const root = find(label);
      const blob = blobs.get(root);
      if (!blob) {
        blobs.set(root, { minX: x, maxX: x, minY: y, maxY: y, area: 1 });
      } else {
        if (x < blob.minX) blob.minX = x;
        if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y;
        if (y > blob.maxY) blob.maxY = y;
        blob.area += 1;
      }
    }
  }

  // 가장 큰 외곽선 선택
  let largest: Rect | null = null;
  let maxArea = 0;
  blobs.forEach((b) => {
    const area = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
    if (area > maxArea) {
      maxArea = area;
      largest = {
        x: b.minX,
        y: b.minY,
        width: b.maxX - b.minX + 1,
        height: b.maxY - b.minY + 1,
      };
    }
  });

  if (!largest) {
    return { x: 0, y: 0, width, height };
  }

  const l = largest as Rect;
  const area = l.width * l.height;
  const minArea = width * height * 0.2; // 전체 영역의 20% 미만이면 무시

  // 안전하게 이미지 경계 안으로 클램프
  return {
    x: area < minArea ? 0 : Math.max(0, l.x),
    y: area < minArea ? 0 : Math.max(0, l.y),
    width: area < minArea ? width : Math.min(width, l.x + l.width) - Math.max(0, l.x),
    height: area < minArea ? height : Math.min(height, l.y + l.height) - Math.max(0, l.y),
  };
};

/**
 * 7x4 그리드로 균등 분할
 */
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
  const bounds = findLargestContourBounds(imageData, threshold);
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
