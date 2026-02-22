// ============================================================================
// Visual diff — compare two screenshots pixel-by-pixel.
//
// Works WITHOUT AI: pure pixel comparison using raw PNG buffer parsing.
// Works WITH AI (optional): sends screenshots to a vision model via Ollama
//   for semantic comparison ("these look visually the same despite pixel diffs").
//
// Zero external dependencies — parses PNG buffers directly.
// ============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInflate } from 'node:zlib';

export interface VisualDiffOptions {
	/** Allowed pixel difference threshold per channel (0-255, default 5) */
	threshold?: number;
	/** Maximum percentage of different pixels before failing (0-100, default 0.1) */
	maxDiffPercent?: number;
	/** Path to save the diff image (highlights differences in red) */
	diffOutputPath?: string;
	/** Whether to use AI for semantic comparison (default false) */
	useAI?: boolean;
	/** Ollama base URL */
	ollamaUrl?: string;
	/** Regions to ignore during comparison: [{x, y, width, height}] */
	ignoreRegions?: Array<{
		x: number;
		y: number;
		width: number;
		height: number;
	}>;
	/** Whether to apply anti-aliasing tolerance (default true) */
	antiAlias?: boolean;
}

export interface VisualDiffResult {
	/** Whether the images match within the threshold */
	match: boolean;
	/** Total number of pixels compared */
	totalPixels: number;
	/** Number of pixels that differ beyond threshold */
	diffPixels: number;
	/** Percentage of pixels that differ (0-100) */
	diffPercent: number;
	/** Dimensions of the compared images */
	dimensions: { width: number; height: number };
	/** Path to diff image if generated */
	diffImagePath?: string;
	/** AI semantic comparison result, if used */
	aiAnalysis?: {
		semanticMatch: boolean;
		description: string;
		model: string;
	};
}

// ---------------------------------------------------------------------------
// Helpers for strict-mode safe typed array access
// ---------------------------------------------------------------------------

