"use client";

import {
  useCallback,
  useId,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2, Trash2 } from "lucide-react";

import { toast } from "@/components/shared/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ANALYTICS_GOAL_METRICS,
  analyticsGoalMetricByKey,
} from "@/features/analytics/lib/goal-metrics";

type GoalRecord = {
  metricKey: string;
  targetValue: number;
};

type AnnotationRecord = {
  id: string;
  date: string;
  label: string;
  color: string | null;
};

type ReportSchedule = "daily" | "weekly" | "monthly";

type ScheduledReportRecord = {
  id: string;
  recipientEmails: string[];
  schedule: ReportSchedule;
  timezone: string;
  enabled: boolean;
  lastSentAt: string | null;
};

type ReportsData = {
  goals: GoalRecord[];
  annotations: AnnotationRecord[];
  reports: ScheduledReportRecord[];
};

const EMPTY_DATA: ReportsData = { goals: [], annotations: [], reports: [] };

const scheduleOptions: Array<{ value: ReportSchedule; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Request failed.",
    );
  }

  return payload as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/**
 * Reports sheet: the write side of goals, tracking notes, and scheduled
 * digests. Read-only cards on the Performance tab render the configured rows;
 * this sheet creates and removes them through the analytics route handlers.
 */
export function AnalyticsReportsSheet({
  businessSlug,
  recipientLimit,
  compact = false,
}: {
  businessSlug: string;
  recipientLimit: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportsData>(EMPTY_DATA);

  const [goalMetric, setGoalMetric] = useState("inquiries");
  const [goalTarget, setGoalTarget] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  const [annotationDate, setAnnotationDate] = useState("");
  const [annotationLabel, setAnnotationLabel] = useState("");
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const [recipients, setRecipients] = useState("");
  const [schedule, setSchedule] = useState<ReportSchedule>("weekly");
  const [timezone, setTimezone] = useState("");
  const [savingReport, setSavingReport] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const base = `/api/business/${businessSlug}/analytics`;
      const [goals, annotations, reports] = await Promise.all([
        fetch(`${base}/goals`).then((response) =>
          readJson<{ goals: GoalRecord[] }>(response),
        ),
        fetch(`${base}/annotations`).then((response) =>
          readJson<{ annotations: AnnotationRecord[] }>(response),
        ),
        fetch(`${base}/scheduled-reports`).then((response) =>
          readJson<{ reports: ScheduledReportRecord[] }>(response),
        ),
      ]);

      setData({
        goals: goals.goals,
        annotations: annotations.annotations,
        reports: reports.reports,
      });
    } catch (error) {
      toast.error("Could not load reports", {
        description: errorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [businessSlug]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    if (!annotationDate) {
      setAnnotationDate(new Date().toISOString().slice(0, 10));
    }
    if (!timezone) {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    void loadReports();
  }

  async function settle(message: string) {
    toast.success(message);
    router.refresh();
    await loadReports();
  }

  async function handleGoalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetValue = Number(goalTarget);

    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      toast.error("Enter a target above zero.");
      return;
    }

    setSavingGoal(true);
    try {
      await fetch(`/api/business/${businessSlug}/analytics/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricKey: goalMetric, targetValue }),
      }).then(readJson);
      setGoalTarget("");
      await settle("Goal saved.");
    } catch (error) {
      toast.error("Could not save the goal", {
        description: errorMessage(error),
      });
    } finally {
      setSavingGoal(false);
    }
  }

  async function deleteGoal(goal: GoalRecord) {
    try {
      await fetch(`/api/business/${businessSlug}/analytics/goals`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metricKey: goal.metricKey }),
      }).then(readJson);
      await settle("Goal removed.");
    } catch (error) {
      toast.error("Could not remove the goal", {
        description: errorMessage(error),
      });
    }
  }

  async function handleAnnotationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = annotationLabel.trim();

    if (!annotationDate || !label) {
      toast.error("Choose a date and enter a note.");
      return;
    }

    setSavingAnnotation(true);
    try {
      await fetch(`/api/business/${businessSlug}/analytics/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: annotationDate, label }),
      }).then(readJson);
      setAnnotationLabel("");
      await settle("Tracking note added.");
    } catch (error) {
      toast.error("Could not add the tracking note", {
        description: errorMessage(error),
      });
    } finally {
      setSavingAnnotation(false);
    }
  }

  async function deleteAnnotation(annotation: AnnotationRecord) {
    try {
      await fetch(`/api/business/${businessSlug}/analytics/annotations`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: annotation.id }),
      }).then(readJson);
      await settle("Tracking note removed.");
    } catch (error) {
      toast.error("Could not remove the tracking note", {
        description: errorMessage(error),
      });
    }
  }

  async function handleReportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipientEmails = recipients
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (recipientEmails.length === 0) {
      toast.error("Add at least one recipient email.");
      return;
    }
    if (recipientEmails.length > recipientLimit) {
      toast.error(
        `Your plan allows up to ${recipientLimit} recipient ${recipientLimit === 1 ? "email" : "emails"}.`,
      );
      return;
    }
    if (!timezone.trim()) {
      toast.error("Enter the report timezone.");
      return;
    }

    setSavingReport(true);
    try {
      await fetch(
        `/api/business/${businessSlug}/analytics/scheduled-reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmails,
            schedule,
            timezone: timezone.trim(),
          }),
        },
      ).then(readJson);
      setRecipients("");
      await settle("Scheduled report created.");
    } catch (error) {
      toast.error("Could not create the scheduled report", {
        description: errorMessage(error),
      });
    } finally {
      setSavingReport(false);
    }
  }

  async function toggleReport(report: ScheduledReportRecord) {
    try {
      await fetch(
        `/api/business/${businessSlug}/analytics/scheduled-reports`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: report.id, enabled: !report.enabled }),
        },
      ).then(readJson);
      await settle(report.enabled ? "Report paused." : "Report resumed.");
    } catch (error) {
      toast.error("Could not update the scheduled report", {
        description: errorMessage(error),
      });
    }
  }

  async function deleteReport(report: ScheduledReportRecord) {
    try {
      await fetch(
        `/api/business/${businessSlug}/analytics/scheduled-reports`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: report.id }),
        },
      ).then(readJson);
      await settle("Scheduled report removed.");
    } catch (error) {
      toast.error("Could not remove the scheduled report", {
        description: errorMessage(error),
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {compact ? (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Analytics reports"
          >
            <Settings2 className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Settings2 data-icon="inline-start" aria-hidden />
            Reports
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Analytics reports</SheetTitle>
          <SheetDescription>
            Set targets, note outside events, and email recurring digests.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-7">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading reports…
            </p>
          ) : null}

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Goals</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Measured against the selected period on the Performance tab.
              </p>
            </div>

            {data.goals.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {data.goals.map((goal) => (
                  <li
                    key={goal.metricKey}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                  >
                    <span className="min-w-0 text-sm text-foreground">
                      {analyticsGoalMetricByKey.get(goal.metricKey)?.label ??
                        goal.metricKey}
                      <span className="text-muted-foreground">
                        {" "}
                        · {goal.targetValue}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${analyticsGoalMetricByKey.get(goal.metricKey)?.label ?? goal.metricKey} goal`}
                      onClick={() => void deleteGoal(goal)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No goals set yet.</p>
            )}

            <form
              onSubmit={handleGoalSubmit}
              className="flex flex-col gap-3 rounded-md border border-border/60 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-goal-metric`}>Metric</Label>
                  <select
                    id={`${fieldId}-goal-metric`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                    value={goalMetric}
                    onChange={(event) => setGoalMetric(event.target.value)}
                  >
                    {ANALYTICS_GOAL_METRICS.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-goal-target`}>
                    Target
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      ({analyticsGoalMetricByKey.get(goalMetric)?.hint})
                    </span>
                  </Label>
                  <Input
                    id={`${fieldId}-goal-target`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="0"
                    value={goalTarget}
                    onChange={(event) => setGoalTarget(event.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                className="self-start"
                disabled={savingGoal}
              >
                {savingGoal ? (
                  <Loader2
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden
                  />
                ) : null}
                Save goal
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Tracking notes
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Mark launches, campaigns, or outages that explain a change.
              </p>
            </div>

            {data.annotations.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {data.annotations.map((annotation) => (
                  <li
                    key={annotation.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                  >
                    <span className="min-w-0 text-sm text-foreground">
                      <span className="block truncate">{annotation.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {annotation.date}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${annotation.label}`}
                      onClick={() => void deleteAnnotation(annotation)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No notes yet.</p>
            )}

            <form
              onSubmit={handleAnnotationSubmit}
              className="flex flex-col gap-3 rounded-md border border-border/60 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-annotation-date`}>Date</Label>
                  <Input
                    id={`${fieldId}-annotation-date`}
                    type="date"
                    value={annotationDate}
                    onChange={(event) => setAnnotationDate(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-annotation-label`}>Note</Label>
                  <Input
                    id={`${fieldId}-annotation-label`}
                    maxLength={200}
                    placeholder="Spring campaign launch"
                    value={annotationLabel}
                    onChange={(event) => setAnnotationLabel(event.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                className="self-start"
                disabled={savingAnnotation}
              >
                {savingAnnotation ? (
                  <Loader2
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden
                  />
                ) : null}
                Add note
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Scheduled reports
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Email the period summary to up to {recipientLimit}{" "}
                {recipientLimit === 1 ? "recipient" : "recipients"}.
              </p>
            </div>

            {data.reports.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {data.reports.map((report) => (
                  <li
                    key={report.id}
                    className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-sm text-foreground">
                        <span className="block truncate">
                          {report.recipientEmails.join(", ")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {report.schedule} · {report.timezone}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => void toggleReport(report)}
                        >
                          {report.enabled ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove scheduled report"
                          onClick={() => void deleteReport(report)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No scheduled reports yet.
              </p>
            )}

            <form
              onSubmit={handleReportSubmit}
              className="flex flex-col gap-3 rounded-md border border-border/60 p-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${fieldId}-report-recipients`}>
                  Recipients
                </Label>
                <Input
                  id={`${fieldId}-report-recipients`}
                  type="text"
                  placeholder="owner@example.com, ops@example.com"
                  value={recipients}
                  onChange={(event) => setRecipients(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple emails with commas.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-report-schedule`}>
                    Schedule
                  </Label>
                  <select
                    id={`${fieldId}-report-schedule`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
                    value={schedule}
                    onChange={(event) =>
                      setSchedule(event.target.value as ReportSchedule)
                    }
                  >
                    {scheduleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-report-timezone`}>Timezone</Label>
                  <Input
                    id={`${fieldId}-report-timezone`}
                    placeholder="America/New_York"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                className="self-start"
                disabled={savingReport}
              >
                {savingReport ? (
                  <Loader2
                    data-icon="inline-start"
                    className="animate-spin"
                    aria-hidden
                  />
                ) : null}
                Schedule report
              </Button>
            </form>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
