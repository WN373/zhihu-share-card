// ==UserScript==
// @name         知乎回答分享卡片生成器 (Zhihu Share Card)
// @namespace    https://github.com/WN373/zhihu-share-card
// @version      1.0.1
// @description  一键将知乎回答、专栏文章或划词金句渲染为精致分享卡片，支持多主题、自定义开关、原文二维码、一键复制到剪贴板与高清 PNG 下载。
// @author       WN373
// @homepageURL  https://github.com/WN373/zhihu-share-card
// @supportURL   https://github.com/WN373/zhihu-share-card/issues
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      zhimg.com
// @connect      zhihu.com
// @require      https://cdn.jsdelivr.net/npm/modern-screenshot@4.6.0/dist/index.js
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'zsc_preferences_v1';
  const DEFAULT_PREFS = {
    theme: 'light', // light | warm | dark | blue
    width: 600, // 480 | 600 | 720
    showTitle: true,
    showAuthor: true,
    showMeta: true,
    showQr: true,
    showFrame: true,
    scale: 2,
  };

  const imageDataUrlCache = new Map();

  // ---------------------------------------------------------------------------
  // Storage & Style Helpers (works both in Tampermonkey and standalone demo)
  // ---------------------------------------------------------------------------
  function loadPrefs() {
    try {
      const raw =
        typeof GM_getValue === 'function'
          ? GM_getValue(STORAGE_KEY, null)
          : localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PREFS };
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { ...DEFAULT_PREFS, ...parsed };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(prefs) {
    try {
      const serialized = JSON.stringify(prefs);
      if (typeof GM_setValue === 'function') {
        GM_setValue(STORAGE_KEY, serialized);
      } else {
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch {
      // ignore storage errors
    }
  }

  function injectCSS(css) {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  // ---------------------------------------------------------------------------
  // Styles (strictly prefixed with zsc- to avoid colliding with Zhihu styles)
  // ---------------------------------------------------------------------------
  injectCSS(`
    .zsc-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 16px;
      padding: 0 6px;
      height: 30px;
      border: none;
      background: transparent;
      color: #8590a6;
      font-size: 14px;
      cursor: pointer;
      border-radius: 4px;
      transition: color 0.15s ease, background-color 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
    }
    .zsc-action-btn:hover {
      color: #1772f6;
      background: rgba(23, 114, 246, 0.08);
    }
    .zsc-action-btn svg {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
    }

    /* Selection floating button */
    .zsc-selection-pill {
      position: fixed;
      z-index: 2147483640;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      background: #18181b;
      color: #ffffff;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      cursor: pointer;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
      transition: transform 0.12s ease, background-color 0.12s ease;
    }
    .zsc-selection-pill:hover {
      background: #1772f6;
      transform: translateY(-1px);
    }

    /* Modal Backdrop */
    .zsc-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      background: rgba(15, 23, 42, 0.62);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }

    .zsc-modal-shell {
      width: min(1160px, 100%);
      height: min(88vh, 860px);
      background: #f5f6f8;
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: #1f2937;
    }

    .zsc-modal-header {
      height: 54px;
      padding: 0 20px;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .zsc-modal-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      color: #111827;
    }

    .zsc-view-tabs {
      display: inline-flex;
      background: #f3f4f6;
      padding: 3px;
      border-radius: 8px;
      gap: 2px;
    }

    .zsc-view-tab {
      border: none;
      background: transparent;
      color: #6b7280;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .zsc-view-tab.active {
      background: #ffffff;
      color: #111827;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }

    .zsc-close-btn {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: #6b7280;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .zsc-close-btn:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .zsc-modal-body {
      flex: 1;
      min-height: 0;
      display: flex;
      overflow: hidden;
    }

    /* Preview Canvas Stage */
    .zsc-stage {
      flex: 1;
      min-width: 0;
      overflow: auto;
      padding: 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      background:
        radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.28) 1px, transparent 0);
      background-size: 20px 20px;
      background-color: #eef1f6;
    }

    .zsc-stage-hint {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .zsc-rendered-img-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      max-width: 100%;
    }

    .zsc-rendered-img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
      display: block;
    }

    /* Sidebar Controls */
    .zsc-sidebar {
      width: 296px;
      flex-shrink: 0;
      background: #ffffff;
      border-left: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .zsc-sidebar-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 18px 18px 12px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .zsc-section-label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.02em;
    }

    .zsc-seg-group {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    .zsc-seg-group.cols-3 {
      grid-template-columns: repeat(3, 1fr);
    }

    .zsc-seg-btn {
      border: 1px solid #e5e7eb;
      background: #ffffff;
      color: #374151;
      border-radius: 8px;
      padding: 7px 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .zsc-seg-btn:hover {
      border-color: #cbd5e1;
      background: #f9fafb;
    }
    .zsc-seg-btn.active {
      border-color: #1772f6;
      background: #eff6ff;
      color: #1772f6;
    }
    .zsc-seg-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .zsc-swatch {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 1px solid rgba(0, 0, 0, 0.15);
      flex-shrink: 0;
    }

    .zsc-toggle-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .zsc-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: #1f2937;
      cursor: pointer;
      user-select: none;
    }

    .zsc-toggle-row input {
      width: 16px;
      height: 16px;
      accent-color: #1772f6;
      cursor: pointer;
    }

    .zsc-sidebar-footer {
      padding: 14px 18px 18px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #ffffff;
    }

    .zsc-btn-primary {
      width: 100%;
      height: 38px;
      border: none;
      border-radius: 9px;
      background: #1772f6;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background-color 0.15s ease, opacity 0.15s ease;
    }
    .zsc-btn-primary:hover {
      background: #0d62df;
    }
    .zsc-btn-primary:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .zsc-btn-secondary {
      width: 100%;
      height: 36px;
      border: 1px solid #d1d5db;
      border-radius: 9px;
      background: #ffffff;
      color: #1f2937;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background-color 0.15s ease;
    }
    .zsc-btn-secondary:hover {
      background: #f9fafb;
    }

    .zsc-status-text {
      font-size: 12px;
      color: #6b7280;
      text-align: center;
      min-height: 16px;
    }
    .zsc-status-text.success {
      color: #059669;
    }
    .zsc-status-text.error {
      color: #dc2626;
    }

    /* =========================================================================
       Renderable Share Card Styles
       ========================================================================= */
    .zsc-card-outer {
      box-sizing: border-box;
      transition: width 0.15s ease, padding 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      line-height: 1.75;
    }

    .zsc-card-outer.has-frame {
      padding: 28px;
      border-radius: 0;
    }
    .zsc-card-outer.no-frame {
      padding: 0;
    }

    .zsc-card {
      border-radius: 16px;
      padding: 28px 30px 24px;
      box-sizing: border-box;
      overflow: hidden;
      word-break: break-word;
    }
    .zsc-card-outer.no-frame .zsc-card {
      border-radius: 0;
      box-shadow: none !important;
    }

    /* Theme: Light */
    .zsc-theme-light.has-frame {
      background: linear-gradient(135deg, #e8eef7 0%, #f1f5f9 50%, #e6edf6 100%);
    }
    .zsc-theme-light .zsc-card {
      background: #ffffff;
      color: #1f2937;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
      border: 1px solid rgba(15, 23, 42, 0.06);
    }
    .zsc-theme-light .zsc-card-title { color: #0f172a; }
    .zsc-theme-light .zsc-author-name { color: #111827; }
    .zsc-theme-light .zsc-author-bio,
    .zsc-theme-light .zsc-meta-row,
    .zsc-theme-light .zsc-footer-sub { color: #64748b; }
    .zsc-theme-light .zsc-divider { background: #e2e8f0; }
    .zsc-theme-light .zsc-body blockquote {
      border-left-color: #1772f6;
      background: #f8fafc;
      color: #475569;
    }
    .zsc-theme-light .zsc-body pre,
    .zsc-theme-light .zsc-body code {
      background: #f1f5f9;
      color: #0f172a;
    }
    .zsc-theme-light .zsc-quote-mark { color: rgba(23, 114, 246, 0.18); }

    /* Theme: Warm Paper */
    .zsc-theme-warm.has-frame {
      background: linear-gradient(135deg, #e9dfd1 0%, #f2ebe0 100%);
    }
    .zsc-theme-warm .zsc-card {
      background: #fbf8f1;
      color: #2c241b;
      box-shadow: 0 12px 32px rgba(72, 52, 28, 0.1);
      border: 1px solid rgba(120, 92, 56, 0.12);
    }
    .zsc-theme-warm .zsc-card-title { color: #1c150e; }
    .zsc-theme-warm .zsc-author-name { color: #2c241b; }
    .zsc-theme-warm .zsc-author-bio,
    .zsc-theme-warm .zsc-meta-row,
    .zsc-theme-warm .zsc-footer-sub { color: #7c6d5a; }
    .zsc-theme-warm .zsc-divider { background: #e6dccb; }
    .zsc-theme-warm .zsc-body blockquote {
      border-left-color: #b45309;
      background: #f4ede0;
      color: #57493a;
    }
    .zsc-theme-warm .zsc-body pre,
    .zsc-theme-warm .zsc-body code {
      background: #f2eadc;
      color: #2c241b;
    }
    .zsc-theme-warm .zsc-quote-mark { color: rgba(180, 83, 9, 0.2); }

    /* Theme: Dark */
    .zsc-theme-dark.has-frame {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    }
    .zsc-theme-dark .zsc-card {
      background: #161b22;
      color: #e2e8f0;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .zsc-theme-dark .zsc-card-title { color: #f8fafc; }
    .zsc-theme-dark .zsc-author-name { color: #f1f5f9; }
    .zsc-theme-dark .zsc-author-bio,
    .zsc-theme-dark .zsc-meta-row,
    .zsc-theme-dark .zsc-footer-sub { color: #94a3b8; }
    .zsc-theme-dark .zsc-divider { background: rgba(255, 255, 255, 0.1); }
    .zsc-theme-dark .zsc-body blockquote {
      border-left-color: #3b82f6;
      background: rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
    }
    .zsc-theme-dark .zsc-body pre,
    .zsc-theme-dark .zsc-body code {
      background: #0d1117;
      color: #e2e8f0;
    }
    .zsc-theme-dark .zsc-quote-mark { color: rgba(59, 130, 246, 0.26); }

    /* Theme: Zhihu Blue Frame */
    .zsc-theme-blue.has-frame {
      background: linear-gradient(135deg, #1772f6 0%, #0ea5e9 100%);
    }
    .zsc-theme-blue .zsc-card {
      background: #ffffff;
      color: #1f2937;
      box-shadow: 0 18px 42px rgba(7, 52, 130, 0.28);
      border: none;
    }
    .zsc-theme-blue .zsc-card-title { color: #0f172a; }
    .zsc-theme-blue .zsc-author-name { color: #111827; }
    .zsc-theme-blue .zsc-author-bio,
    .zsc-theme-blue .zsc-meta-row,
    .zsc-theme-blue .zsc-footer-sub { color: #64748b; }
    .zsc-theme-blue .zsc-divider { background: #e2e8f0; }
    .zsc-theme-blue .zsc-body blockquote {
      border-left-color: #1772f6;
      background: #f0f7ff;
      color: #334155;
    }
    .zsc-theme-blue .zsc-body pre,
    .zsc-theme-blue .zsc-body code {
      background: #f1f5f9;
      color: #0f172a;
    }
    .zsc-theme-blue .zsc-quote-mark { color: rgba(23, 114, 246, 0.2); }

    /* Card Internal Layout */
    .zsc-brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: #1772f6;
      margin-bottom: 12px;
      letter-spacing: 0.02em;
    }
    .zsc-theme-dark .zsc-brand-badge {
      color: #60a5fa;
    }
    .zsc-brand-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: currentColor;
    }

    .zsc-card-title {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.42;
      margin: 0 0 16px 0;
    }

    .zsc-author-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
    }
    .zsc-author-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      background: #e2e8f0;
    }
    .zsc-author-info {
      min-width: 0;
      flex: 1;
    }
    .zsc-author-name {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
    }
    .zsc-author-bio {
      font-size: 12px;
      line-height: 1.4;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .zsc-divider {
      height: 1px;
      margin: 0 0 18px 0;
      border: none;
    }

    .zsc-body {
      font-size: 15px;
      line-height: 1.8;
    }
    .zsc-body p {
      margin: 0 0 12px 0;
    }
    .zsc-body p:last-child {
      margin-bottom: 0;
    }
    .zsc-body h1, .zsc-body h2, .zsc-body h3, .zsc-body h4 {
      font-weight: 700;
      line-height: 1.45;
      margin: 18px 0 10px;
    }
    .zsc-body h2 { font-size: 17px; }
    .zsc-body h3 { font-size: 16px; }
    .zsc-body ul, .zsc-body ol {
      margin: 10px 0 14px;
      padding-left: 22px;
    }
    .zsc-body li {
      margin-bottom: 6px;
    }
    .zsc-body blockquote {
      margin: 14px 0;
      padding: 10px 14px;
      border-left: 3px solid #1772f6;
      border-radius: 0 8px 8px 0;
      font-size: 14px;
    }
    .zsc-body figure {
      margin: 14px 0;
      text-align: center;
    }
    .zsc-body figcaption {
      font-size: 12px;
      opacity: 0.7;
      margin-top: 6px;
    }
    .zsc-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 10px auto;
    }
    .zsc-body img.ee_img,
    .zsc-body img[data-formula] {
      display: inline-block;
      margin: 0 2px;
      vertical-align: middle;
      border-radius: 0;
    }
    .zsc-body pre {
      padding: 12px 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.55;
      margin: 12px 0;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .zsc-body code {
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .zsc-body pre code {
      padding: 0;
      background: transparent !important;
    }
    .zsc-body a {
      color: #1772f6;
      text-decoration: none;
    }
    .zsc-theme-dark .zsc-body a {
      color: #60a5fa;
    }
    .zsc-body hr {
      border: none;
      height: 1px;
      background: currentColor;
      opacity: 0.14;
      margin: 16px 0;
    }

    /* Excerpt / Quote mode */
    .zsc-quote-wrap {
      position: relative;
      padding: 6px 0 4px 4px;
    }
    .zsc-quote-mark {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 48px;
      line-height: 1;
      height: 28px;
      margin-bottom: 6px;
      user-select: none;
    }
    .zsc-quote-text {
      font-size: 16px;
      line-height: 1.85;
      white-space: pre-wrap;
    }

    .zsc-meta-row {
      margin-top: 18px;
      font-size: 12px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .zsc-footer {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px dashed rgba(148, 163, 184, 0.35);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .zsc-footer-left {
      min-width: 0;
      flex: 1;
    }
    .zsc-footer-brand {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 3px;
    }
    .zsc-footer-sub {
      font-size: 11px;
      line-height: 1.4;
      word-break: break-all;
    }
    .zsc-qr-box {
      width: 68px;
      height: 68px;
      padding: 4px;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .zsc-qr-box img {
      width: 60px;
      height: 60px;
      display: block;
      image-rendering: pixelated;
    }

    @media (max-width: 820px) {
      .zsc-modal-body {
        flex-direction: column;
      }
      .zsc-sidebar {
        width: 100%;
        height: 46%;
        border-left: none;
        border-top: 1px solid #e5e7eb;
      }
    }
  `);

  // ---------------------------------------------------------------------------
  // Remote Image -> DataURL (CORS-free via GM_xmlhttpRequest)
  // ---------------------------------------------------------------------------
  function fetchAsDataUrl(url) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
      return Promise.resolve(url);
    }
    if (imageDataUrlCache.has(url)) {
      return Promise.resolve(imageDataUrlCache.get(url));
    }

    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          headers: { Referer: 'https://www.zhihu.com/' },
          onload(res) {
            if (res.status >= 200 && res.status < 300 && res.response) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = typeof reader.result === 'string' ? reader.result : url;
                imageDataUrlCache.set(url, dataUrl);
                resolve(dataUrl);
              };
              reader.onerror = () => resolve(url);
              reader.readAsDataURL(res.response);
            } else {
              resolve(url);
            }
          },
          onerror() {
            resolve(url);
          },
          ontimeout() {
            resolve(url);
          },
        });
      } else {
        fetch(url, { mode: 'cors' })
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (!blob) return resolve(url);
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = typeof reader.result === 'string' ? reader.result : url;
              imageDataUrlCache.set(url, dataUrl);
              resolve(dataUrl);
            };
            reader.onerror = () => resolve(url);
            reader.readAsDataURL(blob);
          })
          .catch(() => resolve(url));
      }
    });
  }

  function resolveZhihuImgUrl(imgEl) {
    const candidates = [
      imgEl.getAttribute('data-original'),
      imgEl.getAttribute('data-actualsrc'),
      imgEl.getAttribute('data-default-watermark-src'),
      imgEl.currentSrc,
      imgEl.getAttribute('src'),
    ];
    for (const c of candidates) {
      if (c && !c.startsWith('data:image/svg+xml')) {
        if (c.startsWith('//')) return `https:${c}`;
        return c;
      }
    }
    return imgEl.getAttribute('src') || '';
  }

  async function inlineAllImages(container) {
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      imgs.map(async (img) => {
        const realUrl = resolveZhihuImgUrl(img);
        if (!realUrl) return;
        img.removeAttribute('srcset');
        img.removeAttribute('loading');
        img.removeAttribute('data-original');
        img.removeAttribute('data-actualsrc');
        const dataUrl = await fetchAsDataUrl(realUrl);
        img.src = dataUrl;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // QR Code Generator (pure local SVG/DataURL via qrcode-generator)
  // ---------------------------------------------------------------------------
  function buildQrDataUrl(text) {
    try {
      if (typeof qrcode !== 'function') return '';
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createDataURL(4, 2);
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Zhihu DOM Extraction (Questions, Answers, Feed Cards, Zhuanlan Articles)
  // ---------------------------------------------------------------------------
  function cleanText(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function sanitizeBodyClone(sourceEl) {
    const clone = sourceEl.cloneNode(true);
    // Remove Zhihu UI clutter inside content
    const junkSelectors = [
      'script',
      'style',
      'noscript',
      '.RichContent-collapsedText',
      '.ContentItem-more',
      '.LinkCard-backdrop',
      '.ZVideo-player',
      '.VPlayer',
      'button',
    ];
    junkSelectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    });

    // Replace lazy placeholder images with real URLs immediately
    clone.querySelectorAll('img').forEach((img) => {
      const realUrl = resolveZhihuImgUrl(img);
      if (realUrl) img.setAttribute('src', realUrl);
      img.removeAttribute('width');
      img.removeAttribute('height');
    });

    return clone;
  }

  function extractZhihuData(rootEl, selectedText = '') {
    const isArticlePage =
      location.hostname === 'zhuanlan.zhihu.com' ||
      rootEl.classList.contains('Post-Main') ||
      rootEl.classList.contains('ArticleItem');

    // 1. Title
    let title = '';
    const cardTitleEl =
      rootEl.querySelector('h2.ContentItem-title a') ||
      rootEl.querySelector('.ContentItem-title') ||
      rootEl.querySelector('.Post-Title');
    if (cardTitleEl) {
      title = cleanText(cardTitleEl);
    }
    if (!title) {
      const pageTitleEl =
        document.querySelector('h1.QuestionHeader-title') ||
        document.querySelector('h1.Post-Title') ||
        document.querySelector('meta[property="og:title"]');
      title = pageTitleEl
        ? pageTitleEl.getAttribute('content') || cleanText(pageTitleEl)
        : document.title.replace(/\s*-\s*知乎\s*$/, '');
    }

    // 2. Author
    const authorEl =
      rootEl.querySelector('.AuthorInfo') || document.querySelector('.AuthorInfo');
    const authorName =
      cleanText(
        authorEl?.querySelector('.AuthorInfo-name .UserLink-link') ||
          authorEl?.querySelector('.AuthorInfo-name') ||
          rootEl.querySelector('meta[itemprop="name"]')
      ) || '知乎用户';
    const authorBio = cleanText(
      authorEl?.querySelector('.AuthorInfo-badgeText') ||
        authorEl?.querySelector('.AuthorInfo-detail')
    );
    const avatarImg =
      authorEl?.querySelector('img.AuthorInfo-avatar') ||
      authorEl?.querySelector('img.Avatar');
    const authorAvatar = avatarImg ? resolveZhihuImgUrl(avatarImg) : '';

    // 3. Body DOM
    const bodyEl =
      rootEl.querySelector('.RichContent-inner') ||
      rootEl.querySelector('.Post-RichTextContainer') ||
      rootEl.querySelector('.RichText');
    const bodyClone = bodyEl ? sanitizeBodyClone(bodyEl) : null;

    // 4. Meta (Votes + Time)
    const voteBtn =
      rootEl.querySelector('button.VoteButton--up') ||
      document.querySelector('button.VoteButton--up');
    const voteRaw = cleanText(voteBtn).replace(/^赞同\s*/, '').trim();
    const votes = voteRaw ? `赞同 ${voteRaw}` : '';

    const timeEl =
      rootEl.querySelector('.ContentItem-time') ||
      document.querySelector('.ContentItem-time');
    const timeText = cleanText(timeEl);

    // 5. Canonical URL
    let url = '';
    const metaUrl = rootEl.querySelector('meta[itemprop="url"]');
    if (metaUrl && metaUrl.getAttribute('content')) {
      url = metaUrl.getAttribute('content');
    } else {
      const linkEl =
        rootEl.querySelector('.ContentItem-time a') ||
        rootEl.querySelector('h2.ContentItem-title a');
      if (linkEl && linkEl.href) {
        url = linkEl.href;
      }
    }
    if (!url) url = location.href;
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('/')) url = `${location.origin}${url}`;
    // Strip noisy query parameters for cleaner QR code
    try {
      const u = new URL(url);
      url = `${u.origin}${u.pathname}`;
    } catch {
      // keep raw
    }

    return {
      kind: isArticlePage ? '知乎专栏' : '知乎回答',
      title,
      authorName,
      authorBio,
      authorAvatar,
      bodyClone,
      votes,
      timeText,
      url,
      selectedText: selectedText.trim(),
    };
  }

  // ---------------------------------------------------------------------------
  // Card DOM Builder
  // ---------------------------------------------------------------------------
  function createCardElement(data, prefs, mode) {
    const outer = document.createElement('div');
    outer.className = `zsc-card-outer zsc-theme-${prefs.theme} ${
      prefs.showFrame ? 'has-frame' : 'no-frame'
    }`;
    outer.style.width = `${prefs.width}px`;

    const card = document.createElement('div');
    card.className = 'zsc-card';

    // Top badge
    const badge = document.createElement('div');
    badge.className = 'zsc-brand-badge';
    badge.innerHTML = `<span class="zsc-brand-dot"></span><span>${
      mode === 'excerpt' ? `${data.kind} · 摘录` : data.kind
    }</span>`;
    card.appendChild(badge);

    // Title
    if (prefs.showTitle && data.title) {
      const titleEl = document.createElement('h1');
      titleEl.className = 'zsc-card-title';
      titleEl.textContent = data.title;
      card.appendChild(titleEl);
    }

    // Author
    if (prefs.showAuthor) {
      const authorRow = document.createElement('div');
      authorRow.className = 'zsc-author-row';

      if (data.authorAvatar) {
        const avatar = document.createElement('img');
        avatar.className = 'zsc-author-avatar';
        avatar.src = data.authorAvatar;
        avatar.alt = data.authorName;
        authorRow.appendChild(avatar);
      }

      const info = document.createElement('div');
      info.className = 'zsc-author-info';

      const name = document.createElement('div');
      name.className = 'zsc-author-name';
      name.textContent = data.authorName;
      info.appendChild(name);

      if (data.authorBio) {
        const bio = document.createElement('div');
        bio.className = 'zsc-author-bio';
        bio.textContent = data.authorBio;
        info.appendChild(bio);
      }

      authorRow.appendChild(info);
      card.appendChild(authorRow);
    }

    if (prefs.showTitle || prefs.showAuthor) {
      const divider = document.createElement('hr');
      divider.className = 'zsc-divider';
      card.appendChild(divider);
    }

    // Content Body
    const body = document.createElement('div');
    body.className = 'zsc-body';

    if (mode === 'excerpt' && data.selectedText) {
      const quoteWrap = document.createElement('div');
      quoteWrap.className = 'zsc-quote-wrap';

      const mark = document.createElement('div');
      mark.className = 'zsc-quote-mark';
      mark.textContent = '“';
      quoteWrap.appendChild(mark);

      const text = document.createElement('div');
      text.className = 'zsc-quote-text';
      text.textContent = data.selectedText;
      quoteWrap.appendChild(text);

      body.appendChild(quoteWrap);
    } else if (data.bodyClone) {
      body.appendChild(data.bodyClone.cloneNode(true));
    } else {
      const empty = document.createElement('p');
      empty.textContent = '未提取到正文内容，请展开完整回答后再试。';
      body.appendChild(empty);
    }
    card.appendChild(body);

    // Meta row (votes & time)
    if (prefs.showMeta && (data.votes || data.timeText)) {
      const metaRow = document.createElement('div');
      metaRow.className = 'zsc-meta-row';
      if (data.votes) {
        const v = document.createElement('span');
        v.textContent = data.votes;
        metaRow.appendChild(v);
      }
      if (data.timeText) {
        const t = document.createElement('span');
        t.textContent = data.timeText;
        metaRow.appendChild(t);
      }
      card.appendChild(metaRow);
    }

    // Footer + QR Code
    if (prefs.showQr) {
      const footer = document.createElement('div');
      footer.className = 'zsc-footer';

      const left = document.createElement('div');
      left.className = 'zsc-footer-left';

      const brand = document.createElement('div');
      brand.className = 'zsc-footer-brand';
      brand.textContent = '扫码阅读原文';
      left.appendChild(brand);

      const sub = document.createElement('div');
      sub.className = 'zsc-footer-sub';
      sub.textContent = data.url;
      left.appendChild(sub);

      footer.appendChild(left);

      const qrUrl = buildQrDataUrl(data.url);
      if (qrUrl) {
        const qrBox = document.createElement('div');
        qrBox.className = 'zsc-qr-box';
        const qrImg = document.createElement('img');
        qrImg.src = qrUrl;
        qrImg.alt = 'QR Code';
        qrBox.appendChild(qrImg);
        footer.appendChild(qrBox);
      }

      card.appendChild(footer);
    }

    outer.appendChild(card);
    return outer;
  }

  // ---------------------------------------------------------------------------
  // Render DOM -> PNG Blob
  // ---------------------------------------------------------------------------
  async function renderElementToBlob(cardEl, scale = 2) {
    if (!window.modernScreenshot || typeof window.modernScreenshot.domToBlob !== 'function') {
      throw new Error('渲染引擎 modern-screenshot 未加载，请检查网络或刷新页面。');
    }
    await inlineAllImages(cardEl);
    // Allow layout & decoded images to settle
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const blob = await window.modernScreenshot.domToBlob(cardEl, {
      scale,
      type: 'image/png',
      fetch: {
        requestInit: { mode: 'cors' },
      },
    });
    if (!blob) {
      throw new Error('图片生成失败，请尝试切换内容或缩小宽度。');
    }
    return blob;
  }

  // ---------------------------------------------------------------------------
  // Studio Modal UI
  // ---------------------------------------------------------------------------
  function openShareStudio(data) {
    // Remove existing modal if any
    document.querySelector('.zsc-modal-backdrop')?.remove();

    const prefs = loadPrefs();
    let mode = data.selectedText ? 'excerpt' : 'full';
    let viewTab = 'live'; // live | image
    let currentCardEl = null;
    let cachedBlob = null;
    let cachedObjectUrl = '';
    let isBusy = false;

    const backdrop = document.createElement('div');
    backdrop.className = 'zsc-modal-backdrop';

    const shell = document.createElement('div');
    shell.className = 'zsc-modal-shell';
    shell.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'zsc-modal-header';
    header.innerHTML = `
      <div class="zsc-modal-title">
        <span>知乎分享卡片</span>
      </div>
      <div class="zsc-view-tabs">
        <button type="button" class="zsc-view-tab active" data-tab="live">实时排版预览</button>
        <button type="button" class="zsc-view-tab" data-tab="image">图片预览（可右键/拖拽）</button>
      </div>
      <button type="button" class="zsc-close-btn" title="关闭 (ESC)">&times;</button>
    `;

    // Body
    const modalBody = document.createElement('div');
    modalBody.className = 'zsc-modal-body';

    const stage = document.createElement('div');
    stage.className = 'zsc-stage';

    const sidebar = document.createElement('div');
    sidebar.className = 'zsc-sidebar';
    sidebar.innerHTML = `
      <div class="zsc-sidebar-scroll">
        <div>
          <div class="zsc-section-label">内容范围</div>
          <div class="zsc-seg-group">
            <button type="button" class="zsc-seg-btn" data-mode="full">完整内容</button>
            <button type="button" class="zsc-seg-btn" data-mode="excerpt" ${
              data.selectedText ? '' : 'disabled title="在正文划词选中后再点击即可启用"'
            }>选中金句</button>
          </div>
        </div>

        <div>
          <div class="zsc-section-label">卡片主题</div>
          <div class="zsc-seg-group">
            <button type="button" class="zsc-seg-btn" data-theme="light">
              <span class="zsc-swatch" style="background:#ffffff"></span>纸白
            </button>
            <button type="button" class="zsc-seg-btn" data-theme="warm">
              <span class="zsc-swatch" style="background:#fbf8f1"></span>暖纸
            </button>
            <button type="button" class="zsc-seg-btn" data-theme="dark">
              <span class="zsc-swatch" style="background:#161b22"></span>暗夜
            </button>
            <button type="button" class="zsc-seg-btn" data-theme="blue">
              <span class="zsc-swatch" style="background:#1772f6"></span>知乎蓝
            </button>
          </div>
        </div>

        <div>
          <div class="zsc-section-label">卡片宽度</div>
          <div class="zsc-seg-group cols-3">
            <button type="button" class="zsc-seg-btn" data-width="480">窄 480</button>
            <button type="button" class="zsc-seg-btn" data-width="600">中 600</button>
            <button type="button" class="zsc-seg-btn" data-width="720">宽 720</button>
          </div>
        </div>

        <div>
          <div class="zsc-section-label">显示开关</div>
          <div class="zsc-toggle-list">
            <label class="zsc-toggle-row">
              <span>显示问题/文章标题</span>
              <input type="checkbox" data-pref="showTitle">
            </label>
            <label class="zsc-toggle-row">
              <span>显示作者头像与简介</span>
              <input type="checkbox" data-pref="showAuthor">
            </label>
            <label class="zsc-toggle-row">
              <span>显示赞同数与时间</span>
              <input type="checkbox" data-pref="showMeta">
            </label>
            <label class="zsc-toggle-row">
              <span>显示底部原文二维码</span>
              <input type="checkbox" data-pref="showQr">
            </label>
            <label class="zsc-toggle-row">
              <span>保留外框渐变留白</span>
              <input type="checkbox" data-pref="showFrame">
            </label>
          </div>
        </div>
      </div>

      <div class="zsc-sidebar-footer">
        <button type="button" class="zsc-btn-primary" data-action="copy">
          一键复制图片到剪贴板
        </button>
        <button type="button" class="zsc-btn-secondary" data-action="download">
          下载高清 PNG
        </button>
        <div class="zsc-status-text" data-role="status"></div>
      </div>
    `;

    modalBody.appendChild(stage);
    modalBody.appendChild(sidebar);
    shell.appendChild(header);
    shell.appendChild(modalBody);
    backdrop.appendChild(shell);
    document.body.appendChild(backdrop);

    const statusEl = sidebar.querySelector('[data-role="status"]');
    const copyBtn = sidebar.querySelector('[data-action="copy"]');
    const downloadBtn = sidebar.querySelector('[data-action="download"]');

    function setStatus(text, type = '') {
      statusEl.textContent = text;
      statusEl.className = `zsc-status-text ${type}`;
    }

    function invalidateBlob() {
      cachedBlob = null;
      if (cachedObjectUrl) {
        URL.revokeObjectURL(cachedObjectUrl);
        cachedObjectUrl = '';
      }
    }

    function syncControlsUI() {
      sidebar.querySelectorAll('[data-mode]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
      sidebar.querySelectorAll('[data-theme]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.theme === prefs.theme);
      });
      sidebar.querySelectorAll('[data-width]').forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.width) === prefs.width);
      });
      sidebar.querySelectorAll('input[data-pref]').forEach((input) => {
        input.checked = Boolean(prefs[input.dataset.pref]);
      });
      header.querySelectorAll('.zsc-view-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === viewTab);
      });
    }

    function renderLiveCard() {
      invalidateBlob();
      currentCardEl = createCardElement(data, prefs, mode);
      stage.innerHTML = '';
      const hint = document.createElement('div');
      hint.className = 'zsc-stage-hint';
      hint.textContent = '实时排版预览 · 调整右侧选项后点击复制或切换「图片预览」右键保存';
      stage.appendChild(hint);
      stage.appendChild(currentCardEl);
      // Pre-inline images in background so clicking Copy is near-instant
      inlineAllImages(currentCardEl).catch(() => {});
    }

    async function getOrRenderBlob() {
      if (cachedBlob) return cachedBlob;
      if (!currentCardEl) {
        currentCardEl = createCardElement(data, prefs, mode);
      }
      // Ensure card is mounted in DOM while capturing
      let tempWrap = null;
      if (!currentCardEl.isConnected) {
        tempWrap = document.createElement('div');
        tempWrap.style.cssText =
          'position:fixed;left:-99999px;top:0;pointer-events:none;opacity:0;';
        tempWrap.appendChild(currentCardEl);
        document.body.appendChild(tempWrap);
      }
      try {
        cachedBlob = await renderElementToBlob(currentCardEl, prefs.scale || 2);
        return cachedBlob;
      } finally {
        if (tempWrap) tempWrap.remove();
      }
    }

    async function showRenderedImageView() {
      stage.innerHTML = '<div class="zsc-stage-hint">正在渲染高清 PNG，请稍候…</div>';
      try {
        const blob = await getOrRenderBlob();
        if (!cachedObjectUrl) {
          cachedObjectUrl = URL.createObjectURL(blob);
        }
        stage.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'zsc-rendered-img-wrap';

        const hint = document.createElement('div');
        hint.className = 'zsc-stage-hint';
        hint.textContent = '已生成 2x 高清图 · 可直接右键「拷贝图像 / 存储图像」，或拖入微信/备忘录';

        const img = document.createElement('img');
        img.className = 'zsc-rendered-img';
        img.src = cachedObjectUrl;
        img.alt = data.title || '知乎分享卡片';

        wrap.appendChild(hint);
        wrap.appendChild(img);
        stage.appendChild(wrap);
      } catch (err) {
        setStatus(err.message || '渲染失败', 'error');
        viewTab = 'live';
        syncControlsUI();
        renderLiveCard();
      }
    }

    function refreshView() {
      syncControlsUI();
      if (viewTab === 'live') {
        renderLiveCard();
      } else {
        currentCardEl = createCardElement(data, prefs, mode);
        invalidateBlob();
        showRenderedImageView();
      }
    }

    // Bind events
    header.querySelector('.zsc-close-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    function onKeyDown(e) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', onKeyDown);

    function closeModal() {
      window.removeEventListener('keydown', onKeyDown);
      invalidateBlob();
      backdrop.remove();
    }

    header.querySelectorAll('.zsc-view-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const nextTab = tab.dataset.tab;
        if (nextTab === viewTab) return;
        viewTab = nextTab;
        syncControlsUI();
        if (viewTab === 'live') {
          stage.innerHTML = '';
          const hint = document.createElement('div');
          hint.className = 'zsc-stage-hint';
          hint.textContent = '实时排版预览 · 调整右侧选项后点击复制或切换「图片预览」右键保存';
          stage.appendChild(hint);
          if (!currentCardEl) currentCardEl = createCardElement(data, prefs, mode);
          stage.appendChild(currentCardEl);
        } else {
          showRenderedImageView();
        }
      });
    });

    sidebar.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        mode = btn.dataset.mode;
        setStatus('');
        refreshView();
      });
    });

    sidebar.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        prefs.theme = btn.dataset.theme;
        savePrefs(prefs);
        setStatus('');
        refreshView();
      });
    });

    sidebar.querySelectorAll('[data-width]').forEach((btn) => {
      btn.addEventListener('click', () => {
        prefs.width = Number(btn.dataset.width);
        savePrefs(prefs);
        setStatus('');
        refreshView();
      });
    });

    sidebar.querySelectorAll('input[data-pref]').forEach((input) => {
      input.addEventListener('change', () => {
        prefs[input.dataset.pref] = input.checked;
        savePrefs(prefs);
        setStatus('');
        refreshView();
      });
    });

    // Copy PNG to clipboard (Safari & Chrome compatible)
    copyBtn.addEventListener('click', async () => {
      if (isBusy) return;
      isBusy = true;
      copyBtn.disabled = true;
      setStatus('正在生成并写入剪贴板…');

      try {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
          throw new Error('当前浏览器不支持直接写入图片剪贴板，请切换「图片预览」右键复制。');
        }
        // Pass a Promise<Blob> to ClipboardItem so Safari preserves user-gesture activation
        const blobPromise = getOrRenderBlob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blobPromise }),
        ]);
        setStatus('已复制高清图片到剪贴板，可直接粘贴到微信/文档！', 'success');
      } catch (err) {
        // Fallback: switch to image preview so user can right-click copy
        setStatus(
          `${err?.message || '剪贴板写入受限'} — 已切换到图片预览，可右键拷贝`,
          'error'
        );
        viewTab = 'image';
        syncControlsUI();
        await showRenderedImageView();
      } finally {
        isBusy = false;
        copyBtn.disabled = false;
      }
    });

    // Download PNG
    downloadBtn.addEventListener('click', async () => {
      if (isBusy) return;
      isBusy = true;
      downloadBtn.disabled = true;
      setStatus('正在导出高清 PNG…');

      try {
        const blob = await getOrRenderBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeTitle = (data.title || 'zhihu-answer')
          .replace(/[\\/:*?"<>|]/g, '')
          .slice(0, 32);
        a.href = url;
        a.download = `${safeTitle}-${data.authorName || 'zhihu'}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStatus('PNG 已开始下载', 'success');
      } catch (err) {
        setStatus(err?.message || '导出失败', 'error');
      } finally {
        isBusy = false;
        downloadBtn.disabled = false;
      }
    });

    // Initial render
    syncControlsUI();
    renderLiveCard();
  }

  // ---------------------------------------------------------------------------
  // Inject Buttons into Zhihu Action Bars
  // ---------------------------------------------------------------------------
  const CARD_ICON_SVG = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <path d="M21 15l-5-5L5 21"></path>
    </svg>
  `;

  function findContentRoot(fromEl) {
    return (
      fromEl.closest('.ContentItem') ||
      fromEl.closest('.AnswerItem') ||
      fromEl.closest('.ArticleItem') ||
      fromEl.closest('.Post-Main') ||
      document.body
    );
  }

  function injectButtons() {
    const actionBars = document.querySelectorAll('.ContentItem-actions');
    actionBars.forEach((bar) => {
      if (bar.querySelector('.zsc-action-btn')) return;

      const root = findContentRoot(bar);
      // Only attach to answers or articles that actually contain rich content
      if (
        !root.querySelector('.RichContent-inner') &&
        !root.querySelector('.Post-RichTextContainer') &&
        !root.querySelector('.RichText')
      ) {
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zsc-action-btn';
      btn.title = '将该回答/文章渲染为分享图片';
      btn.innerHTML = `${CARD_ICON_SVG}<span>生成分享图</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // If user currently selected text inside this answer, capture it for excerpt mode
        let selectedText = '';
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          const anchorNode = sel.anchorNode;
          if (anchorNode && root.contains(anchorNode)) {
            selectedText = sel.toString().trim();
          }
        }

        const data = extractZhihuData(root, selectedText);
        openShareStudio(data);
      });

      bar.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------------------
  // Selection Floating Pill ("生成金句卡片")
  // ---------------------------------------------------------------------------
  const selectionPill = document.createElement('button');
  selectionPill.type = 'button';
  selectionPill.className = 'zsc-selection-pill';
  selectionPill.innerHTML = `${CARD_ICON_SVG}<span>生成金句卡片</span>`;
  document.body.appendChild(selectionPill);

  let pendingSelection = null;

  selectionPill.addEventListener('mousedown', (e) => {
    // Prevent clearing text selection before click runs
    e.preventDefault();
  });

  selectionPill.addEventListener('click', () => {
    if (!pendingSelection) return;
    const { root, text } = pendingSelection;
    selectionPill.style.display = 'none';
    const data = extractZhihuData(root, text);
    openShareStudio(data);
  });

  function updateSelectionPill() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      selectionPill.style.display = 'none';
      pendingSelection = null;
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 4) {
      selectionPill.style.display = 'none';
      pendingSelection = null;
      return;
    }

    const anchorEl =
      sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? sel.anchorNode
        : sel.anchorNode?.parentElement;

    if (!anchorEl || anchorEl.closest('.zsc-modal-backdrop')) {
      selectionPill.style.display = 'none';
      pendingSelection = null;
      return;
    }

    const richContainer =
      anchorEl.closest('.RichContent-inner') ||
      anchorEl.closest('.Post-RichTextContainer') ||
      anchorEl.closest('.RichText');

    if (!richContainer) {
      selectionPill.style.display = 'none';
      pendingSelection = null;
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    pendingSelection = {
      root: findContentRoot(richContainer),
      text,
    };

    const top = Math.max(12, rect.top - 42);
    const left = Math.min(
      window.innerWidth - 150,
      Math.max(12, rect.left + rect.width / 2 - 64)
    );
    selectionPill.style.top = `${top}px`;
    selectionPill.style.left = `${left}px`;
    selectionPill.style.display = 'inline-flex';
  }

  document.addEventListener('mouseup', () => {
    setTimeout(updateSelectionPill, 20);
  });
  document.addEventListener('scroll', () => {
    if (selectionPill.style.display !== 'none') {
      selectionPill.style.display = 'none';
    }
  }, { passive: true });

  // ---------------------------------------------------------------------------
  // Bootstrap & MutationObserver
  // ---------------------------------------------------------------------------
  injectButtons();

  let observerTimer = null;
  const observer = new MutationObserver(() => {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      injectButtons();
    }, 350);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
