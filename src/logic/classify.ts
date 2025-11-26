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
    const dbItem = ITEMS_DB[item.name];

    // 1. DB에 없는 아이템 -> 보수적 KEEP
    if (!dbItem) {
      return {
        ...item,
        action: "KEEP",
        reason: "미식별 아이템 (보관)",
        category: "unknown"
      };
    }

    // 2. 잡동사니(Misc) 중 defaultKeepMin이 0인 것 -> RECYCLE (판매/분해)
    // 단, usedForWorkshop(희귀 업그레이드 재료)은 제외
    if (dbItem.category === "misc" && !dbItem.usedForWorkshop && dbItem.defaultKeepMin === 0) {
      return {
        ...item,
        action: "RECYCLE",
        reason: "잡동사니/손상된 부품 (판매/분해 추천)",
        category: dbItem.category
      };
    }

    // 3. 퀘스트/워크샵 필수 재료 -> KEEP
    if (dbItem.usedForQuests || dbItem.usedForWorkshop) {
      const minKeep = dbItem.defaultKeepMin || 1;
      if (item.qty <= minKeep) {
        return {
          ...item,
          action: "KEEP",
          reason: dbItem.usedForQuests ? "퀘스트 필수" : "시설 업그레이드용",
          category: dbItem.category
        };
      } else {
        return {
          ...item,
          action: "MAYBE",
          reason: `필요량(${minKeep}) 충족됨`,
          category: dbItem.category
        };
      }
    }

    // 4. 일반 제작 재료 / 탄약 / 소모품
    if (dbItem.category === "material" || dbItem.category === "ammo" || dbItem.category === "consumable") {
      const baseMin = dbItem.defaultKeepMin || 10;
      const recycleThreshold = baseMin * 3;
      
      if (item.qty > recycleThreshold) {
        return {
          ...item,
          action: "RECYCLE",
          reason: `보유 과다 (>${recycleThreshold})`,
          category: dbItem.category
        };
      }
      return {
        ...item,
        action: "KEEP",
        reason: "필수 소모품/재료",
        category: dbItem.category
      };
    }

    // 5. 그 외
    return {
      ...item,
      action: "KEEP",
      reason: "보관",
      category: dbItem.category
    };
  });
}
