import { Tick02Icon } from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-2.5 group min-h-11 md:min-h-0 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div
        className={`size-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all duration-200 ${
          checked
            ? "bg-primary border-primary"
            : disabled
              ? "border-border"
              : "border-border group-hover:border-primary/50"
        }`}
      >
        {checked && (
          <Icon icon={Tick02Icon} className="size-3 text-primary-foreground" />
        )}
      </div>
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
    </button>
  );
}
