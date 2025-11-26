/**
 * 이미지에서 아이템 슬롯(밝은 영역)을 찾아내어 좌표(Bounding Box)를 반환합니다.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 1단계: 좌표만 찾기 (UI 표시용)
export async function getItemSlots(file: File, threshold: number = 100): Promise<BoundingBox[]> {
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

      const visited = new Uint8Array(width * height);
      const blobs: BoundingBox[] = [];

      // Grid Fallback을 위한 변수
      // 여기서는 사용자가 직접 조절할 것이므로 Auto-Tuning이나 Fallback을 너무 적극적으로 하지 않고
      // 있는 그대로 보여주는 게 낫습니다. (사용자가 슬라이더로 조절하니까)
      // 다만, threshold가 너무 낮으면 전체가 다 잡히는 문제는 방지해야 함.

      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const idx = getIdx(x, y);
          if (visited[idx]) continue;

          const r = data[idx * 4];
          const g = data[idx * 4 + 1];
          const b = data[idx * 4 + 2];
          const brightness = (r + g + b) / 3;

          if (brightness > threshold) {
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
                    if (nbright > threshold * 0.9) { // 조금 더 엄격하게
                      stack.push([nx, ny]);
                    }
                  }
                }
              }
            }

            const w = maxX - minX;
            const h = maxY - minY;
            // 필터링: 너무 작거나 화면 전체를 덮는 것 제외
            if (w > 15 && h > 15 && w < width * 0.8) {
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

      // NMS (Non-Maximum Suppression) - 겹치는 박스 제거
      // IoU (Intersection over Union) 방식으로 더 정확하게 필터링
      const uniqueBlobs: BoundingBox[] = [];
      
      // 크기순 정렬 (큰 박스 우선)
      blobs.sort((a, b) => (b.width * b.height) - (a.width * a.height));

      for (const b of blobs) {
        let shouldKeep = true;
        const areaB = b.width * b.height;

        for (const u of uniqueBlobs) {
            // 교차 영역 계산
            const x1 = Math.max(b.x, u.x);
            const y1 = Math.max(b.y, u.y);
            const x2 = Math.min(b.x + b.width, u.x + u.width);
            const y2 = Math.min(b.y + b.height, u.y + u.height);

            if (x1 < x2 && y1 < y2) {
                const intersection = (x2 - x1) * (y2 - y1);
                const areaU = u.width * u.height;
                
                // IoU 대신 "포함 비율"을 사용 (작은 박스가 큰 박스 안에 거의 들어가면 제거)
                // 게임 아이콘은 겹쳐있지 않으므로, 조금이라도 겹치면 중복일 확률 높음
                const overlapRatio = intersection / Math.min(areaB, areaU);

                if (overlapRatio > 0.3) { // 30% 이상 겹치면 제거
                    shouldKeep = false;
                    break;
                }
            }
        }
        if (shouldKeep) uniqueBlobs.push(b);
      }

      // 상위 40개 제한 (성능)
      resolve(uniqueBlobs.slice(0, 40));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 2단계: 좌표 기반으로 이미지 자르기
export async function cropItemSlots(file: File, blobs: BoundingBox[], targetSize?: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }

      const itemImages: string[] = [];
      blobs.forEach(blob => {
        if (targetSize && targetSize > 0) {
          // 정사각형으로 리사이즈해 CLIP 처리 속도 절약
          canvas.width = targetSize;
          canvas.height = targetSize;
          ctx.clearRect(0, 0, targetSize, targetSize);
          const scale = Math.min(targetSize / blob.width, targetSize / blob.height);
          const drawW = blob.width * scale;
          const drawH = blob.height * scale;
          const offsetX = (targetSize - drawW) / 2;
          const offsetY = (targetSize - drawH) / 2;
          ctx.drawImage(img, blob.x, blob.y, blob.width, blob.height, offsetX, offsetY, drawW, drawH);
        } else {
          canvas.width = blob.width;
          canvas.height = blob.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, blob.x, blob.y, blob.width, blob.height, 0, 0, blob.width, blob.height);
        }
        itemImages.push(canvas.toDataURL('image/jpeg'));
      });
      resolve(itemImages);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 구버전 호환성 (Deprecated)
export async function detectItemSlots(file: File, threshold: number = 100): Promise<string[]> {
  const blobs = await getItemSlots(file, threshold);
  return cropItemSlots(file, blobs);
}
