import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight02Icon,
  FlashIcon,
  HourglassIcon,
  Mail01Icon,
} from "@hugeicons/core-free-icons";
import type { ComponentProps, ComponentType } from "react";
import { ResendBrandIcon, SlackBrandIcon } from "@/components/brand-icons";
import { getAction, getAllActions } from "./action-registry";

const actionBrandIconByIntegrationKey: Record<
  "resend" | "slack",
  ComponentType<ComponentProps<"svg">>
> = {
  resend: ResendBrandIcon,
  slack: SlackBrandIcon,
};

export type ActionVisualSpec = {
  icon: IconSvgElement;
  iconColorClass: string;
  iconBgClass: string;
  brandIcon: ComponentType<ComponentProps<"svg">> | null;
  brandLabel: string | null;
};

export function isGenericActionNodeLabel(value: string): boolean {
  return /^action(?:\s+\d+)?$/i.test(value.trim());
}

export function isDefaultActionNodeLabel(value: string): boolean {
  const normalizedLabel = value.trim().toLowerCase();
  if (normalizedLabel.length === 0) {
    return false;
  }

  return getAllActions().some((action) => {
    const defaultLabel = action.defaultNodeLabel.trim().toLowerCase();
    const actionLabel = action.label.trim().toLowerCase();
    return normalizedLabel === defaultLabel || normalizedLabel === actionLabel;
  });
}

export function getActionDefaultNodeLabel(
  actionType: string | undefined,
): string | undefined {
  if (!actionType) {
    return undefined;
  }

  const action = getAction(actionType);
  return action?.defaultNodeLabel ?? action?.label;
}

export function getActionVisualSpec(
  actionType: string | undefined,
): ActionVisualSpec {
  const action = actionType ? getAction(actionType) : undefined;
  const brandIcon =
    action?.integrationKey !== undefined
      ? actionBrandIconByIntegrationKey[action.integrationKey]
      : null;
  const brandLabel =
    brandIcon && action?.defaultNodeLabel ? action.defaultNodeLabel : null;

  switch (actionType) {
    case "wait":
      return {
        icon: HourglassIcon,
        iconColorClass: "text-orange-500",
        iconBgClass: "bg-orange-500/10",
        brandIcon,
        brandLabel,
      };
    case "send-resend":
      return {
        icon: Mail01Icon,
        iconColorClass: "text-cyan-500",
        iconBgClass: "bg-cyan-500/10",
        brandIcon,
        brandLabel,
      };
    case "send-slack":
      return {
        icon: FlashIcon,
        iconColorClass: "text-cyan-500",
        iconBgClass: "bg-cyan-500/10",
        brandIcon,
        brandLabel,
      };
    case "condition":
      return {
        icon: ArrowRight02Icon,
        iconColorClass: "text-emerald-500",
        iconBgClass: "bg-emerald-500/10",
        brandIcon,
        brandLabel,
      };
    case "logger":
      return {
        icon: FlashIcon,
        iconColorClass: "text-sky-500",
        iconBgClass: "bg-sky-500/10",
        brandIcon,
        brandLabel,
      };
    default:
      return {
        icon: FlashIcon,
        iconColorClass: "text-muted-foreground",
        iconBgClass: "bg-muted",
        brandIcon,
        brandLabel,
      };
  }
}
