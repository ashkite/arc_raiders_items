import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const OUTPUT_DIR = path.resolve(__dirname, '../public/models/clip-vit-base-patch32');

const FILES = {
  'config.json': 'config.json',
  'preprocessor_config.json': 'preprocessor_config.json',
  'tokenizer.json': 'tokenizer.json',
  'tokenizer_config.json': 'tokenizer_config.json',
  'onnx/model_quantized.onnx': 'onnx/model_quantized.onnx' 
};

async function downloadFile(remotePath, localPath) {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${remotePath}`;
  const dest = path.join(OUTPUT_DIR, localPath);
  const dir = path.dirname(dest);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  console.log(`Downloading ${remotePath} -> ${localPath}...`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    
    console.log(`Success: ${localPath} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error(`Error downloading ${remotePath}:`, error);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    process.exit(1);
  }
}

async function main() {
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('Cleaning old files...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [remote, local] of Object.entries(FILES)) {
    await downloadFile(remote, local);
  }
  
  console.log('All downloads complete!');
}

main();
