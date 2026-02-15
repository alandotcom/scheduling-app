import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface MultiSelectComboboxProps {
  options: readonly string[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
}: MultiSelectComboboxProps) {
  const [filterText, setFilterText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(filterText.toLowerCase()),
  );

  const selectedSet = new Set(value);

  function handleToggle(option: string) {
    if (selectedSet.has(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
    setFilterText("");
  }

  function handleRemove(option: string) {
    onChange(value.filter((v) => v !== option));
  }

  function handleFocus() {
    if (!disabled) {
      setIsOpen(true);
    }
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setFilterText("");
    }, 150);
  }

  function handleDropdownMouseDown(event: React.MouseEvent) {
    event.preventDefault();
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", disabled && "opacity-50 cursor-not-allowed")}
    >
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-input p-2">
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs"
          >
            {item}
            <button
              type="button"
              className="hover:bg-primary/20 rounded-full p-0.5"
              onClick={() => handleRemove(item)}
              disabled={disabled}
              aria-label={`Remove ${item}`}
            >
              <svg
                className="size-3"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </span>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
        />
      </div>

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
          onMouseDown={handleDropdownMouseDown}
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching options
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = selectedSet.has(option);
              return (
                <div
                  key={option}
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                  onClick={() => handleToggle(option)}
                >
                  <span
                    className={cn(
                      "size-3.5 shrink-0 rounded-sm border",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-input bg-transparent",
                    )}
                  />
                  {option}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
