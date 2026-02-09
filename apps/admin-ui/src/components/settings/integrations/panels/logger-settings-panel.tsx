import { Badge } from "@/components/ui/badge";

import type { IntegrationSettingsPanelProps } from "../types";

export function LoggerSettingsPanel({
  settings,
}: IntegrationSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          Logger does not require credentials or additional setup. Enable it to
          emit each outbound event to application logs.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status:</span>
        <Badge variant={settings.enabled ? "success" : "secondary"}>
          {settings.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>
    </div>
  );
}
