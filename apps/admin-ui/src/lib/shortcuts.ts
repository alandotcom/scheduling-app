const MAC_SYMBOLS: Record<string, string> = {
  meta: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  enter: "↵",
  escape: "Esc",
  esc: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

const DEFAULT_SYMBOLS: Record<string, string> = {
  meta: "Cmd",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  esc: "Esc",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
};

function getPlatformString() {
  if (typeof navigator === "undefined") return "";
  const navWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const uaPlatform =
    typeof navWithUserAgentData.userAgentData?.platform === "string"
      ? navWithUserAgentData.userAgentData.platform
      : "";
  return `${uaPlatform} ${navigator.platform}`.toLowerCase();
}

export function isMacLikePlatform() {
  return getPlatformString().includes("mac");
}

function formatToken(token: string, isMac: boolean) {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return "";

  const table = isMac ? MAC_SYMBOLS : DEFAULT_SYMBOLS;
  const mapped = table[normalized];
  if (mapped) return mapped;

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized[0]?.toUpperCase() + normalized.slice(1);
}

function formatChord(chord: string, isMac: boolean) {
  const tokens = chord
    .split("+")
    .map((token) => formatToken(token, isMac))
    .filter(Boolean);

  if (tokens.length === 0) return "";
  if (!isMac) return tokens.join("+");
  return tokens.join("");
}

export function formatShortcut(shortcut: string) {
  const isMac = isMacLikePlatform();
  const chords = shortcut
    .trim()
    .split(/\s+/)
    .map((chord) => formatChord(chord, isMac))
    .filter(Boolean);

  if (chords.length === 0) return shortcut;
  return chords.join(" ");
}

export function formatShortcutFromOptions(shortcuts: string[]) {
  const first = shortcuts[0];
  if (!first) return "";
  return formatShortcut(first);
}
