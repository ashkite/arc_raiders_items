import { ItemMetadata } from '../types';

/**
 * Arc Raiders 아이템 데이터베이스 (Wiki & Community Data Verified)
 */
export const ITEMS_DB: Record<string, ItemMetadata> = {
  // --- Medical & Consumables (회복 및 소모품) ---
  "Adrenaline Shot": { name: "Adrenaline Shot", category: "consumable", defaultKeepMin: 5 },
  "Agave Juice": { name: "Agave Juice", category: "consumable", defaultKeepMin: 10 },
  "Bandage": { name: "Bandage", category: "consumable", defaultKeepMin: 20 },
  "Herbal Bandage": { name: "Herbal Bandage", category: "consumable", defaultKeepMin: 10 },
  "Sterilized Bandage": { name: "Sterilized Bandage", category: "consumable", defaultKeepMin: 10 },
  "Medical Supply": { name: "Medical Supply", category: "consumable", defaultKeepMin: 20 },
  "Painkillers": { name: "Painkillers", category: "consumable", defaultKeepMin: 10 },
  "Stimpack": { name: "Stimpack", category: "consumable", defaultKeepMin: 5 },
  "Vita Shot": { name: "Vita Shot", category: "consumable", defaultKeepMin: 5 },
  "Vita Spray": { name: "Vita Spray", category: "consumable", defaultKeepMin: 5 },
  "Fruit Mix": { name: "Fruit Mix", category: "consumable", defaultKeepMin: 10 },
  "Canned Food": { name: "Canned Food", category: "consumable", defaultKeepMin: 10 },
  "Clean Water": { name: "Clean Water", category: "consumable", defaultKeepMin: 10 },

  // --- Gadgets & Grenades (가젯 및 투척무기) ---
  "Blaze Grenade": { name: "Blaze Grenade", category: "weapon", defaultKeepMin: 5 },
  "Gas Grenade": { name: "Gas Grenade", category: "weapon", defaultKeepMin: 5 },
  "Smoke Grenade": { name: "Smoke Grenade", category: "weapon", defaultKeepMin: 5 },
  "Lure Grenade": { name: "Lure Grenade", category: "weapon", defaultKeepMin: 5 },
  "Shock Grenade": { name: "Shock Grenade", category: "weapon", defaultKeepMin: 5 },
  "Explosive Mine": { name: "Explosive Mine", category: "weapon", defaultKeepMin: 5 },
  "Gas Mine": { name: "Gas Mine", category: "weapon", defaultKeepMin: 5 },
  "Jolt Mine": { name: "Jolt Mine", category: "weapon", defaultKeepMin: 5 },
  "Pulse Mine": { name: "Pulse Mine", category: "weapon", defaultKeepMin: 5 },
  "Light Stick": { name: "Light Stick", category: "misc", defaultKeepMin: 10 },
  "Binoculars": { name: "Binoculars", category: "misc", defaultKeepMin: 1 },
  "Zipline Tool": { name: "Zipline Tool", category: "misc", defaultKeepMin: 1 },

  // --- Crafting Materials (일반 제작 재료) ---
  "Scrap Metal": { name: "Scrap Metal", category: "material", usedForCrafting: true, defaultKeepMin: 100 },
  "Plastic": { name: "Plastic", category: "material", usedForCrafting: true, defaultKeepMin: 50 },
  "Rubber": { name: "Rubber", category: "material", usedForCrafting: true, defaultKeepMin: 40 },
  "Glass": { name: "Glass", category: "material", usedForCrafting: true, defaultKeepMin: 30 },
  "Fabric": { name: "Fabric", category: "material", usedForCrafting: true, defaultKeepMin: 50 },
  "Wire": { name: "Wire", category: "material", usedForCrafting: true, defaultKeepMin: 50 },
  "Canister": { name: "Canister", category: "material", usedForCrafting: true, defaultKeepMin: 20 },
  "Chemicals": { name: "Chemicals", category: "material", usedForCrafting: true, defaultKeepMin: 20 },
  "Explosive Compound": { name: "Explosive Compound", category: "material", usedForCrafting: true, defaultKeepMin: 20 },

  // --- Advanced Components (고급 부품) ---
  "Mechanical Component": { name: "Mechanical Component", category: "material", usedForCrafting: true, defaultKeepMin: 30 },
  "Advanced Mechanical Component": { name: "Advanced Mechanical Component", category: "material", usedForCrafting: true, defaultKeepMin: 10 },
  "Electrical Component": { name: "Electrical Component", category: "material", usedForCrafting: true, defaultKeepMin: 30 },
  "Advanced Electrical Component": { name: "Advanced Electrical Component", category: "material", usedForCrafting: true, defaultKeepMin: 10 },
  "Arc Alloy": { name: "Arc Alloy", category: "material", usedForCrafting: true, defaultKeepMin: 20 },
  "Arc Circuitry": { name: "Arc Circuitry", category: "material", usedForCrafting: true, defaultKeepMin: 15 },
  "Arc Motion Core": { name: "Arc Motion Core", category: "material", usedForCrafting: true, defaultKeepMin: 5 },
  "Bastion Cell": { name: "Bastion Cell", category: "material", usedForCrafting: true, defaultKeepMin: 5 },
  "Flow Controller": { name: "Flow Controller", category: "material", usedForCrafting: true, defaultKeepMin: 5 },
  "Industrial Battery": { name: "Industrial Battery", category: "material", usedForCrafting: true, defaultKeepMin: 5 },
  "Laboratory Reagents": { name: "Laboratory Reagents", category: "material", usedForCrafting: true, defaultKeepMin: 10 },
  "Magnetic Accelerator": { name: "Magnetic Accelerator", category: "material", usedForCrafting: true, defaultKeepMin: 5 },
  "Motor": { name: "Motor", category: "material", usedForCrafting: true, defaultKeepMin: 10 },
  "Sensors": { name: "Sensors", category: "material", usedForCrafting: true, defaultKeepMin: 10 },
  "Steel Spring": { name: "Steel Spring", category: "material", usedForCrafting: true, defaultKeepMin: 20 },

  // --- Quest & Mob Drops (퀘스트 및 몹 드랍 재료) ---
  // 주의: 몹 이름과 혼동하지 않도록 주의
  "Hornet Driver": { name: "Hornet Driver", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Wasp Driver": { name: "Wasp Driver", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Rocketeer Driver": { name: "Rocketeer Driver", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Leaper Pulse Unit": { name: "Leaper Pulse Unit", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Surveyor Vault": { name: "Surveyor Vault", category: "material", usedForQuests: true, defaultKeepMin: 3 }, // 실제 아이템임
  "Sentinel Firing Core": { name: "Sentinel Firing Core", category: "material", usedForQuests: true, defaultKeepMin: 3 },
  "Tick Pod": { name: "Tick Pod", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Snitch Scanner": { name: "Snitch Scanner", category: "material", usedForQuests: true, defaultKeepMin: 5 },
  "Antiseptic": { name: "Antiseptic", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Durable Cloth": { name: "Durable Cloth", category: "material", usedForQuests: true, defaultKeepMin: 20 },
  "Fertilizer": { name: "Fertilizer", category: "material", usedForQuests: true, defaultKeepMin: 20 },
  "Power Rod": { name: "Power Rod", category: "material", usedForQuests: true, defaultKeepMin: 10 },
  "Water Pump": { name: "Water Pump", category: "material", usedForQuests: true, defaultKeepMin: 2 },

  // --- Base/Scrappy Upgrades (희귀 재료) ---
  "Apricot": { name: "Apricot", category: "misc", usedForWorkshop: true, defaultKeepMin: 5 },
  "Lemon": { name: "Lemon", category: "misc", usedForWorkshop: true, defaultKeepMin: 5 },
  "Mushroom": { name: "Mushroom", category: "misc", usedForWorkshop: true, defaultKeepMin: 10 },
  "Olive": { name: "Olive", category: "misc", usedForWorkshop: true, defaultKeepMin: 10 },
  "Prickly Pear": { name: "Prickly Pear", category: "misc", usedForWorkshop: true, defaultKeepMin: 10 },
  "Cat Bed": { name: "Cat Bed", category: "misc", usedForWorkshop: true, defaultKeepMin: 1 },
  "Dog Collar": { name: "Dog Collar", category: "misc", usedForWorkshop: true, defaultKeepMin: 1 },
  "Very Comfortable Pillow": { name: "Very Comfortable Pillow", category: "misc", usedForWorkshop: true, defaultKeepMin: 1 },
  "Toaster": { name: "Toaster", category: "misc", usedForWorkshop: true, defaultKeepMin: 1 },
  "Light Bulb": { name: "Light Bulb", category: "misc", usedForWorkshop: true, defaultKeepMin: 5 },
  "Cooling Fan": { name: "Cooling Fan", category: "misc", usedForWorkshop: true, defaultKeepMin: 5 },
  
  // --- Ammo ---
  "Standard Ammo": { name: "Standard Ammo", category: "ammo", defaultKeepMin: 500 },
  "High-Caliber Ammo": { name: "High-Caliber Ammo", category: "ammo", defaultKeepMin: 200 },
  "Compact Ammo": { name: "Compact Ammo", category: "ammo", defaultKeepMin: 300 },
  "Energy Cell": { name: "Energy Cell", category: "ammo", defaultKeepMin: 100 },

  // --- Valuables ---
  "Old Currency": { name: "Old Currency", category: "misc", defaultKeepMin: 0 },
  "Gold Watch": { name: "Gold Watch", category: "misc", defaultKeepMin: 0 },
};
