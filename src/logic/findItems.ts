import { ITEMS_DB } from '../data/items';
import { RawItem } from '../types';
import { getSimilarity } from './stringUtils';

/**
 * 텍스트에서 알려진 아이템들을 "엄격하게" 찾아냅니다.
 * 노이즈(외계어, 체력바, 무게 등)를 걸러내기 위해
 * DB에 있는 아이템 이름과 유사도가 일정 수준 이상인 경우만 결과로 반환합니다.
 */
export function findKnownItems(text: string): RawItem[] {
  // 1. 텍스트 정제: 특수문자 제거, 소문자 변환 등은 비교 시 수행
  const lines = text.split('\n');
  const foundItems: RawItem[] = [];
  const dbItems = Object.values(ITEMS_DB);

  // DB 아이템들의 "키워드" 추출 (예: "Assorted Seeds" -> ["Assorted", "Seeds"])
  // 최소 3글자 이상인 단어만 키워드로 사용
  const dbKeywords = new Set<string>();
  dbItems.forEach(item => {
    item.name.split(' ').forEach(word => {
      if (word.length >= 3) dbKeywords.add(word.toLowerCase());
    });
  });

  for (const line of lines) {
    const cleanLine = line.trim();
    if (cleanLine.length < 3) continue;

    // 2. 1차 필터: "DB에 있는 키워드가 하나라도 포함되어 있는가?"
    // 노이즈를 획기적으로 줄이는 단계
    const lineWords = cleanLine.toLowerCase().split(/[
\s\W]+/); // 공백/특수문자로 분리
    const hasKeyword = lineWords.some(word => 
      word.length >= 3 && dbKeywords.has(word)
    );

    // 키워드가 전혀 없으면, 혹시 모르니 전체 문장 유사도 검사로 넘어감 (단, 문턱값을 높게)
    // 하지만 대부분의 노이즈는 여기서 걸러짐.
    
    let bestMatchItem = null;
    let bestScore = 0;

    // 3. 정밀 비교 (Fuzzy Matching)
    for (const dbItem of dbItems) {
      // 라인 전체와 아이템 이름 비교
      // "Assorted Seeds x40" vs "Assorted Seeds" -> 앞부분 일치도가 높아야 함
      
      // A. 라인에 아이템 이름이 포함되어 있는지 확인 (가장 강력)
      // 공백 제거 후 비교
      const simpleLine = cleanLine.toLowerCase().replace(/\s/g, '');
      const simpleName = dbItem.name.toLowerCase().replace(/\s/g, '');
      
      if (simpleLine.includes(simpleName)) {
        bestScore = 1.0;
        bestMatchItem = dbItem;
        break; // 완벽한 매칭 찾음
      }

      // B. 부분 유사도 측정
      // 라인의 부분 문자열(윈도우)을 떼어내서 비교
      const nameParts = dbItem.name.split(' ');
      const windowSize = nameParts.length;
      
      if (lineWords.length >= windowSize) {
        for (let i = 0; i <= lineWords.length - windowSize; i++) {
          const phrase = lineWords.slice(i, i + windowSize).join(' ');
          const score = getSimilarity(dbItem.name.toLowerCase(), phrase);
          
          if (score > bestScore) {
            bestScore = score;
            bestMatchItem = dbItem;
          }
        }
      }
    }

    // 4. 결과 확정
    // hasKeyword가 true면 문턱값을 좀 낮춰주고(0.55), 아니면 높게 잡음(0.7)
    const threshold = hasKeyword ? 0.55 : 0.75;

    if (bestMatchItem && bestScore >= threshold) {
      // 수량 추출
      // 1. "x숫자" 패턴
      let qty = 1;
      const qtyMatchX = cleanLine.match(/[xX×]\s*(\d+)/);
      if (qtyMatchX) {
        qty = parseInt(qtyMatchX[1], 10);
      } else {
        // 2. 라인 끝 숫자 패턴 (위험하긴 하지만 차선책)
        const qtyMatchEnd = cleanLine.match(/(\d+)\s*$/);
        if (qtyMatchEnd) {
          // 숫자가 너무 크면(예: 무게 500, 돈 30000) 수량이 아닐 확률 높음
          // 보통 스택 수량은 1~500 사이
          const val = parseInt(qtyMatchEnd[1], 10);
          if (val < 1000) {
             qty = val;
          }
        }
      }

      // 중복 체크: 이미 찾은 아이템 리스트에 같은 이름이 있다면?
      // 보통 인벤토리에 같은 템이 여러 슬롯일 수 있으므로 합치는 게 좋음
      const existing = foundItems.find(i => i.name === bestMatchItem?.name);
      if (existing) {
        existing.qty += qty; // 수량 합산
      } else {
        foundItems.push({
          name: bestMatchItem.name,
          qty: qty
        });
      }
    }
  }

  return foundItems;
}