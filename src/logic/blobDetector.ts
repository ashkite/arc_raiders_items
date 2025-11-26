/**
 * 이미지에서 아이템 슬롯(밝은 영역)을 찾아내어 좌표(Bounding Box)를 반환합니다.
 * OpenCV 없이 픽셀 순회로 간단한 Blob Detection을 수행합니다.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function detectItemSlots(file: File, threshold: number = 100): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("No context")); return; }

      // 성능을 위해 리사이징해서 분석
      const scale = 0.5;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const getIdx = (x: number, y: number) => (y * width + x);

      // 1. 이진화 & Blob Detection (Auto-Tuning)
      // 슬롯을 충분히(예: 20개) 찾을 때까지 threshold를 낮추며 반복 시도
      let detectedBlobs: BoundingBox[] = [];
      let currentThreshold = threshold;
      const minSlots = 20;
      const maxRetries = 5;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const visited = new Uint8Array(width * height);
        const blobs: BoundingBox[] = [];

        for (let y = 0; y < height; y += 4) {
          for (let x = 0; x < width; x += 4) {
            const idx = getIdx(x, y);
            if (visited[idx]) continue;

            const r = data[idx * 4];
            const g = data[idx * 4 + 1];
            const b = data[idx * 4 + 2];
            const brightness = (r + g + b) / 3;

            if (brightness > currentThreshold) {
              const stack = [[x, y]];
              let minX = x, maxX = x, minY = y, maxY = y;
              
              while (stack.length > 0) {
                const [cx, cy] = stack.pop()!;
                const cIdx = getIdx(cx, cy);
                
                if (visited[cIdx]) continue;
                visited[cIdx] = 1;

                minX = Math.min(minX, cx);
                maxX = Math.max(maxX, cx);
                minY = Math.min(minY, cy);
                maxY = Math.max(maxY, cy);

                const neighbors = [[cx+2, cy], [cx-2, cy], [cx, cy+2], [cx, cy-2]];
                for (const [nx, ny] of neighbors) {
                  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = getIdx(nx, ny);
                    if (!visited[nIdx]) {
                      const nr = data[nIdx * 4];
                      const ng = data[nIdx * 4 + 1];
                      const nb = data[nIdx * 4 + 2];
                      const nbright = (nr + ng + nb) / 3;
                      if (nbright > currentThreshold * 0.8) {
                        stack.push([nx, ny]);
                      }
                    }
                  }
                }
              }

              const w = maxX - minX;
              const h = maxY - minY;
              // 너무 작거나(노이즈) 너무 큰(배경) 것 제외
              // 게임 아이콘은 대략 정사각형에 가까움
              if (w > 15 && h > 15 && w < width / 3 && h < height / 3) {
                blobs.push({
                  x: minX / scale,
                  y: minY / scale,
                  width: w / scale,
                  height: h / scale
                });
              }
            }
          }
        }

        // 충분히 찾았으면 중단
        if (blobs.length >= minSlots) {
          detectedBlobs = blobs;
          console.log(`Attempt ${attempt+1}: Found ${blobs.length} slots with threshold ${currentThreshold}`);
          break;
        } else {
          console.log(`Attempt ${attempt+1}: Found only ${blobs.length} slots. Lowering threshold...`);
          detectedBlobs = blobs; // 일단 저장
          currentThreshold -= 20; // 임계값 낮춤 (더 어두운 것도 잡도록)
          if (currentThreshold < 20) break;
        }
      }
      
      // 그래도 너무 적으면 강제 그리드 분할 (Fallback)
      if (detectedBlobs.length < 12) {
         console.warn("Blob detection failed. Switching to Grid Fallback.");
         // 5x5 그리드로 강제 분할
         const cols = 5;
         const rows = 5;
         const cellW = img.width / cols;
         const cellH = img.height / rows;
         
         detectedBlobs = [];
         for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
               detectedBlobs.push({
                  x: c * cellW,
                  y: r * cellH,
                  width: cellW,
                  height: cellH
               });
            }
         }
      }

      // NMS(Non-Maximum Suppression) 비슷한 걸로 겹치는 박스 제거하면 좋지만 일단 생략
      // 성능을 위해 최대 30개까지만 분석
      const validBlobs = detectedBlobs.slice(0, 30); 

      // 3. 각 Blob 영역을 잘라낸(Crop) 이미지 URL 배열 생성
      // 원본 이미지를 다시 그릴 캔버스
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');
      
      if (!cropCtx) { resolve([]); return; }

      const itemImages: string[] = [];
      
      validBlobs.forEach(blob => {
        cropCanvas.width = blob.width;
        cropCanvas.height = blob.height;
        
        cropCtx.drawImage(
          img, 
          blob.x, blob.y, blob.width, blob.height, 
          0, 0, blob.width, blob.height
        );
        itemImages.push(cropCanvas.toDataURL('image/jpeg'));
      });

      resolve(itemImages);
    }; // img.onload close

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}