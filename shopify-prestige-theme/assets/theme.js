/**
 * Prestige Theme — theme.js
 * Vanilla ES6+, event-driven, zero dependencies.
 */

'use strict';

/* ==========================================================================
   UTILITIES
   ========================================================================== */

const $ = (selector, ctx = document) => ctx.querySelector(selector);
const $$ = (selector, ctx = document) => [...ctx.querySelectorAll(selector)];

const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
};

const formatMoney = (cents, format = window.Shopify?.money_format ?? '${{amount}}') => {
  const amount = (cents / 100).toFixed(2);
  const [whole, decimal] = amount.split('.');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return format
    .replace('{{amount}}', `${formatted}.${decimal}`)
    .replace('{{amount_no_decimals}}', formatted)
    .replace('{{amount_with_comma_separator}}', `${formatted.replace(/,/g, '.')},${decimal}`);
};

const trapFocus = (container) => {
  const focusable = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', container);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  const handler = (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
};

const lockScroll = () => {
  document.body.dataset.scrollLocked = 'true';
  document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
};

const unlockScroll = () => {
  document.body.dataset.scrollLocked = 'false';
  document.body.style.paddingRight = '';
};

const publishEvent = (name, detail = {}) =>
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

/* ==========================================================================
   HEADER — Sticky / Transparent / Hide-on-scroll
   ========================================================================== */

class SiteHeader {
  constructor(el) {
    this.el = el;
    this.lastScroll = 0;
    this.isTransparent = el.hasAttribute('data-transparent');
    this.announcementHeight = $('.announcement-bar')?.offsetHeight ?? 0;
    this.threshold = 80;
    this.init();
  }

  init() {
    this.onScroll = debounce(this.handleScroll.bind(this), 10);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    this.handleScroll();
  }

  handleScroll() {
    const current = window.scrollY;
    const scrolled = current > this.announcementHeight + 20;

    this.el.classList.toggle('site-header--scrolled', scrolled);

    if (this.isTransparent) {
      this.el.classList.toggle('site-header--transparent', !scrolled);
    }

    if (current < this.threshold) {
      this.el.classList.remove('site-header--hidden');
    } else if (current > this.lastScroll + 4 && !this.el.classList.contains('site-header--hidden')) {
      this.el.classList.add('site-header--hidden');
    } else if (current < this.lastScroll - 4) {
      this.el.classList.remove('site-header--hidden');
    }

    this.lastScroll = current <= 0 ? 0 : current;
  }
}

/* ==========================================================================
   MEGA MENU
   ========================================================================== */

class MegaMenu {
  constructor(header) {
    this.header = header;
    this.triggers = $$('[data-mega-menu-trigger]', header);
    this.active = null;
    this.init();
  }

  init() {
    this.triggers.forEach(trigger => {
      trigger.addEventListener('mouseenter', () => this.open(trigger));
      trigger.addEventListener('focus', () => this.open(trigger));
    });

    this.header.addEventListener('mouseleave', () => this.closeAll());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  }

  open(trigger) {
    const menuId = trigger.dataset.megaMenuTrigger;
    const menu = $(`[data-mega-menu="${menuId}"]`, this.header);
    if (!menu) return;
    this.closeAll(false);
    menu.classList.add('mega-menu--active');
    trigger.setAttribute('aria-expanded', 'true');
    this.active = { trigger, menu };
  }

  closeAll(focus = true) {
    $$('.mega-menu--active', this.header).forEach(m => m.classList.remove('mega-menu--active'));
    this.triggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
    this.active = null;
  }
}

/* ==========================================================================
   MOBILE NAV DRAWER
   ========================================================================== */

class MobileNav {
  constructor() {
    this.drawer = $('#mobile-nav');
    this.openBtn = $('[data-mobile-nav-open]');
    this.closeBtn = $('[data-mobile-nav-close]');
    this.overlay = $('#overlay');
    if (!this.drawer) return;
    this.releaseFocus = null;
    this.init();
  }

