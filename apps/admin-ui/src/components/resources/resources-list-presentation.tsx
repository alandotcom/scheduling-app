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
import { formatDisplayDate } from "@/lib/date-utils";

interface ResourceListItem {
  id: string;
  name: string;
  quantity: number;
  locationId: string | null;
  createdAt: string | Date;
}

interface ResourcesListPresentationProps {
  resources: ResourceListItem[];
  getLocationName: (locationId: string | null | undefined) => string;
  onOpen: (resourceId: string) => void;
  onDelete: (resourceId: string) => void;
}

export function ResourcesListPresentation({
  resources,
  getLocationName,
  onOpen,
  onDelete,
}: ResourcesListPresentationProps) {
  return (
    <>
      <EntityMobileCardList>
        {resources.map((resource) => (
          <EntityMobileCard
            key={resource.id}
            onOpen={() => onOpen(resource.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {resource.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {getLocationName(resource.locationId)}
                </p>
              </div>
              <RowActions
                ariaLabel={`Actions for ${resource.name}`}
                actions={[
                  {
                    label: "Edit",
                    onClick: () => onOpen(resource.id),
                  },
                  {
                    label: "Delete",
                    onClick: () => onDelete(resource.id),
                    variant: "destructive",
                  },
                ]}
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <EntityCardField label="Quantity" value={resource.quantity} />
              <EntityCardField
                label="Created"
                value={formatDisplayDate(resource.createdAt)}
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
              <TableHead>Quantity</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((resource) => (
              <TableRow
                key={resource.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                tabIndex={0}
                onClick={() => onOpen(resource.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(resource.id);
                  }
                }}
              >
                <TableCell className="font-medium">{resource.name}</TableCell>
                <TableCell>{resource.quantity}</TableCell>
                <TableCell>{getLocationName(resource.locationId)}</TableCell>
                <TableCell>{formatDisplayDate(resource.createdAt)}</TableCell>
                <TableCell>
                  <RowActions
                    ariaLabel={`Actions for ${resource.name}`}
                    actions={[
                      {
                        label: "Edit",
                        onClick: () => onOpen(resource.id),
                      },
                      {
                        label: "Delete",
                        onClick: () => onDelete(resource.id),
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
