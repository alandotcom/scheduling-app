import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface MultiSelectComboboxOption {
  label: string;
  value: string;
}

interface MultiSelectComboboxProps {
  ariaLabel?: string;
  className?: string;
  id?: string;
  options: readonly MultiSelectComboboxOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function handleDropdownMouseDown(event: React.MouseEvent) {
  event.preventDefault();
}

export function MultiSelectCombobox({
  ariaLabel,
  className,
  id,
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

  const optionByValue = new Map(
    options.map((option) => [option.value, option]),
  );
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.value}`
      .toLowerCase()
      .includes(filterText.toLowerCase()),
  );

  const selectedSet = new Set(value);

  function handleToggle(optionValue: string) {
    if (selectedSet.has(optionValue)) {
      onChange(
        value.filter((candidateValue) => candidateValue !== optionValue),
      );
    } else {
      onChange([...value, optionValue]);
    }
    setFilterText("");
  }

  function handleRemove(optionValue: string) {
    onChange(value.filter((candidateValue) => candidateValue !== optionValue));
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

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        className,
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-input px-2 py-1.5">
        {value.map((selectedValue) => (
          <span
            key={selectedValue}
            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-primary text-xs"
          >
            {optionByValue.get(selectedValue)?.label ?? selectedValue}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-primary/20"
              onClick={() => handleRemove(selectedValue)}
              disabled={disabled}
              aria-label={`Remove ${selectedValue}`}
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
          aria-label={ariaLabel ?? placeholder}
          id={id}
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
              const isSelected = selectedSet.has(option.value);
              return (
                <div
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => handleToggle(option.value)}
                >
                  <span
                    className={cn(
                      "size-3.5 shrink-0 rounded-sm border",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-input bg-transparent",
                    )}
                  />
                  {option.label}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
