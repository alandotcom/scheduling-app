import { Tick02Icon } from "@hugeicons/core-free-icons";

import { Icon } from "@/components/ui/icon";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 group"
    >
      <div
        className={`size-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
          checked
            ? "bg-primary border-primary"
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
