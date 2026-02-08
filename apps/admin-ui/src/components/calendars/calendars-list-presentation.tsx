import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import {
  EntityCardField,
  EntityDesktopTable,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { RowActions } from "@/components/row-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayDate, formatTimezoneShort } from "@/lib/date-utils";

interface CalendarListItemBase {
  id: string;
  name: string;
  timezone: string;
  locationId: string | null;
  createdAt: string | Date;
  relationshipCounts?: {
    appointmentsThisWeek?: number;
  } | null;
}

interface CalendarsListPresentationProps<
  TCalendar extends CalendarListItemBase,
> {
  calendars: TCalendar[];
  getLocationName: (locationId: string | null | undefined) => string;
  getActions: (calendar: TCalendar) => ContextMenuItem[];
  onOpen: (calendarId: string) => void;
}

export function CalendarsListPresentation<
  TCalendar extends CalendarListItemBase,
>({
  calendars,
  getLocationName,
  getActions,
  onOpen,
}: CalendarsListPresentationProps<TCalendar>) {
  return (
    <>
      <EntityMobileCardList>
        {calendars.map((calendar) => (
          <EntityMobileCard
            key={calendar.id}
            onOpen={() => onOpen(calendar.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {calendar.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTimezoneShort(calendar.timezone)}
                </p>
              </div>
              <RowActions
                ariaLabel={`Actions for ${calendar.name}`}
                actions={getActions(calendar)}
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <EntityCardField
                label="Location"
                value={getLocationName(calendar.locationId)}
              />
              <EntityCardField
                label="This Week"
                value={
                  <RelationshipCountBadge
                    count={
                      calendar.relationshipCounts?.appointmentsThisWeek ?? 0
                    }
                    singular="appointment"
                  />
                }
              />
              <EntityCardField
                label="Created"
                value={formatDisplayDate(calendar.createdAt)}
              />
            </dl>
          </EntityMobileCard>
        ))}
      </EntityMobileCardList>

      <EntityDesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>This Week</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calendars.map((calendar) => (
              <ContextMenu key={calendar.id} items={getActions(calendar)}>
                <TableRow
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onClick={() => onOpen(calendar.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(calendar.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{calendar.name}</TableCell>
                  <TableCell title={calendar.timezone}>
                    {formatTimezoneShort(calendar.timezone)}
                  </TableCell>
                  <TableCell>{getLocationName(calendar.locationId)}</TableCell>
                  <TableCell>
                    <RelationshipCountBadge
                      count={
                        calendar.relationshipCounts?.appointmentsThisWeek ?? 0
                      }
                      singular="appointment"
                    />
                  </TableCell>
                  <TableCell>{formatDisplayDate(calendar.createdAt)}</TableCell>
                  <TableCell>
                    <RowActions
                      ariaLabel={`Actions for ${calendar.name}`}
                      actions={getActions(calendar)}
                    />
                  </TableCell>
                </TableRow>
              </ContextMenu>
            ))}
          </TableBody>
        </Table>
      </EntityDesktopTable>
    </>
  );
}