  init() {
    this.openBtn?.addEventListener('click', () => this.open());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  open() {
    this.drawer.classList.add('mobile-nav--open');
    this.overlay?.classList.add('site-overlay--active');
    lockScroll();
    this.releaseFocus = trapFocus(this.drawer);
    this.closeBtn?.focus();
  }

  close() {
    this.drawer.classList.remove('mobile-nav--open');
    this.overlay?.classList.remove('site-overlay--active');
    unlockScroll();
    this.releaseFocus?.();
    this.openBtn?.focus();
  }
}

/* ==========================================================================
   CART DRAWER — AJAX side cart
   ========================================================================== */

class CartDrawer {
  constructor() {
    this.drawer = $('#cart-drawer');
    this.overlay = $('#overlay');
    this.itemsContainer = this.drawer?.querySelector('.cart-drawer__items');
    this.subtotalEl = this.drawer?.querySelector('.cart-drawer__subtotal-price');
    this.countEl = this.drawer?.querySelector('.cart-drawer__count');
    this.progressFill = this.drawer?.querySelector('.shipping-progress__fill');
    this.progressLabel = this.drawer?.querySelector('.shipping-progress__label');
    this.freeShippingThreshold = window.theme?.settings?.free_shipping_threshold ?? 0;
    this.releaseFocus = null;
    if (!this.drawer) return;
    this.init();
  }

