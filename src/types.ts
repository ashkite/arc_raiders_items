export type Action = "KEEP" | "MAYBE" | "RECYCLE";

export type RawItem = {
  name: string;
  qty: number;
};

export type ClassifiedItem = RawItem & {
  action: Action;
  reason: string;
  category?: string; // e.g., "ammo", "material", "quest"
};

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type ItemMetadata = {
  name: string;
  category: "ammo" | "material" | "consumable" | "weapon" | "armor" | "misc";
  aliases: string[];
  rarity: Rarity;
  mainColor: string;
  weight: number;
  usedForQuests?: boolean;
  usedForWorkshop?: boolean;
  usedForCrafting?: boolean;
  usedForSpecialVendor?: boolean;
  defaultKeepMin?: number; // 권장 최소 보유량
  maxStack?: number;
};

export type OcrResult = {
  rawText: string;
  lines: string[];
};

export interface ItemResult {
  id: string;
  name: string;
  confidence: number;
  details?: string;
}
