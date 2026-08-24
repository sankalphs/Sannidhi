interface BarcodeDetectorDetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(
    source: HTMLVideoElement | ImageBitmap | ImageBitmapSource,
  ): Promise<BarcodeDetectorDetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