  init() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-cart-drawer-open]')) { e.preventDefault(); this.open(); }
      if (e.target.closest('[data-cart-drawer-close]') || (e.target === this.overlay)) this.close();
      if (e.target.closest('[data-cart-remove]')) this.removeItem(e.target.closest('[data-cart-remove]'));
      if (e.target.closest('[data-quantity-change]')) this.changeQuantity(e.target.closest('[data-quantity-change]'));
    });

    document.addEventListener('cart:open', () => this.open());
    document.addEventListener('cart:refresh', () => this.fetchCart());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  async open() {
    await this.fetchCart();
    this.drawer.classList.add('cart-drawer--open');
    this.overlay?.classList.add('site-overlay--active');
    this.drawer.removeAttribute('aria-hidden');
    lockScroll();
    this.releaseFocus = trapFocus(this.drawer);
    this.drawer.querySelector('.cart-drawer__close')?.focus();
  }

  close() {
    this.drawer.classList.remove('cart-drawer--open');
    this.overlay?.classList.remove('site-overlay--active');
    this.drawer.setAttribute('aria-hidden', 'true');
    unlockScroll();
    this.releaseFocus?.();
  }

  async fetchCart() {
    try {
      const res = await fetch(`${window.theme.routes.cart}.js`);
      const cart = await res.json();
      this.renderCart(cart);
      this.updateHeaderCount(cart.item_count);
    } catch (e) {
      console.error('Cart fetch failed:', e);
    }
  }

  renderCart(cart) {
    if (!this.itemsContainer) return;

    this.subtotalEl && (this.subtotalEl.textContent = formatMoney(cart.total_price));
    this.countEl && (this.countEl.textContent = `(${cart.item_count})`);

    this.updateShippingProgress(cart.total_price);

    if (cart.item_count === 0) {
      this.itemsContainer.innerHTML = `
        <div class="cart-drawer__empty">
          <p class="cart-drawer__empty-title">Your cart is empty</p>
          <p>Discover our collection and find something you love.</p>
          <a href="/collections/all" class="btn btn--secondary">Shop Now</a>
        </div>`;
      return;
    }

    this.itemsContainer.innerHTML = cart.items.map(item => this.renderItem(item)).join('');
  }

  renderItem(item) {
    const image = item.image
      ? `<img src="${item.image.replace('_original.', '_200x.')}" alt="${item.product_title}" loading="lazy" width="96" height="128">`
      : '';

    const variantInfo = item.variant_title && item.variant_title !== 'Default Title'
      ? `<p class="cart-item__variant">${item.variant_title}</p>` : '';

    return `
      <div class="cart-item" data-line="${item.key}">
        <a href="${item.url}" class="cart-item__image">${image}</a>
        <div class="cart-item__details">
          <p class="cart-item__vendor">${item.vendor}</p>
          <a href="${item.url}" class="cart-item__title">${item.product_title}</a>
          ${variantInfo}
          <div class="cart-item__footer">
            <div class="quantity-input">
              <button class="quantity-input__btn" data-quantity-change data-line="${item.key}" data-direction="-1" aria-label="Decrease quantity">
                <svg width="12" height="2" viewBox="0 0 12 2" fill="none" aria-hidden="true"><line x1="1" y1="1" x2="11" y2="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <input class="quantity-input__field" type="number" value="${item.quantity}" min="1" data-line-key="${item.key}" aria-label="Quantity">
              <button class="quantity-input__btn" data-quantity-change data-line="${item.key}" data-direction="1" aria-label="Increase quantity">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </div>
            <span class="cart-item__price">${formatMoney(item.final_line_price)}</span>
            <button class="cart-item__remove" data-cart-remove data-line="${item.key}" aria-label="Remove ${item.product_title}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l.8 9.6a.8.8 0 00.8.8h6.8a.8.8 0 00.8-.8L13 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }

  updateShippingProgress(totalCents) {
    if (!this.progressFill || !this.freeShippingThreshold) return;
    const pct = Math.min((totalCents / this.freeShippingThreshold) * 100, 100);
    this.progressFill.style.width = `${pct}%`;
    const remaining = this.freeShippingThreshold - totalCents;
    if (this.progressLabel) {
      this.progressLabel.textContent = remaining > 0
        ? `Spend ${formatMoney(remaining)} more for free shipping`
        : 'You qualify for free shipping!';
    }
  }

  updateHeaderCount(count) {
    $$('[data-cart-count]').forEach(el => {
      el.textContent = count;
      el.dataset.count = count;
    });
  }

  async removeItem(btn) {
    const key = btn.dataset.line;
    btn.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(window.theme.routes.cart_change, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ id: key, quantity: 0 })
      });
      const cart = await res.json();
      this.renderCart(cart);
      this.updateHeaderCount(cart.item_count);
    } catch (e) { console.error('Remove item failed:', e); }
  }

  async changeQuantity(btn) {
    const key = btn.dataset.line;
    const direction = parseInt(btn.dataset.direction, 10);
    const input = this.itemsContainer.querySelector(`[data-line-key="${key}"]`);
    const newQty = Math.max(1, parseInt(input?.value ?? 1, 10) + direction);

    try {
      const res = await fetch(window.theme.routes.cart_change, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ id: key, quantity: newQty })
      });
      const cart = await res.json();
      this.renderCart(cart);
      this.updateHeaderCount(cart.item_count);
    } catch (e) { console.error('Update quantity failed:', e); }
  }
}

/* ==========================================================================
   ADD TO CART — Main product form + Quick buy
   ========================================================================== */

class AddToCart {
  constructor() {
    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-add-to-cart-form]');
      if (!form) return;
      e.preventDefault();
      await this.submit(form);
    });
  }

  async submit(form) {
    const btn = form.querySelector('[data-submit-btn]');
    if (!btn) return;

    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-loading');

    try {
      const formData = new FormData(form);
      const res = await fetch(window.theme.routes.cart_add, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: formData
      });

      if (!res.ok) throw new Error((await res.json()).description ?? 'Add to cart failed');

      publishEvent('cart:open');
      publishEvent('cart:refresh');

      btn.setAttribute('aria-busy', 'false');
      btn.classList.remove('is-loading');

      const originalText = btn.querySelector('.btn__text')?.textContent;
      if (btn.querySelector('.btn__text')) btn.querySelector('.btn__text').textContent = 'Added!';
      setTimeout(() => {
        if (btn.querySelector('.btn__text')) btn.querySelector('.btn__text').textContent = originalText ?? 'Add to Cart';
      }, 2000);

    } catch (err) {
      console.error('Add to cart error:', err);
      btn.setAttribute('aria-busy', 'false');
      btn.classList.remove('is-loading');
    }
  }
}

/* ==========================================================================
   VARIANT SELECTOR
   ========================================================================== */

class VariantSelector {
  constructor(form) {
    this.form = form;
    this.productData = JSON.parse($('[data-product-json]', form)?.textContent ?? '{}');
    this.selectors = $$('[data-option-selector]', form);
    this.priceEl = $('[data-product-price]', form.closest('[data-product-section]') ?? document);
    this.comparePriceEl = $('[data-product-compare-price]', form.closest('[data-product-section]') ?? document);
    this.addBtn = $('[data-submit-btn]', form);
    this.mainImage = $('[data-product-main-image]');
    this.init();
  }

  init() {
    this.selectors.forEach(el => {
      el.addEventListener('change', () => this.onVariantChange());
      el.addEventListener('click', (e) => {
        const target = e.target.closest('[data-variant-value]');
        if (!target) return;
        $$('[data-variant-value]', el).forEach(v => v.classList.remove('variant-btn--active', 'variant-swatch--active'));
        target.classList.add(target.dataset.selectorType === 'color' ? 'variant-swatch--active' : 'variant-btn--active');
        const hiddenInput = el.querySelector('input[type=hidden]') ?? el.querySelector('select');
        if (hiddenInput) hiddenInput.value = target.dataset.variantValue;
        this.onVariantChange();
      });
    });
  }

  onVariantChange() {
    const selectedValues = this.selectors.map(s => {
      const active = $('[data-variant-value].variant-btn--active, [data-variant-value].variant-swatch--active', s);
      return active?.dataset.variantValue ?? s.querySelector('select')?.value ?? '';
    });

    const variant = this.productData.variants?.find(v =>
      v.options.every((opt, i) => opt === selectedValues[i])
    );

    if (!variant) return;

    this.updatePrice(variant);
    this.updateAvailability(variant);
    this.updateURL(variant);
    this.updateMedia(variant);

    publishEvent('variant:changed', { variant, form: this.form });
  }

  updatePrice(variant) {
    if (!this.priceEl) return;
    this.priceEl.textContent = formatMoney(variant.price);
    if (this.comparePriceEl) {
      this.comparePriceEl.textContent = variant.compare_at_price > variant.price
        ? formatMoney(variant.compare_at_price) : '';
    }
  }

  updateAvailability(variant) {
    if (!this.addBtn) return;
    const text = this.addBtn.querySelector('.btn__text');
    if (!variant.available) {
      this.addBtn.setAttribute('disabled', 'disabled');
      if (text) text.textContent = 'Sold Out';
    } else {
      this.addBtn.removeAttribute('disabled');
      if (text) text.textContent = 'Add to Cart';
    }
  }

  updateURL(variant) {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.id);
    window.history.replaceState({}, '', url.toString());
  }

  updateMedia(variant) {
    if (!variant.featured_image || !this.mainImage) return;
    const newSrc = variant.featured_image.src.replace(/_(pico|icon|thumb|small|compact|medium|large|grande|original)\./, '_800x.');
    this.mainImage.src = newSrc;
    this.mainImage.closest('.product-gallery__item')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ==========================================================================
   COLOR SWATCH HOVER — Collection grid image swap
   ========================================================================== */

class SwatchHover {
  constructor(card) {
    this.card = card;
    this.swatches = $$('[data-swatch-hover]', card);
    this.img = card.querySelector('.product-card__image');
    this.hoverImg = card.querySelector('.product-card__image--hover');
    this.init();
  }

  init() {
    this.swatches.forEach(swatch => {
      swatch.addEventListener('mouseenter', () => this.swap(swatch));
      swatch.addEventListener('focus', () => this.swap(swatch));
    });
  }

  swap(swatch) {
    const imgSrc = swatch.dataset.swatchImage;
    if (!imgSrc || !this.hoverImg) return;
    this.hoverImg.src = imgSrc;
    $$('[data-swatch-hover]', this.card).forEach(s => s.classList.remove('swatch--active'));
    swatch.classList.add('swatch--active');
  }
}

/* ==========================================================================
   SLIDESHOW
   ========================================================================== */

class Slideshow {
  constructor(el) {
    this.el = el;
    this.track = el.querySelector('.slideshow__slides');
    this.slides = $$('.slideshow__slide', el);
    this.dots = $$('.slideshow__dot', el);
    this.prevBtn = el.querySelector('.slideshow__arrow--prev');
    this.nextBtn = el.querySelector('.slideshow__arrow--next');
    this.current = 0;
    this.autoplay = el.dataset.autoplay !== 'false';
    this.interval = parseInt(el.dataset.interval ?? '5000', 10);
    this.timer = null;
    this.isDragging = false;
    this.startX = 0;
    this.init();
  }

  init() {
    this.prevBtn?.addEventListener('click', () => { this.prev(); this.resetTimer(); });
    this.nextBtn?.addEventListener('click', () => { this.next(); this.resetTimer(); });
    this.dots.forEach((dot, i) => dot.addEventListener('click', () => { this.goTo(i); this.resetTimer(); }));

    this.el.addEventListener('pointerdown', e => { this.isDragging = true; this.startX = e.clientX; });
    this.el.addEventListener('pointerup', e => {
      if (!this.isDragging) return;
      const diff = this.startX - e.clientX;
      if (Math.abs(diff) > 50) diff > 0 ? this.next() : this.prev();
      this.isDragging = false;
    });

    if (this.autoplay && this.slides.length > 1) this.startTimer();

    this.goTo(0);
  }

  goTo(index) {
    this.current = (index + this.slides.length) % this.slides.length;
    if (this.track) {
      this.track.style.transform = `translateX(-${this.current * 100}%)`;
    }
    this.dots.forEach((dot, i) => dot.classList.toggle('slideshow__dot--active', i === this.current));
    this.slides.forEach((slide, i) => {
      slide.setAttribute('aria-hidden', i !== this.current ? 'true' : 'false');
    });
  }

  next() { this.goTo(this.current + 1); }
  prev() { this.goTo(this.current - 1); }

  startTimer() { this.timer = setInterval(() => this.next(), this.interval); }
  resetTimer() { clearInterval(this.timer); this.startTimer(); }
  destroy() { clearInterval(this.timer); }
}

/* ==========================================================================
   CAROUSEL
   ========================================================================== */

class Carousel {
  constructor(el) {
    this.el = el;
    this.track = el.querySelector('.carousel-track');
    this.items = $$('.carousel-item', el);
    this.prevBtn = el.querySelector('.carousel-btn--prev');
    this.nextBtn = el.querySelector('.carousel-btn--next');
    this.current = 0;
    this.visible = parseInt(getComputedStyle(el).getPropertyValue('--carousel-visible').trim() || '4', 10);
    this.init();
  }

  init() {
    this.prevBtn?.addEventListener('click', () => this.prev());
    this.nextBtn?.addEventListener('click', () => this.next());
    window.addEventListener('resize', debounce(() => this.recalculate(), 200));
    this.update();
  }

  recalculate() {
    this.visible = parseInt(getComputedStyle(this.el).getPropertyValue('--carousel-visible').trim() || '4', 10);
    this.goTo(0);
  }

  goTo(index) {
    const max = Math.max(0, this.items.length - this.visible);
    this.current = Math.max(0, Math.min(index, max));
    const itemWidth = this.items[0]?.offsetWidth ?? 0;
    const gap = parseFloat(getComputedStyle(this.track)?.gap ?? '0');
    this.track.style.transform = `translateX(-${this.current * (itemWidth + gap)}px)`;
    this.update();
  }

  prev() { this.goTo(this.current - 1); }
  next() { this.goTo(this.current + 1); }

  update() {
    const max = Math.max(0, this.items.length - this.visible);
    if (this.prevBtn) this.prevBtn.disabled = this.current === 0;
    if (this.nextBtn) this.nextBtn.disabled = this.current >= max;
  }
}

/* ==========================================================================
   ACCORDION
   ========================================================================== */

class Accordion {
  constructor(el) {
    this.el = el;
    this.trigger = el.querySelector('.accordion__trigger');
    this.content = el.querySelector('.accordion__content');
    this.init();
  }

  init() {
    this.trigger?.addEventListener('click', () => this.toggle());
  }

  toggle() {
    const expanded = this.trigger.getAttribute('aria-expanded') === 'true';
    this.trigger.setAttribute('aria-expanded', !expanded ? 'true' : 'false');
    this.content?.setAttribute('aria-hidden', expanded ? 'true' : 'false');
  }

  open() {
    this.trigger?.setAttribute('aria-expanded', 'true');
    this.content?.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.content?.setAttribute('aria-hidden', 'true');
  }
}

/* ==========================================================================
   PREDICTIVE SEARCH
   ========================================================================== */

class PredictiveSearch {
  constructor(modal) {
    this.modal = modal;
    this.input = modal.querySelector('.search-modal__input');
    this.results = modal.querySelector('.search-results');
    this.openBtns = $$('[data-search-open]');
    this.closeBtns = $$('[data-search-close]', modal);
    this.abortController = null;
    this.releaseFocus = null;
    this.init();
  }

  init() {
    this.openBtns.forEach(btn => btn.addEventListener('click', () => this.open()));
    this.closeBtns.forEach(btn => btn.addEventListener('click', () => this.close()));

    this.input?.addEventListener('input', debounce((e) => {
      const q = e.target.value.trim();
      if (q.length >= 2) this.fetch(q); else this.clearResults();
    }, 300));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.close();
    });
  }

  open() {
    this.modal.hidden = false;
    lockScroll();
    this.releaseFocus = trapFocus(this.modal);
    this.input?.focus();
  }

  close() {
    this.modal.hidden = true;
    unlockScroll();
    this.releaseFocus?.();
    this.clearResults();
    $$('[data-search-open]')[0]?.focus();
  }

  clearResults() {
    if (this.results) this.results.innerHTML = '';
    this.abortController?.abort();
  }

  async fetch(query) {
    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      const params = new URLSearchParams({
        q: query,
        resources: 'product,collection,page',
        limit: 6,
        'resources[options][unavailable_products]': 'hide',
        'resources[options][fields]': 'title,product_type,variants.title'
      });

      const res = await fetch(`${window.theme.routes.predictive_search}?${params}&section_id=predictive-search`, {
        signal: this.abortController.signal,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      const html = await res.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const content = parsed.querySelector('#shopify-section-predictive-search');
      if (this.results && content) this.results.innerHTML = content.innerHTML;

    } catch (e) {
      if (e.name !== 'AbortError') console.error('Search error:', e);
    }
  }
}

/* ==========================================================================
   COLLECTION FILTERING — OS2.0 async filters
   ========================================================================== */

class CollectionFilter {
  constructor(section) {
    this.section = section;
    this.grid = section.querySelector('[data-product-grid]');
    this.form = section.querySelector('[data-filter-form]');
    this.sortSelect = section.querySelector('[data-sort-select]');
    this.abortController = null;
    this.init();
  }

  init() {
    this.form?.addEventListener('change', (e) => {
      if (e.target.closest('[data-filter-input]')) {
        this.submitFilter();
      }
    });

    this.sortSelect?.addEventListener('change', () => this.submitFilter());

    this.section.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-remove-filter]');
      if (!chip) return;
      const url = chip.dataset.removeFilter;
      this.fetchCollection(url);
    });

    window.addEventListener('popstate', () => this.fetchCollection(window.location.href, false));
  }

  submitFilter() {
    const url = new URL(window.location.href);
    if (this.form) {
      const data = new FormData(this.form);
      const params = new URLSearchParams(data);
      if (this.sortSelect?.value) params.set('sort_by', this.sortSelect.value);
      url.search = params.toString();
    }
    this.fetchCollection(url.toString());
  }

  async fetchCollection(url, pushState = true) {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.grid?.classList.add('product-grid--loading');

    try {
      const sectionUrl = new URL(url, window.location.origin);
      sectionUrl.searchParams.set('section_id', this.section.dataset.sectionId ?? 'main-collection');

      const res = await fetch(sectionUrl.toString(), {
        signal: this.abortController.signal,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      const html = await res.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');

      const newGrid = parsed.querySelector('[data-product-grid]');
      const newToolbar = parsed.querySelector('[data-collection-toolbar]');
      const newFilters = parsed.querySelector('[data-filter-form]');
      const newPagination = parsed.querySelector('[data-pagination]');
      const newActiveFilters = parsed.querySelector('[data-active-filters]');

      if (newGrid && this.grid) this.grid.innerHTML = newGrid.innerHTML;
      if (newToolbar) $('[data-collection-toolbar]', this.section)?.replaceWith(newToolbar);
      if (newFilters && this.form) this.form.innerHTML = newFilters.innerHTML;
      if (newActiveFilters) $('[data-active-filters]', this.section)?.replaceWith(newActiveFilters);
      if (newPagination) $('[data-pagination]', this.section)?.replaceWith(newPagination);

      if (pushState) history.pushState(null, '', url);

      initProductCards();

    } catch (e) {
      if (e.name !== 'AbortError') console.error('Filter error:', e);
    } finally {
      this.grid?.classList.remove('product-grid--loading');
    }
  }
}

/* ==========================================================================
   SHOP THE LOOK — Hotspot popovers
   ========================================================================== */

class ShopTheLook {
  constructor(section) {
    this.section = section;
    this.hotspots = $$('.hotspot', section);
    this.activePopover = null;
    this.init();
  }

  init() {
    this.hotspots.forEach(hotspot => {
      hotspot.addEventListener('click', (e) => {
        e.stopPropagation();
        const popoverId = hotspot.dataset.hotspot;
        const popover = $(`[data-hotspot-popover="${popoverId}"]`, this.section);
        if (!popover) return;
        if (this.activePopover === popover) { this.closeAll(); return; }
        this.closeAll();
        this.open(hotspot, popover);
      });
    });

    document.addEventListener('click', () => this.closeAll());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeAll(); });
  }

  open(hotspot, popover) {
    popover.classList.add('hotspot-popover--active');
    hotspot.setAttribute('aria-expanded', 'true');
    this.activePopover = popover;

    const rect = popover.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      popover.classList.remove('hotspot-popover--right');
      popover.classList.add('hotspot-popover--left');
    } else {
      popover.classList.remove('hotspot-popover--left');
      popover.classList.add('hotspot-popover--right');
    }
  }

  closeAll() {
    $$('.hotspot-popover--active', this.section).forEach(p => p.classList.remove('hotspot-popover--active'));
    this.hotspots.forEach(h => h.setAttribute('aria-expanded', 'false'));
    this.activePopover = null;
  }
}

/* ==========================================================================
   PARALLAX
   ========================================================================== */

class Parallax {
  constructor(el) {
    this.el = el;
    this.img = el.querySelector('img');
    this.speed = parseFloat(el.dataset.parallaxSpeed ?? '0.3');
    if (!this.img) return;
    this.init();
  }

  init() {
    this.raf = null;
    window.addEventListener('scroll', () => {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.update(); this.raf = null; });
    }, { passive: true });
  }

  update() {
    const rect = this.el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const center = rect.top + rect.height / 2 - window.innerHeight / 2;
    const offset = center * this.speed * -1;
    this.img.style.transform = `scale(1.15) translateY(${offset}px)`;
  }
}

/* ==========================================================================
   INTERSECTION OBSERVER — Scroll animations
   ========================================================================== */

class ScrollAnimations {
  constructor() {
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    $$('[data-animate]').forEach(el => this.observer.observe(el));
  }

  observe(el) { this.observer?.observe(el); }
}

/* ==========================================================================
   FILTER DROPDOWN (mobile)
   ========================================================================== */

class FilterDropdown {
  constructor(trigger) {
    this.trigger = trigger;
    this.content = document.getElementById(trigger.getAttribute('aria-controls'));
    this.init();
  }

  init() {
    this.trigger.addEventListener('click', () => this.toggle());
  }

  toggle() {
    const open = this.trigger.getAttribute('aria-expanded') === 'true';
    this.trigger.setAttribute('aria-expanded', !open ? 'true' : 'false');
    this.content?.classList.toggle('filter-group__options--open', !open);
    const icon = this.trigger.querySelector('.filter-group__icon');
    icon && (icon.style.transform = !open ? 'rotate(180deg)' : '');
  }
}

/* ==========================================================================
   PRODUCT MEDIA MOBILE SWIPER
   ========================================================================== */

class ProductGalleryMobile {
  constructor(el) {
    this.el = el;
    this.track = el.querySelector('.product-gallery__grid');
    this.thumbs = $$('.product-gallery__thumb');
    if (!this.track || window.innerWidth > 767) return;
    this.slides = $$('.product-gallery__item', this.track);
    this.current = 0;
    this.startX = 0;
    this.init();
  }

  init() {
    this.el.style.overflowX = 'hidden';
    this.el.style.scrollSnapType = 'x mandatory';
    this.track.style.display = 'flex';
    this.track.style.scrollSnapType = 'x mandatory';
    this.slides.forEach(s => { s.style.flex = '0 0 100%'; s.style.scrollSnapAlign = 'start'; });
    this.el.addEventListener('scroll', debounce(() => this.updateActive(), 100));
  }

  updateActive() {
    const scrollLeft = this.el.scrollLeft;
    const slideWidth = this.slides[0]?.offsetWidth ?? 0;
    const index = Math.round(scrollLeft / slideWidth);
    this.current = index;
    this.thumbs.forEach((t, i) => t.classList.toggle('product-gallery__thumb--active', i === index));
  }
}

/* ==========================================================================
   INIT HELPERS
   ========================================================================== */

let scrollAnimations;

function initProductCards() {
  $$('[data-product-card]').forEach(card => new SwatchHover(card));
}

function init() {
  const header = $('.site-header');
  if (header) {
    new SiteHeader(header);
    new MegaMenu(header);
  }

  new MobileNav();
  new CartDrawer();
  new AddToCart();
  scrollAnimations = new ScrollAnimations();

  $$('[data-variant-form]').forEach(form => new VariantSelector(form));
  $$('[data-slideshow]').forEach(el => new Slideshow(el));
  $$('[data-carousel]').forEach(el => new Carousel(el));
  $$('.accordion').forEach(el => new Accordion(el));

  const searchModal = $('#search-modal');
  if (searchModal) new PredictiveSearch(searchModal);

  $$('[data-collection-section]').forEach(s => new CollectionFilter(s));
  $$('[data-shop-the-look]').forEach(s => new ShopTheLook(s));
  $$('[data-parallax]').forEach(el => new Parallax(el));
  $$('[data-filter-group-trigger]').forEach(el => new FilterDropdown(el));
  $$('[data-product-gallery-mobile]').forEach(el => new ProductGalleryMobile(el));

  initProductCards();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
