import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const OUTPUT_DIR = path.resolve(__dirname, '../public/models/clip-vit-base-patch32');

// 다운로드할 파일 매핑 (Source -> Destination)
const FILES = {
  'config.json': 'config.json',
  'preprocessor_config.json': 'preprocessor_config.json',
  'tokenizer.json': 'tokenizer.json',
  'tokenizer_config.json': 'tokenizer_config.json',
  // 중요: HuggingFace 경로 -> 로컬 저장 이름
  'onnx/model_quantized.onnx': 'model_quantized.onnx' 
};

async function downloadFile(remotePath, localName) {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${remotePath}`;
  const dest = path.join(OUTPUT_DIR, localName);
  
  console.log(`Downloading ${remotePath} -> ${localName}...`);
  
  try {
    // Node.js 18+ supports fetch natively
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    
    console.log(`Success: ${localName} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error(`Error downloading ${remotePath}:`, error);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    process.exit(1); // Fail fast
  }
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const [remote, local] of Object.entries(FILES)) {
    await downloadFile(remote, local);
  }
  
  console.log('All downloads complete!');
}

main();
