import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

interface IconProps {
  icon: IconSvgElement;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export function Icon({
  icon,
  className,
  "aria-hidden": ariaHidden,
}: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={2}
      className={cn("size-4", className)}
      aria-hidden={ariaHidden}
    />
  );
}
