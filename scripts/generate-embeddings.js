#!/usr/bin/env node
/**
 * 수집된 아이콘으로 CLIP 임베딩을 생성해 public/embeddings.json에 저장합니다.
 * - public/items/*.{png,jpg}를 순회
 * - src/data/items.json의 이름과 매핑 후 feature-extraction 수행
 * - 개선점 (2025-12-02):
 *   1. 모델 업그레이드 (patch32 -> patch16)
 *   2. 배경 합성 (투명 -> 어두운 회색 #1f2937)
 *   3. **Data Augmentation**: 수량 텍스트(x5, 99 등)가 겹쳐진 노이즈 데이터를 추가 생성하여 인식률 향상
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

// 텍스트 오버레이용 SVG 생성
function createTextOverlay(text, fontSize = 60) {
  // 우측 하단 배치
  return `
    <svg width="224" height="224">
      <style>
        .text { fill: white; stroke: black; stroke-width: 2px; font-size: ${fontSize}px; font-weight: bold; font-family: sans-serif; }
      </style>
      <text x="95%" y="90%" text-anchor="end" class="text">${text}</text>
    </svg>
  `;
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

  console.log(`아이템 ${pairs.length}개 임베딩 생성 시작 (Augmentation 적용)...`);
  const result = {};

  // Augmentation 설정
  const BACKGROUNDS = {
    gray: { r: 31, g: 41, b: 55, alpha: 1 }, // #1f2937 (Default)
    green: { r: 6, g: 78, b: 59, alpha: 1 }, // #064e3b (Uncommon)
    blue: { r: 30, g: 58, b: 138, alpha: 1 }, // #1e3a8a (Rare)
    purple: { r: 88, g: 28, b: 135, alpha: 1 }, // #581c87 (Epic)
  };

  const TEXT_VARIANTS = [
    { suffix: '', text: null },       // No text
    { suffix: '_x5', text: 'x5' },    // Common quantity
    { suffix: '_99', text: '99' },    // Max stack
  ];

  let count = 0;

  for (const { name, file } of pairs) {
    try {
      // 아이콘 원본 로드 (리사이징 전)
      const originalBuffer = await sharp(file).toBuffer();

      // 모든 배경색 x 모든 텍스트 조합 생성 (Cross Product)
      for (const [bgName, bgColor] of Object.entries(BACKGROUNDS)) {
        
        // 1. 배경 합성 및 리사이징
        const baseBuffer = await sharp(originalBuffer)
          .resize(224, 224, { fit: 'contain', background: bgColor })
          .flatten({ background: bgColor })
          .toFormat('png')
          .toBuffer();

        for (const textVar of TEXT_VARIANTS) {
          let finalBuffer = baseBuffer;

          // 2. 텍스트 오버레이 합성
          if (textVar.text) {
            const svg = createTextOverlay(textVar.text);
            finalBuffer = await sharp(baseBuffer)
              .composite([{ input: Buffer.from(svg), gravity: 'southeast' }])
              .toBuffer();
          }

          // 3. 임베딩 생성
          const rawImage = await RawImage.fromBlob(new Blob([finalBuffer]));
          const output = await extractor(rawImage, { pooling: 'mean', normalize: true });
          const vec = Array.from(output.data ?? output);
          
          // 키 이름 생성 (예: Bandage__bg_gray_x5)
          // worker.ts에서 __bg_... 로 분리하여 베이스 이름 추출 가능
          const key = `${name}__bg_${bgName}${textVar.suffix}`;
          result[key] = normalize(vec);
        }
      }

      count++;
      if (count % 5 === 0) process.stdout.write('.');

    } catch (e) {
      console.error(`\n[Error] ${name} 처리 실패:`, e.message);
    }
  }

  console.log('\n');
  await fs.writeFile(OUTPUT, JSON.stringify(result, null, 2));
  console.log(`임베딩 저장 완료: ${OUTPUT} (총 ${Object.keys(result).length}개 벡터)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});