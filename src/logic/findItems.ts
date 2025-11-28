import { ITEMS_DB } from '../data/items';
import { RawItem } from '../types';
import { getSimilarity } from './stringUtils';

// OCR 결과에서 무시해야 할 몹 이름 및 시스템 메시지 목록
const BLACKLIST_KEYWORDS = [
  "ARC Surveyor", "Surveyor", // Surveyor Vault(아이템)와 혼동 주의, 문맥 확인 필요
  "Bastion", "Bombardier", "Fireball", 
  "Hornet", "Leaper", "Pop", "Rocketeer", "Shredder", 
  "Snitch", "Tick", "Wasp", "Queen", "Matriarch",
  "Health", "Armor", "Weight", "Inventory", "Loot"
];

export function findKnownItems(text: string): RawItem[] {
  const lines = text.split('\n');
  const foundItems: RawItem[] = [];
  const dbItems = Object.values(ITEMS_DB);

  const dbKeywords = new Set<string>();
  dbItems.forEach(item => {
    const variants = [item.name, ...(item.aliases || [])];
    variants.forEach(name => {
      name.split(' ').forEach(word => {
        if (word.length >= 3) dbKeywords.add(word.toLowerCase());
      });
    });
  });

  for (const line of lines) {
    const cleanLine = line.trim();
    if (cleanLine.length < 3) continue;

    // 0. 블랙리스트 필터링 (몹 이름 무시)
    // 단, "Surveyor Vault" 같은 아이템 이름이 블랙리스트 "Surveyor" 때문에 무시되지 않도록 주의
    // -> 완전 일치나 몹 이름 패턴이 강할 때만 스킵
    const isMobName = BLACKLIST_KEYWORDS.some(mob => {
      // 몹 이름과 매우 유사하고, 뒤에 'Vault', 'Driver' 같은 아이템 접미사가 없는 경우
      if (cleanLine.includes(mob)) {
        // 예외: "Surveyor Vault"는 아이템임. "ARC Surveyor"는 몹임.
        if (mob === "Surveyor" && cleanLine.includes("Vault")) return false;
        if (mob === "Hornet" && cleanLine.includes("Driver")) return false;
        if (mob === "Wasp" && cleanLine.includes("Driver")) return false;
        if (mob === "Leaper" && cleanLine.includes("Pulse")) return false;
        if (mob === "Snitch" && cleanLine.includes("Scanner")) return false;
        return true; // 몹 이름으로 판단되어 무시
      }
      return false;
    });

    if (isMobName) continue;

    // 1. 1차 필터: 키워드 존재 여부
    const lineWords = cleanLine.toLowerCase().split(/[\s\W]+/);
    const hasKeyword = lineWords.some(word => 
      word.length >= 3 && dbKeywords.has(word)
    );

    let bestMatchItem = null;
    let bestScore = 0;

    // 2. 정밀 비교
    for (const dbItem of dbItems) {
      const candidateNames = [dbItem.name, ...(dbItem.aliases || [])];
      const simpleLine = cleanLine.toLowerCase().replace(/\s/g, '');

      for (const candidate of candidateNames) {
        const simpleName = candidate.toLowerCase().replace(/\s/g, '');
        
        if (simpleLine.includes(simpleName)) {
          bestScore = 1.0;
          bestMatchItem = dbItem;
          break;
        }

        const nameParts = candidate.split(' ');
        const windowSize = nameParts.length;
        
        if (lineWords.length >= windowSize) {
          for (let i = 0; i <= lineWords.length - windowSize; i++) {
            const phrase = lineWords.slice(i, i + windowSize).join(' ');
            const score = getSimilarity(candidate.toLowerCase(), phrase);
            
            if (score > bestScore) {
              bestScore = score;
              bestMatchItem = dbItem;
            }
          }
        }
      }
    }

    const threshold = hasKeyword ? 0.55 : 0.75;

    if (bestMatchItem && bestScore >= threshold) {
      let qty = 1;
      const qtyMatchX = cleanLine.match(/[xX×]\s*(\d+)/);
      if (qtyMatchX) {
        qty = parseInt(qtyMatchX[1], 10);
      } else {
        const qtyMatchEnd = cleanLine.match(/(\d+)\s*$/);
        if (qtyMatchEnd) {
          const val = parseInt(qtyMatchEnd[1], 10);
          if (val < 1000) qty = val;
        }
      }

      const existing = foundItems.find(i => i.name === bestMatchItem?.name);
      if (existing) {
        existing.qty += qty;
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
