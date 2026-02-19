import {
  Add01Icon,
  ArrowDown01Icon,
  Calendar03Icon,
  Clock01Icon,
  Layers01Icon,
  Location01Icon,
  Package01Icon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { useCreateCommand } from "@/hooks/use-create-command";

export function CreateMenu() {
  const { runCreateCommand, preloadRoute } = useCreateCommand();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Icon icon={Add01Icon} data-icon="inline-start" />
            Create
            <Icon icon={ArrowDown01Icon} className="ml-1 size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuItem
          onClick={() => runCreateCommand("/appointments", "appointments")}
          onMouseEnter={() => preloadRoute("/appointments")}
        >
          <Icon icon={Clock01Icon} className="size-4" />
          Appointment
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => runCreateCommand("/clients", "clients")}
          onMouseEnter={() => preloadRoute("/clients")}
        >
          <Icon icon={UserGroup02Icon} className="size-4" />
          Client
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => runCreateCommand("/calendars", "calendars")}
          onMouseEnter={() => preloadRoute("/calendars")}
        >
          <Icon icon={Calendar03Icon} className="size-4" />
          Calendar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            runCreateCommand("/appointment-types", "appointment-types")
          }
          onMouseEnter={() => preloadRoute("/appointment-types")}
        >
          <Icon icon={Layers01Icon} className="size-4" />
          Appointment Type
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => runCreateCommand("/resources", "resources")}
          onMouseEnter={() => preloadRoute("/resources")}
        >
          <Icon icon={Package01Icon} className="size-4" />
          Resource
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => runCreateCommand("/locations", "locations")}
          onMouseEnter={() => preloadRoute("/locations")}
        >
          <Icon icon={Location01Icon} className="size-4" />
          Location
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
