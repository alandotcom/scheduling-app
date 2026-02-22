import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import {
  Controller,
  type FieldErrors,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/min";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { createClientSchema } from "@scheduling/dto";
import type {
  CreateClientInput,
  CustomAttributeDefinitionResponse,
  CustomAttributeValues,
} from "@scheduling/dto";
import { toast } from "sonner";
import { CustomAttributeFormField } from "@/components/clients/custom-attribute-form-field";
import { DetailTab, DetailTabs } from "@/components/workbench";
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

const FOCUSABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "phoneCountry",
  "referenceId",
] as const;

type FocusableField = (typeof FOCUSABLE_FIELDS)[number];
export type ClientFormSection = "profile" | "relationships";

const isClientFormSection = (value: string): value is ClientFormSection =>
  value === "profile" || value === "relationships";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFocusableField = (value: string): value is FocusableField =>
  FOCUSABLE_FIELDS.some((field) => field === value);

const isFieldError = (value: unknown): value is { type: unknown } =>
  typeof value === "object" && value !== null && "type" in value;

const findFirstErrorPath = (
  errors: unknown,
  parentPath = "",
): string | null => {
  if (!isRecord(errors)) {
    return null;
  }

  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue;

    const nextPath = parentPath ? `${parentPath}.${key}` : key;
    if (isFieldError(value)) {
      return nextPath;
    }

    if (isRecord(value)) {
      const nestedPath = findFirstErrorPath(value, nextPath);
      if (nestedPath) {
        return nestedPath;
      }
    }
  }

  return null;
};

const getCustomAttributeFieldKeyFromErrorPath = (
  errorPath: string,
): string | null => {
  const [topLevel, fieldKey] = errorPath.split(".");
  if (topLevel !== "customAttributes" || !fieldKey) {
    return null;
  }
  return fieldKey;
};

const focusCustomAttributeField = (fieldKey: string): boolean => {
  const element = document.getElementById(`ca-${fieldKey}`);
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  element.focus();
  return true;
};

