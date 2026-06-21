import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Shared scrim for modal / dialog / sheet backdrops. Keeps the dim + blur
 * identical across every overlay; positioning and z-index stay per-surface.
 */
export const overlayClassName = "bg-black/50 md:backdrop-blur-sm";
