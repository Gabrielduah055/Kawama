import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import {
  ShoppingChatContext,
  ShoppingChatResponse,
  ShoppingChatService,
} from '../services/shopping-chat.service';
import { AskKawamaComponent } from './ask-kawama.component';

describe('AskKawamaComponent', () => {
  let fixture: ComponentFixture<AskKawamaComponent>;
  let component: AskKawamaComponent;
  let service: ShoppingChatService;
  let response$: Subject<ShoppingChatResponse>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AskKawamaComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AskKawamaComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(ShoppingChatService);
    response$ = new Subject<ShoppingChatResponse>();
    spyOn(service, 'send').and.returnValue(response$);
    spyOn(service, 'clearConversation').and.callThrough();
  });

  it('sends trimmed product-page context and renders returned product links', () => {
    service.panelOpen.set(true);
    component.productSlug.set('smoothie-blender');
    component.messageText = '  Show me this blender  ';
    component.submit();

    expect(service.send).toHaveBeenCalledWith(
      'Show me this blender',
      { productSlug: 'smoothie-blender' } satisfies ShoppingChatContext,
    );

    response$.next({
      conversationId: '8f459851-2bd0-4fa7-a48b-2712fb92a902',
      assistantMessage: 'This blender is available.',
      products: [{
        id: 'product-1',
        slug: 'smoothie-blender',
        name: 'Smoothie Blender',
        price: 199.95,
        currency: 'GHS',
        availability: 'in_stock',
      }],
      suggestedFollowUps: ['Compare it with another blender'],
    });
    fixture.detectChanges();

    const productLink = fixture.nativeElement.querySelector('.ask-kawama-products a') as HTMLAnchorElement;
    expect(productLink.textContent).toContain('Smoothie Blender');
    expect(productLink.getAttribute('href')).toBe('/product/smoothie-blender');
  });

  it('cancels an active request and prevents its response from restoring a reset chat', () => {
    component.submit('Show me blenders');
    expect(component.sending()).toBeTrue();

    component.startOver();
    expect(service.clearConversation).toHaveBeenCalled();
    expect(component.sending()).toBeFalse();
    expect(component.messages().map((message) => message.text)).toEqual([
      'New chat started. What are you shopping for?',
    ]);
    expect(response$.observed).toBeFalse();

    response$.next({
      conversationId: '8f459851-2bd0-4fa7-a48b-2712fb92a902',
      assistantMessage: 'This late response must stay hidden.',
      products: [],
      suggestedFollowUps: [],
    });
    expect(component.messages().some((message) => message.text.includes('late response'))).toBeFalse();
  });

  it('offers a deliberate restart when the stored conversation has expired', () => {
    component.submit('Continue my search');
    response$.error(new HttpErrorResponse({
      status: 404,
      statusText: 'Not Found',
      error: { error: { code: 'CONVERSATION_NOT_FOUND' } },
    }));

    const errorMessage = component.messages().at(-1);
    expect(errorMessage?.error).toBeTrue();
    expect(errorMessage?.restartBeforeRetry).toBeTrue();
    expect(errorMessage?.retryMessage).toBe('Continue my search');
  });
});
