import { RelationshipCountBadge } from "@/components/relationship-count-badge";
import { RowActions } from "@/components/row-actions";
import {
  EntityCardField,
  EntityDesktopTable,
  EntityMobileCard,
  EntityMobileCardList,
} from "@/components/entity-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayDate, formatTimezoneShort } from "@/lib/date-utils";

type DetailTabValue = "details" | "calendars" | "resources";

interface LocationListItem {
  id: string;
  name: string;
  timezone: string;
  createdAt: string | Date;
  relationshipCounts?: {
    calendars?: number;
    resources?: number;
  } | null;
}

interface LocationsListPresentationProps {
  locations: LocationListItem[];
  onOpen: (locationId: string, tab?: DetailTabValue) => void;
  onDelete: (locationId: string) => void;
}

export function LocationsListPresentation({
  locations,
  onOpen,
  onDelete,
}: LocationsListPresentationProps) {
  return (
    <>
      <EntityMobileCardList>
        {locations.map((location) => (
          <EntityMobileCard
            key={location.id}
            onOpen={() => onOpen(location.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {location.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTimezoneShort(location.timezone)}
                </p>
              </div>
              <RowActions
                ariaLabel={`Actions for ${location.name}`}
                actions={[
                  {
                    label: "View",
                    onClick: () => onOpen(location.id),
                  },
                  {
                    label: "Edit",
                    onClick: () => onOpen(location.id, "details"),
                  },
                  {
                    label: "Delete",
                    onClick: () => onDelete(location.id),
                    variant: "destructive",
                  },
                ]}
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <EntityCardField
                label="Created"
                value={formatDisplayDate(location.createdAt)}
              />
              <EntityCardField
                label="Calendars"
                value={
                  <RelationshipCountBadge
                    count={location.relationshipCounts?.calendars ?? 0}
                    singular="calendar"
                  />
                }
              />
              <EntityCardField
                label="Resources"
                value={
                  <RelationshipCountBadge
                    count={location.relationshipCounts?.resources ?? 0}
                    singular="resource"
                  />
                }
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
              <TableHead>Relationships</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow
                key={location.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                tabIndex={0}
                onClick={() => onOpen(location.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(location.id);
                  }
                }}
              >
                <TableCell className="font-medium">{location.name}</TableCell>
                <TableCell title={location.timezone}>
                  {formatTimezoneShort(location.timezone)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <RelationshipCountBadge
                      count={location.relationshipCounts?.calendars ?? 0}
                      singular="calendar"
                    />
                    <RelationshipCountBadge
                      count={location.relationshipCounts?.resources ?? 0}
                      singular="resource"
                    />
                  </div>
                </TableCell>
                <TableCell>{formatDisplayDate(location.createdAt)}</TableCell>
                <TableCell>
                  <RowActions
                    ariaLabel={`Actions for ${location.name}`}
                    actions={[
                      {
                        label: "View",
                        onClick: () => onOpen(location.id),
                      },
                      {
                        label: "Edit",
                        onClick: () => onOpen(location.id, "details"),
                      },
                      {
                        label: "Delete",
                        onClick: () => onDelete(location.id),
                        variant: "destructive",
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </EntityDesktopTable>
    </>
  );
}
