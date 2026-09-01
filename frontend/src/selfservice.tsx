import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CartLine, CatalogItem } from './types';

type ViewState = 'catalog' | 'pending' | 'success' | 'failed';
type UILang = 'pt' | 'en';

const uiText: Record<UILang, Record<string, string>> = {
  pt: {
    title: 'Selfservice',
    subtitle: 'Selecione os produtos e pague com MBWay',
    catalog: 'Produtos',
    cart: 'Carrinho',
    emptyCart: 'O carrinho esta vazio.',
    add: 'Adicionar',
    remove: 'Remover',
    total: 'Total',
    phone: 'Numero de telefone',
    paymentDetails: 'Dados de pagamento',
    mbwayNumber: 'Numero MBWay',
    mbwayHint: 'Insira o numero associado ao MBWay para continuar.',
    phonePlaceholder: '9XXXXXXXX',
    pay: 'Pagar',
    pendingTitle: 'Pagamento pendente',
    pendingHint: 'Estamos a aguardar confirmação de pagamento no MBWay.',
    timeoutHint: 'Se nao houver confirmação em 5 minutos, o pedido será cancelado.',
    successTitle: 'Pagamento confirmado',
    successHint: 'Obrigado pela tua compra! Enviamos o liink com os teus produtos para o teu telefone.',
    failedTitle: 'Pagamento sem sucesso',
    failedHint: 'O pagamento foi rejeitado ou expirou. Volte a tentar.',
    back: 'Voltar a comprar',
    cancel: 'Cancelar',
    loading: 'A carregar...',
    requiredPhone: 'Introduz um numero de telefone valido.',
    order: 'Pedido',
    associatedPhone: 'Numero associado',
    confirmed: 'Confirmado',
    attention: 'Atenção',
    statusOk: 'OK',
    statusFailed: 'Falhou',
  },
  en: {
    title: 'Selfservice',
    subtitle: 'Select products and pay with MBWay',
    catalog: 'Products',
    cart: 'Cart',
    emptyCart: 'Your cart is empty.',
    add: 'Add',
    remove: 'Remove',
    total: 'Total',
    phone: 'Phone number',
    paymentDetails: 'Payment details',
    mbwayNumber: 'MBWay number',
    mbwayHint: 'Enter the number associated with MBWay to continue.',
    phonePlaceholder: '9XXXXXXXX',
    pay: 'Pay',
    pendingTitle: 'Payment pending',
    pendingHint: 'Waiting for MBWay payment confirmation.',
    timeoutHint: 'If no confirmation arrives in 5 minutes, the order is canceled.',
    successTitle: 'Payment confirmed',
    successHint: 'Thank you! Your order has been paid successfully.',
    failedTitle: 'Payment failed',
    failedHint: 'Payment was rejected or timed out. Please try again.',
    back: 'Back to shopping',
    cancel: 'Cancel',
    loading: 'Loading...',
    requiredPhone: 'Please enter a valid phone number.',
    order: 'Order',
    associatedPhone: 'Associated number',
    confirmed: 'Confirmed',
    attention: 'Attention',
    statusOk: 'OK',
    statusFailed: 'Failed',
  },
};

const CHECKOUT_TIMEOUT_SECONDS = 300;

interface PublicConfig {
  organizer: string;
  organizerName?: string;
  organizerLogoUrl?: string;
  event: string;
  eventName?: string;
  basePath: string;
  apiBase: string;
  csrfToken?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
}

declare global {
  interface Window {
    BETTERPOS_SELF?: Partial<PublicConfig>;
  }
}

interface StoredPendingCheckout {
  token: string;
  phone?: string;
  orderCode?: string;
  expiresAt?: string;
}

function getPendingStorageKey(config: PublicConfig): string {
  return `betterpos:selfservice:pending:${config.organizer}:${config.event}`;
}