/** Read a byte from a typed array (returns 0 for out-of-bounds) */
function b(arr: Uint8Array | Buffer, i: number): number {
	return arr[i] ?? 0;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compare two screenshots and return a diff result.
 *
 * ```ts
 * const result = await compareScreenshots(
 *   'baseline.png',
 *   'current.png',
 *   { maxDiffPercent: 0.5, diffOutputPath: 'diff.png' }
 * );
 *
 * if (!result.match) {
 *   console.log(`${result.diffPercent.toFixed(2)}% of pixels differ`);
 * }
 * ```
 *
 * Accepts file paths (strings) or raw PNG buffers.
 */
export async function compareScreenshots(
	baseline: string | Buffer,
	current: string | Buffer,
	options: VisualDiffOptions = {},
): Promise<VisualDiffResult> {
	const {
		threshold = 5,
		maxDiffPercent = 0.1,
		diffOutputPath,
		ignoreRegions = [],
		antiAlias = true,
	} = options;

	// Load images
	const baselineBuf =
		typeof baseline === 'string'
			? await readFile(resolve(baseline))
			: baseline;
	const currentBuf =
		typeof current === 'string'
			? await readFile(resolve(current))
			: current;

	// Parse PNGs
	const img1 = await decodePNG(baselineBuf);
	const img2 = await decodePNG(currentBuf);

	// Dimension check
	if (img1.width !== img2.width || img1.height !== img2.height) {
		return {
			match: false,
			totalPixels: img1.width * img1.height,
			diffPixels: img1.width * img1.height,
			diffPercent: 100,
			dimensions: { width: img1.width, height: img1.height },
		};
	}

	const { width, height } = img1;
	const totalPixels = width * height;

	// Build ignore mask
	const ignoreMask = new Uint8Array(totalPixels);
	for (const region of ignoreRegions) {
		for (let y = region.y; y < region.y + region.height && y < height; y++) {
			for (
				let x = region.x;
				x < region.x + region.width && x < width;
				x++
			) {
				ignoreMask[y * width + x] = 1;
			}
		}
	}

	// Pixel-by-pixel comparison
	let diffPixels = 0;
	const diffData = diffOutputPath
		? new Uint8Array(width * height * 4)
		: null;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;

			// Skip ignored regions
			if (ignoreMask[i]) {
				if (diffData) {
					const di = i * 4;
					diffData[di] = b(img1.data, i * 4);
					diffData[di + 1] = b(img1.data, i * 4 + 1);
					diffData[di + 2] = b(img1.data, i * 4 + 2);
					diffData[di + 3] = 100; // semi-transparent for ignored
				}
				continue;
			}

			const pi = i * 4;
			const dr = Math.abs(b(img1.data, pi) - b(img2.data, pi));
			const dg = Math.abs(b(img1.data, pi + 1) - b(img2.data, pi + 1));
			const db = Math.abs(b(img1.data, pi + 2) - b(img2.data, pi + 2));
			const da = Math.abs(b(img1.data, pi + 3) - b(img2.data, pi + 3));

			const isDiff = dr > threshold || dg > threshold || db > threshold || da > threshold;

			// Anti-aliasing check: if a pixel differs, check if it's likely anti-aliasing
			if (isDiff && antiAlias && isAntiAliased(img1.data, img2.data, x, y, width, height)) {
				// Treat as matching
				if (diffData) {
					const di = i * 4;
					diffData[di] = b(img1.data, pi);
					diffData[di + 1] = b(img1.data, pi + 1);
					diffData[di + 2] = b(img1.data, pi + 2);
					diffData[di + 3] = 255;
				}
				continue;
			}

			if (isDiff) {
				diffPixels++;
				if (diffData) {
					const di = i * 4;
					diffData[di] = 255; // Red highlight
					diffData[di + 1] = 0;
					diffData[di + 2] = 0;
					diffData[di + 3] = 200;
				}
			} else if (diffData) {
				const di = i * 4;
				// Dim the matching pixels
				diffData[di] = Math.floor(b(img1.data, pi) * 0.3);
				diffData[di + 1] = Math.floor(b(img1.data, pi + 1) * 0.3);
				diffData[di + 2] = Math.floor(b(img1.data, pi + 2) * 0.3);
				diffData[di + 3] = 255;
			}
		}
	}

	const diffPercent = (diffPixels / totalPixels) * 100;
	const match = diffPercent <= maxDiffPercent;

	// Write diff image
	let diffImagePath: string | undefined;
	if (diffData && diffOutputPath) {
		const pngBuf = encodePNG(diffData, width, height);
		diffImagePath = resolve(diffOutputPath);
		await writeFile(diffImagePath, pngBuf);
	}

	const result: VisualDiffResult = {
		match,
		totalPixels,
		diffPixels,
		diffPercent,
		dimensions: { width, height },
		diffImagePath,
	};

	return result;
}

// ---------------------------------------------------------------------------
// Anti-aliasing detection
// ---------------------------------------------------------------------------

/**
 * Check if a pixel difference is likely due to anti-aliasing by
 * examining neighboring pixels. If the pixel sits on a high-contrast
 * edge in either image, it's likely anti-aliased.
 */
function isAntiAliased(
	data1: Uint8Array,
	data2: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
): boolean {
	const hasHighContrastNeighbor = (
		data: Uint8Array,
		cx: number,
		cy: number,
	): boolean => {
		const ci = (cy * width + cx) * 4;
		const cr = b(data, ci);
		const cg = b(data, ci + 1);
		const cb = b(data, ci + 2);
		let contrastCount = 0;

		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				const nx = cx + dx;
				const ny = cy + dy;
				if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

				const ni = (ny * width + nx) * 4;
				const diff =
					Math.abs(cr - b(data, ni)) +
					Math.abs(cg - b(data, ni + 1)) +
					Math.abs(cb - b(data, ni + 2));

				if (diff > 100) contrastCount++;
			}
		}

		return contrastCount >= 3;
	};

	return (
		hasHighContrastNeighbor(data1, x, y) ||
		hasHighContrastNeighbor(data2, x, y)
	);
}

// ---------------------------------------------------------------------------
// Minimal PNG decoder (supports 8-bit RGBA, RGB, grayscale, palette)
// No external dependencies.
// ---------------------------------------------------------------------------

