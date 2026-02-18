import { useEffect, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/min";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { createClientSchema } from "@scheduling/dto";
import type { CreateClientInput } from "@scheduling/dto";

import { FieldShortcutHint } from "@/components/ui/field-shortcut-hint";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { useModalFieldShortcuts } from "@/hooks/use-modal-field-shortcuts";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import { handleCtrlJkArrowNavigation } from "@/lib/keyboard-navigation";
import { formatPhoneInputAsYouType } from "@/lib/phone";

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

export interface ClientFormProps {
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
  onDraftChange?: (data: CreateClientInput) => void;
  onDiscardDraft?: () => void;
  showDiscardAction?: boolean;
}

export function ClientForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  shortcutsEnabled = true,
  onDraftChange,
  onDiscardDraft,
  showDiscardAction = false,
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

  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = watch((values) => {
      onDraftChange({
        firstName: values.firstName ?? "",
        lastName: values.lastName ?? "",
        email: values.email ?? "",
        phone: values.phone ?? "",
        phoneCountry: values.phoneCountry ?? "US",
      });
    });
    return () => subscription.unsubscribe();
  }, [onDraftChange, watch]);

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

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-1 sm:-mx-6 sm:px-6 sm:backdrop-blur sm:supports-[backdrop-filter]:bg-background/80">
        {showDiscardAction && onDiscardDraft ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDiscardDraft}
            disabled={isSubmitting}
          >
            Discard Draft
          </Button>
        ) : null}
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
