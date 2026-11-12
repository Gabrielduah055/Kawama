import { Injectable } from '@angular/core';

export type ProductShareResult = 'shared-image' | 'shared-link' | 'copied';

@Injectable({ providedIn: 'root' })
export class ShareService {
  async prepareImage(imageUrl: string, productName: string): Promise<File | undefined> {
    if (typeof window === 'undefined' || typeof File === 'undefined') return undefined;

    try {
      const response = await fetch(new URL(imageUrl, window.location.origin));
      if (!response.ok) return undefined;

      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith('image/')) return undefined;

      const subtype = blob.type.split('/')[1]?.split('+')[0] || 'jpg';
      const extension = subtype === 'jpeg' ? 'jpg' : subtype;
      const fileName = `${productName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product'}.${extension}`;
      return new File([blob], fileName, { type: blob.type });
    } catch {
      return undefined;
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

      if (image && navigator.canShare) {
        try {
          sharesImage = navigator.canShare({ files: [image] });
          if (sharesImage) shareData.files = [image];
        } catch {
          sharesImage = false;
        }
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
