import rawItems from './items.json';
import { ItemMetadata } from '../types';

type CategoryKey = keyof typeof rawItems.categoryPresets;

type CategoryPreset = {
  category: ItemMetadata['category'];
  defaultKeepMin?: number;
  usedForCrafting?: boolean;
  usedForQuests?: boolean;
  usedForWorkshop?: boolean;
  usedForSpecialVendor?: boolean;
  maxStack?: number;
  rarity?: ItemMetadata['rarity'];
  mainColor?: string;
  weight?: number;
};

type JsonItem = {
  name: string;
  aliases?: string[];
  rarity?: ItemMetadata['rarity'];
  mainColor?: string;
  weight?: number;
  maxStack?: number;
  defaultKeepMin?: number;
  category?: ItemMetadata['category'];
  usedForCrafting?: boolean;
  usedForQuests?: boolean;
  usedForWorkshop?: boolean;
  usedForSpecialVendor?: boolean;
};

type ItemsJson = {
  categoryPresets: Record<CategoryKey, CategoryPreset>;
  items: Record<CategoryKey, Array<string | JsonItem>>;
  overrides: Record<string, Partial<ItemMetadata>>;
};

const data = rawItems as unknown as ItemsJson;

const mergeWithPreset = (item: JsonItem, preset: CategoryPreset): ItemMetadata => {
  return {
    name: item.name,
    category: item.category ?? preset.category ?? 'misc',
    aliases: item.aliases ?? [],
    rarity: item.rarity ?? preset.rarity ?? 'common',
    mainColor: item.mainColor ?? preset.mainColor ?? '#9ca3af',
    weight: item.weight ?? preset.weight ?? 1,
    defaultKeepMin: item.defaultKeepMin ?? preset.defaultKeepMin,
    usedForCrafting: item.usedForCrafting ?? preset.usedForCrafting,
    usedForQuests: item.usedForQuests ?? preset.usedForQuests,
    usedForWorkshop: item.usedForWorkshop ?? preset.usedForWorkshop,
    usedForSpecialVendor: item.usedForSpecialVendor ?? preset.usedForSpecialVendor,
    maxStack: item.maxStack ?? preset.maxStack,
  };
};

export const ITEMS_DB: Record<string, ItemMetadata> = Object.entries(data.items).reduce(
  (acc, [categoryKey, items]) => {
    const preset = data.categoryPresets[categoryKey as CategoryKey];

    items.forEach((entry) => {
      const normalized: JsonItem = typeof entry === 'string' ? { name: entry } : entry;
      const meta = mergeWithPreset(normalized, preset);
      acc[meta.name] = meta;
    });

    return acc;
  },
  {} as Record<string, ItemMetadata>
);

Object.entries(data.overrides).forEach(([name, override]) => {
  if (!ITEMS_DB[name]) {
    const fallbackPreset = {
      category: override.category ?? 'misc',
      rarity: override.rarity ?? 'common',
      mainColor: override.mainColor ?? '#9ca3af',
      weight: override.weight ?? 1,
    } as CategoryPreset;
    ITEMS_DB[name] = mergeWithPreset({ name, ...override }, fallbackPreset);
    return;
  }
  ITEMS_DB[name] = {
    ...ITEMS_DB[name],
    ...override,
    aliases: override.aliases ?? ITEMS_DB[name].aliases ?? [],
    rarity: override.rarity ?? ITEMS_DB[name].rarity,
    mainColor: override.mainColor ?? ITEMS_DB[name].mainColor,
    weight: override.weight ?? ITEMS_DB[name].weight,
  };
});

export const ITEMS = Object.values(ITEMS_DB);
