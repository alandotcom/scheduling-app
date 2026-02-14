import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TriggerConfigProps = {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
};

export function TriggerConfig({ config, onChange }: TriggerConfigProps) {
  const triggerType =
    typeof config.triggerType === "string" ? config.triggerType : "Webhook";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Trigger type</Label>
        <Select
          items={[
            { value: "Webhook", label: "Webhook" },
            { value: "Schedule", label: "Schedule" },
          ]}
          value={triggerType}
          onValueChange={(value) => onChange({ ...config, triggerType: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select trigger" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Webhook">Webhook</SelectItem>
            <SelectItem value="Schedule">Schedule</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {triggerType === "Schedule" ? (
        <>
          <div className="space-y-1.5">
            <Label>Cron expression</Label>
            <Input
              value={
                typeof config.scheduleExpression === "string"
                  ? config.scheduleExpression
                  : ""
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  scheduleExpression: event.target.value,
                  scheduleCron: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input
              value={
                typeof config.scheduleTimezone === "string"
                  ? config.scheduleTimezone
                  : "America/New_York"
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  scheduleTimezone: event.target.value,
                })
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Domain</Label>
            <Input
              value={
                typeof config.domain === "string"
                  ? config.domain
                  : "appointment"
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  domain: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Start events (CSV)</Label>
            <Input
              value={
                typeof config.webhookCreateEvents === "string"
                  ? config.webhookCreateEvents
                  : ""
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  webhookCreateEvents: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Restart events (CSV)</Label>
            <Input
              value={
                typeof config.webhookUpdateEvents === "string"
                  ? config.webhookUpdateEvents
                  : ""
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  webhookUpdateEvents: event.target.value,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stop events (CSV)</Label>
            <Input
              value={
                typeof config.webhookDeleteEvents === "string"
                  ? config.webhookDeleteEvents
                  : ""
              }
              onChange={(event) =>
                onChange({
                  ...config,
                  webhookDeleteEvents: event.target.value,
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
