import { describe, expect, test } from "bun:test";
import { createAppointmentFixture } from "@/test-utils";
import {
  getAttentionCounts,
  getDashboardStats,
  getSortedTodayAppointments,
  shouldEnableDashboardQueries,
} from "./index";

describe("dashboard data helpers", () => {
  test("maps summary values to dashboard stat cards", () => {
    const stats = getDashboardStats({
      todayAppointments: 5,
      weekAppointments: 8,
      clients: 11,
      calendars: 3,
      pendingAppointments: 2,
      noShows: 1,
    });

    expect(stats.todayCount).toBe(5);
    expect(stats.weekCount).toBe(8);
    expect(stats.clientCount).toBe(11);
    expect(stats.calendarCount).toBe(3);
  });

  test("maps pending/no-show counts from summary", () => {
    const attention = getAttentionCounts({
      todayAppointments: 0,
      weekAppointments: 0,
      clients: 0,
      calendars: 0,
      pendingAppointments: 4,
      noShows: 2,
    });

    expect(attention.pendingAppointments).toBe(4);
    expect(attention.noShows).toBe(2);
  });

  test("sorts appointments by start time without mutating input", () => {
    const early = new Date();
    early.setHours(9, 0, 0, 0);
    const late = new Date();
    late.setHours(15, 0, 0, 0);

    const unsorted = [
      createAppointmentFixture({
        id: "late",
        startAt: late,
        client: {
          id: "client-late",
          firstName: "Late",
          lastName: "Person",
          email: "late@example.com",
        },
      }),
      createAppointmentFixture({
        id: "early",
        startAt: early,
        client: {
          id: "client-early",
          firstName: "Early",
          lastName: "Person",
          email: "early@example.com",
        },
      }),
    ];

    const sorted = getSortedTodayAppointments(unsorted);

    expect(sorted.map((appointment) => appointment.id)).toEqual([
      "early",
      "late",
    ]);
    expect(unsorted.map((appointment) => appointment.id)).toEqual([
      "late",
      "early",
    ]);
  });

  test("enables dashboard queries when active organization is present", () => {
    expect(shouldEnableDashboardQueries("org-123")).toBe(true);
  });

  test("disables dashboard queries when active organization is missing", () => {
    expect(shouldEnableDashboardQueries(null)).toBe(false);
    expect(shouldEnableDashboardQueries(undefined)).toBe(false);
  });
});
