import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShareService {
  async shareProduct(title: string, text: string, path: string): Promise<'shared' | 'copied'> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      throw new Error('Sharing is only available in a browser.');
    }
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return 'shared';
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
