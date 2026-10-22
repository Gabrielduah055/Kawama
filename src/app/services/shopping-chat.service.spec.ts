import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';
import { ShoppingChatResponse, ShoppingChatService } from './shopping-chat.service';

describe('ShoppingChatService', () => {
  let service: ShoppingChatService;
  let http: HttpTestingController;
  const chatUrl = buildApiUrl(environment.aiApiBaseUrl, environment.apiEndpoints.shoppingChat);
  const conversationId = '8f459851-2bd0-4fa7-a48b-2712fb92a902';
  const sessionToken = 'A'.repeat(43);
  const response: ShoppingChatResponse = {
    conversationId,
    assistantMessage: 'Here are the current options.',
    products: [],
    suggestedFollowUps: ['Would you like a comparison?'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ShoppingChatService);
    http = TestBed.inject(HttpTestingController);
    service.clearConversation();
  });

  afterEach(() => {
    service.clearConversation();
    http.verify();
  });

  it('starts a chat with product-page context and captures the session header', () => {
    let result: ShoppingChatResponse | undefined;
    service.send('Tell me about this item', { productSlug: 'smoothie-blender' }).subscribe((value) => (result = value));

    const request = http.expectOne(chatUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('X-Chat-Session')).toBeFalse();
    expect(request.request.body).toEqual({
      message: 'Tell me about this item',
      context: { productSlug: 'smoothie-blender' },
    });
    request.flush({ data: response }, { headers: { 'X-Chat-Session': sessionToken } });

    expect(result).toEqual(response);
  });

  it('continues with the stored conversation id and session header', () => {
    service.send('Show me blenders').subscribe();
    http.expectOne(chatUrl).flush({ data: response }, { headers: { 'X-Chat-Session': sessionToken } });

    service.send('Compare the first one').subscribe();
    const continued = http.expectOne(chatUrl);
    expect(continued.request.headers.get('X-Chat-Session')).toBe(sessionToken);
    expect(continued.request.body).toEqual({
      conversationId,
      message: 'Compare the first one',
    });
    continued.flush({ data: response }, { headers: { 'X-Chat-Session': sessionToken } });
  });

  it('surfaces an expired owner-bound conversation without silently creating another one', () => {
    service.send('Show me blenders').subscribe();
    http.expectOne(chatUrl).flush({ data: response }, { headers: { 'X-Chat-Session': sessionToken } });

    let status: number | undefined;
    service.send('Show me another option').subscribe({ error: (error) => (status = error.status) });
    const expired = http.expectOne(chatUrl);
    expect(expired.request.headers.get('X-Chat-Session')).toBe(sessionToken);
    expired.flush(
      { error: { code: 'CONVERSATION_NOT_FOUND', message: 'The conversation was not found.' } },
      { status: 404, statusText: 'Not Found' },
    );

    expect(status).toBe(404);
    http.expectNone(chatUrl);
  });

  it('trims messages and rejects empty or oversized input before making a request', () => {
    let emptyError: unknown;
    service.send('   ').subscribe({ error: (error) => (emptyError = error) });
    expect(emptyError).toEqual(jasmine.any(RangeError));

    let longError: unknown;
    service.send('x'.repeat(1501)).subscribe({ error: (error) => (longError = error) });
    expect(longError).toEqual(jasmine.any(RangeError));
    http.expectNone(chatUrl);
  });
});
