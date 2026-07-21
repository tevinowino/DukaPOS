// Minimal ambient typing for the experimental Barcode Detection API
// (Chrome/Edge/Android only — see ARCHITECTURE.md ADR references to
// BarcodeDetector support gaps). Not yet part of TypeScript's bundled DOM
// lib, so declared locally rather than cast through `any` at call sites.

interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  ): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}
