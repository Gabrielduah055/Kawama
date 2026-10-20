import { ShareService } from './share.service';

describe('ShareService', () => {
  const service = new ShareService();
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: originalShare });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
  });

  it('uses native sharing when it is available', async () => {
    const share = jasmine.createSpy('share').and.resolveTo();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });

    await expectAsync(service.shareProduct('Pan', 'Useful pan', '/product/pan')).toBeResolvedTo('shared');
    expect(share).toHaveBeenCalledWith(
      jasmine.objectContaining({ title: 'Pan', text: 'Useful pan', url: `${window.location.origin}/product/pan` }),
    );
  });

  it('copies the canonical URL when native sharing fails', async () => {
    const share = jasmine.createSpy('share').and.rejectWith(new Error('Not supported'));
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await expectAsync(service.shareProduct('Pan', 'Useful pan', '/product/pan')).toBeResolvedTo('copied');
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/product/pan`);
  });

  it('preserves a cancelled native share without copying', async () => {
    const share = jasmine.createSpy('share').and.rejectWith(new DOMException('Cancelled', 'AbortError'));
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await expectAsync(service.shareProduct('Pan', 'Useful pan', '/product/pan')).toBeRejected();
    expect(writeText).not.toHaveBeenCalled();
  });
});