const sanitizeCustomAttributes = (
  customAttributes: CreateClientInput["customAttributes"],
): CreateClientInput["customAttributes"] => {
  if (!customAttributes) {
    return undefined;
  }

  const sanitized: CustomAttributeValues = {};

  for (const [key, value] of Object.entries(customAttributes)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

export interface ClientFormProps {
  defaultValues?: {
    id?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    phoneCountry?: string;
    customAttributes?: CustomAttributeValues;
  };
  clientRelationOptions?: Array<{ value: string; label: string }>;
  onSubmit: (data: CreateClientInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  shortcutsEnabled?: boolean;
  onDraftChange?: (data: CreateClientInput) => void;
  onDiscardDraft?: () => void;
  showDiscardAction?: boolean;
  footerStart?: ReactNode;
  disableSubmitWhenPristine?: boolean;
  formId?: string;
  showActions?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  customFieldDefinitions?: CustomAttributeDefinitionResponse[];
  onInvalidSubmit?: (errors: FieldErrors<CreateClientInput>) => void;
  forcedSection?: ClientFormSection;
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
  footerStart,
  disableSubmitWhenPristine = false,
  formId,
  showActions = true,
  onDirtyChange,
  customFieldDefinitions,
  clientRelationOptions,
  onInvalidSubmit,
  forcedSection,
}: ClientFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [countryComboboxOpen, setCountryComboboxOpen] = useState(false);
  const [activeSection, setActiveSection] =
    useState<ClientFormSection>("profile");
  const resolvedSection = forcedSection ?? activeSection;

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setFocus,
    getValues,
    formState: { errors, isDirty, submitCount },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: defaultValues?.firstName ?? "",
      lastName: defaultValues?.lastName ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      phoneCountry: defaultValues?.phoneCountry ?? "US",
      ...(defaultValues?.customAttributes
        ? { customAttributes: defaultValues.customAttributes }
        : {}),
    },
  });

  const phoneCountry = useWatch({
    control,
    name: "phoneCountry",
  });
  const draftFirstName = useWatch({
    control,
    name: "firstName",
  });
  const draftLastName = useWatch({
    control,
    name: "lastName",
  });
  const draftEmail = useWatch({
    control,
    name: "email",
  });
  const draftPhone = useWatch({
    control,
    name: "phone",
  });
  const draftPhoneCountry = phoneCountry;

  const activePhoneCountryValue = phoneCountry ?? "US";
  const activeDraftPhoneCountry = draftPhoneCountry ?? "US";
  const activePhoneCountry = isPhoneCountryCode(activePhoneCountryValue)
    ? activePhoneCountryValue
    : "US";
  const selectedCountryOption =
    PHONE_COUNTRY_OPTIONS.find(
      (option) => option.value === activePhoneCountryValue,
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

  const sortedCustomFieldDefinitions = useMemo(
    () =>
      (customFieldDefinitions ?? []).toSorted(
        (a, b) => a.displayOrder - b.displayOrder,
      ),
    [customFieldDefinitions],
  );

  const {
    relationCustomFieldDefinitions,
    nonRelationCustomFieldDefinitions,
    relationCustomFieldKeys,
  } = useMemo(() => {
    const relationDefinitions: CustomAttributeDefinitionResponse[] = [];
    const nonRelationDefinitions: CustomAttributeDefinitionResponse[] = [];
    const relationFieldKeys = new Set<string>();

    for (const definition of sortedCustomFieldDefinitions) {
      if (definition.type === "RELATION_CLIENT") {
        relationDefinitions.push(definition);
        relationFieldKeys.add(definition.fieldKey);
      } else {
        nonRelationDefinitions.push(definition);
      }
    }

    return {
      relationCustomFieldDefinitions: relationDefinitions,
      nonRelationCustomFieldDefinitions: nonRelationDefinitions,
      relationCustomFieldKeys: relationFieldKeys,
    };
  }, [sortedCustomFieldDefinitions]);

  const hasRelationCustomFields = relationCustomFieldDefinitions.length > 0;
  const profileCustomFieldDefinitions = hasRelationCustomFields
    ? nonRelationCustomFieldDefinitions
    : sortedCustomFieldDefinitions;

  useEffect(() => {
    if (forcedSection) {
      return;
    }

    if (!hasRelationCustomFields && activeSection !== "profile") {
      setActiveSection("profile");
    }
  }, [activeSection, forcedSection, hasRelationCustomFields]);

  useSubmitShortcut({
    enabled:
      shortcutsEnabled &&
      !isSubmitting &&
      (!disableSubmitWhenPristine || isDirty),
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  useEffect(() => {
    if (!onDraftChange) return;
    const timeoutId = setTimeout(() => {
      onDraftChange({
        firstName: draftFirstName ?? "",
        lastName: draftLastName ?? "",
        email: draftEmail ?? "",
        phone: draftPhone ?? "",
        phoneCountry: activeDraftPhoneCountry,
      });
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [
    activeDraftPhoneCountry,
    draftEmail,
    draftFirstName,
    draftLastName,
    draftPhone,
    onDraftChange,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleValidSubmit = (data: CreateClientInput) => {
    const sanitizedCustomAttributes = sanitizeCustomAttributes(
      data.customAttributes,
    );

    onSubmit({
      ...data,
      ...(sanitizedCustomAttributes
        ? { customAttributes: sanitizedCustomAttributes }
        : {}),
    });
  };

  const handleInvalidSubmit = (
    submitErrors: FieldErrors<CreateClientInput>,
  ) => {
    const firstErrorPath = findFirstErrorPath(submitErrors);

    if (firstErrorPath) {
      const customAttributeFieldKey =
        getCustomAttributeFieldKeyFromErrorPath(firstErrorPath);
      let nextSection: ClientFormSection | null = null;
      if (!forcedSection && hasRelationCustomFields) {
        nextSection =
          customAttributeFieldKey &&
          relationCustomFieldKeys.has(customAttributeFieldKey)
            ? "relationships"
            : "profile";
        setActiveSection(nextSection);
      }

      if (customAttributeFieldKey) {
        queueMicrotask(() => {
          if (focusCustomAttributeField(customAttributeFieldKey)) {
            return;
          }

          setTimeout(() => {
            focusCustomAttributeField(customAttributeFieldKey);
          }, 0);
        });
      }

      const topLevelField = firstErrorPath.split(".")[0] ?? "";
      if (!customAttributeFieldKey && isFocusableField(topLevelField)) {
        const shouldDelayFocus = nextSection === "profile";
        if (shouldDelayFocus) {
          queueMicrotask(() => setFocus(topLevelField));
        } else {
          setFocus(topLevelField);
        }
      }
    }

    toast.error("Please fix highlighted fields before saving");
    onInvalidSubmit?.(submitErrors);
  };

  const hasSubmitErrors = submitCount > 0 && Object.keys(errors).length > 0;

  return (
    <form
      id={formId}
      ref={formRef}
      onSubmit={handleSubmit(handleValidSubmit, handleInvalidSubmit)}
      autoComplete="off"
      className="space-y-5"
    >
      {hasRelationCustomFields && !forcedSection ? (
        <DetailTabs
          value={activeSection}
          onValueChange={(nextValue) => {
            if (!isClientFormSection(nextValue)) return;
            setActiveSection(nextValue);
          }}
          className="px-0"
        >
          <DetailTab value="profile">Profile</DetailTab>
          <DetailTab value="relationships">Relationships</DetailTab>
        </DetailTabs>
      ) : null}

      {resolvedSection === "profile" ||
      (!hasRelationCustomFields && forcedSection !== "relationships") ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div
                className="space-y-2.5 relative"
                ref={registerField("first-name")}
              >
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  autoComplete="off"
                  aria-describedby={
                    errors.firstName ? "firstName-error" : undefined
                  }
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

              <div
                className="space-y-2.5 relative"
                ref={registerField("last-name")}
              >
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Smith"
                  autoComplete="off"
                  aria-describedby={
                    errors.lastName ? "lastName-error" : undefined
                  }
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

            <div className="space-y-4">
              <div
                className="space-y-2.5 relative"
                ref={registerField("email")}
              >
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  autoComplete="off"
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
                <div
                  className="space-y-2.5 relative"
                  ref={registerField("country")}
                >
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
                                errors.phoneCountry
                                  ? "phone-country-error"
                                  : undefined
                              }
                              aria-invalid={!!errors.phoneCountry}
                              className="h-10 w-full justify-between px-3 normal-case"
                              disabled={isSubmitting}
                              onKeyDown={(event) => {
                                handleCtrlJkArrowNavigation(
                                  event,
                                  countryComboboxOpen,
                                );
                              }}
                            >
                              <span className="truncate normal-case">
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
                                handleCtrlJkArrowNavigation(
                                  event,
                                  countryComboboxOpen,
                                );
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
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm normal-case outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                                  >
                                    <span className="flex-1 truncate">
                                      {country.label}
                                    </span>
                                    <span className="text-muted-foreground">
                                      +{country.callingCode}
                                    </span>
                                    <Combobox.ItemIndicator>
                                      <Icon
                                        icon={Tick02Icon}
                                        className="size-4"
                                      />
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
                    <p
                      id="phone-country-error"
                      className="text-sm text-destructive"
                    >
                      {errors.phoneCountry.message}
                    </p>
                  )}
                  <FieldShortcutHint shortcut="c" visible={hintsVisible} />
                </div>

                <div
                  className="space-y-2.5 relative"
                  ref={registerField("phone")}
                >
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="555-555-5555"
                        aria-describedby={
                          errors.phone ? "phone-error" : undefined
                        }
                        aria-invalid={!!errors.phone}
                        value={field.value ?? ""}
                        onBlur={field.onBlur}
                        onChange={(event) => {
                          const typedValue = event.target.value;
                          const { formatted, detectedCountry } =
                            formatPhoneInputAsYouType(
                              typedValue,
                              activePhoneCountry,
                            );

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
            </div>
          </div>

          {profileCustomFieldDefinitions.length > 0 ? (
            <div className="space-y-4 border-t border-border pt-6">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Custom Fields
              </Label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-y-5">
                {profileCustomFieldDefinitions.map((definition) => (
                  <CustomAttributeFormField
                    key={definition.fieldKey}
                    definition={definition}
                    clientOptions={clientRelationOptions}
                    currentClientId={defaultValues?.id}
                    control={control}
                    disabled={isSubmitting}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {hasRelationCustomFields && resolvedSection === "relationships" ? (
        <div className="space-y-4">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Relationships
          </Label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-y-5">
            {relationCustomFieldDefinitions.map((definition) => (
              <CustomAttributeFormField
                key={definition.fieldKey}
                definition={definition}
                clientOptions={clientRelationOptions}
                currentClientId={defaultValues?.id}
                control={control}
                disabled={isSubmitting}
              />
            ))}
          </div>
        </div>
      ) : null}

      {hasSubmitErrors ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          Please review the highlighted fields and try saving again.
        </div>
      ) : null}

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {footerStart ? <div>{footerStart}</div> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {showDiscardAction && onDiscardDraft ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
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
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || (disableSubmitWhenPristine && !isDirty)}
            >
              {isSubmitting ? "Saving..." : "Save"}
              <ShortcutBadge
                shortcut="meta+enter"
                className="ml-2 hidden sm:inline-flex"
              />
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
