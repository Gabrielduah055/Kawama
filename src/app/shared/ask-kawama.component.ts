import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, startWith, Subscription } from 'rxjs';
import {
  ShoppingChatProduct,
  ShoppingChatService,
} from '../services/shopping-chat.service';

interface ChatMessage {
  readonly id: number;
  readonly role: 'assistant' | 'user';
  readonly text: string;
  readonly products?: readonly ShoppingChatProduct[];
  readonly suggestedFollowUps?: readonly string[];
  readonly error?: boolean;
  readonly retryMessage?: string;
  readonly restartBeforeRetry?: boolean;
}

interface ChatErrorState {
  readonly message: string;
  readonly restartBeforeRetry: boolean;
}

@Component({
  selector: 'app-ask-kawama',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ask-kawama.component.html',
})
export class AskKawamaComponent {
  @ViewChild('messageInput') private messageInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;

  readonly messages = signal<readonly ChatMessage[]>([
    {
      id: 1,
      role: 'assistant',
      text: 'Hi! I can help you find products, compare current options, and explain Kawama checkout.',
    },
  ]);
  readonly sending = signal(false);
  readonly productSlug = signal<string | undefined>(undefined);
  messageText = '';
  private nextMessageId = 2;
  private activeRequest?: Subscription;
  private requestGeneration = 0;

  constructor(
    readonly chat: ShoppingChatService,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef,
  ) {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.productSlug.set(this.productSlugFromUrl(this.router.url)));
    this.destroyRef.onDestroy(() => this.cancelActiveRequest());
  }

  togglePanel(): void {
    this.chat.togglePanel();
    if (this.chat.panelOpen()) {
      this.focusInput();
      this.scrollToLatest();
    }
  }

  closePanel(): void {
    this.chat.closePanel();
  }

  startOver(): void {
    this.resetConversation();
    this.focusInput();
  }

  submit(suggestedMessage?: string): void {
    const message = (suggestedMessage ?? this.messageText).trim();
    if (!message || this.sending()) return;

    this.messageText = '';
    this.messages.update((messages) => [
      ...messages,
      { id: this.nextMessageId++, role: 'user', text: message },
    ]);
    this.sending.set(true);
    this.scrollToLatest();
    const requestGeneration = ++this.requestGeneration;
    const productSlug = this.productSlug();
    const request = this.chat.send(message, productSlug ? { productSlug } : undefined).subscribe({
      next: (response) => {
        if (requestGeneration !== this.requestGeneration) return;
        this.messages.update((messages) => [
          ...messages,
          {
            id: this.nextMessageId++,
            role: 'assistant',
            text: response.assistantMessage,
            products: response.products,
            suggestedFollowUps: response.suggestedFollowUps,
          },
        ]);
        this.activeRequest = undefined;
        this.sending.set(false);
        this.scrollToLatest();
        this.focusInput();
      },
      error: (error: unknown) => {
        if (requestGeneration !== this.requestGeneration) return;
        const errorState = this.errorState(error);
        this.messages.update((messages) => [
          ...messages,
          {
            id: this.nextMessageId++,
            role: 'assistant',
            text: errorState.message,
            error: true,
            retryMessage: message,
            restartBeforeRetry: errorState.restartBeforeRetry,
          },
        ]);
        this.activeRequest = undefined;
        this.sending.set(false);
        this.scrollToLatest();
        this.focusInput();
      },
    });
    this.activeRequest = request.closed ? undefined : request;
  }

  retry(message: string, restartBeforeRetry = false): void {
    if (this.sending()) return;
    if (restartBeforeRetry) this.resetConversation();
    this.submit(message);
  }

  handleInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    this.submit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.chat.panelOpen()) this.closePanel();
  }

  private productSlugFromUrl(url: string): string | undefined {
    const primary = this.router.parseUrl(url).root.children['primary'];
    const segments = primary?.segments.map((segment) => segment.path) ?? [];
    return segments[0] === 'product' && segments[1] ? segments[1] : undefined;
  }

  private errorState(error: unknown): ChatErrorState {
    if (error instanceof RangeError) {
      return { message: error.message, restartBeforeRetry: false };
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        message: 'Ask Kawama took too long to respond. Check your connection, then try again.',
        restartBeforeRetry: false,
      };
    }
    if (!(error instanceof HttpErrorResponse)) {
      return {
        message: 'Ask Kawama could not respond. Check your connection and try again.',
        restartBeforeRetry: false,
      };
    }
    const code = (error.error?.error as { code?: string } | undefined)?.code;
    if (error.status === 404 && code === 'CONVERSATION_NOT_FOUND') {
      return {
        message: 'This chat has expired or is no longer available. Start a new chat to continue.',
        restartBeforeRetry: true,
      };
    }
    if (error.status === 0) {
      return {
        message: 'Ask Kawama could not connect. Check your connection and try again.',
        restartBeforeRetry: false,
      };
    }
    if (
      error.status === 429 ||
      code === 'CHAT_RATE_LIMIT' ||
      code === 'AI_PROVIDER_RATE_LIMITED'
    ) {
      return {
        message: 'Ask Kawama is receiving too many requests. Please wait a moment and try again.',
        restartBeforeRetry: false,
      };
    }
    if (code === 'AI_PROVIDER_TIMEOUT') {
      return {
        message: 'Ask Kawama took too long to respond. Please try again.',
        restartBeforeRetry: false,
      };
    }
    if (
      error.status === 503 ||
      code === 'AI_CHAT_DISABLED' ||
      code === 'AI_CHAT_NOT_CONFIGURED' ||
      code === 'AI_PROVIDER_NOT_CONFIGURED'
    ) {
      return {
        message: 'Ask Kawama is temporarily unavailable. You can keep browsing the shop and try again later.',
        restartBeforeRetry: false,
      };
    }
    return {
      message: 'Ask Kawama could not respond right now. Please try again.',
      restartBeforeRetry: false,
    };
  }

  private resetConversation(): void {
    this.requestGeneration += 1;
    this.cancelActiveRequest();
    this.chat.clearConversation();
    this.sending.set(false);
    this.messages.set([
      {
        id: this.nextMessageId++,
        role: 'assistant',
        text: 'New chat started. What are you shopping for?',
      },
    ]);
    this.messageText = '';
    this.scrollToLatest();
  }

  private cancelActiveRequest(): void {
    this.activeRequest?.unsubscribe();
    this.activeRequest = undefined;
  }

  private focusInput(): void {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => this.messageInput?.nativeElement.focus(), 0);
  }

  private scrollToLatest(): void {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      const messageList = this.messageList?.nativeElement;
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
    }, 0);
  }
}
