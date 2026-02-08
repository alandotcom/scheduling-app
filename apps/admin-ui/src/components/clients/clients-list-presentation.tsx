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
import { formatPhoneForDisplay } from "@/lib/phone";

interface ClientListItemBase {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  createdAt: string | Date;
  relationshipCounts?: {
    appointments?: number;
  } | null;
}

interface ClientsListPresentationProps<TClient extends ClientListItemBase> {
  clients: TClient[];
  onOpen: (clientId: string) => void;
  onBook: (client: TClient) => void;
  onEdit: (client: TClient) => void;
  onDelete: (clientId: string) => void;
}

export function ClientsListPresentation<TClient extends ClientListItemBase>({
  clients,
  onOpen,
  onBook,
  onEdit,
  onDelete,
}: ClientsListPresentationProps<TClient>) {
  return (
    <>
      <EntityMobileCardList>
        {clients.map((client) => {
          const formattedPhone = formatPhoneForDisplay(client.phone);
          const displayName = `${client.firstName} ${client.lastName}`;

          return (
            <EntityMobileCard key={client.id} onOpen={() => onOpen(client.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {displayName}
                  </h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {client.email ?? formattedPhone ?? "No contact details"}
                  </p>
                </div>
                <RowActions
                  ariaLabel={`Actions for ${displayName}`}
                  actions={[
                    {
                      label: "View",
                      onClick: () => onOpen(client.id),
                    },
                    {
                      label: "Book",
                      onClick: () => onBook(client),
                    },
                    {
                      label: "Edit",
                      onClick: () => onEdit(client),
                    },
                    {
                      label: "Delete",
                      onClick: () => onDelete(client.id),
                      variant: "destructive",
                    },
                  ]}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <EntityCardField
                  label="Appointments"
                  value={
                    <RelationshipCountBadge
                      count={client.relationshipCounts?.appointments ?? 0}
                      singular="appointment"
                    />
                  }
                />
                <EntityCardField
                  label="Created"
                  value={formatDisplayDate(client.createdAt)}
                />
                <EntityCardField
                  label="Email"
                  value={
                    client.email ? (
                      <span className="break-all">{client.email}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )
                  }
                  className="col-span-2"
                />
                <EntityCardField
                  label="Phone"
                  value={
                    formattedPhone ?? (
                      <span className="text-muted-foreground">-</span>
                    )
                  }
                  className="col-span-2"
                />
              </dl>
            </EntityMobileCard>
          );
        })}
      </EntityMobileCardList>

      <EntityDesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Appointments</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const formattedPhone = formatPhoneForDisplay(client.phone);
              const displayName = `${client.firstName} ${client.lastName}`;

              return (
                <TableRow
                  key={client.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onClick={() => onOpen(client.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(client.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{displayName}</TableCell>
                  <TableCell>
                    {client.email || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {formattedPhone ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RelationshipCountBadge
                      count={client.relationshipCounts?.appointments ?? 0}
                      singular="appointment"
                    />
                  </TableCell>
                  <TableCell>{formatDisplayDate(client.createdAt)}</TableCell>
                  <TableCell>
                    <RowActions
                      ariaLabel={`Actions for ${displayName}`}
                      actions={[
                        {
                          label: "View",
                          onClick: () => onOpen(client.id),
                        },
                        {
                          label: "Book",
                          onClick: () => onBook(client),
                        },
                        {
                          label: "Edit",
                          onClick: () => onEdit(client),
                        },
                        {
                          label: "Delete",
                          onClick: () => onDelete(client.id),
                          variant: "destructive",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </EntityDesktopTable>
    </>
  );
}
