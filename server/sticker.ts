import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface StickerOptions {
  packName?: string;
  authorName?: string;
}

/**
 * Injects WhatsApp sticker EXIF metadata (Pack name, author name, emojis)
 * into a WebP buffer so WhatsApp client renders it as an authentic floating sticker.
 */
export function addExifToWebp(
  webpBuffer: Buffer,
  pack: string = 'stiker rakhan',
  author: string = 'rakhn'
): Buffer {
  try {
    const json = {
      'sticker-pack-id': `com.axale.sticker.${Date.now()}`,
      'sticker-pack-name': pack,
      'sticker-pack-publisher': author,
      'emojis': ['✨']
    };
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([
      Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00]),
      Buffer.from([
        jsonBuff.length & 0xff,
        (jsonBuff.length >> 8) & 0xff,
        (jsonBuff.length >> 16) & 0xff,
        (jsonBuff.length >> 24) & 0xff,
      ]),
      Buffer.from([0x16, 0x00, 0x00, 0x00]),
      jsonBuff,
    ]);

    const exifChunkHeader = Buffer.from('EXIF');
    const exifChunkSize = Buffer.alloc(4);
    exifChunkSize.writeUInt32LE(exif.length, 0);
    const exifChunk = Buffer.concat([exifChunkHeader, exifChunkSize, exif]);

    // If exif chunk length is odd, add a padding null byte per WebP specification
    const paddedExifChunk =
      exif.length % 2 !== 0 ? Buffer.concat([exifChunk, Buffer.from([0x00])]) : exifChunk;

    const riff = webpBuffer.slice(0, 4);
    const webp = webpBuffer.slice(8, 12);
    if (riff.toString() !== 'RIFF' || webp.toString() !== 'WEBP') {
      return webpBuffer;
    }

    // Clone buffer so we can modify flags safely
    const result = Buffer.from(webpBuffer);

    // If chunk at offset 12 is VP8X, set EXIF flag (bit 3: 0x08)
    if (result.slice(12, 16).toString() === 'VP8X' && result.length > 20) {
      result[20] |= 0x08;
    }

    const rest = result.slice(12);
    const newSize = 4 + rest.length + paddedExifChunk.length;
    const newSizeBuff = Buffer.alloc(4);
    newSizeBuff.writeUInt32LE(newSize, 0);

    return Buffer.concat([riff, newSizeBuff, webp, rest, paddedExifChunk]);
  } catch (err) {
    console.error('[Sticker EXIF] Gagal menyuntikkan EXIF metadata:', err);
    return webpBuffer;
  }
}

/**
 * Converts an image or video buffer to a pristine, transparent WhatsApp WebP sticker.
 * Specifications:
 * - Exactly 512x512 canvas
 * - Scales largest side up/down to 512px (fills canvas appropriately, no tiny images)
 * - 100% transparent background (format=rgba + yuva420p, eliminates black padding bars)
 * - Injects official WhatsApp EXIF metadata so it renders as a genuine floating sticker
 */
export async function convertMediaToWebpSticker(
  inputBuffer: Buffer,
  isVideo: boolean = false,
  options?: StickerOptions
): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const rand = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputExt = isVideo ? '.mp4' : '.png';
  const inputPath = path.join(tmpDir, `wa_sticker_in_${rand}${inputExt}`);
  const outputPath = path.join(tmpDir, `wa_sticker_out_${rand}.webp`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    let ffmpegArgs: string[] = [];

    if (isVideo) {
      // Animated video/GIF sticker:
      // - Max 6 seconds, 12 fps
      // - 512x512 scaled with transparent padding (color=0x00000000)
      // - BGRA/RGBA true color without yuva420p chroma-bleeding
      ffmpegArgs = [
        '-y',
        '-i', inputPath,
        '-t', '6',
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=12,format=rgba,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000',
        '-vcodec', 'libwebp',
        '-lossless', '0',
        '-compression_level', '4',
        '-q:v', '45',
        '-loop', '0',
        '-an',
        '-vsync', '0',
        outputPath,
      ];
    } else {
      // Static image sticker:
      // - Scaled cleanly to fit 512x512 with transparent padding (color=0x00000000)
      // - Lossless 1 mode: 100% crystal clean transparency, zero black fringes or halos!
      ffmpegArgs = [
        '-y',
        '-i', inputPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000',
        '-vcodec', 'libwebp',
        '-lossless', '1',
        '-compression_level', '4',
        '-q:v', '75',
        '-loop', '0',
        '-an',
        '-vsync', '0',
        outputPath,
      ];
    }

    await execFileAsync('/usr/bin/ffmpeg', ffmpegArgs);

    // If static lossless sticker exceeds 800KB, re-encode with high quality lossy (without yuva420p)
    let rawWebp = await fs.promises.readFile(outputPath);
    if (!isVideo && rawWebp.length > 800 * 1024) {
      const fallbackArgs = [
        '-y',
        '-i', inputPath,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000',
        '-vcodec', 'libwebp',
        '-lossless', '0',
        '-compression_level', '4',
        '-q:v', '70',
        '-loop', '0',
        '-an',
        '-vsync', '0',
        outputPath,
      ];
      await execFileAsync('/usr/bin/ffmpeg', fallbackArgs);
      rawWebp = await fs.promises.readFile(outputPath);
    }

    // Inject WhatsApp sticker EXIF metadata
    const finalSticker = addExifToWebp(
      rawWebp,
      options?.packName || 'stiker rakhan',
      options?.authorName || 'rakhn'
    );

    return finalSticker;
  } finally {
    // Clean up temporary files
    fs.promises.unlink(inputPath).catch(() => {});
    fs.promises.unlink(outputPath).catch(() => {});
  }
}
