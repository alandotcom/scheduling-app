import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EventAttributeSuggestion } from "./event-attribute-suggestions";

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
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
        ref={inputRef}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);

          const cursor = event.target.selectionStart ?? nextValue.length;
          updateMentionState(nextValue, cursor);
        }}
        onKeyDown={(event) => {
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
        }}
        placeholder={placeholder}
        value={value}
      />

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
