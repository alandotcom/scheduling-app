// Clients management page with table list and modal-based detail/create/edit flows

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useClosingSnapshot } from "@/hooks/use-closing-snapshot";
import { DateTime } from "luxon";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/min";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight02Icon,
  Calendar03Icon,
  Delete01Icon,
  PencilEdit01Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";
import { AppointmentModal } from "@/components/appointment-modal";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DetailTab, DetailTabs } from "@/components/workbench";
import { EntityModal } from "@/components/entity-modal";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientsListPresentation } from "@/components/clients/clients-list-presentation";
import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, PageScaffold } from "@/components/layout/page-scaffold";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useCrudState } from "@/hooks/use-crud-state";
import {
  useKeyboardShortcuts,
  useListNavigation,
} from "@/hooks/use-keyboard-shortcuts";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { useUrlDrivenModal } from "@/hooks/use-url-driven-modal";
import { useValidateSelection } from "@/hooks/use-selection-search-params";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-utils";
import { handleCtrlJkArrowNavigation } from "@/lib/keyboard-navigation";
import {
  deriveCountryFromPhone,
  formatPhoneForDisplay,
  formatPhoneInputAsYouType,
} from "@/lib/phone";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";
import {
  DEFAULT_SCHEDULING_TIMEZONE_MODE,
  type SchedulingTimezoneMode,
} from "@/lib/scheduling-timezone";

type PhoneCountryOption = {
  value: CountryCode;
  label: string;
  callingCode: string;
  searchText: string;
};

const PRIORITY_PHONE_COUNTRIES: CountryCode[] = [
  "US",
  "CA",
  "GB",
  "AU",
  "DE",
  "FR",
  "IN",
];

const countryDisplayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const ALL_PHONE_COUNTRY_OPTIONS: PhoneCountryOption[] = getCountries()
  .map((country) => {
    const label = countryDisplayNames?.of(country) ?? country;
    const callingCode = getCountryCallingCode(country);
    return {
      value: country,
      label,
      callingCode,
      searchText: `${country} ${label} +${callingCode}`.toLowerCase(),
    };
  })
  .toSorted((a, b) => a.label.localeCompare(b.label));

const priorityCountrySet = new Set(PRIORITY_PHONE_COUNTRIES);
const PHONE_COUNTRY_OPTIONS: PhoneCountryOption[] = [
  ...PRIORITY_PHONE_COUNTRIES.map((country) =>
    ALL_PHONE_COUNTRY_OPTIONS.find((option) => option.value === country),
  ).filter((option): option is PhoneCountryOption => !!option),
  ...ALL_PHONE_COUNTRY_OPTIONS.filter(
    (option) => !priorityCountrySet.has(option.value),
  ),
];
const isPhoneCountryCode = (value: string): value is CountryCode =>
  PHONE_COUNTRY_OPTIONS.some((option) => option.value === value);

interface ClientFormProps {
  defaultValues?: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    phoneCountry?: string;
  };
  onSubmit: (data: CreateClientInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  shortcutsEnabled?: boolean;
}

function ClientForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  shortcutsEnabled = true,
}: ClientFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [countryComboboxOpen, setCountryComboboxOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: defaultValues?.firstName ?? "",
      lastName: defaultValues?.lastName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      phoneCountry: defaultValues?.phoneCountry ?? "US",
    },
  });

  const phoneCountry = watch("phoneCountry") ?? "US";
  const activePhoneCountry = isPhoneCountryCode(phoneCountry)
    ? phoneCountry
    : "US";
  const selectedCountryOption =
    PHONE_COUNTRY_OPTIONS.find(
      (option) => option.value === activePhoneCountry,
    ) ?? PHONE_COUNTRY_OPTIONS.find((option) => option.value === "US");

  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: shortcutsEnabled,
    fields: [
      { id: "first-name", key: "f", description: "Focus first name" },
      { id: "last-name", key: "l", description: "Focus last name" },
      { id: "email", key: "e", description: "Focus email" },
      {
        id: "country",
        key: "c",
        description: "Focus country",
        openOnFocus: true,
      },
      { id: "phone", key: "p", description: "Focus phone" },
    ],
  });

  useSubmitShortcut({
    enabled: shortcutsEnabled && !isSubmitting,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2.5 relative" ref={registerField("first-name")}>
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            placeholder="John"
            aria-describedby={errors.firstName ? "firstName-error" : undefined}
            aria-invalid={!!errors.firstName}
            {...register("firstName")}
            disabled={isSubmitting}
          />
          {errors.firstName && (
            <p id="firstName-error" className="text-sm text-destructive">
              {errors.firstName.message}
            </p>
          )}
          <FieldShortcutHint shortcut="f" visible={hintsVisible} />
        </div>

        <div className="space-y-2.5 relative" ref={registerField("last-name")}>
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            placeholder="Smith"
            aria-describedby={errors.lastName ? "lastName-error" : undefined}
            aria-invalid={!!errors.lastName}
            {...register("lastName")}
            disabled={isSubmitting}
          />
          {errors.lastName && (
            <p id="lastName-error" className="text-sm text-destructive">
              {errors.lastName.message}
            </p>
          )}
          <FieldShortcutHint shortcut="l" visible={hintsVisible} />
        </div>
      </div>

      <div className="space-y-2.5 relative" ref={registerField("email")}>
        <Label htmlFor="email">Email (optional)</Label>
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          aria-describedby={errors.email ? "email-error" : undefined}
          aria-invalid={!!errors.email}
          {...register("email")}
          disabled={isSubmitting}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
        <FieldShortcutHint shortcut="e" visible={hintsVisible} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-2.5 relative" ref={registerField("country")}>
          <Label htmlFor="phoneCountry">Country</Label>
          <Controller
            name="phoneCountry"
            control={control}
            render={({ field }) => (
              <Combobox.Root
                items={PHONE_COUNTRY_OPTIONS}
                value={selectedCountryOption ?? null}
                open={countryComboboxOpen}
                itemToStringLabel={(item) => item.label}
                itemToStringValue={(item) => item.value}
                isItemEqualToValue={(item, selected) =>
                  item.value === selected.value
                }
                onOpenChange={(open) => {
                  setCountryComboboxOpen(open);
                }}
                onValueChange={(nextCountry) => {
                  if (!nextCountry) return;

                  field.onChange(nextCountry.value);

                  const currentPhone = getValues("phone") ?? "";
                  if (!currentPhone.startsWith("+")) {
                    const { formatted } = formatPhoneInputAsYouType(
                      currentPhone,
                      nextCountry.value,
                    );
                    setValue("phone", formatted, {
                      shouldDirty: true,
                      shouldValidate: !!errors.phone,
                    });
                  }
                }}
              >
                <Combobox.Trigger
                  render={
                    <Button
                      id="phoneCountry"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryComboboxOpen}
                      aria-describedby={
                        errors.phoneCountry ? "phone-country-error" : undefined
                      }
                      aria-invalid={!!errors.phoneCountry}
                      className="h-10 w-full justify-between px-3"
                      disabled={isSubmitting}
                      onKeyDown={(event) => {
                        handleCtrlJkArrowNavigation(event, countryComboboxOpen);
                      }}
                    >
                      <span className="truncate">
                        {selectedCountryOption
                          ? `${selectedCountryOption.label} (+${selectedCountryOption.callingCode})`
                          : "Select country"}
                      </span>
                      <Icon icon={ArrowDown01Icon} className="size-4" />
                    </Button>
                  }
                />
                <Combobox.Portal keepMounted>
                  <Combobox.Positioner
                    positionMethod="fixed"
                    disableAnchorTracking
                    sideOffset={6}
                    align="start"
                    className="z-[90]"
                  >
                    <Combobox.Popup
                      className="w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-background shadow-lg"
                      onKeyDown={(event) => {
                        handleCtrlJkArrowNavigation(event, countryComboboxOpen);
                      }}
                    >
                      <div className="border-b border-border px-3 py-1">
                        <Combobox.Input
                          placeholder="Search country or dialing code..."
                          className="h-9 w-full border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
                          onKeyDown={(event) => {
                            handleCtrlJkArrowNavigation(
                              event,
                              countryComboboxOpen,
                            );
                          }}
                        />
                      </div>
                      <Combobox.Empty className="px-3 py-3 text-sm text-muted-foreground">
                        No countries found.
                      </Combobox.Empty>
                      <Combobox.List className="max-h-72 overflow-y-auto p-1">
                        {(country: PhoneCountryOption) => (
                          <Combobox.Item
                            key={country.value}
                            value={country}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                          >
                            <span className="flex-1 truncate">
                              {country.label}
                            </span>
                            <span className="text-muted-foreground">
                              +{country.callingCode}
                            </span>
                            <Combobox.ItemIndicator>
                              <Icon icon={Tick02Icon} className="size-4" />
                            </Combobox.ItemIndicator>
                          </Combobox.Item>
                        )}
                      </Combobox.List>
                    </Combobox.Popup>
                  </Combobox.Positioner>
                </Combobox.Portal>
              </Combobox.Root>
            )}
          />
          {errors.phoneCountry && (
            <p id="phone-country-error" className="text-sm text-destructive">
              {errors.phoneCountry.message}
            </p>
          )}
          <FieldShortcutHint shortcut="c" visible={hintsVisible} />
        </div>

        <div className="space-y-2.5 relative" ref={registerField("phone")}>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <Input
                id="phone"
                type="tel"
                placeholder="555-555-5555"
                aria-describedby={errors.phone ? "phone-error" : undefined}
                aria-invalid={!!errors.phone}
                value={field.value ?? ""}
                onBlur={field.onBlur}
                onChange={(event) => {
                  const typedValue = event.target.value;
                  const { formatted, detectedCountry } =
                    formatPhoneInputAsYouType(typedValue, activePhoneCountry);

                  field.onChange(formatted);

                  if (
                    typedValue.trim().startsWith("+") &&
                    detectedCountry &&
                    detectedCountry !== activePhoneCountry
                  ) {
                    setValue("phoneCountry", detectedCountry, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }
                }}
                disabled={isSubmitting}
              />
            )}
          />
          {errors.phone && (
            <p id="phone-error" className="text-sm text-destructive">
              {errors.phone.message}
            </p>
          )}
          <FieldShortcutHint shortcut="p" visible={hintsVisible} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-1 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <Button
          type="button"
          variant="outline"
          className="hover:translate-y-0"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="hover:translate-y-0"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save"}
          <ShortcutBadge
            shortcut="meta+enter"
            className="ml-2 hidden sm:inline-flex"
          />
        </Button>
      </div>
    </form>
  );
}

