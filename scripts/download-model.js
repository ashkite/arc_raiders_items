import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const OUTPUT_DIR = path.resolve(__dirname, '../public/models/clip-vit-base-patch32');

const MODEL_FILES = [
    'onnx/model_quantized.onnx',
    'model_quantized.onnx',
    'onnx/model.onnx',
    'model.onnx'
];

const BASE_FILES = [
  'config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
];

const downloadFile = (filename, targetName = null) => {
  const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${filename}`;
  const finalName = targetName || filename;
  const finalPath = path.join(OUTPUT_DIR, finalName);
  const dir = path.dirname(finalPath);
  
  if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
  }

  const file = fs.createWriteStream(finalPath);

  console.log(`Downloading ${filename} to ${finalPath}...`);

  return new Promise((resolve, reject) => {
    const request = (downloadUrl) => {
      https.get(downloadUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          let location = response.headers.location;
          if (location && !location.startsWith('http')) {
            location = `https://huggingface.co${location}`;
          }
          console.log(` Redirecting...`);
          request(location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${filename}: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            console.log(`Saved ${finalName}`);
            resolve();
          });
        });
      }).on('error', (err) => {
        fs.unlink(finalPath, () => {});
        reject(err);
      });
    };
    
    request(url);
  });
};

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    for (const file of BASE_FILES) {
      if (fs.existsSync(path.join(OUTPUT_DIR, file)) && fs.statSync(path.join(OUTPUT_DIR, file)).size > 0) {
        console.log(`${file} exists. Skipping.`);
        continue;
      }
      await downloadFile(file);
    }

    let modelDownloaded = false;
    const targetModelName = 'model_quantized.onnx';
    
    if (fs.existsSync(path.join(OUTPUT_DIR, targetModelName)) && fs.statSync(path.join(OUTPUT_DIR, targetModelName)).size > 0) {
        console.log('Model file already exists. Skipping.');
        modelDownloaded = true;
    } else {
        for (const candidate of MODEL_FILES) {
            try {
                console.log(`Trying to download model from: ${candidate}`);
                await downloadFile(candidate, targetModelName);
                modelDownloaded = true;
                break;
            } catch (e) {
                console.log(`Failed to download ${candidate} (${e.message}), trying next...`);
            }
        }
    }

    if (!modelDownloaded) {
        throw new Error("Could not download any model file.");
    }

    console.log('All files downloaded successfully!');
  } catch (error) {
    console.error('Download failed:', error);
  }
}

main();