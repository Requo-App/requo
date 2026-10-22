"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Package, Plus, Square, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImporterPlanContext } from "@/features/importer/types";
import { cn } from "@/lib/utils";

export type QuoteLibraryLineDraft = {
  draftId: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
};

export type QuoteLibraryDraft = {
  draftId: string;
  kind: "block" | "package";
  name: string;
  description: string;
  items: QuoteLibraryLineDraft[];
};

type ImporterQuoteLibraryReviewProps = {
  entries: QuoteLibraryDraft[];
  onChange: (entries: QuoteLibraryDraft[]) => void;
  sourceName: string;
  warnings: string[];
  planContext: ImporterPlanContext;
  overLimitNonce: number;
};

export function ImporterQuoteLibraryReview({
  entries,
  onChange,
  sourceName,
  warnings,
  planContext,
  overLimitNonce,
}: ImporterQuoteLibraryReviewProps) {
  const { existingCount, limit } = planContext;
  const selectedCount = entries.length;
  const totalAfterImport = existingCount + selectedCount;
  const overBy = limit === null ? 0 : Math.max(0, totalAfterImport - limit);
  const isOverLimit = overBy > 0;

  const overLimitIndexes = useMemo(() => {
    if (overBy === 0) return new Set<number>();

    const set = new Set<number>();

    for (let i = entries.length - overBy; i < entries.length; i += 1) {
      if (i >= 0) set.add(i);
    }

    return set;
  }, [entries.length, overBy]);

  const lastEntryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOverLimit || overLimitNonce === 0) return;

    lastEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [overLimitNonce, isOverLimit]);

  function updateEntry(draftId: string, patch: Partial<QuoteLibraryDraft>) {
    onChange(
      entries.map((entry) => (entry.draftId === draftId ? normaliseEntry({ ...entry, ...patch }) : entry)),
    );
  }

  function removeEntry(draftId: string) {
    onChange(entries.filter((entry) => entry.draftId !== draftId));
  }

  function updateLineItem(
    entryDraftId: string,
    itemDraftId: string,
    patch: Partial<QuoteLibraryLineDraft>,
  ) {
    onChange(
      entries.map((entry) =>
        entry.draftId !== entryDraftId
          ? entry
          : normaliseEntry({
              ...entry,
              items: entry.items.map((item) =>
                item.draftId === itemDraftId ? { ...item, ...patch } : item,
              ),
            }),
      ),
    );
  }

  function removeLineItem(entryDraftId: string, itemDraftId: string) {
    onChange(
      entries
        .map((entry) =>
          entry.draftId !== entryDraftId
            ? entry
            : normaliseEntry({
                ...entry,
                items: entry.items.filter((item) => item.draftId !== itemDraftId),
              }),
        )
        .filter((entry) => entry.items.length > 0),
    );
  }

  function addLineItem(entryDraftId: string) {
    onChange(
      entries.map((entry) =>
        entry.draftId !== entryDraftId
          ? entry
          : normaliseEntry({
              ...entry,
              items: [
                ...entry.items,
                {
                  draftId: `new_${Math.random().toString(36).slice(2, 8)}`,
                  description: "",
                  quantity: 1,
                  unitPriceInCents: 0,
                },
              ],
            }),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          AI extracted {entries.length} quote library{" "}
          {entries.length === 1 ? "entry" : "entries"} from{" "}
          <span className="font-medium text-foreground">{sourceName}</span>. Review prices
          carefully. Anything wrong? Edit it or remove it before importing.
        </p>
        <p className="text-xs text-muted-foreground">
          You currently have {existingCount} saved{" "}
          {limit === null ? (
            "(unlimited on your plan)"
          ) : (
            <>
              of <span className="font-medium text-foreground">{limit}</span> allowed by your plan
            </>
          )}
          {selectedCount > 0
            ? `. After this import you would have ${totalAfterImport}.`
            : "."}
        </p>
      </div>

      {isOverLimit ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {overBy} entr{overBy === 1 ? "y" : "ies"} over your plan limit
          </AlertTitle>
          <AlertDescription>
            Remove the highlighted {overBy === 1 ? "entry" : "entries"} at the bottom of the list,
            or upgrade your plan to import all of them.
          </AlertDescription>
        </Alert>
      ) : null}

      {warnings.length ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {entries.length ? (
        <div className="flex flex-col gap-4">
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            const isOver = overLimitIndexes.has(index);

            return (
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-lg border bg-card px-4 py-4 transition-[border-color,background-color] duration-300",
                  isOver
                    ? "border-destructive/70 bg-destructive/5 ring-1 ring-destructive/30"
                    : "border-border/70",
                )}
                key={entry.draftId}
                ref={isLast ? lastEntryRef : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs font-medium uppercase tracking-wide",
                        isOver ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      Entry {index + 1}
                      {isOver ? " — over plan limit" : ""}
                    </span>
                    <Badge variant="secondary">
                      {entry.kind === "block" ? (
                        <>
                          <Square data-icon="inline-start" />
                          Quote library block
                        </>
                      ) : (
                        <>
                          <Package data-icon="inline-start" />
                          Service package
                        </>
                      )}
                    </Badge>
                  </div>
                  <Button
                    aria-label="Remove this entry"
                    onClick={() => removeEntry(entry.draftId)}
                    size="icon-sm"
                    type="button"
                    variant={isOver ? "destructive" : "ghost"}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <Input
                      maxLength={120}
                      onChange={(event) =>
                        updateEntry(entry.draftId, { name: event.target.value })
                      }
                      placeholder="Short name"
                      value={entry.name}
                    />
                  </FieldContent>
                </Field>

                <Field>
                  <FieldLabel>Description (optional)</FieldLabel>
                  <FieldContent>
                    <Textarea
                      maxLength={600}
                      onChange={(event) =>
                        updateEntry(entry.draftId, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Optional description"
                      rows={2}
                      value={entry.description}
                    />
                  </FieldContent>
                </Field>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Line items
                    </span>
                    <Button
                      onClick={() => addLineItem(entry.draftId)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus data-icon="inline-start" />
                      Add line
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {entry.items.map((item, itemIndex) => (
                      <LineItemRow
                        item={item}
                        key={item.draftId}
                        onChange={(patch) =>
                          updateLineItem(entry.draftId, item.draftId, patch)
                        }
                        onRemove={() => removeLineItem(entry.draftId, item.draftId)}
                        position={itemIndex + 1}
                        showRemove={entry.items.length > 1}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/80 px-6 py-10 text-center text-sm text-muted-foreground">
          All entries removed. Go back to pick a different file.
        </div>
      )}
    </div>
  );
}

/**
 * Keep `kind` consistent with item count — a single-item entry is always a block,
 * and multi-item entries are always packages. This mirrors the validation rule
 * in quote-library-schemas.ts so commits don't fail server-side.
 */
function normaliseEntry(entry: QuoteLibraryDraft): QuoteLibraryDraft {
  const kind: "block" | "package" = entry.items.length === 1 ? "block" : "package";

  return { ...entry, kind };
}

function LineItemRow({
  item,
  onChange,
  onRemove,
  position,
  showRemove,
}: {
  item: QuoteLibraryLineDraft;
  onChange: (patch: Partial<QuoteLibraryLineDraft>) => void;
  onRemove: () => void;
  position: number;
  showRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-3 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
      <Field>
        <FieldLabel className="text-xs">Description #{position}</FieldLabel>
        <FieldContent>
          <Input
            maxLength={400}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="Line item description"
            value={item.description}
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel className="text-xs">Qty</FieldLabel>
        <FieldContent>
          <Input
            inputMode="numeric"
            min={1}
            onChange={(event) =>
              onChange({ quantity: clampInt(event.target.value, 1, 100_000, 1) })
            }
            type="number"
            value={item.quantity}
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel className="text-xs">Unit price</FieldLabel>
        <FieldContent>
          <Input
            inputMode="decimal"
            onChange={(event) =>
              onChange({ unitPriceInCents: parseMoneyInput(event.target.value) })
            }
            placeholder="0.00"
            type="text"
            value={centsToString(item.unitPriceInCents)}
          />
        </FieldContent>
      </Field>

      {showRemove ? (
        <Button
          aria-label="Remove this line"
          className="mb-0.5"
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <span aria-hidden="true" className="hidden sm:block sm:w-8" />
      )}
    </div>
  );
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(Math.max(parsed, min), max);
}

function parseMoneyInput(value: string): number {
  const cleaned = value.replace(/[^\d.]/g, "");

  if (!cleaned) return 0;

  const parsed = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  return Math.min(Math.round(parsed * 100), 100_000_000);
}

function centsToString(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "";

  return (cents / 100).toFixed(2);
}
