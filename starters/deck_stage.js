// <deck-stage> — slide-deck shell web component
// Usage:
//   <script src="./deck_stage.js"></script>
//   <deck-stage width="1920" height="1080">
//     <section>Slide 1</section>
//     <section>Slide 2</section>
//   </deck-stage>
//
// Features:
//   - Letterboxed scale-to-fit via transform
//   - Keyboard nav: ← → Space Home End; tap edges on mobile
//   - Overlay slide counter {idx+1}/{total}
//   - Auto data-screen-label="NN Title", data-om-validate on each section
//   - localStorage position persistence
//   - Speaker notes via <script id="speaker-notes" type="application/json">[...]</script>
//   - Print: one slide per page (global <style>, not shadow DOM @page)
//   - noscale attr clears transform for export screenshots
//   - Public API: .goToSlide(n), .nextSlide(), .prevSlide(), .totalSlides

(() => {
  if (customElements.get('deck-stage')) return;

  // Global print styles (can't use @page inside shadow DOM)
  const printStyle = document.createElement('style');
  printStyle.id = 'deck-stage-print';
  printStyle.textContent = `
    @media print {
      @page { size: 1920px 1080px; margin: 0; }
      body { margin: 0; }
      deck-stage { display: block; background: white; }
      deck-stage section { page-break-after: always; break-after: page; }
      deck-stage section:last-child { page-break-after: auto; }
      deck-stage .deck-overlay { display: none !important; }
    }
  `;
  document.head.appendChild(printStyle);

  class DeckStage extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._current = 0;
      this._sections = [];
      this._resizeRaf = 0;
      this._storageKey = `deck_cur_slide_${location.pathname}`;
    }

    connectedCallback() {
      const w = parseInt(this.getAttribute('width'), 10) || 1920;
      const h = parseInt(this.getAttribute('height'), 10) || 1080;
      this._w = w; this._h = h;

      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; width: 100vw; height: 100vh; background: #000; overflow: hidden; position: relative; }
          :host([noscale]) { width: ${w}px; height: ${h}px; background: transparent; }
          :host([noscale]) .deck-canvas { transform: none !important; }
          :host([noscale]) .deck-overlay { display: none; }
          .deck-canvas {
            position: absolute; left: 50%; top: 50%;
            width: ${w}px; height: ${h}px;
            transform-origin: 0 0;
            background: white;
          }
          ::slotted(section) {
            width: ${w}px;
            height: ${h}px;
            box-sizing: border-box;
            overflow: hidden;
          }
          /* Hide non-active with !important so light-DOM styles
             on the section itself can still define display type (flex, grid, etc.)
             on the active one. */
          ::slotted(section:not(.active)) { display: none !important; }
          .deck-overlay {
            position: fixed;
            bottom: 16px; right: 20px;
            color: rgba(255,255,255,0.6);
            font: 13px/1 ui-monospace, Menlo, Consolas, monospace;
            background: rgba(0,0,0,0.4);
            padding: 6px 10px; border-radius: 4px;
            pointer-events: none;
            z-index: 100;
          }
          .deck-nav-hit {
            position: fixed; top: 0; bottom: 0; width: 15%;
            cursor: pointer; z-index: 50;
          }
          .deck-nav-hit.prev { left: 0; }
          .deck-nav-hit.next { right: 0; }
          @media (hover: hover) { .deck-nav-hit { display: none; } }
        </style>
        <div class="deck-canvas"><slot></slot></div>
        <div class="deck-overlay"><span class="idx">1</span>/<span class="total">1</span></div>
        <div class="deck-nav-hit prev" data-dir="-1"></div>
        <div class="deck-nav-hit next" data-dir="+1"></div>
      `;

      this._canvas = this.shadowRoot.querySelector('.deck-canvas');
      this._overlay = this.shadowRoot.querySelector('.deck-overlay');
      this._idxEl = this.shadowRoot.querySelector('.idx');
      this._totalEl = this.shadowRoot.querySelector('.total');

      this._collectSections();
      this._tagSections();
      this._applyScale();
      this._restorePosition();
      this._renderOverlay();
      this._showCurrent();

      // Listeners
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onTap = this._onTap.bind(this);
      document.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      this.shadowRoot.querySelectorAll('.deck-nav-hit').forEach(el =>
        el.addEventListener('click', this._onTap));

      // Re-collect if children change (e.g., dynamic slides)
      this._slotObserver = new MutationObserver(() => {
        this._collectSections();
        this._tagSections();
        this._clampCurrent();
        this._renderOverlay();
        this._showCurrent();
      });
      this._slotObserver.observe(this, { childList: true });

      // Allow external seek via postMessage
      this._onMessage = (e) => {
        // Same-origin only. On file:// every page reports origin 'null'; on http:// (the /serve
        // server) 'null' would be a sandboxed iframe, so it is only accepted for file:// pages.
        const sameOrigin = window.location.protocol === 'file:' ? e.origin === 'null' : e.origin === window.location.origin;
        if (!sameOrigin) return;
        if (!e.data || typeof e.data !== 'object') return;
        if (typeof e.data.seekSlide === 'number') this.goToSlide(e.data.seekSlide);
      };
      window.addEventListener('message', this._onMessage);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('message', this._onMessage);
      this._slotObserver?.disconnect();
    }

    static get observedAttributes() { return ['noscale']; }
    attributeChangedCallback(name) {
      if (name === 'noscale') this._applyScale();
    }

    get totalSlides() { return this._sections.length; }
    get currentSlide() { return this._current; }
    get width() { return this._w; }
    get height() { return this._h; }

    goToSlide(idx) {
      if (this._sections.length === 0) return;
      idx = Math.max(0, Math.min(this._sections.length - 1, idx | 0));
      this._current = idx;
      this._showCurrent();
      this._renderOverlay();
      this._persistPosition();
      this._postSlideChanged();
    }

    _clampCurrent() {
      if (this._sections.length === 0) { this._current = 0; return; }
      this._current = Math.max(0, Math.min(this._sections.length - 1, this._current));
    }

    nextSlide() { this.goToSlide(this._current + 1); }
    prevSlide() { this.goToSlide(this._current - 1); }

    _collectSections() {
      this._sections = Array.from(this.children).filter(c => c.tagName === 'SECTION');
    }

    _tagSections() {
      this._sections.forEach((s, i) => {
        const idx = String(i + 1).padStart(2, '0');
        const existing = s.getAttribute('data-screen-label');
        if (!existing) {
          const heading = s.querySelector('h1, h2, [data-title]');
          const title = heading ? heading.textContent.trim().slice(0, 30) : `Slide ${i + 1}`;
          s.setAttribute('data-screen-label', `${idx} ${title}`);
        }
        s.setAttribute('data-om-validate', '');
      });
    }

    _showCurrent() {
      this._sections.forEach((s, i) => {
        s.classList.toggle('active', i === this._current);
      });
    }

    _renderOverlay() {
      if (this._idxEl) this._idxEl.textContent = String(this._current + 1);
      if (this._totalEl) this._totalEl.textContent = String(this._sections.length);
    }

    _applyScale() {
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = 'none';
        this._canvas.style.left = '0';
        this._canvas.style.top = '0';
        return;
      }
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = requestAnimationFrame(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scale = Math.min(vw / this._w, vh / this._h);
        const tx = (vw - this._w * scale) / 2;
        const ty = (vh - this._h * scale) / 2;
        this._canvas.style.left = '0';
        this._canvas.style.top = '0';
        this._canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      });
    }

    _onResize() { this._applyScale(); }

    _onKey(e) {
      if (e.defaultPrevented) return;
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ': this.nextSlide(); e.preventDefault(); break;
        case 'ArrowLeft':
        case 'PageUp': this.prevSlide(); e.preventDefault(); break;
        case 'Home': this.goToSlide(0); e.preventDefault(); break;
        case 'End': this.goToSlide(this._sections.length - 1); e.preventDefault(); break;
      }
    }

    _onTap(e) {
      const dir = e.currentTarget.dataset.dir;
      if (dir === '+1') this.nextSlide();
      else if (dir === '-1') this.prevSlide();
    }

    _persistPosition() {
      try { localStorage.setItem(this._storageKey, String(this._current)); } catch {}
    }

    _restorePosition() {
      try {
        const v = parseInt(localStorage.getItem(this._storageKey), 10);
        if (!Number.isNaN(v)) this._current = Math.max(0, Math.min(this._sections.length - 1, v));
      } catch {}
    }

    _postSlideChanged() {
      const note = this._getSpeakerNote(this._current);
      const payload = { slideIndexChanged: this._current };
      if (note) payload.note = note;
      try { window.postMessage(payload, window.location.protocol === 'file:' ? '*' : window.location.origin); } catch {}
    }

    _getSpeakerNote(idx) {
      const el = document.getElementById('speaker-notes');
      if (!el) return null;
      try {
        const arr = JSON.parse(el.textContent);
        return Array.isArray(arr) ? (arr[idx] || null) : null;
      } catch { return null; }
    }
  }

  customElements.define('deck-stage', DeckStage);
})();
