import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { EventAttributeSuggestion } from "./event-attribute-suggestions";

const REFERENCE_TOKEN_PATTERN =
  /@?[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\.\d+)+/g;

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder?: string;
  disabled?: boolean;
  suggestions: EventAttributeSuggestion[];
  multiline?: boolean;
  rows?: number;
}

type MentionState = {
  start: number;
  end: number;
  query: string;
};

function getMentionState(value: string, cursor: number): MentionState | null {
  const beforeCursor = value.slice(0, cursor);
  const mentionStart = beforeCursor.lastIndexOf("@");

  if (mentionStart < 0) {
    return null;
  }

  const mentionQuery = beforeCursor.slice(mentionStart + 1);
  if (/\s/.test(mentionQuery)) {
    return null;
  }

  return {
    start: mentionStart,
    end: cursor,
    query: mentionQuery,
  };
}

/** Check if a DOM node is inside a badge element */
function isInsideBadge(node: Node, container: HTMLElement): boolean {
  let parent = node.parentElement;
  while (parent && parent !== container) {
    if (parent.hasAttribute("data-template")) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

function isHTMLElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isHTMLBRElement(node: HTMLElement): boolean {
  return node.tagName === "BR";
}

function isBlockElement(node: HTMLElement): boolean {
  return ["DIV", "P", "LI"].includes(node.tagName);
}

/** Get cursor position as character offset in the value string */
function getCursorOffset(container: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  let offset = 0;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    null,
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isInsideBadge(node, container)) {
        continue;
      }
      if (node === range.endContainer) {
        return offset + range.endOffset;
      }
      offset += (node.textContent || "").length;
    } else if (isHTMLElement(node)) {
      const template = node.getAttribute("data-template");
      if (template) {
        if (node.contains(range.endContainer) || node === range.endContainer) {
          return offset + template.length;
        }
        offset += template.length;
      }
    }
  }

  return offset;
}

/** Set cursor at a character offset in the contentEditable container */
function setCursorOffset(container: HTMLElement, targetOffset: number) {
  let offset = 0;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    null,
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (isInsideBadge(node, container)) {
        continue;
      }
      const len = (node.textContent || "").length;
      if (offset + len >= targetOffset) {
        try {
          const range = document.createRange();
          range.setStart(node, Math.min(targetOffset - offset, len));
          range.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        } catch {
          container.focus();
        }
        return;
      }
      offset += len;
    } else if (isHTMLElement(node)) {
      const template = node.getAttribute("data-template");
      if (template) {
        if (offset + template.length >= targetOffset) {
          // Position cursor after the badge
          let target = node.nextSibling;
          if (!target && node.parentNode) {
            target = document.createTextNode("");
            node.parentNode.appendChild(target);
          }
          if (target) {
            try {
              const range = document.createRange();
              range.setStart(target, 0);
              range.collapse(true);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
            } catch {
              container.focus();
            }
          }
          return;
        }
        offset += template.length;
      }
    }
  }
}

/** Extract the text value from the contentEditable DOM */
function extractValue(container: HTMLElement): string {
  function extractNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return isInsideBadge(node, container) ? "" : (node.textContent ?? "");
    }

    if (!isHTMLElement(node)) {
      return "";
    }

    const template = node.getAttribute("data-template");
    if (template) {
      return template;
    }

    if (isHTMLBRElement(node)) {
      return "\n";
    }

    if (!isBlockElement(node)) {
      return [...node.childNodes].map((child) => extractNode(child)).join("");
    }

    const content = [...node.childNodes]
      .map((child) => extractNode(child))
      .join("");
    return `${content}\n`;
  }

  const value = [...container.childNodes]
    .map((child) => extractNode(child))
    .join("");

  return value.replace(/\n$/, "");
}

