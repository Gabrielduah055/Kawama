import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map, Observable, throwError, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildApiUrl } from '../core/endpoint';

interface ApiEnvelope<T> {
  readonly data: T;
}

export interface ShoppingChatContext {
  readonly productId?: string;
  readonly productSlug?: string;
}

export interface ShoppingChatRequest {
  readonly message: string;
  readonly conversationId?: string;
  readonly context?: ShoppingChatContext;
}

export interface ShoppingChatProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly price: number;
  readonly currency: 'GHS';
  readonly availability: 'in_stock' | 'low_stock' | 'out_of_stock';
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
  readonly url?: string;
}

export interface ShoppingChatResponse {
  readonly conversationId: string;
  readonly assistantMessage: string;
  readonly products: readonly ShoppingChatProduct[];
  readonly suggestedFollowUps: readonly string[];
}

interface ChatSession {
  readonly conversationId: string;
  readonly sessionToken: string;
}

const LEGACY_CHAT_STORAGE_KEY = 'kawama-shopping-chat-v1';
const CHAT_MESSAGE_MAX_LENGTH = 1_500;
const CHAT_REQUEST_TIMEOUT_MS = 35_000;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class ShoppingChatService {
  readonly panelOpen = signal(false);
  private readonly chatUrl = buildApiUrl(environment.aiApiBaseUrl, environment.apiEndpoints.shoppingChat);
  private session?: ChatSession;

  constructor(private readonly http: HttpClient) {
    this.removeLegacyStoredSession();
  }

  openPanel(): void {
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  togglePanel(): void {
    this.panelOpen.update((open) => !open);
  }

  send(message: string, context?: ShoppingChatContext): Observable<ShoppingChatResponse> {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return throwError(() => new RangeError('Enter a message before sending.'));
    }
    if (trimmedMessage.length > CHAT_MESSAGE_MAX_LENGTH) {
      return throwError(() => new RangeError(`Messages can be up to ${CHAT_MESSAGE_MAX_LENGTH} characters.`));
    }

    return this.sendRequest(trimmedMessage, context, this.session);
  }

  clearConversation(): void {
    this.session = undefined;
    this.removeLegacyStoredSession();
  }

  private sendRequest(
    message: string,
    context?: ShoppingChatContext,
    session?: ChatSession,
  ): Observable<ShoppingChatResponse> {
    const headers = session
      ? new HttpHeaders({ 'X-Chat-Session': session.sessionToken })
      : undefined;
    const body: ShoppingChatRequest = {
      ...(session ? { conversationId: session.conversationId } : {}),
      message,
      ...(context ? { context } : {}),
    };

    return this.http.post<ApiEnvelope<ShoppingChatResponse>>(this.chatUrl, body, {
      headers,
      observe: 'response',
    }).pipe(
      timeout({ first: CHAT_REQUEST_TIMEOUT_MS }),
      map((response) => this.captureSession(response)),
    );
  }

  private captureSession(response: HttpResponse<ApiEnvelope<ShoppingChatResponse>>): ShoppingChatResponse {
    if (!response.body) throw new Error('The shopping assistant returned an empty response.');
    const data = {
      ...response.body.data,
      products: response.body.data.products ?? [],
      suggestedFollowUps: response.body.data.suggestedFollowUps ?? [],
    };
    const sessionToken = response.headers.get('X-Chat-Session');
    if (sessionToken && SESSION_TOKEN_PATTERN.test(sessionToken) && CONVERSATION_ID_PATTERN.test(data.conversationId)) {
      this.session = { conversationId: data.conversationId, sessionToken };
    }
    return data;
  }

  private removeLegacyStoredSession(): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
    } catch {
      // Chat remains usable when browser storage is unavailable.
    }
  }
}
