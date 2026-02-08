import { Badge } from "@/components/ui/badge";
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
import { formatDisplayDate } from "@/lib/date-utils";

type ManageTab = "details" | "calendars" | "resources";

interface AppointmentTypeListItemBase {
  id: string;
  name: string;
  durationMin: number;
  paddingBeforeMin: number | null;
  paddingAfterMin: number | null;
  capacity: number | null;
  createdAt: string | Date;
  relationshipCounts?: {
    calendars?: number;
    resources?: number;
    appointments?: number;
  } | null;
}

interface AppointmentTypesListPresentationProps<
  TAppointmentType extends AppointmentTypeListItemBase,
> {
  appointmentTypes: TAppointmentType[];
  getActions: (type: TAppointmentType) => ContextMenuItem[];
  onOpen: (typeId: string, tab?: ManageTab) => void;
}

export function AppointmentTypesListPresentation<
  TAppointmentType extends AppointmentTypeListItemBase,
>({
  appointmentTypes,
  getActions,
  onOpen,
}: AppointmentTypesListPresentationProps<TAppointmentType>) {
  return (
    <>
      <EntityMobileCardList>
        {appointmentTypes.map((type) => (
          <EntityMobileCard
            key={type.id}
            onOpen={() => onOpen(type.id, "details")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {type.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {type.durationMin} min
                </p>
              </div>
              <RowActions
                ariaLabel={`Actions for ${type.name}`}
                actions={getActions(type)}
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <EntityCardField
                label="Capacity"
                value={<Badge variant="secondary">{type.capacity ?? 1}</Badge>}
              />
              <EntityCardField
                label="Padding"
                value={`${type.paddingBeforeMin ?? 0} / ${type.paddingAfterMin ?? 0} min`}
              />
              <EntityCardField
                label="Calendars"
                value={
                  <RelationshipCountBadge
                    count={type.relationshipCounts?.calendars ?? 0}
                    singular="calendar"
                  />
                }
              />
              <EntityCardField
                label="Resources"
                value={
                  <RelationshipCountBadge
                    count={type.relationshipCounts?.resources ?? 0}
                    singular="resource"
                  />
                }
              />
              <EntityCardField
                label="Appointments"
                value={
                  <RelationshipCountBadge
                    count={type.relationshipCounts?.appointments ?? 0}
                    singular="appointment"
                  />
                }
              />
              <EntityCardField
                label="Created"
                value={formatDisplayDate(type.createdAt)}
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
              <TableHead>Duration</TableHead>
              <TableHead>Padding</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Relationships</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointmentTypes.map((type) => (
              <ContextMenu key={type.id} items={getActions(type)}>
                <TableRow
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onClick={() => onOpen(type.id, "details")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(type.id, "details");
                    }
                  }}
                >
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>{type.durationMin} min</TableCell>
                  <TableCell>
                    {type.paddingBeforeMin || type.paddingAfterMin ? (
                      <span className="text-muted-foreground">
                        {type.paddingBeforeMin ?? 0} /{" "}
                        {type.paddingAfterMin ?? 0} min
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{type.capacity ?? 1}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <RelationshipCountBadge
                        count={type.relationshipCounts?.calendars ?? 0}
                        singular="calendar"
                      />
                      <RelationshipCountBadge
                        count={type.relationshipCounts?.resources ?? 0}
                        singular="resource"
                      />
                      <RelationshipCountBadge
                        count={type.relationshipCounts?.appointments ?? 0}
                        singular="appointment"
                      />
                    </div>
                  </TableCell>
                  <TableCell>{formatDisplayDate(type.createdAt)}</TableCell>
                  <TableCell>
                    <RowActions
                      ariaLabel={`Actions for ${type.name}`}
                      actions={getActions(type)}
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
