/**
 * Dynamic Blob Detection Logic
 * Replaces rigid grid with computer vision based object detection
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundingBox = Rect;

// Union-Find data structure for efficient component labeling
class UnionFind {
  parent: number[];
  constructor(size: number) {
    this.parent = Array(size).fill(0).map((_, i) => i);
  }
  find(i: number): number {
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(i: number, j: number) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) this.parent[rootI] = rootJ;
  }
}

export function findItemBlobs(imageData: ImageData, threshold: number = 50): Rect[] {
  const { width, height, data } = imageData;
  
  // FINE-GRAINED TILE: 5px instead of 10px to separate close items
  const TILE_SIZE = 5;
  const COLS = Math.ceil(width / TILE_SIZE);
  const ROWS = Math.ceil(height / TILE_SIZE);
  
  // 1. Tile Analysis
  const activeTiles = new Uint8Array(COLS * ROWS);
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let minVal = 255, maxVal = 0;
      
      const startX = x * TILE_SIZE;
      const startY = y * TILE_SIZE;
      const endX = Math.min(startX + TILE_SIZE, width);
      const endY = Math.min(startY + TILE_SIZE, height);
      
      for (let py = startY; py < endY; py++) { 
        for (let px = startX; px < endX; px++) {
          const idx = (py * width + px) * 4;
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (brightness < minVal) minVal = brightness;
          if (brightness > maxVal) maxVal = brightness;
        }
      }
      
      if ((maxVal - minVal) > threshold) {
         activeTiles[y * COLS + x] = 1;
      }
    }
  }

  // 1.5. Morphological Closing (Dilation)
  // Connects internal gaps but radius is now small (5px)
  const dilatedTiles = new Uint8Array(activeTiles);
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = y * COLS + x;
      if (activeTiles[idx] === 0) continue;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
            dilatedTiles[ny * COLS + nx] = 1;
          }
        }
      }
    }
  }

  // 2. Connected Components
  const uf = new UnionFind(COLS * ROWS);
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = y * COLS + x;
      if (dilatedTiles[idx] === 0) continue;

      if (x + 1 < COLS && dilatedTiles[idx + 1] === 1) {
        uf.union(idx, idx + 1);
      }
      if (y + 1 < ROWS && dilatedTiles[idx + COLS] === 1) {
        uf.union(idx, idx + COLS);
      }
    }
  }

  // 3. Group
  const groups = new Map<number, { minX: number, minY: number, maxX: number, maxY: number }>();
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = y * COLS + x;
      if (dilatedTiles[idx] === 0) continue;
      
      const root = uf.find(idx);
      
      if (!groups.has(root)) {
        groups.set(root, { minX: x, minY: y, maxX: x, maxY: y });
      } else {
        const g = groups.get(root)!;
        if (x < g.minX) g.minX = x;
        if (x > g.maxX) g.maxX = x;
        if (y < g.minY) g.minY = y;
        if (y > g.maxY) g.maxY = y;
      }
    }
  }

  // 4. Convert
  let rawRects: Rect[] = [];
  
  groups.forEach(g => {
    const x = g.minX * TILE_SIZE;
    const y = g.minY * TILE_SIZE;
    const w = (g.maxX - g.minX + 1) * TILE_SIZE;
    const h = (g.maxY - g.minY + 1) * TILE_SIZE;
    
    // Filter tiny noise (must be > 20x20 px)
    if (w >= 20 && h >= 20) {
       rawRects.push({ x, y, width: w, height: h });
    }
  });

  // 5. Merge
  // Use a strictly touching logic. 
  // Reduce MERGE_DIST significantly to avoid merging neighbors.
  // 0 means "must touch or overlap".
  let changed = true;
  const MERGE_DIST = 0; 

  while (changed) {
    changed = false;
    const merged: Rect[] = [];
    const used = new Array(rawRects.length).fill(false);

    for (let i = 0; i < rawRects.length; i++) {
      if (used[i]) continue;
      
      let current = { ...rawRects[i] };
      used[i] = true;
      
      for (let j = i + 1; j < rawRects.length; j++) {
        if (used[j]) continue;
        
        const other = rawRects[j];
        
        const isClose = !(
          current.x > other.x + other.width + MERGE_DIST ||
          other.x > current.x + current.width + MERGE_DIST ||
          current.y > other.y + other.height + MERGE_DIST ||
          other.y > current.y + current.height + MERGE_DIST
        );
        
        if (isClose) {
          const minX = Math.min(current.x, other.x);
          const minY = Math.min(current.y, other.y);
          const maxX = Math.max(current.x + current.width, other.x + other.width);
          const maxY = Math.max(current.y + current.height, other.y + other.height);
          
          current = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
          };
          
          used[j] = true;
          changed = true;
        }
      }
      merged.push(current);
    }
    rawRects = merged;
  }

  return rawRects;
}

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
      
      resolve(findItemBlobs(imageData, threshold));
    };
    img.src = URL.createObjectURL(file);
  });
};
