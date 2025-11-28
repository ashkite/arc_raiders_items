#!/usr/bin/env node
/**
 * ARC Raiders 아이템 아이콘 + 메타데이터 수집기
 * - arcraiders.wiki Category:Item_Icons 페이지에서 아이콘 다운로드
 * - Teyk0o/ARDB (공개 DB)에서 무게/등급/스택 정보를 병합
 * - 결과:
 *   - public/items/<slug>.png (아이콘)
 *   - src/data/items.json (기존 구조에 메타필드 덮어쓰기)
 *
 * 네트워크/사이트 변경 시 실패할 수 있으니, 필요한 경우 URL을 업데이트하세요.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { load as loadHtml } from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ICON_SOURCES = [
  process.env.ICON_SOURCE_URL,
  'https://arcraiders.wiki/wiki/Category:Item_Icons',
  'https://arcraiders.wiki.gg/wiki/Category:Item_Icons',
].filter(Boolean);
const ICON_HTML_FILE = process.env.ICON_HTML_FILE; // 로컬에 저장한 HTML 파일 경로
const ICON_COOKIE = process.env.ICON_COOKIE; // 필요 시 세션 쿠키 전달
const META_URL = 'https://raw.githubusercontent.com/Teyk0o/ARDB/main/data/items.json';
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ICON_DIR = path.join(PUBLIC_DIR, 'items');
const ITEMS_JSON = path.join(ROOT, 'src', 'data', 'items.json');

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const normalizeName = (raw) => {
  return raw
    .replace(/^File:/i, '')
    .replace(/\.png$/i, '')
    .replace(/[_-]?icon$/i, '')
    .trim();
};

async function ensureDirs() {
  await fs.mkdir(ICON_DIR, { recursive: true });
}

async function fetchHtml(url) {
  if (ICON_HTML_FILE) {
    console.log(`ICON_HTML_FILE 사용: ${ICON_HTML_FILE}`);
    return fs.readFile(ICON_HTML_FILE, 'utf-8');
  }

  const res = await fetch(url, {
    headers: {
      // wiki.gg는 UA가 없으면 401을 줄 수 있음
      'User-Agent': 'Mozilla/5.0 (fetch-gamedata-script)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(ICON_COOKIE ? { Cookie: ICON_COOKIE } : {}),
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.text();
}

async function downloadIcon(src, name, base) {
  const resolved = src.startsWith('http') ? src : new URL(src, base).toString();
  const res = await fetch(resolved);
  if (!res.ok) {
    console.warn(`아이콘 다운로드 실패: ${name} (${res.status})`);
    return null;
  }
  const arrayBuffer = await res.arrayBuffer();
  const slug = slugify(name) || 'unknown';
  const outPath = path.join(ICON_DIR, `${slug}.png`);
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
  return { name, file: `items/${slug}.png` };
}

async function scrapeIcons(knownNames = new Set()) {
  let html = null;
  let baseUrl = null;
  let lastErr = null;
  for (const url of DEFAULT_ICON_SOURCES) {
    try {
      console.log(`아이콘 페이지 시도: ${url}`);
      html = await fetchHtml(url);
      baseUrl = new URL(url).origin;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`아이콘 페이지 실패: ${url} (${e.message})`);
    }
  }
  if (!html) {
    throw lastErr || new Error('아이콘 페이지를 불러오지 못했습니다.');
  }
  const $ = loadHtml(html);
  const images = [];

  $('img').each((_, el) => {
    const $el = $(el);
    const alt = $el.attr('alt') || '';
    const dataSrc = $el.attr('data-src') || $el.attr('src');
    if (!alt || !dataSrc) return;
    // wiki.gg는 썸네일 파라미터가 붙을 수 있으므로 원본 URL로 정리
    const cleanSrc = dataSrc.replace(/\\/g, '').replace(/(\/revision\/latest.*)/, '');
    // 라이선스 아이콘 등 불필요 이미지 건너뛰기
    if (cleanSrc.includes('licenses/cc-by') || cleanSrc.includes('wikigg_logo')) return;
    const cleanName = normalizeName(alt);
    // DB에 없는 이름이면 건너뛰기 (노이즈 제거)
    if (knownNames.size > 0 && !knownNames.has(cleanName)) return;
    images.push({ name: cleanName, src: cleanSrc });
  });

  const downloaded = [];
  for (const img of images) {
    const saved = await downloadIcon(img.src, img.name, baseUrl);
    if (saved) downloaded.push(saved);
  }
  return downloaded;
}

async function fetchMetadata() {
  try {
    const res = await fetch(META_URL);
    if (!res.ok) throw new Error(`메타데이터 fetch 실패: ${res.status}`);
    const json = await res.json();
    // 예상 구조: [{ name, weight, rarity, maxStack, category }]
    return json;
  } catch (e) {
    console.warn('메타데이터를 가져오지 못했습니다. 기존 JSON을 유지합니다.', e);
    return null;
  }
}

async function loadLocalDb() {
  const raw = await fs.readFile(ITEMS_JSON, 'utf-8');
  return JSON.parse(raw);
}

async function saveDb(data) {
  await fs.writeFile(ITEMS_JSON, JSON.stringify(data, null, 2));
  console.log(`Updated ${ITEMS_JSON}`);
}

function mergeMetadata(existing, metaList = []) {
  const metaIndex = new Map();
  metaList.forEach((m) => {
    if (m?.name) metaIndex.set(m.name, m);
  });

  const result = { ...existing };
  Object.entries(existing.items).forEach(([category, items]) => {
    result.items[category] = items.map((entry) => {
      const obj = typeof entry === 'string' ? { name: entry } : entry;
      const meta = metaIndex.get(obj.name);
      if (!meta) return obj;
      return {
        ...obj,
        rarity: meta.rarity || obj.rarity,
        weight: meta.weight ?? obj.weight,
        maxStack: meta.maxStack ?? obj.maxStack,
        price: meta.price ?? obj.price,
        category: meta.category || obj.category,
      };
    });
  });
  return result;
}

async function main() {
  await ensureDirs();
  const db = await loadLocalDb();
  const knownNames = new Set(
    Object.values(db.items)
      .flat()
      .map((entry) => (typeof entry === 'string' ? entry : entry.name))
  );

  const [icons, meta] = await Promise.all([
    scrapeIcons(knownNames),
    fetchMetadata(),
  ]);

  if (icons.length === 0) {
    console.warn('아이콘을 찾지 못했습니다. items.json만 업데이트합니다.');
  } else {
    console.log(`아이콘 ${icons.length}개 저장 완료 (public/items)`);
  }

  const mergedDb = mergeMetadata(db, meta || []);
  await saveDb(mergedDb);

  const mapPath = path.join(PUBLIC_DIR, 'icons-map.json');
  await fs.writeFile(mapPath, JSON.stringify(icons, null, 2));
  console.log(`아이콘 매핑 저장: ${mapPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