function loadPendingCheckout(storageKey: string): StoredPendingCheckout | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPendingCheckout;
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePendingCheckout(storageKey: string, payload: StoredPendingCheckout): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Best effort only.
  }
}

function clearPendingCheckout(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Best effort only.
  }
}

function getMountNode(): HTMLElement | null {
  return document.getElementById('betterpos-selfservice-app');
}

function applyBrandColors(config: PublicConfig): void {
  const primary = (config.brandPrimaryColor || '').trim();
  const secondary = (config.brandSecondaryColor || '').trim();
  const rootStyle = document.documentElement.style;
  if (primary) {
    rootStyle.setProperty('--color-primary', primary);
    rootStyle.setProperty('--pos-brand', primary);
  }
  if (secondary) {
    rootStyle.setProperty('--color-secondary', secondary);
    rootStyle.setProperty('--pos-accent', secondary);
  }
}

function getConfig(): PublicConfig {
  const mount = getMountNode();
  const ds = mount?.dataset || {};
  const cfg = window.BETTERPOS_SELF || {};
  return {
    organizer: String(cfg.organizer || ds.organizer || ''),
    organizerName: String(cfg.organizerName || ds.organizerName || ''),
    organizerLogoUrl: String(cfg.organizerLogoUrl || ds.organizerLogoUrl || ''),
    event: String(cfg.event || ds.event || ''),
    eventName: String(cfg.eventName || ds.eventName || ''),
    basePath: String(cfg.basePath || ds.basePath || ''),
    apiBase: String(cfg.apiBase || ds.apiBase || ''),
    csrfToken: String(cfg.csrfToken || ds.csrfToken || ''),
    brandPrimaryColor: String(cfg.brandPrimaryColor || ds.brandPrimaryColor || ''),
    brandSecondaryColor: String(cfg.brandSecondaryColor || ds.brandSecondaryColor || ''),
  };
}

function toMoney(value: number | string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTimerHue(progress: number): number {
  const safeProgress = clamp(progress, 0, 1);
  return Math.round(0 + safeProgress * 130);
}

function getCsrfToken(preferred?: string): string | null {
  if (preferred && preferred !== 'None' && preferred !== 'undefined' && preferred !== 'null') return preferred;
  const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  if (meta?.content) return meta.content;
  return null;
}

async function apiFetch<T>(config: PublicConfig, url: string, options?: RequestInit): Promise<T> {
  const opts: RequestInit = { ...(options || {}) };
  opts.credentials = 'same-origin';
  const method = (opts.method || 'GET').toUpperCase();
  opts.headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };

  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    const csrf = getCsrfToken(config.csrfToken);
    if (csrf) {
      (opts.headers as Record<string, string>)['X-CSRFToken'] = csrf;
    }
  }

  const res = await fetch(url, opts);
  const raw = await res.text();
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data as T;
}