function insertTextAtSelection(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

const BADGE_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-sky-300/90 bg-sky-500/10 px-1.5 mx-0.5 font-medium text-sky-700 dark:border-sky-400/50 dark:text-sky-300";

export function ExpressionInput({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  suggestions,
  multiline = false,
  rows,
}: ExpressionInputProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(value);
  const shouldUpdateDisplay = useRef(true);
  const pendingCursorPosition = useRef<number | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const minRows = Math.max(rows ?? 3, 1);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Sync with external value prop
  useEffect(() => {
    if (value !== internalValue) {
      setInternalValue(value);
      shouldUpdateDisplay.current = true;
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild the contentEditable DOM when display update is needed
  useEffect(() => {
    if (!shouldUpdateDisplay.current || !contentRef.current) {
      return;
    }

    const container = contentRef.current;
    const text = internalValue;

    // Save cursor position before rebuilding
    let cursorPos = isFocused ? getCursorOffset(container) : null;
    if (pendingCursorPosition.current !== null) {
      cursorPos = pendingCursorPosition.current;
      pendingCursorPosition.current = null;
    }

    // Clear and rebuild DOM
    container.innerHTML = "";

    if (!text && !isFocused) {
      if (placeholder) {
        const span = document.createElement("span");
        span.className = "text-muted-foreground/70 pointer-events-none";
        span.textContent = placeholder;
        container.appendChild(span);
      }
      shouldUpdateDisplay.current = false;
      return;
    }

    // Parse value and create text nodes + badge elements
    let cursor = 0;
    for (const match of text.matchAll(REFERENCE_TOKEN_PATTERN)) {
      const token = match[0];
      const start = match.index;
      if (!token || start === undefined) {
        continue;
      }

      if (start > cursor) {
        container.appendChild(
          document.createTextNode(text.slice(cursor, start)),
        );
      }

      const badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      badge.contentEditable = "false";
      badge.setAttribute("data-template", token);
      badge.setAttribute("data-expression-token", "true");
      badge.textContent = token;
      container.appendChild(badge);

      cursor = start + token.length;
    }

    if (cursor < text.length) {
      container.appendChild(document.createTextNode(text.slice(cursor)));
    }

    // Ensure there's always a text node to type in
    if (!container.childNodes.length) {
      container.appendChild(document.createTextNode(""));
    }

    shouldUpdateDisplay.current = false;

    // Restore cursor position after DOM rebuild
    if (cursorPos !== null) {
      requestAnimationFrame(() => {
        if (contentRef.current) {
          setCursorOffset(contentRef.current, cursorPos);
        }
      });
    }
  }, [internalValue, isFocused, placeholder]);

  const filteredSuggestions = useMemo(() => {
    if (!mentionState) {
      return [];
    }

    const normalizedQuery = mentionState.query.toLowerCase();
    const filtered = suggestions.filter((suggestion) =>
      suggestion.value.toLowerCase().includes(normalizedQuery),
    );

    return filtered.slice(0, 20);
  }, [mentionState, suggestions]);

  function updateMentionState(nextValue: string, cursor: number) {
    const nextMentionState = getMentionState(nextValue, cursor);
    setMentionState(nextMentionState);
    setOpen(Boolean(nextMentionState));
    setActiveIndex(0);
  }

  function handleInput() {
    if (!contentRef.current) {
      return;
    }

    const newValue = extractValue(contentRef.current);
    if (newValue === internalValue) {
      return;
    }

    // Check if reference count changed — if so, rebuild display
    const oldRefs = [...internalValue.matchAll(REFERENCE_TOKEN_PATTERN)].length;
    const newRefs = [...newValue.matchAll(REFERENCE_TOKEN_PATTERN)].length;

    setInternalValue(newValue);
    onChange(newValue);

    if (oldRefs !== newRefs) {
      shouldUpdateDisplay.current = true;
    }

    // Update mention/autocomplete state
    const cursor = getCursorOffset(contentRef.current);
    if (cursor !== null) {
      updateMentionState(newValue, cursor);
    }
  }

  function insertSuggestion(suggestion: EventAttributeSuggestion) {
    if (!mentionState) {
      return;
    }

    const inserted = `${suggestion.value} `;
    const nextValue = `${internalValue.slice(0, mentionState.start)}${inserted}${internalValue.slice(mentionState.end)}`;
    const nextCursor = mentionState.start + inserted.length;

    pendingCursorPosition.current = nextCursor;
    shouldUpdateDisplay.current = true;

    setInternalValue(nextValue);
    onChange(nextValue);
    setOpen(false);
    setMentionState(null);
    contentRef.current?.focus();
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base md:text-sm",
          multiline ? "items-start" : "items-center",
          "transition-all duration-200 ease-out",
          "focus-within:border-ring focus-within:ring-ring/30 focus-within:ring-[3px]",
          "dark:bg-input/30",
          disabled && "pointer-events-none cursor-not-allowed opacity-50",
        )}
        style={multiline ? { minHeight: `${minRows * 1.5}rem` } : undefined}
      >
        <div
          ref={contentRef}
          contentEditable={!disabled}
          className={cn(
            "w-full outline-none break-words",
            multiline
              ? "whitespace-pre-wrap"
              : "whitespace-pre overflow-hidden",
          )}
          onInput={handleInput}
          onKeyDown={(event) => {
            if (open && filteredSuggestions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  current + 1 >= filteredSuggestions.length ? 0 : current + 1,
                );
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) =>
                  current - 1 < 0
                    ? filteredSuggestions.length - 1
                    : current - 1,
                );
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                const suggestion = filteredSuggestions[activeIndex];
                if (suggestion) {
                  insertSuggestion(suggestion);
                }
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                setMentionState(null);
              }
            }

            if (event.key === "Enter") {
              if (!multiline) {
                event.preventDefault();
                return;
              }

              event.preventDefault();
              insertTextAtSelection("\n");
              handleInput();
            }
          }}
          onBlur={() => {
            blurTimeoutRef.current = setTimeout(() => {
              setIsFocused(false);
              shouldUpdateDisplay.current = true;
              setOpen(false);
              setMentionState(null);
              onBlur();
            }, 120);
          }}
          onFocus={() => {
            setIsFocused(true);
            if (!internalValue) {
              shouldUpdateDisplay.current = true;
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(text));
              range.collapse(false);
              handleInput();
            }
          }}
          role="textbox"
          aria-multiline={multiline}
          suppressContentEditableWarning
        />
      </div>

      {open ? (
        <div
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {filteredSuggestions.length === 0 ? (
            <div className="px-2 py-1.5 text-muted-foreground text-xs">
              No matching attributes
            </div>
          ) : (
            filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.value}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                  index === activeIndex ? "bg-accent" : "hover:bg-accent/70",
                )}
                onClick={() => insertSuggestion(suggestion)}
                type="button"
              >
                <span className="font-medium">{suggestion.value}</span>
                <span className="text-muted-foreground">{suggestion.type}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
