import { ClassifiedItem, RawItem } from '../types';
import { ITEMS_DB } from '../data/items';

export function classifyItems(
  rawItems: RawItem[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _goal?: {
    targetWorkshops?: string[];
    targetCrafts?: string[];
    minKeepMats?: Record<string, number>;
  }
): ClassifiedItem[] {
  return rawItems.map((item) => {
    // 이름으로 DB 조회 (복수형/단수형 처리 등 간단한 정규화 필요할 수 있음)
    // 여기서는 정확한 매칭 우선, 추후 findItems에서 매칭된 이름을 넘겨주므로 그대로 사용
    const dbItem = ITEMS_DB[item.name];

    // 1. 메타데이터가 없는 경우 -> 보수적 KEEP (알 수 없는 아이템은 버리지 말자)
    if (!dbItem) {
      return {
        ...item,
        action: "KEEP",
        reason: "데이터베이스에 없는 아이템 (안전하게 보관)",
        category: "unknown"
      };
    }

    // 2. 필수 퀘스트 및 업그레이드 재료 (가장 중요)
    // usedForWorkshop(Scrappy/Base) 아이템은 특히 희귀할 수 있음
    if (dbItem.usedForQuests || dbItem.usedForWorkshop) {
      const minKeep = dbItem.defaultKeepMin || 1;
      
      if (item.qty <= minKeep) {
        return {
          ...item,
          action: "KEEP",
          reason: dbItem.usedForQuests 
            ? `퀘스트 필수 재료 (목표: ${minKeep}개)` 
            : `시설/Scrappy 업그레이드 재료 (중요)`,
          category: dbItem.category
        };
      } else {
        // 퀘스트템이라도 너무 많으면 MAYBE
        return {
          ...item,
          action: "MAYBE",
          reason: `필요 수량(${minKeep}) 충족됨. 여유분`,
          category: dbItem.category
        };
      }
    }

    // 3. 제작 재료 (Crafting)
    if (dbItem.usedForCrafting) {
      const minKeep = dbItem.defaultKeepMin || 20;
      if (item.qty <= minKeep) {
        return {
          ...item,
          action: "KEEP",
          reason: "제작 재료",
          category: dbItem.category
        };
      }
      return {
        ...item,
        action: "MAYBE",
        reason: `제작 재료 여유분 (>${minKeep})`,
        category: dbItem.category
      };
    }

    // 4. 탄약 및 일반 자원
    if (dbItem.category === "ammo" || dbItem.category === "material") {
      const baseMin = dbItem.defaultKeepMin || 10;
      const recycleThreshold = baseMin * 3; // 3배 이상이면 과함
      
      if (item.qty > recycleThreshold) {
        return {
          ...item,
          action: "RECYCLE",
          reason: `재고 과다 (>${recycleThreshold}) -> 판매/분해 추천`,
          category: dbItem.category
        };
      }
      return {
        ...item,
        action: "KEEP",
        reason: "기본 소모품",
        category: dbItem.category
      };
    }

    // 5. 그 외 (Valuables 등)
    // minKeep이 0인 경우(예: Old Currency)는 다다익선이거나 바로 파는 것일 수 있음
    // 여기서는 "KEEP"으로 분류하되, 판매용 아이템임을 명시할 수도 있음
    
    return {
      ...item,
      action: "KEEP",
      reason: "보관 추천",
      category: dbItem.category
    };
  });
}