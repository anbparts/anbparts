'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

type CompanyValueVisibilityContextValue = {
  rawHidden: boolean;
  setRawHidden: (hidden: boolean) => void;
  toggleRawHidden: () => void;
};

const STORAGE_KEY = 'dashboard-hide-values';

const SETTINGS_ROUTE_PREFIXES = [
  '/configuracoes-gerais',
  '/bling/config-produtos',
  '/conf-gerais',
  '/config-ml',
  '/import',
];

const CompanyValueVisibilityContext = createContext<CompanyValueVisibilityContextValue | null>(null);

export type FinancialViewportMode = 'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

export function CompanyValueVisibilityProvider({ children }: { children: ReactNode }) {
  const [rawHidden, setRawHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRawHidden(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, rawHidden ? '1' : '0');
  }, [rawHidden]);

  const value = useMemo<CompanyValueVisibilityContextValue>(() => ({
    rawHidden,
    setRawHidden,
    toggleRawHidden: () => setRawHidden((current) => !current),
  }), [rawHidden]);

  return (
    <CompanyValueVisibilityContext.Provider value={value}>
      {children}
    </CompanyValueVisibilityContext.Provider>
  );
}

export function isSettingsRoute(pathname: string | null | undefined) {
  const path = String(pathname || '');
  return SETTINGS_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function useCompanyValueVisibility() {
  const context = useContext(CompanyValueVisibilityContext);
  const pathname = usePathname();

  if (!context) {
    throw new Error('useCompanyValueVisibility must be used inside CompanyValueVisibilityProvider');
  }

  const hidden = context.rawHidden && !isSettingsRoute(pathname);

  return {
    hidden,
    rawHidden: context.rawHidden,
    setRawHidden: context.setRawHidden,
    toggleRawHidden: context.toggleRawHidden,
  };
}

export function sensitiveMaskStyle(hidden: boolean): CSSProperties {
  return hidden
    ? {
        filter: 'blur(6px)',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    : {};
}

export function sensitiveText(text: string | number, hidden: boolean, fallback = '****') {
  return hidden ? fallback : String(text);
}

export function useFinancialViewportMode() {
  const [viewportMode, setViewportMode] = useState<FinancialViewportMode>('desktop');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const phoneMedia = window.matchMedia('(max-width: 767px)');
    const tabletPortraitMedia = window.matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1024px) and (orientation: portrait)');
    const tabletLandscapeMedia = window.matchMedia('(pointer: coarse) and (min-width: 900px) and (max-width: 1600px) and (orientation: landscape)');

    const syncViewportMode = () => {
      if (phoneMedia.matches) {
        setViewportMode('phone');
        return;
      }

      if (tabletPortraitMedia.matches) {
        setViewportMode('tablet-portrait');
        return;
      }

      if (tabletLandscapeMedia.matches) {
        setViewportMode('tablet-landscape');
        return;
      }

      setViewportMode('desktop');
    };

    syncViewportMode();
    phoneMedia.addEventListener('change', syncViewportMode);
    tabletPortraitMedia.addEventListener('change', syncViewportMode);
    tabletLandscapeMedia.addEventListener('change', syncViewportMode);

    return () => {
      phoneMedia.removeEventListener('change', syncViewportMode);
      tabletPortraitMedia.removeEventListener('change', syncViewportMode);
      tabletLandscapeMedia.removeEventListener('change', syncViewportMode);
    };
  }, []);

  return viewportMode;
}

function shouldMaskText(text: string) {
  const normalized = String(text || '').trim();
  return normalized.length > 0 && /\d/.test(normalized);
}

function shouldSkipMaskedElement(element: Element | null) {
  if (!element) return true;

  const tagName = element.tagName.toLowerCase();
  if (['script', 'style', 'noscript', 'svg', 'path', 'img', 'canvas', 'input', 'textarea', 'select', 'option'].includes(tagName)) {
    return true;
  }

  return Boolean(element.closest('[data-company-sensitive-ignore="1"]'));
}

function clearAutoMask(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('[data-company-sensitive-auto="1"]').forEach((element) => {
    element.removeAttribute('data-company-sensitive-auto');
  });
}

function applyAutoMask(root: HTMLElement | null) {
  if (!root) return;

  clearAutoMask(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || !shouldMaskText(node.textContent)) {
        return NodeFilter.FILTER_SKIP;
      }

      const parent = node.parentElement;
      if (!parent || shouldSkipMaskedElement(parent)) {
        return NodeFilter.FILTER_SKIP;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const marked = new Set<Element>();
  let currentNode = walker.nextNode();
  while (currentNode) {
    const parent = currentNode.parentElement;
    if (parent && !marked.has(parent)) {
      parent.setAttribute('data-company-sensitive-auto', '1');
      marked.add(parent);
    }
    currentNode = walker.nextNode();
  }
}

export function GlobalSensitiveNumberMask({ children }: { children: ReactNode }) {
  const { hidden } = useCompanyValueVisibility();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    if (!hidden) {
      clearAutoMask(root);
      return undefined;
    }

    const syncMask = () => applyAutoMask(root);
    syncMask();

    const observer = new MutationObserver(() => {
      syncMask();
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      clearAutoMask(root);
    };
  }, [hidden]);

  return (
    <div ref={rootRef} data-company-values-root="1" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
