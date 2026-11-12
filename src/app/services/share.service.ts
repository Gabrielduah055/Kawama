import { Injectable } from '@angular/core';

export type ProductShareResult = 'shared-image' | 'shared-link' | 'copied';

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly imagePreparationTimeoutMs = 8_000;

  supportsFileSharing(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  }

  canShareImage(image: File): boolean {
    if (!this.supportsFileSharing()) return false;

    try {
      return navigator.canShare({ files: [image] });
    } catch {
      return false;
    }
  }

  async prepareImage(imageUrl: string, productName: string): Promise<File | undefined> {
    if (typeof window === 'undefined' || typeof File === 'undefined') return undefined;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.imagePreparationTimeoutMs);

    try {
      const response = await fetch(new URL(imageUrl, window.location.origin), { signal: controller.signal });
      if (!response.ok) return undefined;

      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith('image/')) return undefined;

      const subtype = blob.type.split('/')[1]?.split('+')[0] || 'jpg';
      const extension = subtype === 'jpeg' ? 'jpg' : subtype;
      const fileName = `${productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product'}.${extension}`;
      return new File([blob], fileName, { type: blob.type });
    } catch {
      return undefined;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async shareProduct(
    title: string,
    text: string,
    path: string,
    image?: File,
  ): Promise<ProductShareResult> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      throw new Error('Sharing is only available in a browser.');
    }
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      const shareData: ShareData = { title, text, url };
      let sharesImage = false;

      if (image && this.canShareImage(image)) {
        sharesImage = true;
        shareData.files = [image];
      }

      try {
        await navigator.share(shareData);
        return sharesImage ? 'shared-image' : 'shared-link';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
      }
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
    throw new Error('Sharing is not supported by this browser.');
  }
}
