#!/usr/bin/env node
/**
 * 수집된 아이콘으로 CLIP 임베딩을 생성해 public/embeddings.json에 저장합니다.
 * - public/items/*.{png,jpg}를 순회
 * - src/data/items.json의 이름과 매핑 후 feature-extraction 수행
 * - 개선점:
 *   1. 모델 업그레이드 (patch32 -> patch16)
 *   2. 배경 합성 (투명 -> 어두운 회색)으로 인식률 향상
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline, env, RawImage } from '@xenova/transformers';
import fetch, { Response } from 'node-fetch';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ICON_DIR = path.join(PUBLIC_DIR, 'items');
const ITEMS_JSON = path.join(ROOT, 'src', 'data', 'items.json');
const OUTPUT = path.join(PUBLIC_DIR, 'embeddings.json');
const ICONS_MAP = path.join(PUBLIC_DIR, 'icons-map.json');

// 1. 모델 업그레이드: 더 높은 해상도(16x16 패치)로 미세한 차이 식별
const MODEL_ID = 'Xenova/clip-vit-base-patch16';

env.allowLocalModels = true;
env.localModelPath = path.join(PUBLIC_DIR, 'models');
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
      if (iconsMap.has(obj.name)) {
        const file = iconsMap.get(obj.name);
        pairs.push({ name: obj.name, file: path.join(PUBLIC_DIR, file) });
        return;
      }
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
    throw new Error('아이콘 매칭 실패. icons-map.json 또는 파일명을 확인하세요.');
  }

  console.log(`모델 ${MODEL_ID} 로드 중...`);
  const extractor = await pipeline('image-feature-extraction', MODEL_ID, { quantized: true });

  console.log(`아이템 ${pairs.length}개 임베딩 생성 시작 (배경 합성 적용)...`);
  const result = {};

  for (const { name, file } of pairs) {
    try {
      // 2. 배경 합성 (Data Augmentation)
      // 실제 게임은 어두운 배경(슬롯) 위에 아이콘이 있음.
      // 투명 배경인 이미지를 그대로 학습하면 인식률이 떨어짐.
      // 따라서 인벤토리 슬롯 색상(#1f2937, 다크 그레이)을 배경으로 합성함.
      const buffer = await sharp(file)
        .resize(224, 224, { fit: 'contain', background: { r: 31, g: 41, b: 55, alpha: 1 } }) // #1f2937
        .flatten({ background: { r: 31, g: 41, b: 55 } }) // 투명 영역 채우기
        .toFormat('png')
        .toBuffer();

      // RawImage 변환 (Transformers.js 호환)
      const rawImage = await RawImage.fromBlob(new Blob([buffer]));
      
      const output = await extractor(rawImage, { pooling: 'mean', normalize: true });
      const vec = Array.from(output.data ?? output);
      result[name] = normalize(vec);
      
      // 진행 상황 표시 (10개 단위)
      if (Object.keys(result).length % 10 === 0) {
        process.stdout.write('.');
      }
    } catch (e) {
      console.error(`\n[Error] ${name} 처리 실패:`, e.message);
    }
  }

  console.log('\n');
  await fs.writeFile(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`임베딩 저장 완료: ${OUTPUT} (${Object.keys(result).length}개)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});