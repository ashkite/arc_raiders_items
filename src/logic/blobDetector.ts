/**
 * Grid-based Detection Logic
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoundingBox = Rect; // Alias for compatibility

export function findItemBlobs(imageData: ImageData): Rect[] {
  const { width, height } = imageData;
  const detectedRects: Rect[] = [];
  
  const cols = 8; 
  const rows = 5; 
  
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  
  if (cellW < 30 || cellH < 30) return [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
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

// Alias for compatibility with InventoryImageInput
export const getItemSlots = async (file: File, _threshold: number): Promise<BoundingBox[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(findItemBlobs(imageData));
    };
    img.src = URL.createObjectURL(file);
  });
};
