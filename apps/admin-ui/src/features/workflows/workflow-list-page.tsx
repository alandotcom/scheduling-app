import { Add01Icon } from "@hugeicons/core-free-icons";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

type StubStatus = "active" | "draft" | "archived";

interface StubWorkflow {
  id: string;
  name: string;
  description: string | null;
  key: string;
  status: StubStatus;
  updatedAt: string;
}

const STUB_WORKFLOWS: StubWorkflow[] = [
  {
    id: "1",
    name: "New Client Welcome",
    description: "Send welcome email when a new client is created",
    key: "new-client-welcome",
    status: "active",
    updatedAt: "2/14/2026, 11:18:19 AM",
  },
  {
    id: "2",
    name: "Appointment Reminder",
    description: "Remind clients 24h before their appointment",
    key: "appointment-reminder",
    status: "active",
    updatedAt: "2/14/2026, 8:49:33 AM",
  },
  {
    id: "3",
    name: "No-Show Follow Up",
    description: null,
    key: "no-show-follow-up",
    status: "draft",
    updatedAt: "2/14/2026, 8:33:24 AM",
  },
  {
    id: "4",
    name: "Cancellation Survey",
    description: null,
    key: "cancellation-survey",
    status: "draft",
    updatedAt: "2/14/2026, 12:44:56 AM",
  },
  {
    id: "5",
    name: "Weekly Digest",
    description: "Send a weekly summary to org admins",
    key: "weekly-digest",
    status: "draft",
    updatedAt: "2/14/2026, 12:43:28 AM",
  },
];

function toStatusBadgeVariant(
  status: StubStatus,
): "default" | "secondary" | "warning" {
  if (status === "active") return "default";
  if (status === "draft") return "warning";
  return "secondary";
}

export function WorkflowListPage() {
  return (
    <PageScaffold className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage orchestration flows for domain events and
            schedules.
          </p>
        </div>
        <Button disabled>
          <Icon icon={Add01Icon} className="size-4" />
          New workflow
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STUB_WORKFLOWS.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader>
              <CardTitle className="line-clamp-1">{workflow.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {workflow.description || "No description"}
              </CardDescription>
              <CardAction>
                <Badge variant={toStatusBadgeVariant(workflow.status)}>
                  {workflow.status}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Key:</span>{" "}
                {workflow.key}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Updated:</span>{" "}
                {workflow.updatedAt}
              </p>
            </CardContent>
            <CardFooter />
          </Card>
        ))}
      </div>
    </PageScaffold>
  );
}
