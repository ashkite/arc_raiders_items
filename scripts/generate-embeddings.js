#!/usr/bin/env node
/**
 * 수집된 아이콘으로 CLIP 임베딩을 생성해 public/embeddings.json에 저장합니다.
 * - public/items/*.{png,jpg}를 순회
 * - src/data/items.json의 이름과 매핑 후 feature-extraction 수행
 * - 결과: { "Item Name": [float, ...] }
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { pipeline, env } from '@xenova/transformers';
import fetch, { Response } from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ICON_DIR = path.join(PUBLIC_DIR, 'items');
const ITEMS_JSON = path.join(ROOT, 'src', 'data', 'items.json');
const OUTPUT = path.join(PUBLIC_DIR, 'embeddings.json');
const ICONS_MAP = path.join(PUBLIC_DIR, 'icons-map.json');

env.allowLocalModels = true;
env.localModelPath = path.join(PUBLIC_DIR, 'models');
// 로컬 모델이 없으면 remote 허용 (필요 시 네트워크)
env.allowRemoteModels = true;
// 로컬 파일 접근용 커스텀 fetch 정의
const customFetch = async (url, options) => {
  const target = typeof url === 'string' ? url : url?.toString?.() ?? '';
  if (target.startsWith('file://')) {
    const filePath = fileURLToPath(target);
    const buf = await fs.readFile(filePath);
    return new Response(buf, { status: 200 });
  }
  return fetch(url, options);
};
env.fetch = customFetch;
globalThis.fetch = customFetch;

const normalize = (arr) => {
  let norm = 0;
  for (const v of arr) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return arr.map((v) => v / norm);
};

async function loadItemsDb() {
  const raw = await fs.readFile(ITEMS_JSON, 'utf-8');
  return JSON.parse(raw);
}

async function listIcons() {
  try {
    const files = await fs.readdir(ICON_DIR);
    return files.filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
  } catch (e) {
    console.warn('아이콘 디렉토리를 찾을 수 없습니다.', e);
    return [];
  }
}

async function loadIconsMap() {
  try {
    const raw = await fs.readFile(ICONS_MAP, 'utf-8');
    const list = JSON.parse(raw);
    const map = new Map();
    list.forEach((entry) => {
      if (entry?.name && entry?.file) map.set(entry.name, entry.file);
    });
    return map;
  } catch {
    return new Map();
  }
}

function mapNameToIcon(db, icons, iconsMap) {
  const iconMap = new Map();
  icons.forEach((file) => {
    const base = path.basename(file, path.extname(file));
    iconMap.set(base, file);
  });

  const pairs = [];
  Object.values(db.items).forEach((arr) => {
    arr.forEach((entry) => {
      const obj = typeof entry === 'string' ? { name: entry } : entry;
      // 1) icons-map.json 매핑 우선
      if (iconsMap.has(obj.name)) {
        const file = iconsMap.get(obj.name);
        pairs.push({ name: obj.name, file: path.join(PUBLIC_DIR, file) });
        return;
      }
      // 2) slug 기반 매칭
      const slug = obj.icon || obj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const file = iconMap.get(slug);
      if (file) pairs.push({ name: obj.name, file: path.join(ICON_DIR, file) });
    });
  });
  return pairs;
}

async function main() {
  const db = await loadItemsDb();
  const icons = await listIcons();
  const iconsMap = await loadIconsMap();
  if (icons.length === 0 && iconsMap.size === 0) {
    throw new Error('아이콘이 없습니다. fetch-gamedata.js를 먼저 실행하세요.');
  }

  const pairs = mapNameToIcon(db, icons, iconsMap);
  if (pairs.length === 0) {
    throw new Error('아이콘과 아이템 이름을 매칭하지 못했습니다. icons-map.json 또는 파일명을 확인하세요.');
  }

  const baseUrl = process.env.EMBED_BASE_URL ? process.env.EMBED_BASE_URL.replace(/\/+$/, '') : null;

  console.log(`아이템 ${pairs.length}개 임베딩 생성 시작...`);
  // 이미지 입력을 처리하는 전용 파이프라인 사용
  const extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', { quantized: true });

  const result = {};
  for (const { name, file } of pairs) {
    const fileUrl = baseUrl
      ? `${baseUrl}/${path.basename(file)}`
      : pathToFileURL(file).href;
    const output = await extractor(fileUrl, { pooling: 'mean', normalize: true });
    const vec = Array.from(output.data ?? output);
    result[name] = normalize(vec);
  }

  await fs.writeFile(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`임베딩 저장 완료: ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