type DetailTabValue = "details" | "history";
type AppointmentDetailTabValue = "details" | "client" | "history";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "history";
const isAppointmentDetailTab = (
  value: string,
): value is AppointmentDetailTabValue =>
  value === "details" || value === "client" || value === "history";

function ClientsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { selected, tab, appointment, appointmentTab, create } =
    Route.useSearch();
  const selectedId = selected ?? null;
  const activeTab: DetailTabValue = tab && isDetailTab(tab) ? tab : "details";
  const selectedAppointmentId = appointment ?? null;
  const activeAppointmentTab: AppointmentDetailTabValue =
    appointmentTab && isAppointmentDetailTab(appointmentTab)
      ? appointmentTab
      : "details";

  const [search, setSearch] = useState("");
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentModalClientPrefill, setAppointmentModalClientPrefill] =
    useState<{ id: string; name: string } | null>(null);
  const [appointmentTimezoneMode, setAppointmentTimezoneMode] =
    useState<SchedulingTimezoneMode>(DEFAULT_SCHEDULING_TIMEZONE_MODE);

  const { data, isLoading, isFetching, error } = useQuery({
    ...orpc.clients.list.queryOptions({
      input: { search: search || undefined, limit: 100 },
    }),
    placeholderData: (previous) => previous,
  });

  type ClientItem = NonNullable<typeof data>["items"][number];

  const crud = useCrudState<ClientItem>();

  useEffect(() => {
    if (create !== "1") return;
    crud.openCreate();
    navigate({
      search: (prev) => ({
        ...prev,
        create: undefined,
      }),
      replace: true,
    });
  }, [create, crud, navigate]);

  const clients = data?.items ?? [];
  const isSelectionDataResolved = !isLoading && !isFetching && !error;
  const selectedClient =
    clients.find((client) => client.id === selectedId) ?? null;
  const displayClient = useClosingSnapshot(selectedClient ?? undefined);
  const { isOpen: detailModalOpen, closeNow: closeDetailModalNow } =
    useUrlDrivenModal({
      selectedId,
      hasResolvedEntity: !!selectedClient,
    });

  const openDetails = useCallback(
    (clientId: string, nextTab: DetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: clientId,
          tab: nextTab,
          appointment: undefined,
          appointmentTab: undefined,
        }),
      });
    },
    [navigate],
  );

  const clearDetails = useCallback(() => {
    closeDetailModalNow();
    navigate({
      search: (prev) => ({
        ...prev,
        selected: undefined,
        tab: undefined,
        appointment: undefined,
        appointmentTab: undefined,
      }),
      replace: true,
    });
  }, [closeDetailModalNow, navigate]);

  const setActiveTab = useCallback(
    (value: string) => {
      if (!selectedId || !isDetailTab(value)) return;
      navigate({
        search: (prev) => ({
          ...prev,
          tab: value,
        }),
      });
    },
    [navigate, selectedId],
  );

  const openAppointmentDetails = useCallback(
    (appointmentId: string, nextTab: AppointmentDetailTabValue = "details") => {
      navigate({
        search: (prev) => ({
          ...prev,
          tab: "history",
          appointment: appointmentId,
          appointmentTab: nextTab,
        }),
      });
    },
    [navigate],
  );

  const clearSelectedAppointment = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        appointment: undefined,
        appointmentTab: undefined,
      }),
      replace: true,
    });
  }, [navigate]);

  const openClientFromAppointment = useCallback(
    (clientId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          selected: clientId,
          tab: "details",
          appointment: undefined,
          appointmentTab: undefined,
        }),
      });
    },
    [navigate],
  );

  const setActiveAppointmentTab = useCallback(
    (value: AppointmentDetailTabValue) => {
      if (!selectedAppointmentId) return;
      navigate({
        search: (prev) => ({
          ...prev,
          appointmentTab: value,
        }),
      });
    },
    [navigate, selectedAppointmentId],
  );

  useValidateSelection({
    items: clients,
    selectedId,
    isDataResolved: isSelectionDataResolved,
    onInvalidSelection: clearDetails,
  });

  const selectedIndex = selectedId
    ? clients.findIndex((client) => client.id === selectedId)
    : -1;

  useListNavigation({
    items: clients,
    selectedIndex,
    onSelect: (index) => {
      const client = clients[index];
      if (client) openDetails(client.id);
    },
    onOpen: (client) => openDetails(client.id),
    enabled:
      clients.length > 0 &&
      !crud.showCreateForm &&
      !detailModalOpen &&
      !appointmentModalOpen,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "c",
        action: crud.openCreate,
        description: "Create client",
      },
      {
        key: "escape",
        action: clearDetails,
        description: "Close details",
        ignoreInputs: false,
      },
    ],
    enabled: !crud.showCreateForm && !detailModalOpen && !appointmentModalOpen,
  });

  const createMutation = useMutation(
    orpc.clients.create.mutationOptions({
      onSuccess: (createdClient) => {
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        setSearch("");
        crud.closeCreate();
        navigate({
          search: (prev) => ({
            ...prev,
            selected: createdClient.id,
            tab: "details",
            appointment: undefined,
            appointmentTab: undefined,
          }),
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create client");
      },
    }),
  );

  const updateMutation = useMutation(
    orpc.clients.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        crud.closeEdit();
        toast.success("Client updated successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update client");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.clients.remove.mutationOptions({
      onSuccess: () => {
        if (crud.deletingItemId && crud.deletingItemId === selectedId) {
          clearDetails();
        }
        queryClient.invalidateQueries({ queryKey: orpc.clients.key() });
        crud.closeDelete();
        toast.success("Client deleted successfully");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete client");
      },
    }),
  );

  const handleCreate = (formData: CreateClientInput) => {
    createMutation.mutate(formData);
  };

  const handleUpdate = (formData: CreateClientInput) => {
    if (!crud.editingItem) return;
    updateMutation.mutate({
      id: crud.editingItem.id,
      data: formData,
    });
  };

  const handleDelete = () => {
    if (!crud.deletingItemId) return;
    deleteMutation.mutate({ id: crud.deletingItemId });
  };

  const handleBookAppointment = useCallback((client: ClientItem) => {
    setAppointmentModalClientPrefill({
      id: client.id,
      name: `${client.firstName} ${client.lastName}`,
    });
    setAppointmentModalOpen(true);
  }, []);

  const handleAppointmentCreated = useCallback(
    (appointmentId: string) => {
      navigate({
        to: "/appointments",
        search: {
          selected: appointmentId,
          tab: "details",
        },
      });
    },
    [navigate],
  );

  const { data: appointmentsData, isLoading: isLoadingAppointments } = useQuery(
    {
      ...orpc.appointments.list.queryOptions({
        input: { clientId: selectedId ?? "", limit: 20 },
      }),
      enabled:
        !!selectedId && (activeTab === "history" || !!selectedAppointmentId),
    },
  );

  const appointments = appointmentsData?.items ?? [];
  const selectedAppointmentFromList =
    appointments.find((apt) => apt.id === selectedAppointmentId) ?? null;
  const { data: selectedAppointmentFromGet, isLoading: isLoadingAppointment } =
    useQuery({
      ...orpc.appointments.get.queryOptions({
        input: { id: selectedAppointmentId ?? "" },
      }),
      enabled: !!selectedAppointmentId && !selectedAppointmentFromList,
    });
  const selectedAppointment =
    selectedAppointmentFromList ?? selectedAppointmentFromGet ?? null;
  const displayAppointment = selectedAppointmentId ? selectedAppointment : null;
  const isAppointmentDetailOpen = !!selectedAppointmentId;
  const appointmentDisplayTimezone =
    displayAppointment?.calendar?.timezone ??
    displayAppointment?.timezone ??
    "America/New_York";

  const { upcomingAppointments, pastAppointments } = useMemo(() => {
    const now = DateTime.now();
    const toDateTime = (value: string | Date) =>
      typeof value === "string"
        ? DateTime.fromISO(value, { setZone: true })
        : DateTime.fromJSDate(value);

    return {
      upcomingAppointments: appointments.filter(
        (apt) => toDateTime(apt.startAt) >= now && apt.status !== "cancelled",
      ),
      pastAppointments: appointments.filter(
        (apt) => toDateTime(apt.startAt) < now || apt.status === "cancelled",
      ),
    };
  }, [appointments]);

  return (
    <PageScaffold>
      <PageHeader
        title="Clients"
        description="Manage client records and contact information"
        actions={
          <Button onClick={crud.openCreate}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Client</span>
            <span className="sm:hidden">Add</span>
            <ShortcutBadge
              shortcut="c"
              className="ml-2 hidden md:inline-flex"
            />
          </Button>
        }
      />

      <div className="mt-6 space-y-6">
        <div className="max-w-sm">
          <div className="relative">
            <Icon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          {isLoading ? (
            <EntityListLoadingState rows={5} cols={6} />
          ) : error ? (
            <div className="py-10 text-center text-destructive">
              Error loading clients
            </div>
          ) : !clients.length ? (
            <EntityListEmptyState>
              {search
                ? "No clients found matching your search."
                : "No clients yet. Create your first client to get started."}
            </EntityListEmptyState>
          ) : (
            <ClientsListPresentation
              clients={clients}
              onOpen={openDetails}
              onBook={handleBookAppointment}
              onEdit={crud.openEdit}
              onDelete={crud.openDelete}
            />
          )}
        </div>
      </div>

      <EntityModal
        open={detailModalOpen && !!displayClient}
        onOpenChange={(open) => {
          if (!open) clearDetails();
        }}
        title={
          isAppointmentDetailOpen
            ? (displayAppointment?.appointmentType?.name ?? "Appointment")
            : displayClient
              ? `${displayClient.firstName} ${displayClient.lastName}`
              : ""
        }
        description={
          isAppointmentDetailOpen && displayAppointment
            ? formatDisplayDate(
                displayAppointment.startAt,
                appointmentDisplayTimezone,
              )
            : !isAppointmentDetailOpen
              ? (displayClient?.email ??
                formatPhoneForDisplay(displayClient?.phone) ??
                undefined)
              : undefined
        }
        className={
          displayAppointment
            ? "sm:h-[min(94dvh,60rem)] sm:min-h-[42rem]"
            : undefined
        }
      >
        {displayClient ? (
          <div className="flex h-full min-h-0 flex-col">
            {isAppointmentDetailOpen ? (
              <div className="min-h-0 flex-1">
                <AppointmentDetail
                  appointment={displayAppointment}
                  displayTimezone={appointmentDisplayTimezone}
                  timezoneMode={appointmentTimezoneMode}
                  onTimezoneModeChange={setAppointmentTimezoneMode}
                  activeTab={activeAppointmentTab}
                  onTabChange={(tabValue) => setActiveAppointmentTab(tabValue)}
                  onOpenClient={openClientFromAppointment}
                  isLoading={isLoadingAppointment}
                  showHeader={false}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                <div className="space-y-4">
                  <DetailTabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="px-0"
                  >
                    <DetailTab value="details">Details</DetailTab>
                    <DetailTab value="history">History</DetailTab>
                  </DetailTabs>

                  <div className="space-y-6">
                    {activeTab === "details" ? (
                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Created
                          </Label>
                          <p className="mt-1 text-sm">
                            {formatDisplayDate(displayClient.createdAt)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Email
                          </Label>
                          <p className="mt-1 text-sm">
                            {displayClient.email ?? (
                              <span className="text-muted-foreground">
                                Not set
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Phone
                          </Label>
                          <p className="mt-1 text-sm">
                            {formatPhoneForDisplay(displayClient.phone) ?? (
                              <span className="text-muted-foreground">
                                Not set
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Total Appointments
                          </Label>
                          <p className="mt-1 text-sm">
                            {displayClient.relationshipCounts?.appointments ??
                              0}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {isLoadingAppointments ? (
                          <div className="py-6 text-center text-muted-foreground">
                            Loading appointments...
                          </div>
                        ) : (
                          <>
                            <div>
                              <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Upcoming
                              </h3>
                              {upcomingAppointments.length === 0 ? (
                                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                  No upcoming appointments
                                </div>
                              ) : (
                                <div className="divide-y divide-border/50 rounded-lg border border-border">
                                  {upcomingAppointments.map((apt) => (
                                    <button
                                      key={apt.id}
                                      type="button"
                                      className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      onClick={() =>
                                        openAppointmentDetails(apt.id)
                                      }
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium">
                                            {formatDisplayDateTime(apt.startAt)}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {apt.appointmentType?.name}
                                            {apt.calendar &&
                                              ` - ${apt.calendar.name}`}
                                          </div>
                                        </div>
                                        <Badge
                                          variant={
                                            apt.status === "confirmed"
                                              ? "success"
                                              : "secondary"
                                          }
                                        >
                                          {apt.status}
                                        </Badge>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                  Past
                                </h3>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link
                                    to="/appointments"
                                    search={{ clientId: displayClient.id }}
                                  >
                                    View all
                                    <Icon
                                      icon={ArrowRight02Icon}
                                      data-icon="inline-end"
                                    />
                                  </Link>
                                </Button>
                              </div>
                              {pastAppointments.length === 0 ? (
                                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                  No past appointments
                                </div>
                              ) : (
                                <div className="divide-y divide-border/50 rounded-lg border border-border">
                                  {pastAppointments.slice(0, 5).map((apt) => (
                                    <button
                                      key={apt.id}
                                      type="button"
                                      className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      onClick={() =>
                                        openAppointmentDetails(apt.id)
                                      }
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium">
                                            {formatDisplayDateTime(apt.startAt)}
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {apt.appointmentType?.name}
                                          </div>
                                        </div>
                                        <Badge
                                          variant={
                                            apt.status === "confirmed"
                                              ? "success"
                                              : apt.status === "cancelled" ||
                                                  apt.status === "no_show"
                                                ? "destructive"
                                                : "secondary"
                                          }
                                        >
                                          {apt.status === "no_show"
                                            ? "No Show"
                                            : apt.status}
                                        </Badge>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-6">
              {isAppointmentDetailOpen ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearSelectedAppointment}
                >
                  <Icon
                    icon={ArrowRight02Icon}
                    data-icon="inline-start"
                    className="rotate-180"
                  />
                  Back to client
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => crud.openDelete(displayClient.id)}
                  >
                    <Icon icon={Delete01Icon} data-icon="inline-start" />
                    Delete Client
                  </Button>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        clearDetails();
                        handleBookAppointment(displayClient);
                      }}
                    >
                      <Icon icon={Calendar03Icon} data-icon="inline-start" />
                      Book
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        clearDetails();
                        crud.openEdit(displayClient);
                      }}
                    >
                      <Icon icon={PencilEdit01Icon} data-icon="inline-start" />
                      Edit
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </EntityModal>

      <EntityModal
        open={crud.showCreateForm}
        onOpenChange={(open) => {
          if (!open) crud.closeCreate();
        }}
        title="New Client"
      >
        <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <ClientForm
            onSubmit={handleCreate}
            onCancel={crud.closeCreate}
            isSubmitting={createMutation.isPending}
            shortcutsEnabled={crud.showCreateForm}
          />
        </div>
      </EntityModal>

      <EntityModal
        open={!!crud.editingItem}
        onOpenChange={(open) => {
          if (!open) crud.closeEdit();
        }}
        title="Edit Client"
      >
        {crud.editingItem ? (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <ClientForm
              defaultValues={{
                firstName: crud.editingItem.firstName,
                lastName: crud.editingItem.lastName,
                email: crud.editingItem.email ?? undefined,
                phone:
                  formatPhoneForDisplay(crud.editingItem.phone) ?? undefined,
                phoneCountry:
                  deriveCountryFromPhone(crud.editingItem.phone) ?? "US",
              }}
              onSubmit={handleUpdate}
              onCancel={crud.closeEdit}
              isSubmitting={updateMutation.isPending}
              shortcutsEnabled={!!crud.editingItem}
            />
          </div>
        ) : null}
      </EntityModal>

      <AppointmentModal
        open={appointmentModalOpen}
        onOpenChange={(nextOpen) => {
          setAppointmentModalOpen(nextOpen);
          if (!nextOpen) {
            setAppointmentModalClientPrefill(null);
          }
        }}
        defaultClientId={appointmentModalClientPrefill?.id}
        defaultClientName={appointmentModalClientPrefill?.name}
        onCreated={handleAppointmentCreated}
      />

      <DeleteConfirmDialog
        open={!!crud.deletingItemId}
        onOpenChange={crud.closeDelete}
        onConfirm={handleDelete}
        title="Delete Client"
        description="Are you sure you want to delete this client? This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/clients")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    create?: "1";
    selected?: string;
    tab?: DetailTabValue;
    appointment?: string;
    appointmentTab?: AppointmentDetailTabValue;
  } => {
    const create = search.create === "1" ? "1" : undefined;
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    const appointment =
      typeof search.appointment === "string" ? search.appointment : undefined;
    const rawAppointmentTab =
      typeof search.appointmentTab === "string" ? search.appointmentTab : "";
    const parsedAppointmentTab = isAppointmentDetailTab(rawAppointmentTab)
      ? rawAppointmentTab
      : undefined;
    return {
      create,
      selected,
      tab,
      appointment,
      appointmentTab: parsedAppointmentTab,
    };
  },
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      queryClient.ensureQueryData(
        orpc.clients.list.queryOptions({
          input: { limit: 100 },
        }),
      ),
    );
  },
  component: ClientsPage,
});
