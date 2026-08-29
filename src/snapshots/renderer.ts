export interface SnapshotCanvas {
  width: number;
  height: number;
  toBlob: (callback: (blob: Blob | null) => void, type?: string) => void;
}

export function canvasToPng(canvas: SnapshotCanvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob === null) {
          reject(new Error("canvas PNG conversion returned no blob"));
          return;
        }
        resolve(blob);
      }, "image/png");
    } catch (error) {
      reject(error instanceof Error ? error : new Error("canvas PNG conversion failed"));
    }
  });
}

export function triggerSnapshotDownload(blob: Blob, fileName: string): string | null {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  return url;
}