function SelfserviceApp({ config }: { config: PublicConfig }) {
  const lang: UILang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
  const t = (key: string) => uiText[lang][key] || key;
  const eventTitle = (config.organizerName || '').trim() || (config.eventName || '').trim() || t('title');
  const eventSubtitle = (config.eventName || '').trim() || t('subtitle');
  const brandLogoUrl = (config.organizerLogoUrl || '').trim();
  const pendingStorageKey = useMemo(() => getPendingStorageKey(config), [config]);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [phone, setPhone] = useState('');
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [view, setView] = useState<ViewState>('catalog');
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [orderCode, setOrderCode] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(CHECKOUT_TIMEOUT_SECONDS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    applyBrandColors(config);
  }, [config]);

  const total = useMemo(() => cart.reduce((acc, line) => acc + line.price * line.qty, 0), [cart]);

  useEffect(() => {
    const stored = loadPendingCheckout(pendingStorageKey);
    if (!stored?.token) return;

    setCheckoutToken(stored.token);
    if (stored.phone) setPhone(stored.phone);
    if (stored.orderCode) setOrderCode(stored.orderCode);

    const parsedExpiresAt = Date.parse(stored.expiresAt || '');
    if (!Number.isNaN(parsedExpiresAt)) {
      setExpiresAtMs(parsedExpiresAt);
      setRemainingSeconds(Math.max(0, Math.ceil((parsedExpiresAt - Date.now()) / 1000)));
    }

    setView('pending');
  }, [pendingStorageKey]);

  useEffect(() => {
    apiFetch<{ items: CatalogItem[] }>(config, `${config.apiBase}/catalog/`)
      .then((data) => setCatalog(data.items || []))
      .catch((err: Error) => setError(err.message));
  }, [config]);

  useEffect(() => {
    if (view !== 'pending' || !checkoutToken) return;

    const pollStatus = () => {
      apiFetch<{ state: string; order_code: string; remaining_seconds: number; expires_at: string }>(
        config,
        `${config.apiBase}/checkout/${checkoutToken}/status/`
      )
        .then((status) => {
          setRemainingSeconds(status.remaining_seconds || 0);
          const parsedExpiresAt = Date.parse(status.expires_at);
          if (!Number.isNaN(parsedExpiresAt)) {
            setExpiresAtMs(parsedExpiresAt);
          }
          setOrderCode(status.order_code || orderCode);
          if (status.state === 'paid') {
            setView('success');
            setCart([]);
            setCheckoutToken(null);
            setExpiresAtMs(null);
            clearPendingCheckout(pendingStorageKey);
          } else if (status.state === 'failed' || status.state === 'timeout') {
            setView('failed');
            setCheckoutToken(null);
            setExpiresAtMs(null);
            clearPendingCheckout(pendingStorageKey);
          } else {
            savePendingCheckout(pendingStorageKey, {
              token: checkoutToken,
              phone,
              orderCode: status.order_code || orderCode,
              expiresAt: status.expires_at,
            });
          }
        })
        .catch((err: Error) => {
          setError(err.message);
          setView('failed');
          setCheckoutToken(null);
          setExpiresAtMs(null);
          clearPendingCheckout(pendingStorageKey);
        });
    };

    pollStatus();
    const pollIntervalMs = 5000 + Math.floor(Math.random() * 700);
    const timer = window.setInterval(pollStatus, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [view, checkoutToken, config, orderCode, phone, pendingStorageKey]);

  useEffect(() => {
    if (view !== 'pending') return;

    const tick = () => {
      if (!expiresAtMs) return;
      const seconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(seconds);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [view, expiresAtMs]);

  useEffect(() => {
    if (view !== 'failed') return;
    clearPendingCheckout(pendingStorageKey);
    const timer = window.setTimeout(() => {
      setView('catalog');
      setCheckoutToken(null);
      setExpiresAtMs(null);
      setOrderCode('');
      setRemainingSeconds(300);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [view, pendingStorageKey]);

  function addToCart(item: CatalogItem) {
    setCart((old) => {
      const existing = old.find((line) => line.item_id === item.id);
      if (existing) {
        return old.map((line) =>
          line.item_id === item.id
            ? { ...line, qty: line.qty + 1 }
            : line
        );
      }
      return old.concat([{ item_id: item.id, name: item.name, price: Number(item.price || 0), qty: 1 }]);
    });
  }

  function removeFromCart(itemId: number) {
    setCart((old) =>
      old
        .map((line) => (line.item_id === itemId ? { ...line, qty: Math.max(0, line.qty - 1) } : line))
        .filter((line) => line.qty > 0)
    );
  }

  async function startCheckout(): Promise<boolean> {
    if (!cart.length) return false;
    if (!phone.trim()) {
      setError(t('requiredPhone'));
      return false;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{
        checkout_token: string;
        order_code: string;
        state: string;
        expires_at: string;
      }>(config, `${config.apiBase}/checkout/start/`, {
        method: 'POST',
        body: JSON.stringify({
          phone,
          locale: lang,
          lines: cart.map((line) => ({ item_id: line.item_id, quantity: line.qty })),
        }),
      });
      setCheckoutToken(result.checkout_token);
      setOrderCode(result.order_code);
      const parsedExpiresAt = Date.parse(result.expires_at);
      if (!Number.isNaN(parsedExpiresAt)) {
        setExpiresAtMs(parsedExpiresAt);
        setRemainingSeconds(Math.max(0, Math.ceil((parsedExpiresAt - Date.now()) / 1000)));
      } else {
        setExpiresAtMs(null);
        setRemainingSeconds(CHECKOUT_TIMEOUT_SECONDS);
      }
      savePendingCheckout(pendingStorageKey, {
        token: result.checkout_token,
        phone: phone.trim(),
        orderCode: result.order_code,
        expiresAt: result.expires_at,
      });
      setView('pending');
      return true;
    } catch (err) {
      setError((err as Error).message);
      setView('failed');
      return false;
    } finally {
      setLoading(false);
    }
  }

  function askPhoneAndCheckout() {
    if (!cart.length) return;
    setPhoneModalOpen(true);
  }

  function backToCatalog() {
    setView('catalog');
    setCheckoutToken(null);
    setExpiresAtMs(null);
    setOrderCode('');
    setRemainingSeconds(CHECKOUT_TIMEOUT_SECONDS);
    clearPendingCheckout(pendingStorageKey);
  }

  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const ss = String(remainingSeconds % 60).padStart(2, '0');
  const phoneDisplay = phone.trim() || '-';
  const timerProgress = clamp(remainingSeconds / CHECKOUT_TIMEOUT_SECONDS, 0, 1);
  const timerHue = getTimerHue(timerProgress);
  const timerStyle = {
    '--timer-progress': String(timerProgress),
    '--timer-color': `hsl(${timerHue} 78% 48%)`,
    '--timer-color-soft': `hsla(${timerHue} 78% 48% / 0.18)`,
    '--timer-glow': `hsla(${timerHue} 78% 48% / 0.28)`,
  } as React.CSSProperties;

  return (
    <div className="betterpos-container">
      <header className="betterpos-header">
        <div className="header-brand">
          {brandLogoUrl ? <img src={brandLogoUrl} alt={eventTitle} className="header-brand-logo" /> : null}
          <div>
          <h1>{eventTitle}</h1>
          <p>{eventSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="view pos-view">
        {error ? <div className="error-box">{error}</div> : null}

        {view === 'catalog' ? (
          <div className="pos-container">
            <div className="pos-catalog">
              <div className="pos-section-head">
                <h3>{t('catalog')}</h3>
                <span className="section-pill">{catalog.length}</span>
              </div>
              <div className="catalog-grid">
                {catalog.map((item) => (
                  <div key={item.id} className="catalog-card">
                    <h4>{item.name}</h4>
                    <p className="price">{toMoney(item.price)} EUR</p>
                    <button onClick={() => addToCart(item)}>{t('add')}</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pos-cart">
              <div className="pos-section-head">
                <h3>{t('cart')}</h3>
                <span className="section-pill">{cart.length}</span>
              </div>
              <div className="cart-items">
                {cart.length ? cart.map((line) => (
                  <div key={line.item_id} className="cart-line">
                    <div>
                      <strong>{line.name}</strong>
                      <div className="muted">{toMoney(line.price)} EUR</div>
                    </div>
                    <div className="line-total">
                      x{line.qty} = {toMoney(line.qty * line.price)} EUR
                    </div>
                    <button className="btn-secondary" onClick={() => removeFromCart(line.item_id)}>{t('remove')}</button>
                  </div>
                )) : <p className="muted">{t('emptyCart')}</p>}
              </div>

              <div className="cart-summary">
                <h4>{t('total')}: {toMoney(total)} EUR</h4>
              </div>

              <button className="pay-btn pay-btn-eupago" onClick={askPhoneAndCheckout} disabled={loading || !cart.length}>
                {loading ? t('loading') : t('pay')}
              </button>
            </div>
          </div>
        ) : null}

        {phoneModalOpen ? (
          <div className="modal-backdrop" onClick={() => setPhoneModalOpen(false)}>
            <div className="modal-card" onClick={(ev) => ev.stopPropagation()}>
              <div className="modal-header">
                <h4>{t('paymentDetails')}</h4>
                <button type="button" className="btn-secondary modal-close-btn" onClick={() => setPhoneModalOpen(false)}>
                  x
                </button>
              </div>
              <div className="modal-body">
                <label>{t('mbwayNumber')}</label>
                <input
                  value={phone}
                  onChange={(ev) => setPhone(ev.target.value)}
                  placeholder={t('phonePlaceholder')}
                />
                <p className="muted">{t('mbwayHint')}</p>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setPhoneModalOpen(false)}>
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await startCheckout();
                      if (ok) setPhoneModalOpen(false);
                    }}
                    disabled={loading}
                  >
                    {loading ? t('loading') : t('pay')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {view === 'pending' ? (
          <div className="selfservice-status-card selfservice-status-pending">
            <div className="selfservice-status-hero">
              <div className="timer-ring" style={timerStyle}>
                <div className="timer-ring-inner">
                  <span className="timer-value">{mm}:{ss}</span>
                </div>
              </div>

              <div className="selfservice-status-copy">
                <span className="status-kicker">MBWay</span>
                <h3>{t('pendingTitle')}</h3>
                <p>{t('pendingHint')}</p>
                <p className="pending-timeout-note">{t('timeoutHint')}</p>
              </div>
            </div>

            <div className="selfservice-status-meta selfservice-status-meta-pending">
              <div>
                <span className="meta-label">{t('order')}</span>
                <strong>{orderCode}</strong>
              </div>
              <div>
                <span className="meta-label">{t('associatedPhone')}</span>
                <strong>{phoneDisplay}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {view === 'success' ? (
          <div className="selfservice-status-card selfservice-status-success">
            <div className="selfservice-status-hero">
              <div className="status-badge-icon status-badge-icon-success">✓</div>
              <div className="selfservice-status-copy">
                <span className="status-kicker">{t('confirmed')}</span>
                <h3>{t('successTitle')}</h3>
                <p>{t('successHint')}</p>
              </div>
            </div>

            <div className="selfservice-status-meta">
              <div>
                <span className="meta-label">{t('order')}</span>
                <strong>{orderCode}</strong>
              </div>
            </div>

            <button className="selfservice-cta-success" onClick={backToCatalog}>{t('back')}</button>
          </div>
        ) : null}

        {view === 'failed' ? (
          <div className="selfservice-status-card selfservice-status-failed">
            <div className="selfservice-status-hero">
              <div className="status-badge-icon status-badge-icon-failed">!</div>
              <div className="selfservice-status-copy">
                <span className="status-kicker">{t('attention')}</span>
                <h3>{t('failedTitle')}</h3>
                <p>{t('failedHint')}</p>
              </div>
            </div>

            <div className="selfservice-status-meta">
              <div>
                <span className="meta-label">{t('order')}</span>
                <strong>{orderCode || '—'}</strong>
              </div>
              <div>
                <span className="meta-label">Estado</span>
                <strong>{t('statusFailed')}</strong>
              </div>
            </div>

            <button className="selfservice-cta-failed" onClick={backToCatalog}>{t('back')}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const mountNode = getMountNode();
if (!mountNode) {
  throw new Error('Missing #betterpos-selfservice-app mount node');
}

const config = getConfig();
const root = createRoot(mountNode);

root.render(
  <React.StrictMode>
    <SelfserviceApp config={config} />
  </React.StrictMode>
);
