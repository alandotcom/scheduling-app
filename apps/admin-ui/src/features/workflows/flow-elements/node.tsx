import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type WorkflowNodeCardProps = ComponentProps<typeof Card> & {
  handles: {
    target: boolean;
    source: boolean;
  };
  status?: "idle" | "running" | "success" | "error" | "cancelled";
};

export function Node({
  handles,
  className,
  status,
  ...props
}: WorkflowNodeCardProps) {
  return (
    <Card
      className={cn(
        "relative min-w-56 gap-0 rounded-md border bg-card",
        status === "success" && "border-green-500",
        status === "error" && "border-destructive",
        status === "cancelled" && "border-muted-foreground",
        className,
      )}
      {...props}
    >
      {handles.target ? (
        <Handle position={Position.Left} type="target" />
      ) : null}
      {handles.source ? (
        <Handle position={Position.Right} type="source" />
      ) : null}
      {props.children}
    </Card>
  );
}

export function NodeHeader(props: ComponentProps<typeof CardHeader>) {
  return (
    <CardHeader
      className={cn("gap-1 border-b bg-muted/50", props.className)}
      {...props}
    />
  );
}

export function NodeTitle(props: ComponentProps<typeof CardTitle>) {
  return <CardTitle {...props} />;
}

export function NodeDescription(props: ComponentProps<typeof CardDescription>) {
  return <CardDescription {...props} />;
}

export function NodeContent(props: ComponentProps<typeof CardContent>) {
  return <CardContent className={cn("pt-3", props.className)} {...props} />;
}

export function NodeFooter(props: ComponentProps<typeof CardFooter>) {
  return (
    <CardFooter
      className={cn("border-t bg-muted/30", props.className)}
      {...props}
    />
  );
}
