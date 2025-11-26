import { ItemMetadata } from '../types';

// 인식률을 높이기 위해 가능한 많은 아이템을 등록해야 합니다.
export const ITEMS_DB: Record<string, ItemMetadata> = {
  // --- Quest & Special ---
  "Assorted Seeds": { name: "Assorted Seeds", category: "material", usedForQuests: true, defaultKeepMin: 50 },
  "Rusted Medical Kit": { name: "Rusted Medical Kit", category: "consumable", defaultKeepMin: 10 },
  "Old Currency": { name: "Old Currency", category: "misc", defaultKeepMin: 0 },
  "Drug Production Kit": { name: "Drug Production Kit", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Memory Chip": { name: "Memory Chip", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Encrypted Data Drive": { name: "Encrypted Data Drive", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  
  // --- Ammo ---
  "Standard Ammo": { name: "Standard Ammo", category: "ammo", defaultKeepMin: 500 },
  "High-Caliber Ammo": { name: "High-Caliber Ammo", category: "ammo", defaultKeepMin: 200 },
  "Compact Ammo": { name: "Compact Ammo", category: "ammo", defaultKeepMin: 300 },
  "Energy Cell": { name: "Energy Cell", category: "ammo", defaultKeepMin: 100 },
  "Explosive Charge": { name: "Explosive Charge", category: "ammo", defaultKeepMin: 20 },
  
  // --- Crafting Materials ---
  "Scrap Metal": { name: "Scrap Metal", category: "material", usedForCrafting: true, defaultKeepMin: 100 },
  "Electronic Parts": { name: "Electronic Parts", category: "material", usedForWorkshop: true, defaultKeepMin: 20 },
  "Synthetic Fabric": { name: "Synthetic Fabric", category: "material", usedForCrafting: true, defaultKeepMin: 50 },
  "Plastic Polymer": { name: "Plastic Polymer", category: "material", usedForCrafting: true, defaultKeepMin: 50 },
  "Chemical Compound": { name: "Chemical Compound", category: "material", usedForCrafting: true, defaultKeepMin: 30 },
  "Weapon Parts": { name: "Weapon Parts", category: "material", usedForWorkshop: true, defaultKeepMin: 10 },
  "Armor Plating": { name: "Armor Plating", category: "material", usedForWorkshop: true, defaultKeepMin: 10 },
  
  // --- Consumables ---
  "Canned Food": { name: "Canned Food", category: "consumable", defaultKeepMin: 10 },
  "Clean Water": { name: "Clean Water", category: "consumable", defaultKeepMin: 10 },
  "Painkillers": { name: "Painkillers", category: "consumable", defaultKeepMin: 5 },
  "Bandage": { name: "Bandage", category: "consumable", defaultKeepMin: 10 },
  "Stimpack": { name: "Stimpack", category: "consumable", defaultKeepMin: 5 },
  
  // --- Valuables/Misc ---
  "Gold Watch": { name: "Gold Watch", category: "misc", defaultKeepMin: 0 },
  "Silver Locket": { name: "Silver Locket", category: "misc", defaultKeepMin: 0 },
  "Gemstone": { name: "Gemstone", category: "misc", defaultKeepMin: 0 },
};
