"use client";

import { useSyncExternalStore } from "react";

/**
 * Known in-app browser user-agent indicators with display names.
 * Google blocks OAuth from these embedded browsers (error 403: disallowed_useragent).
 */
const IN_APP_BROWSER_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  appName: string | null;
}> = [
  { pattern: /FBAN|FBAV/i, appName: "Facebook" }, // Facebook / Messenger
  { pattern: /Instagram/i, appName: "Instagram" }, // Instagram
  { pattern: /Twitter/i, appName: "X (Twitter)" }, // Twitter / X
  { pattern: /Line\//i, appName: "LINE" }, // LINE
  { pattern: /Snapchat/i, appName: "Snapchat" }, // Snapchat
  { pattern: /Pinterest/i, appName: "Pinterest" }, // Pinterest
  { pattern: /LinkedIn/i, appName: "LinkedIn" }, // LinkedIn
  { pattern: /MicroMessenger/i, appName: "WeChat" }, // WeChat
  { pattern: /QQ\//i, appName: "QQ" }, // QQ
  { pattern: /TikTok/i, appName: "TikTok" }, // TikTok
  { pattern: /Telegram/i, appName: "Telegram" }, // Telegram (some versions)
  { pattern: /\bwv\b/i, appName: "Android WebView" }, // Android WebView
];

export type InAppBrowserInfo = {
  isInAppBrowser: boolean;
  /** Best-effort app name for display (e.g. "Facebook", "Instagram"). */
  appName: string | null;
};

const DEFAULT_INFO: InAppBrowserInfo = { isInAppBrowser: false, appName: null };

// Stable references for useSyncExternalStore (user-agent never changes mid-session)
const subscribe = () => () => {};
let cachedSnapshot: InAppBrowserInfo | null = null;
function getSnapshot(): InAppBrowserInfo {
  if (cachedSnapshot === null) {
    cachedSnapshot = detectInAppBrowser(navigator.userAgent);
  }
  return cachedSnapshot;
}
function getServerSnapshot(): InAppBrowserInfo {
  return DEFAULT_INFO;
}

/**
 * Detects whether the current page is rendered inside an in-app browser
 * (e.g. Facebook Messenger, Instagram, TikTok).
 *
 * Returns `{ isInAppBrowser: false, appName: null }` during SSR and on
 * standard browsers.
 */
export function useInAppBrowser(): InAppBrowserInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function detectInAppBrowser(ua: string): InAppBrowserInfo {
  for (const { pattern, appName } of IN_APP_BROWSER_PATTERNS) {
    if (pattern.test(ua)) {
      return { isInAppBrowser: true, appName };
    }
  }
  return { isInAppBrowser: false, appName: null };
}
