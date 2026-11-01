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
  readonly formattedText?: readonly ChatContentBlock[];
  readonly products?: readonly ShoppingChatProduct[];
  readonly suggestedFollowUps?: readonly string[];
  readonly error?: boolean;
  readonly retryMessage?: string;
  readonly restartBeforeRetry?: boolean;
}

interface ChatInlineSegment {
  readonly kind: 'text' | 'link';
  readonly text: string;
  readonly href?: string;
  readonly strong?: boolean;
}

interface ChatContentBlock {
  readonly kind: 'paragraph' | 'heading' | 'ordered-list' | 'unordered-list';
  readonly segments?: readonly ChatInlineSegment[];
  readonly items?: readonly (readonly ChatInlineSegment[])[];
}

const INLINE_TOKEN_PATTERN = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|https?:\/\/[^\s<]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?]+$/;

function inlineSegments(value: string): readonly ChatInlineSegment[] {
  const segments: ChatInlineSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(INLINE_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ kind: 'text', text: value.slice(cursor, index) });

    if (match[1] && match[2]) {
      segments.push({ kind: 'link', text: match[1], href: match[2] });
    } else if (match[3]) {
      segments.push({ kind: 'text', text: match[3], strong: true });
    } else {
      const token = match[0];
      const trailing = token.match(TRAILING_URL_PUNCTUATION)?.[0] ?? '';
      const href = trailing ? token.slice(0, -trailing.length) : token;
      segments.push({ kind: 'link', text: href, href });
      if (trailing) segments.push({ kind: 'text', text: trailing });
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length) segments.push({ kind: 'text', text: value.slice(cursor) });
  return segments.length ? segments : [{ kind: 'text', text: value }];
}

export function formatAssistantMessage(value: string): readonly ChatContentBlock[] {
  const blocks: ChatContentBlock[] = [];
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let listKind: 'ordered-list' | 'unordered-list' | undefined;
  let listItems: (readonly ChatInlineSegment[])[] = [];

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ kind: 'paragraph', segments: inlineSegments(text) });
    paragraph = [];
  };
  const flushList = () => {
    if (listKind && listItems.length) blocks.push({ kind: listKind, items: listItems });
    listKind = undefined;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', segments: inlineSegments(heading[2]) });
      continue;
    }

    const orderedItem = /^\d+[.)]\s+(.+)$/.exec(line);
    const unorderedItem = /^[-*•]\s+(.+)$/.exec(line);
    const nextListKind = orderedItem ? 'ordered-list' : unorderedItem ? 'unordered-list' : undefined;
    if (nextListKind) {
      flushParagraph();
      if (listKind && listKind !== nextListKind) flushList();
      listKind = nextListKind;
      listItems.push(inlineSegments((orderedItem ?? unorderedItem)![1]));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ kind: 'paragraph', segments: inlineSegments(value) }];
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
      formattedText: formatAssistantMessage('Hi! I can help you find products, compare current options, and explain Kawama checkout.'),
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
            formattedText: formatAssistantMessage(response.assistantMessage),
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
            formattedText: formatAssistantMessage(errorState.message),
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
        formattedText: formatAssistantMessage('New chat started. What are you shopping for?'),
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
