import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const OUTPUT_DIR = path.resolve(__dirname, `../public/models/${MODEL_ID}`);

const FILES = {
  'config.json': 'config.json',
  'preprocessor_config.json': 'preprocessor_config.json',
  'tokenizer.json': 'tokenizer.json',
  'tokenizer_config.json': 'tokenizer_config.json',
  'onnx/model_quantized.onnx': 'onnx/model_quantized.onnx'
};

const downloadFile = (remotePath, localPath) => {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${remotePath}`;
  const dest = path.join(OUTPUT_DIR, localPath);
  const dir = path.dirname(dest);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const request = (downloadUrl) => {
      console.log(`Downloading ${remotePath}...`);
      https.get(downloadUrl, (response) => {
        // Handle Redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          let location = response.headers.location;
          if (location.startsWith('/')) {
             location = `https://huggingface.co${location}`;
          }
          console.log(`  -> Redirecting to ${location}`);
          request(location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${remotePath}: ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(dest);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          const stats = fs.statSync(dest);
          console.log(`  -> Saved ${localPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    request(url);
  });
};

async function main() {
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('Cleaning old files...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  
  try {
    for (const [remote, local] of Object.entries(FILES)) {
      await downloadFile(remote, local);
    }
    console.log('\nAll files downloaded successfully via stream!');
  } catch (error) {
    console.error('\nDownload failed:', error.message);
    process.exit(1);
  }
}

main();
