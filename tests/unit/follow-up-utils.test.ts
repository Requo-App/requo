import { describe, it, expect } from "vitest";

import {
  addCalendarDays,
  formatFollowUpDate,
  getBusinessDayStartInstant,
  getDateInputValue,
  getFollowUpDueBucket,
  getNextRecurrenceDueDate,
  getQuickFollowUpDueDate,
  getTodayDateStringInTimezone,
  parseFollowUpDateTimeInput,
  parseFollowUpDueDateInput,
  shouldRecur,
  zonedDateTimeToUtc,
} from "@/features/follow-ups/utils";

/**
 * A due date is a business-local calendar day, anchored at 9 AM in the
 * business timezone. The stored instant must land on that same calendar day
 * in that zone — for every zone, including the ones east of UTC+9 where the
 * naive "9 AM − offset" shortcut rolls over to the next UTC day.
 */
describe("features/follow-ups/utils — due date parsing", () => {
  const cases: Array<[string, string, string]> = [
    // timezone, input date, expected local wall clock
    ["America/New_York", "2026-01-15", "2026-01-15 09:00"],
    ["Europe/Berlin", "2026-01-15", "2026-01-15 09:00"],
    ["Asia/Tokyo", "2026-01-15", "2026-01-15 09:00"],
    ["Australia/Sydney", "2026-01-15", "2026-01-15 09:00"],
    ["Pacific/Auckland", "2026-01-15", "2026-01-15 09:00"],
    ["Pacific/Kiritimati", "2026-01-15", "2026-01-15 09:00"],
  ];

  it.each(cases)(
    "anchors 9 AM on the requested day in %s",
    (timezone, date, expected) => {
      const instant = parseFollowUpDueDateInput(date, timezone);
      const local = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(instant);

      expect(local.replace(",", "").replace(" ", " ")).toBe(
        expected.replace(" ", " "),
      );
    },
  );

  it("keeps the calendar day for zones east of UTC+9", () => {
    const instant = parseFollowUpDueDateInput("2026-01-15", "Australia/Sydney");

    // The instant is the previous UTC day, but the local day is unchanged.
    expect(instant.toISOString().slice(0, 10)).toBe("2026-01-14");
    expect(getDateInputValue(instant, "Australia/Sydney")).toBe("2026-01-15");
  });

  it("falls back to noon UTC without a timezone", () => {
    expect(parseFollowUpDueDateInput("2026-01-15").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z",
    );
  });

  it("falls back to noon UTC for an invalid timezone", () => {
    expect(
      parseFollowUpDueDateInput("2026-01-15", "Not/AZone").toISOString(),
    ).toBe("2026-01-15T12:00:00.000Z");
  });
});

describe("features/follow-ups/utils — zonedDateTimeToUtc", () => {
  it("resolves a normal wall clock", () => {
    expect(zonedDateTimeToUtc("2026-01-15", "09:00", "Europe/Berlin").toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
  });

  it("moves a wall clock across the spring-forward gap", () => {
    // 02:30 does not exist on 2026-03-08 in New York; the result must still
    // land on the same calendar day.
    const instant = zonedDateTimeToUtc("2026-03-08", "02:30", "America/New_York");
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);

    expect(localDate).toBe("2026-03-08");
  });

  it("resolves an ambiguous fall-back wall clock to the earlier offset", () => {
    const instant = zonedDateTimeToUtc("2026-11-01", "01:30", "America/New_York");
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);

    expect(local).toContain("2026-11-01");
    expect(local).toContain("01:30");
  });
});

describe("features/follow-ups/utils — due buckets", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");

  it("reads the due day in the business timezone", () => {
    // 2026-01-16 09:00 in Sydney is 2026-01-15 22:00 UTC — the same UTC day
    // but a different local day.
    const dueAt = parseFollowUpDueDateInput("2026-01-16", "Australia/Sydney");

    expect(
      getFollowUpDueBucket({ status: "pending", dueAt }, now, "Australia/Sydney"),
    ).toBe("upcoming");
  });

  it("marks a local-today due date as due today", () => {
    const dueAt = parseFollowUpDueDateInput("2026-01-15", "Australia/Sydney");

    expect(
      getFollowUpDueBucket({ status: "pending", dueAt }, now, "Australia/Sydney"),
    ).toBe("today");
  });

  it("marks a past local day as overdue", () => {
    const dueAt = parseFollowUpDueDateInput("2026-01-14", "Australia/Sydney");

    expect(
      getFollowUpDueBucket({ status: "pending", dueAt }, now, "Australia/Sydney"),
    ).toBe("overdue");
  });

  it("treats finished work as done regardless of the date", () => {
    const dueAt = parseFollowUpDueDateInput("2026-01-01", "Australia/Sydney");

    expect(
      getFollowUpDueBucket({ status: "completed", dueAt }, now, "Australia/Sydney"),
    ).toBe("done");
    expect(
      getFollowUpDueBucket({ status: "skipped", dueAt }, now, "Australia/Sydney"),
    ).toBe("done");
  });
});

