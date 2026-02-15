import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
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
}

type MentionState = {
  start: number;
  end: number;
  query: string;
};

type ExpressionSegment = {
  value: string;
  isReference: boolean;
};

type ExpressionReferenceRange = {
  start: number;
  end: number;
};

function toExpressionSegments(value: string): ExpressionSegment[] {
  if (value.length === 0) {
    return [];
  }

  const segments: ExpressionSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(REFERENCE_TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index;

    if (!token || start === undefined) {
      continue;
    }

    if (start > cursor) {
      segments.push({
        value: value.slice(cursor, start),
        isReference: false,
      });
    }

    segments.push({
      value: token,
      isReference: true,
    });
    cursor = start + token.length;
  }

  if (cursor < value.length) {
    segments.push({
      value: value.slice(cursor),
      isReference: false,
    });
  }

  return segments;
}

function getReferenceRanges(value: string): ExpressionReferenceRange[] {
  const ranges: ExpressionReferenceRange[] = [];

  for (const match of value.matchAll(REFERENCE_TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index;
    if (!token || start === undefined) {
      continue;
    }

    ranges.push({
      start,
      end: start + token.length,
    });
  }

  return ranges;
}

function findInternalReferenceRange(
  ranges: ExpressionReferenceRange[],
  position: number,
): ExpressionReferenceRange | null {
  const matchingRange = ranges.find(
    (range) => position > range.start && position < range.end,
  );

  return matchingRange ?? null;
}

function clampSelectionToReferenceBoundaries(input: {
  start: number;
  end: number;
  ranges: ExpressionReferenceRange[];
}) {
  if (input.start === input.end) {
    const range = findInternalReferenceRange(input.ranges, input.start);
    if (!range) {
      return { start: input.start, end: input.end };
    }

    return {
      start: range.end,
      end: range.end,
    };
  }

  let nextStart = input.start;
  let nextEnd = input.end;

  for (const range of input.ranges) {
    if (nextStart > range.start && nextStart < range.end) {
      nextStart = range.start;
    }

    if (nextEnd > range.start && nextEnd < range.end) {
      nextEnd = range.end;
    }
  }

  return {
    start: nextStart,
    end: nextEnd,
  };
}

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

export function ExpressionInput({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  suggestions,
}: ExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const expressionSegments = useMemo(
    () => toExpressionSegments(value),
    [value],
  );
  const referenceRanges = useMemo(() => getReferenceRanges(value), [value]);

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

  function insertSuggestion(suggestion: EventAttributeSuggestion) {
    if (!mentionState) {
      return;
    }

    const nextValue = `${value.slice(0, mentionState.start)}${suggestion.value}${value.slice(mentionState.end)}`;
    const nextCursor = mentionState.start + suggestion.value.length;

    onChange(nextValue);
    setOpen(false);
    setMentionState(null);

    requestAnimationFrame(() => {
      if (!inputRef.current) {
        return;
      }

      inputRef.current.focus();
      inputRef.current.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <div className="relative">
      <Input
        className="text-transparent caret-foreground selection:bg-accent selection:text-accent-foreground"
        ref={inputRef}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);

          const cursor = event.target.selectionStart ?? nextValue.length;
          updateMentionState(nextValue, cursor);
          setScrollLeft(event.target.scrollLeft);
        }}
        onKeyDown={(event) => {
          const selectionStart = event.currentTarget.selectionStart;
          const selectionEnd = event.currentTarget.selectionEnd;

          if (selectionStart !== null && selectionEnd !== null) {
            if (event.key === "ArrowLeft" && selectionStart === selectionEnd) {
              const range = referenceRanges.find(
                (item) => item.end === selectionStart,
              );

              if (range) {
                event.preventDefault();
                event.currentTarget.setSelectionRange(range.start, range.start);
                return;
              }
            }

            if (event.key === "ArrowRight" && selectionStart === selectionEnd) {
              const range = referenceRanges.find(
                (item) => item.start === selectionStart,
              );

              if (range) {
                event.preventDefault();
                event.currentTarget.setSelectionRange(range.end, range.end);
                return;
              }
            }

            if (event.key === "Backspace" && selectionStart === selectionEnd) {
              const range = referenceRanges.find(
                (item) => item.end === selectionStart,
              );

              if (range) {
                event.preventDefault();
                const nextValue = `${value.slice(0, range.start)}${value.slice(range.end)}`;
                onChange(nextValue);
                setOpen(false);
                setMentionState(null);
                requestAnimationFrame(() => {
                  if (!inputRef.current) {
                    return;
                  }

                  inputRef.current.focus();
                  inputRef.current.setSelectionRange(range.start, range.start);
                });
                return;
              }
            }

            if (event.key === "Delete" && selectionStart === selectionEnd) {
              const range = referenceRanges.find(
                (item) => item.start === selectionStart,
              );

              if (range) {
                event.preventDefault();
                const nextValue = `${value.slice(0, range.start)}${value.slice(range.end)}`;
                onChange(nextValue);
                setOpen(false);
                setMentionState(null);
                requestAnimationFrame(() => {
                  if (!inputRef.current) {
                    return;
                  }

                  inputRef.current.focus();
                  inputRef.current.setSelectionRange(range.start, range.start);
                });
                return;
              }
            }
          }

          if (!open || filteredSuggestions.length === 0) {
            return;
          }

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
              current - 1 < 0 ? filteredSuggestions.length - 1 : current - 1,
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
        }}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => {
            setOpen(false);
            setMentionState(null);
            onBlur();
          }, 120);
        }}
        onFocus={(event) => {
          const cursor = event.currentTarget.selectionStart ?? value.length;
          updateMentionState(value, cursor);
          setScrollLeft(event.currentTarget.scrollLeft);
        }}
        onSelect={(event) => {
          const start = event.currentTarget.selectionStart;
          const end = event.currentTarget.selectionEnd;

          if (start === null || end === null) {
            return;
          }

          const clamped = clampSelectionToReferenceBoundaries({
            start,
            end,
            ranges: referenceRanges,
          });

          if (clamped.start === start && clamped.end === end) {
            return;
          }

          event.currentTarget.setSelectionRange(clamped.start, clamped.end);
        }}
        onScroll={(event) => {
          setScrollLeft(event.currentTarget.scrollLeft);
        }}
        placeholder={placeholder}
        value={value}
      />

      {value.length > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-lg px-3 py-2 text-base md:text-sm"
        >
          <div
            className="whitespace-pre text-foreground"
            style={{ transform: `translateX(${-scrollLeft}px)` }}
          >
            {expressionSegments.map((segment, index) =>
              segment.isReference ? (
                <span
                  className="inline-flex items-center rounded-md border border-sky-300/90 bg-sky-500/10 px-1.5 font-medium text-sky-700 dark:border-sky-400/50 dark:text-sky-300"
                  data-expression-token="true"
                  key={`${segment.value}-${index}`}
                >
                  {segment.value}
                </span>
              ) : (
                <span key={`${segment.value}-${index}`}>{segment.value}</span>
              ),
            )}
          </div>
        </div>
      ) : null}

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
