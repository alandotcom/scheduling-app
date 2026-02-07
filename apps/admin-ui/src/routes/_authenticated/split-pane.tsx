import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Add01Icon } from "@hugeicons/core-free-icons";

import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  SplitPaneLayout,
} from "@/components/split-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DemoItem = {
  id: string;
  name: string;
  subtitle: string;
  status: "active" | "draft";
  timezone: string;
  appointments: number;
  nextAppointment: string;
  notes: string;
};

const demoItems: DemoItem[] = [
  {
    id: "cal-001",
    name: "Downtown Clinic",
    subtitle: "Primary schedule for downtown",
    status: "active",
    timezone: "America/Los_Angeles",
    appointments: 28,
    nextAppointment: "Today, 3:30 PM",
    notes: "Peak demand on Mondays. Confirm staffing coverage.",
  },
  {
    id: "cal-002",
    name: "Uptown Studio",
    subtitle: "Walk-in focused calendar",
    status: "active",
    timezone: "America/Los_Angeles",
    appointments: 14,
    nextAppointment: "Tomorrow, 9:00 AM",
    notes: "Add buffer between 1-2 PM for resets.",
  },
  {
    id: "cal-003",
    name: "Mobile Team",
    subtitle: "On-site visits and offsite events",
    status: "draft",
    timezone: "America/Denver",
    appointments: 0,
    nextAppointment: "No upcoming appointments",
    notes: "Finalize availability rules before launch.",
  },
  {
    id: "cal-004",
    name: "Telehealth",
    subtitle: "Remote appointments",
    status: "active",
    timezone: "America/New_York",
    appointments: 19,
    nextAppointment: "Today, 6:15 PM",
    notes: "Consider extending evening hours on Thursdays.",
  },
];

function SplitPaneDemoPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => demoItems[0]?.id ?? null,
  );
  const [activeTab, setActiveTab] = useState("details");

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return demoItems;
    return demoItems.filter((item) =>
      item.name.toLowerCase().includes(normalized),
    );
  }, [query]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Split Pane Demo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preview the list/detail layout with a mobile sheet.
          </p>
        </div>
        <Button>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Calendar
        </Button>
      </div>

      <SplitPaneLayout className="mt-6 min-h-[600px]">
        <ListPanel className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Input
                placeholder="Search calendars"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Badge variant="secondary">{filteredItems.length} total</Badge>
            </div>
            <div role="listbox" aria-label="Calendars" className="divide-y">
              {filteredItems.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors",
                      "hover:bg-muted/40",
                      isSelected && "bg-muted/60",
                    )}
                    onClick={() => {
                      setSelectedId(item.id);
                      setActiveTab("details");
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {item.name}
                          </span>
                          <Badge
                            variant={
                              item.status === "active" ? "success" : "outline"
                            }
                          >
                            {item.status === "active" ? "Active" : "Draft"}
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{item.appointments} upcoming</div>
                        <div>{item.nextAppointment}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </ListPanel>

        <DetailPanel
          open={!!selectedItem}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
          sheetTitle={selectedItem?.name ?? "Details"}
          sheetDescription={selectedItem?.subtitle}
          bodyClassName="p-0"
        >
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {selectedItem?.name ?? "Calendar"}
                  </h2>
                  {selectedItem && (
                    <Badge
                      variant={
                        selectedItem.status === "active" ? "success" : "outline"
                      }
                    >
                      {selectedItem.status === "active" ? "Active" : "Draft"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedItem?.subtitle ??
                    "Select a calendar to see details."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm">Edit</Button>
                <Button variant="outline" size="sm">
                  View schedule
                </Button>
              </div>
            </div>

            <DetailTabs value={activeTab} onValueChange={setActiveTab}>
              <DetailTab value="details">Details</DetailTab>
              <DetailTab value="availability">Availability</DetailTab>
              <DetailTab value="notes">Notes</DetailTab>
            </DetailTabs>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === "details" && selectedItem && (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <div>
                      <div className="text-sm font-medium">Timezone</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedItem.timezone}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        Next appointment
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedItem.nextAppointment}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Upcoming count</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedItem.appointments} appointments
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="text-sm font-medium">Highlights</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Low-latency selection and inline actions keep work in
                      context. The detail panel mirrors the selection state and
                      updates without changing routes.
                    </p>
                  </div>
                </div>
              )}
              {activeTab === "availability" && selectedItem && (
                <div className="space-y-4">
                  <div className="text-sm font-medium">Weekly hours</div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Monday - Thursday</span>
                      <span>9:00 AM - 6:00 PM</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Friday</span>
                      <span>9:00 AM - 4:00 PM</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Saturday</span>
                      <span>Closed</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Sunday</span>
                      <span>Closed</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="text-sm font-medium">Overrides</div>
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No overrides scheduled in the next 30 days.
                  </div>
                </div>
              )}
              {activeTab === "notes" && selectedItem && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Notes</div>
                  <Textarea defaultValue={selectedItem.notes} />
                </div>
              )}
            </div>
          </div>
        </DetailPanel>
      </SplitPaneLayout>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/split-pane")({
  component: SplitPaneDemoPage,
});
