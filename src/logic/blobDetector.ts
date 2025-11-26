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

      // NMS (겹치는 박스 제거)
      // 간단하게: 중심점이 다른 박스 안에 있으면 제거
      const uniqueBlobs: BoundingBox[] = [];
      blobs.sort((a, b) => (b.width * b.height) - (a.width * a.height)); // 큰 것부터

      for (const b of blobs) {
        let overlapped = false;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;

        for (const u of uniqueBlobs) {
            if (cx > u.x && cx < u.x + u.width && cy > u.y && cy < u.y + u.height) {
                overlapped = true;
                break;
            }
        }
        if (!overlapped) uniqueBlobs.push(b);
      }

      // 상위 40개 제한 (성능)
      resolve(uniqueBlobs.slice(0, 40));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 2단계: 좌표 기반으로 이미지 자르기
export async function cropItemSlots(file: File, blobs: BoundingBox[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }

      const itemImages: string[] = [];
      blobs.forEach(blob => {
        canvas.width = blob.width;
        canvas.height = blob.height;
        ctx.drawImage(img, blob.x, blob.y, blob.width, blob.height, 0, 0, blob.width, blob.height);
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