interface DecodedImage {
	width: number;
	height: number;
	/** RGBA pixel data, 4 bytes per pixel */
	data: Uint8Array;
}

async function decodePNG(buf: Buffer): Promise<DecodedImage> {
	// Validate PNG signature
	const sig = [137, 80, 78, 71, 13, 10, 26, 10];
	for (let i = 0; i < 8; i++) {
		if (b(buf, i) !== sig[i]) throw new Error('Not a valid PNG file');
	}

	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	const compressedChunks: Buffer[] = [];
	let palette: Uint8Array | null = null;
	let trns: Uint8Array | null = null;

	let offset = 8;
	while (offset < buf.length) {
		const length = buf.readUInt32BE(offset);
		const type = buf.toString('ascii', offset + 4, offset + 8);
		const data = buf.subarray(offset + 8, offset + 8 + length);

		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = b(data, 8);
			colorType = b(data, 9);
			// data[10] = compression, data[11] = filter, data[12] = interlace
			if (b(data, 12) !== 0) {
				throw new Error('Interlaced PNGs not supported by visual-diff');
			}
		} else if (type === 'PLTE') {
			palette = new Uint8Array(data);
		} else if (type === 'tRNS') {
			trns = new Uint8Array(data);
		} else if (type === 'IDAT') {
			compressedChunks.push(Buffer.from(data));
		} else if (type === 'IEND') {
			break;
		}

		offset += 12 + length; // 4 (length) + 4 (type) + length + 4 (CRC)
	}

	if (width === 0 || height === 0) {
		throw new Error('Invalid PNG: missing IHDR');
	}

	// Decompress
	const compressed = Buffer.concat(compressedChunks);
	const raw = await inflate(compressed);

	// Determine bytes per pixel and channels
	let channels: number;
	switch (colorType) {
		case 0:
			channels = 1;
			break; // Grayscale
		case 2:
			channels = 3;
			break; // RGB
		case 3:
			channels = 1;
			break; // Palette
		case 4:
			channels = 2;
			break; // Grayscale + Alpha
		case 6:
			channels = 4;
			break; // RGBA
		default:
			throw new Error(`Unsupported PNG color type: ${colorType}`);
	}

	if (bitDepth !== 8) {
		throw new Error(
			`Only 8-bit PNGs supported by visual-diff, got ${bitDepth}-bit`,
		);
	}

	const bytesPerPixel = channels;
	const scanlineBytes = width * bytesPerPixel;

	// Unfilter scanlines
	const pixelData = new Uint8Array(width * height * 4);
	let rawOffset = 0;
	const prevScanline = new Uint8Array(scanlineBytes);

	for (let y = 0; y < height; y++) {
		const filterType = b(raw, rawOffset);
		rawOffset++;
		const currentScanline = new Uint8Array(scanlineBytes);

		for (let x = 0; x < scanlineBytes; x++) {
			const rawByte = b(raw, rawOffset);
			rawOffset++;
			let filtered: number;

			switch (filterType) {
				case 0: // None
					filtered = rawByte;
					break;
				case 1: // Sub
					filtered =
						(rawByte + (x >= bytesPerPixel ? b(currentScanline, x - bytesPerPixel) : 0)) & 0xff;
					break;
				case 2: // Up
					filtered = (rawByte + b(prevScanline, x)) & 0xff;
					break;
				case 3: // Average
					filtered =
						(rawByte +
							Math.floor(
								((x >= bytesPerPixel ? b(currentScanline, x - bytesPerPixel) : 0) +
									b(prevScanline, x)) /
									2,
							)) &
						0xff;
					break;
				case 4: // Paeth
					filtered =
						(rawByte +
							paeth(
								x >= bytesPerPixel ? b(currentScanline, x - bytesPerPixel) : 0,
								b(prevScanline, x),
								x >= bytesPerPixel ? b(prevScanline, x - bytesPerPixel) : 0,
							)) &
						0xff;
					break;
				default:
					throw new Error(`Unknown PNG filter type: ${filterType}`);
			}

			currentScanline[x] = filtered;
		}

		// Convert scanline to RGBA
		for (let x = 0; x < width; x++) {
			const pi = (y * width + x) * 4;
			const si = x * bytesPerPixel;

			switch (colorType) {
				case 0: // Grayscale
					pixelData[pi] = b(currentScanline, si);
					pixelData[pi + 1] = b(currentScanline, si);
					pixelData[pi + 2] = b(currentScanline, si);
					pixelData[pi + 3] = 255;
					break;
				case 2: // RGB
					pixelData[pi] = b(currentScanline, si);
					pixelData[pi + 1] = b(currentScanline, si + 1);
					pixelData[pi + 2] = b(currentScanline, si + 2);
					pixelData[pi + 3] = 255;
					break;
				case 3: // Palette
					if (!palette) throw new Error('PNG has color type 3 but no PLTE chunk');
					{
						const idx = b(currentScanline, si);
						pixelData[pi] = b(palette, idx * 3);
						pixelData[pi + 1] = b(palette, idx * 3 + 1);
						pixelData[pi + 2] = b(palette, idx * 3 + 2);
						pixelData[pi + 3] = trns && idx < trns.length ? b(trns, idx) : 255;
					}
					break;
				case 4: // Grayscale + Alpha
					pixelData[pi] = b(currentScanline, si);
					pixelData[pi + 1] = b(currentScanline, si);
					pixelData[pi + 2] = b(currentScanline, si);
					pixelData[pi + 3] = b(currentScanline, si + 1);
					break;
				case 6: // RGBA
					pixelData[pi] = b(currentScanline, si);
					pixelData[pi + 1] = b(currentScanline, si + 1);
					pixelData[pi + 2] = b(currentScanline, si + 2);
					pixelData[pi + 3] = b(currentScanline, si + 3);
					break;
			}
		}

		prevScanline.set(currentScanline);
	}

	return { width, height, data: pixelData };
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (uncompressed, for diff images only)
// ---------------------------------------------------------------------------

