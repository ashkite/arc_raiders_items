import { ItemMetadata } from '../types';

/**
 * Arc Raiders 아이템 데이터베이스
 * 출처: arcraiders.wiki 및 커뮤니티 데이터 기반
 */
export const ITEMS_DB: Record<string, ItemMetadata> = {
  // --- Quest & Mission Critical ---
  "Antiseptic": { name: "Antiseptic", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Durable Cloth": { name: "Durable Cloth", category: "material", usedForQuests: true, usedForCrafting: true, defaultKeepMin: 20 },
  "Fertilizer": { name: "Fertilizer", category: "material", usedForQuests: true, defaultKeepMin: 20 },
  "Power Rod": { name: "Power Rod", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Snitch Scanner": { name: "Snitch Scanner", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Syringe": { name: "Syringe", category: "consumable", usedForQuests: true, defaultKeepMin: 15 },
  "Water Pump": { name: "Water Pump", category: "material", usedForQuests: true, defaultKeepMin: 2 },
  "Wire": { name: "Wire", category: "material", usedForQuests: true, usedForCrafting: true, defaultKeepMin: 50 },
  "Memory Chip": { name: "Memory Chip", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Encrypted Data Drive": { name: "Encrypted Data Drive", category: "material", usedForQuests: true, defaultKeepMin: 5 },

  // --- Scrappy & Base Upgrades (Rare/Unique) ---
  "Apricot": { name: "Apricot", category: "misc", usedForWorkshop: true, defaultKeepMin: 5 }, // Scrappy Food?
  "Cat Bed": { name: "Cat Bed", category: "misc", usedForWorkshop: true, defaultKeepMin: 1 },
  "Dog Collar": { name: "Dog Collar", category: "misc", usedForWorkshop: true, defaultKeepMin: 1 },
  "Lemon": { name: "Lemon", category: "consumable", usedForWorkshop: true, defaultKeepMin: 5 },
  "Mushroom": { name: "Mushroom", category: "consumable", usedForWorkshop: true, defaultKeepMin: 10 },
  "Olive": { name: "Olive", category: "consumable", usedForWorkshop: true, defaultKeepMin: 10 },
  "Prickly Pear": { name: "Prickly Pear", category: "consumable", usedForWorkshop: true, defaultKeepMin: 10 },
  "Very Comfortable Pillow": { name: "Very Comfortable Pillow", category: "misc", usedForWorkshop: true, defaultKeepMin: 2 },

  // --- Advanced Crafting Components ---
  "Mechanical Component": { name: "Mechanical Component", category: "material", usedForCrafting: true, defaultKeepMin: 30 },
  "Advanced Electrical Component": { name: "Advanced Electrical Component", category: "material", usedForCrafting: true, defaultKeepMin: 20 },
  "Arc Alloy": { name: "Arc Alloy", category: "material", usedForCrafting: true, defaultKeepMin: 20 },
  "Arc Circuitry": { name: "Arc Circuitry", category: "material", usedForCrafting: true, defaultKeepMin: 15 },
  "Arc Motion Core": { name: "Arc Motion Core", category: "material", usedForCrafting: true, defaultKeepMin: 5 },
  "Weapon Part": { name: "Weapon Part", category: "material", usedForCrafting: true, defaultKeepMin: 20 },
  
  // --- Common Resources ---
  "Scrap Metal": { name: "Scrap Metal", category: "material", usedForCrafting: true, defaultKeepMin: 100 },
  "Plastic": { name: "Plastic", category: "material", usedForCrafting: true, defaultKeepMin: 50 },
  "Rubber": { name: "Rubber", category: "material", usedForCrafting: true, defaultKeepMin: 40 },
  "Glass": { name: "Glass", category: "material", usedForCrafting: true, defaultKeepMin: 30 },
  
  // --- Ammo & Combat ---
  "Standard Ammo": { name: "Standard Ammo", category: "ammo", defaultKeepMin: 500 },
  "High-Caliber Ammo": { name: "High-Caliber Ammo", category: "ammo", defaultKeepMin: 200 },
  "Compact Ammo": { name: "Compact Ammo", category: "ammo", defaultKeepMin: 300 },
  "Energy Cell": { name: "Energy Cell", category: "ammo", defaultKeepMin: 100 },
  "Explosive Charge": { name: "Explosive Charge", category: "ammo", defaultKeepMin: 20 },
  "Grenade": { name: "Grenade", category: "weapon", defaultKeepMin: 5 },

  // --- Consumables ---
  "Medical Supply": { name: "Medical Supply", category: "consumable", defaultKeepMin: 15 },
  "Canned Food": { name: "Canned Food", category: "consumable", defaultKeepMin: 10 },
  "Clean Water": { name: "Clean Water", category: "consumable", defaultKeepMin: 10 },
  "Painkillers": { name: "Painkillers", category: "consumable", defaultKeepMin: 5 },
  "Stimpack": { name: "Stimpack", category: "consumable", defaultKeepMin: 5 },

  // --- Valuables ---
  "Old Currency": { name: "Old Currency", category: "misc", defaultKeepMin: 0 },
  "Gold Watch": { name: "Gold Watch", category: "misc", defaultKeepMin: 0 },
  "Silver Locket": { name: "Silver Locket", category: "misc", defaultKeepMin: 0 },
};