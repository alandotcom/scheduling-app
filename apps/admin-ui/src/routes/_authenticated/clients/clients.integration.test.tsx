import { describe, expect, test } from "bun:test";

type DetailTabValue = "details" | "history" | "workflows";
type AppointmentDetailTabValue = "details" | "client" | "history" | "workflows";

const isDetailTab = (value: string): value is DetailTabValue =>
  value === "details" || value === "history" || value === "workflows";

const isAppointmentDetailTab = (
  value: string,
): value is AppointmentDetailTabValue =>
  value === "details" ||
  value === "client" ||
  value === "history" ||
  value === "workflows";

const validateSearch = (
  search: Record<string, unknown>,
): {
  selected?: string;
  tab?: DetailTabValue;
  appointment?: string;
  appointmentTab?: AppointmentDetailTabValue;
} => {
  const selected =
    typeof search.selected === "string" ? search.selected : undefined;
  const rawTab = typeof search.tab === "string" ? search.tab : "";
  const tab = isDetailTab(rawTab) ? rawTab : undefined;
  const appointment =
    typeof search.appointment === "string" ? search.appointment : undefined;
  const rawAppointmentTab =
    typeof search.appointmentTab === "string" ? search.appointmentTab : "";
  const appointmentTab = isAppointmentDetailTab(rawAppointmentTab)
    ? rawAppointmentTab
    : undefined;

  return { selected, tab, appointment, appointmentTab };
};

describe("clients route validateSearch", () => {
  test("accepts client and appointment detail tabs", () => {
    const result = validateSearch({
      selected: "client-123",
      tab: "workflows",
      appointment: "apt-456",
      appointmentTab: "workflows",
    });

    expect(result.selected).toBe("client-123");
    expect(result.tab).toBe("workflows");
    expect(result.appointment).toBe("apt-456");
    expect(result.appointmentTab).toBe("workflows");
  });

  test("rejects unknown appointment tab", () => {
    const result = validateSearch({
      appointment: "apt-456",
      appointmentTab: "notes",
    });

    expect(result.appointment).toBe("apt-456");
    expect(result.appointmentTab).toBeUndefined();
  });

  test("rejects non-string appointment values", () => {
    const result = validateSearch({
      appointment: 123,
      appointmentTab: 456,
    });

    expect(result.appointment).toBeUndefined();
    expect(result.appointmentTab).toBeUndefined();
  });
});