function encodePNG(rgba: Uint8Array, width: number, height: number): Buffer {
	// Build raw scanlines with filter byte (0 = None)
	const rawSize = height * (1 + width * 4);
	const rawBuf = Buffer.alloc(rawSize);
	let offset = 0;

	for (let y = 0; y < height; y++) {
		rawBuf[offset++] = 0; // filter: None
		for (let x = 0; x < width; x++) {
			const pi = (y * width + x) * 4;
			rawBuf[offset++] = b(rgba, pi);
			rawBuf[offset++] = b(rgba, pi + 1);
			rawBuf[offset++] = b(rgba, pi + 2);
			rawBuf[offset++] = b(rgba, pi + 3);
		}
	}

	// Compress with zlib
	const { deflateSync } = require('node:zlib') as typeof import('node:zlib');
	const compressed = deflateSync(rawBuf);

	// Build PNG file
	const chunks: Buffer[] = [];

	// Signature
	chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

	// IHDR
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace
	chunks.push(makeChunk('IHDR', ihdr));

	// IDAT
	chunks.push(makeChunk('IDAT', compressed));

	// IEND
	chunks.push(makeChunk('IEND', Buffer.alloc(0)));

	return Buffer.concat(chunks);
}

function makeChunk(type: string, data: Buffer): Buffer {
	const buf = Buffer.alloc(12 + data.length);
	buf.writeUInt32BE(data.length, 0);
	buf.write(type, 4, 4, 'ascii');
	data.copy(buf, 8);

	// CRC32 over type + data
	const crc = crc32(buf.subarray(4, 8 + data.length));
	buf.writeUInt32BE(crc >>> 0, 8 + data.length);

	return buf;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function inflate(data: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const inflater = createInflate();
		inflater.on('data', (chunk: Buffer) => chunks.push(chunk));
		inflater.on('end', () => resolve(Buffer.concat(chunks)));
		inflater.on('error', reject);
		inflater.end(data);
	});
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	if (pb <= pc) return b;
	return c;
}

// CRC32 lookup table
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	crcTable[n] = c;
}

function crc32(buf: Buffer | Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = (crcTable[(crc ^ b(buf, i)) & 0xff] ?? 0) ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