describe("features/follow-ups/utils — calendar helpers", () => {
  it("builds the UTC instant of business-local midnight", () => {
    expect(
      getBusinessDayStartInstant("2026-01-15", "Australia/Sydney").toISOString(),
    ).toBe("2026-01-14T13:00:00.000Z");
    expect(
      getBusinessDayStartInstant("2026-01-15", "America/New_York").toISOString(),
    ).toBe("2026-01-15T05:00:00.000Z");
  });

  it("adds calendar days without crossing a DST boundary", () => {
    expect(addCalendarDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("derives a quick due date from the business-local today", () => {
    const now = new Date("2026-01-15T22:00:00.000Z");

    // 2026-01-15 23:00 in Sydney is already the 16th locally.
    expect(getQuickFollowUpDueDate("tomorrow", now, "Australia/Sydney")).toBe(
      "2026-01-17",
    );
    expect(getQuickFollowUpDueDate("3d", now, "Australia/Sydney")).toBe(
      "2026-01-19",
    );
  });

  it("reads today in the business timezone", () => {
    const now = new Date("2026-01-15T22:00:00.000Z");

    expect(getTodayDateStringInTimezone("Australia/Sydney", now)).toBe("2026-01-16");
    expect(getTodayDateStringInTimezone("UTC", now)).toBe("2026-01-15");
  });

  it("parses a naive business-local date and time", () => {
    const instant = parseFollowUpDateTimeInput(
      "2026-01-16T09:00",
      "Australia/Sydney",
    );

    expect(instant.toISOString()).toBe("2026-01-15T22:00:00.000Z");
  });

  it("formats a due date in the business timezone", () => {
    const dueAt = parseFollowUpDueDateInput("2026-01-15", "Australia/Sydney");

    expect(formatFollowUpDate(dueAt, "Australia/Sydney")).toBe("Jan 15, 2026");
    expect(formatFollowUpDate(dueAt, "UTC")).toBe("Jan 14, 2026");
  });

  it("formats a bare calendar date without shifting it", () => {
    // A `YYYY-MM-DD` string is a calendar date, not an instant, so it must
    // not roll back a day in a negative-offset zone.
    expect(formatFollowUpDate("2026-01-15", "America/New_York")).toBe(
      "Jan 15, 2026",
    );
    expect(formatFollowUpDate("2026-01-15", "UTC")).toBe("Jan 15, 2026");
    expect(formatFollowUpDate("2026-01-15", "Australia/Sydney")).toBe(
      "Jan 15, 2026",
    );
  });
});

describe("features/follow-ups/utils — recurrence", () => {
  it("stops repeating without a pattern", () => {
    expect(
      shouldRecur({ recurrence: "none", recurrenceCount: 0, recurrenceLimit: null }),
    ).toBe(false);
  });

  it("stops repeating once the limit is reached", () => {
    expect(
      shouldRecur({ recurrence: "weekly", recurrenceCount: 3, recurrenceLimit: 3 }),
    ).toBe(false);
    expect(
      shouldRecur({ recurrence: "weekly", recurrenceCount: 2, recurrenceLimit: 3 }),
    ).toBe(true);
  });

  it("repeats without a limit", () => {
    expect(
      shouldRecur({ recurrence: "weekly", recurrenceCount: 99, recurrenceLimit: null }),
    ).toBe(true);
  });

  it("advances the due date by the recurrence step", () => {
    const dueAt = new Date("2026-01-15T09:00:00.000Z");

    expect(getNextRecurrenceDueDate(dueAt, "daily").toISOString()).toBe(
      "2026-01-16T09:00:00.000Z",
    );
    expect(getNextRecurrenceDueDate(dueAt, "every_3_days").toISOString()).toBe(
      "2026-01-18T09:00:00.000Z",
    );
    expect(getNextRecurrenceDueDate(dueAt, "monthly").toISOString()).toBe(
      "2026-02-14T09:00:00.000Z",
    );
  });

  it("keeps the local wall clock across a DST change", () => {
    // 2026-03-22 is before the European spring-forward, 2026-03-29 after.
    const dueAt = parseFollowUpDueDateInput("2026-03-22", "Europe/Berlin");
    const next = getNextRecurrenceDueDate(dueAt, "weekly", "Europe/Berlin");

    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(next);

    // The calendar day advances by seven and the clock stays at 09:00.
    expect(local).toContain("2026-03-29");
    expect(local).toContain("09:00");
  });
});
