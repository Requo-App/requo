"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Clock,
  FileText,
  FileUp,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useAnimatedList, type MotionState } from "@/hooks/use-animated-list";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type { OptimisticActionResult } from "@/hooks/use-optimistic-mutation";
import type {
  KnowledgeFileActionState,
  KnowledgeFileDeleteActionState,
  MemoryEntryActionState,
} from "@/features/memory/actions";
import type {
  BusinessMemoryCategory,
  KnowledgeFileRow,
  KnowledgeFileStatus,
  MemoryRow,
} from "@/features/memory/types";
import {
  KNOWLEDGE_FILE_ACCEPT,
  KNOWLEDGE_FILE_ACCEPT_EXTENSIONS,
  memoryCategoryLabels,
} from "@/features/memory/types";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type MemoryEntryFormAction = (
  prevState: MemoryEntryActionState,
  formData: FormData,
) => Promise<MemoryEntryActionState>;

type KnowledgeFileUploadAction = (
  prevState: KnowledgeFileActionState,
  formData: FormData,
) => Promise<KnowledgeFileActionState>;

type KnowledgeFileDeleteAction = (
  fileId: string,
) => Promise<KnowledgeFileDeleteActionState>;

type MemoryEntryDeleteAction = (
  memoryId: string,
) => Promise<MemoryEntryActionState>;

type MemoryEntryUpdateFormAction = (
  memoryId: string,
  prevState: MemoryEntryActionState,
  formData: FormData,
) => Promise<MemoryEntryActionState>;

export type KnowledgeManagerProps = {
  /**
   * The business whose knowledge base this is. The data is fetched when the
   * tab is opened: rendering the tab with the rest of the settings page ran
   * its three queries on every visit, even for owners who only ever looked
   * at the Assistant tab.
   */
  businessSlug: string;
  createEntryAction: MemoryEntryFormAction;
  updateEntryAction: MemoryEntryUpdateFormAction;
  deleteEntryAction: MemoryEntryDeleteAction;
  uploadFileAction: KnowledgeFileUploadAction;
  deleteFileAction: KnowledgeFileDeleteAction;
  retryFileAction: (fileId: string) => Promise<KnowledgeFileActionState>;
};

export type UnifiedKnowledgeEntry =
  | {
      id: string;
      kind: "memory";
      title: string;
      category: BusinessMemoryCategory;
      content: string;
      createdAt: Date;
      data: MemoryRow;
    }
  | {
      id: string;
      kind: "file";
      title: string;
      byteSize: number;
      mimeType: string;
      status: KnowledgeFileStatus;
      extractedCharacterCount: number | null;
      failureReason: string | null;
      createdAt: Date;
      data: KnowledgeFileRow;
    };

type FilterTab = "all" | "memory" | "file";

/** The knowledge payload the tab loads from its route. */
type KnowledgePayload = {
  memories: MemoryRow[];
  knowledgeFiles: KnowledgeFileRow[];
  sourceCount: number;
  sourceLimit: number | null;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Whether the file can be processed again.
 *
 * A file stuck in "processing" — its background step killed by a deploy or a
 * timeout — was permanently unindexed and un-actionable: the retry affordance
 * was only offered for "failed".
 */
function canRetryFile(status: KnowledgeFileStatus): boolean {
  return status === "failed" || status === "processing";
}

const fileStatusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "text-muted-foreground",
    badgeVariant: "secondary" as const,
  },
  processing: {
    label: "Processing",
    icon: Spinner,
    className: "text-blue-500",
    badgeVariant: "secondary" as const,
  },
  ready: {
    label: "Ready",
    icon: CheckCircle,
    className: "text-emerald-500",
    badgeVariant: "secondary" as const,
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    className: "text-destructive",
    badgeVariant: "destructive" as const,
  },
} as const;

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export function KnowledgeManager({
  businessSlug,
  createEntryAction,
  updateEntryAction,
  deleteEntryAction,
  uploadFileAction,
  deleteFileAction,
  retryFileAction,
}: KnowledgeManagerProps) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<UnifiedKnowledgeEntry | null>(null);
  const [data, setData] = useState<KnowledgePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/business/knowledge?businessSlug=${encodeURIComponent(businessSlug)}`,
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setLoadError(body?.error ?? "Could not load the knowledge base.");
        return;
      }

      const body = (await response.json()) as KnowledgePayload;
      setData(body);
      setLoadError(null);
    } catch {
      setLoadError("Could not load the knowledge base.");
    }
  }, [businessSlug]);

  useEffect(() => {
    // Loading the tab's data when it is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const memories = useMemo(() => data?.memories ?? [], [data]);
  const knowledgeFiles = useMemo(
    () => data?.knowledgeFiles ?? [],
    [data],
  );
  const sourceLimit = data?.sourceLimit ?? null;
  const sourceCount = data?.sourceCount ?? 0;

  const atLimit = sourceLimit !== null && sourceCount >= sourceLimit;
  const memoryCount = memories.length;
  const fileCount = knowledgeFiles.length;

  const allEntries = useMemo<UnifiedKnowledgeEntry[]>(() => {
    const memoryItems: UnifiedKnowledgeEntry[] = memories.map((m) => ({
      id: m.id,
      kind: "memory",
      title: m.title,
      category: m.category,
      content: m.content,
      createdAt: m.createdAt,
      data: m,
    }));

    const fileItems: UnifiedKnowledgeEntry[] = knowledgeFiles.map((f) => ({
      id: f.id,
      kind: "file",
      title: f.originalFileName,
      byteSize: f.byteSize,
      mimeType: f.mimeType,
      status: f.status,
      extractedCharacterCount: f.extractedCharacterCount,
      failureReason: f.failureReason,
      createdAt: f.createdAt,
      data: f,
    }));

    return [...memoryItems, ...fileItems].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [memories, knowledgeFiles]);

  const filtered = useMemo(() => {
    if (filter === "all") return allEntries;
    return allEntries.filter((e) => e.kind === filter);
  }, [allEntries, filter]);

  const { items: animatedFiltered, getMotionState, getItemRef, removeItem } =
    useAnimatedList(filtered);

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-10">
      {loadError ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      {/* Stats summary matching products page */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={BookOpen}
          label="Manual entries"
          value={memoryCount}
          description="Rules, FAQs & instructions"
        />
        <StatCard
          icon={FileText}
          label="Knowledge files"
          value={fileCount}
          description="PDFs, CSVs & text files"
        />
        <StatCard
          icon={Layers}
          label="Plan usage"
          value={`${sourceCount}/${sourceLimit ?? "∞"}`}
          description={atLimit ? "Limit reached" : "Sources indexed"}
        />
      </div>

      {/* Toolbar: tabs + action buttons matching products page */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as FilterTab)}
        >
          <TabsList>
            <TabsTrigger value="all">
              All <span className="ml-1.5 text-muted-foreground">{allEntries.length}</span>
            </TabsTrigger>
            <TabsTrigger value="memory">
              Notes <span className="ml-1.5 text-muted-foreground">{memoryCount}</span>
            </TabsTrigger>
            <TabsTrigger value="file">
              Files <span className="ml-1.5 text-muted-foreground">{fileCount}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <UploadFileButton
            disabled={atLimit}
            onChanged={() => void reload()}
            uploadFileAction={uploadFileAction}
          />
          <Button
            disabled={atLimit}
            onClick={() => setAddEntryOpen(true)}
            size="sm"
            type="button"
          >
            <Plus data-icon="inline-start" />
            New
          </Button>
        </div>
      </div>

      {/* Unified entries list */}
      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border/75">
          <div className="divide-y divide-border/60">
            {animatedFiltered.map((entry) => (
              <KnowledgeEntryRow
                entry={entry}
                key={entry.id}
                motionState={getMotionState(entry.id)}
                itemRef={getItemRef(entry.id)}
                onDelete={() => setDeleteTarget(entry)}
                onEdit={() => {
                  if (entry.kind === "memory") {
                    setEditingMemory(entry.data);
                  }
                }}
                onChanged={() => void reload()}
                retryAction={retryFileAction}
              />
            ))}
          </div>
        </div>
      ) : (
        <DashboardEmptyState
          description={
            filter === "file"
              ? "Upload PDFs, CSVs, or text files to give AI detailed reference material."
              : filter === "memory"
                ? "Add business rules, FAQs, or pricing guidelines for AI to reference."
                : "Add your first manual note or upload a file to give AI business context."
          }
          icon={filter === "file" ? FileText : BookOpen}
          title={
            filter === "file"
              ? "No files uploaded yet"
              : filter === "memory"
                ? "No manual entries yet"
                : "No knowledge sources yet"
          }
          variant="section"
        />
      )}

      {/* Add entry dialog */}
      <AddMemoryEntryDialog
        createAction={createEntryAction}
        onChanged={() => void reload()}
        onOpenChange={setAddEntryOpen}
        open={addEntryOpen}
      />

      {/* Edit entry dialog */}
      {editingMemory ? (
        <EditMemoryEntryDialog
          memory={editingMemory}
          onChanged={() => void reload()}
          onOpenChange={(open) => {
            if (!open) setEditingMemory(null);
          }}
          open={editingMemory !== null}
          updateAction={updateEntryAction}
        />
      ) : null}

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        deleteEntryAction={deleteEntryAction}
        deleteFileAction={deleteFileAction}
        entry={deleteTarget}
        onChanged={() => void reload()}
        onClose={() => setDeleteTarget(null)}
        onOptimisticRemove={removeItem}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat Card                                                                 */
/* -------------------------------------------------------------------------- */

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof Layers;
  label: string;
  value: number | string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/75 bg-card/97 p-4">
      <div className="rounded-lg bg-muted p-2">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Knowledge Entry Row                                                       */
/* -------------------------------------------------------------------------- */

function KnowledgeEntryRow({
  entry,
  motionState,
  itemRef,
  onDelete,
  onEdit,
  onChanged,
  retryAction,
}: {
  entry: UnifiedKnowledgeEntry;
  motionState?: MotionState;
  itemRef?: (node: HTMLElement | null) => void;
  onDelete: () => void;
  onEdit: () => void;
  /** Called after a mutation so the tab reloads its data. */
  onChanged: () => void;
  retryAction: (fileId: string) => Promise<KnowledgeFileActionState>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const { scheduleRefresh } = useDeferredRefresh();

  const isMemory = entry.kind === "memory";
  const Icon = isMemory ? BookOpen : FileText;

  async function handleRetry() {
    if (entry.kind !== "file") return;
    setIsRetrying(true);
    try {
      await retryAction(entry.data.id);
      scheduleRefresh();
      onChanged();
    } finally {
      setIsRetrying(false);
    }
  }

  const fileStatus = entry.kind === "file" ? fileStatusConfig[entry.status] : null;
  const FileStatusIcon = fileStatus?.icon;
  const categoryLabel =
    entry.kind === "memory"
      ? memoryCategoryLabels[entry.category] ?? entry.category
      : null;

  return (
    <div
      ref={itemRef}
      className="motion-list-item group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:items-center sm:gap-4 sm:px-5 sm:py-4"
      data-motion-state={motionState}
    >
      <div className="mt-0.5 rounded-lg bg-muted/60 p-2 sm:mt-0">
        <Icon className="size-4 text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {entry.title}
            </p>
            {entry.kind === "memory" ? (
              <Badge variant="outline" className="shrink-0 text-xs">
                {categoryLabel}
              </Badge>
            ) : fileStatus && FileStatusIcon ? (
              <Badge
                variant={fileStatus.badgeVariant}
                className="shrink-0 text-xs gap-1"
              >
                <FileStatusIcon className={cn("size-3", fileStatus.className)} />
                {fileStatus.label}
              </Badge>
            ) : null}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {entry.kind === "memory" ? (
              entry.content
            ) : (
              <>
                {formatBytes(entry.byteSize)}
                {entry.extractedCharacterCount
                  ? ` · ${entry.extractedCharacterCount.toLocaleString()} chars extracted`
                  : null}
                {entry.failureReason ? ` · ${entry.failureReason}` : null}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {entry.kind === "file" && canRetryFile(entry.status) ? (
          <Button
            aria-label="Retry processing"
            disabled={isRetrying}
            onClick={handleRetry}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw
              className={cn("size-3.5", isRetrying && "animate-spin")}
            />
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${entry.title}`}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {entry.kind === "memory" ? (
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                Edit
              </DropdownMenuItem>
            ) : null}
            {entry.kind === "file" && canRetryFile(entry.status) ? (
              <DropdownMenuItem onSelect={handleRetry}>
                <RefreshCw />
                Retry processing
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onDelete} variant="destructive">
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Upload File Button                                                        */
/* -------------------------------------------------------------------------- */

function UploadFileButton({
  disabled,
  onChanged,
  uploadFileAction,
}: {
  disabled: boolean;
  /** Called after a mutation so the tab reloads its data. */
  onChanged: () => void;
  uploadFileAction: KnowledgeFileUploadAction;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, isPending] = useActionStateWithSonner(
    async (prevState: KnowledgeFileActionState, formData: FormData) => {
      const result = await uploadFileAction(prevState, formData);
      if (result.success) {
        scheduleRefresh();
        onChanged();
      }
      return result;
    },
    {},
  );

  return (
    <form action={formAction}>
      <input
        ref={fileInputRef}
        type="file"
        name="file"
        accept={[
          ...KNOWLEDGE_FILE_ACCEPT,
          ...KNOWLEDGE_FILE_ACCEPT_EXTENSIONS,
        ].join(",")}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) {
            const form = e.target.closest("form");
            if (form) form.requestSubmit();
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        {isPending ? (
          <Spinner className="size-3.5" />
        ) : (
          <FileUp data-icon="inline-start" />
        )}
        Import from file
      </Button>
      {state.error ? (
        <p className="sr-only">{state.error}</p>
      ) : null}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add Entry Dialog                                                          */
/* -------------------------------------------------------------------------- */

function AddMemoryEntryDialog({
  open,
  onOpenChange,
  onChanged,
  createAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a mutation so the tab reloads its data. */
  onChanged: () => void;
  createAction: MemoryEntryFormAction;
}) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [category, setCategory] =
    useState<BusinessMemoryCategory>("business_rules");
  const [state, formAction, isPending] = useActionStateWithSonner(
    async (prevState: MemoryEntryActionState, formData: FormData) => {
      const result = await createAction(prevState, formData);
      if (result.success) {
        onOpenChange(false);
        scheduleRefresh();
        onChanged();
      }
      return result;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
              <BookOpen className="size-5 text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogTitle>Add knowledge entry</DialogTitle>
              <DialogDescription>
                Write a fact, rule, or context note for AI to reference when
                drafting quotes and responses.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form action={formAction}>
          <div className="flex flex-col gap-4 py-2">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <FieldContent>
                <Input
                  autoFocus
                  maxLength={200}
                  name="title"
                  placeholder="e.g. Minimum project size or Deposit terms"
                />
              </FieldContent>
              {state.fieldErrors?.title ? (
                <FieldError>{state.fieldErrors.title[0]}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="add-category">Category</FieldLabel>
              <FieldDescription>
                Helps AI understand how to apply this information.
              </FieldDescription>
              <FieldContent>
                <input name="category" type="hidden" value={category} />
                <Combobox
                  aria-invalid={Boolean(state.fieldErrors?.category?.[0])}
                  id="add-category"
                  onValueChange={(value) =>
                    setCategory(value as BusinessMemoryCategory)
                  }
                  options={Object.entries(memoryCategoryLabels).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  placeholder="Choose category"
                  value={category}
                />
              </FieldContent>
              {state.fieldErrors?.category ? (
                <FieldError>{state.fieldErrors.category[0]}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel>Content</FieldLabel>
              <FieldContent>
                <Textarea
                  maxLength={4000}
                  name="content"
                  placeholder="e.g. We don't take on jobs under $500. First-time clients require a 50% deposit before work commences."
                  rows={4}
                />
              </FieldContent>
              {state.fieldErrors?.content ? (
                <FieldError>{state.fieldErrors.content[0]}</FieldError>
              ) : null}
            </Field>

            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </div>

          <DialogFooter className="mt-2">
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Edit Entry Dialog                                                         */
/* -------------------------------------------------------------------------- */

function EditMemoryEntryDialog({
  memory,
  open,
  onOpenChange,
  onChanged,
  updateAction,
}: {
  memory: MemoryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a mutation so the tab reloads its data. */
  onChanged: () => void;
  updateAction: MemoryEntryUpdateFormAction;
}) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [category, setCategory] = useState<BusinessMemoryCategory>(
    memory.category,
  );
  const [state, formAction, isPending] = useActionStateWithSonner(
    async (prevState: MemoryEntryActionState, formData: FormData) => {
      const result = await updateAction(memory.id, prevState, formData);
      if (result.success) {
        onOpenChange(false);
        scheduleRefresh();
        onChanged();
      }
      return result;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
              <BookOpen className="size-5 text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogTitle>Edit knowledge entry</DialogTitle>
              <DialogDescription>
                Update this fact, rule, or context note.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form action={formAction}>
          <div className="flex flex-col gap-4 py-2">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <FieldContent>
                <Input
                  autoFocus
                  defaultValue={memory.title}
                  maxLength={200}
                  name="title"
                />
              </FieldContent>
              {state.fieldErrors?.title ? (
                <FieldError>{state.fieldErrors.title[0]}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-category">Category</FieldLabel>
              <FieldDescription>
                Helps AI understand how to apply this information.
              </FieldDescription>
              <FieldContent>
                <input name="category" type="hidden" value={category} />
                <Combobox
                  aria-invalid={Boolean(state.fieldErrors?.category?.[0])}
                  id="edit-category"
                  onValueChange={(value) =>
                    setCategory(value as BusinessMemoryCategory)
                  }
                  options={Object.entries(memoryCategoryLabels).map(
                    ([value, label]) => ({ value, label }),
                  )}
                  placeholder="Choose category"
                  value={category}
                />
              </FieldContent>
              {state.fieldErrors?.category ? (
                <FieldError>{state.fieldErrors.category[0]}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel>Content</FieldLabel>
              <FieldContent>
                <Textarea
                  defaultValue={memory.content}
                  maxLength={4000}
                  name="content"
                  rows={4}
                />
              </FieldContent>
              {state.fieldErrors?.content ? (
                <FieldError>{state.fieldErrors.content[0]}</FieldError>
              ) : null}
            </Field>

            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </div>

          <DialogFooter className="mt-2">
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Delete Confirmation Dialog                                                */
/* -------------------------------------------------------------------------- */

function DeleteConfirmDialog({
  deleteEntryAction,
  deleteFileAction,
  entry,
  onChanged,
  onClose,
  onOptimisticRemove,
}: {
  deleteEntryAction: MemoryEntryDeleteAction;
  deleteFileAction: KnowledgeFileDeleteAction;
  entry: UnifiedKnowledgeEntry | null;
  /** Called after a mutation so the tab reloads its data. */
  onChanged: () => void;
  onClose: () => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
}) {
  if (!entry) return null;

  const isMemory = entry.kind === "memory";
  const itemTypeLabel = isMemory ? "knowledge entry" : "knowledge file";

  function handleDelete() {
    if (!entry) return;
    const target = entry;
    onClose();

    onOptimisticRemove(target.id, async () => {
      try {
        if (target.kind === "memory") {
          const result = await deleteEntryAction(target.data.id);
          return {
            error: result.error,
            success: result.success,
          };
        } else {
          const result = await deleteFileAction(target.data.id);
          return {
            error: result.error,
            success: result.success ? "File deleted" : undefined,
          };
        }
      } finally {
        onChanged();
      }
    });
  }

  return (
    <ConfirmationDialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Delete ${itemTypeLabel}?`}
      description={
        <>
          This permanently removes &ldquo;{entry.title}&rdquo; from your
          knowledge base. AI won&apos;t reference it in future drafts.
        </>
      }
      confirmLabel="Delete"
      onConfirm={handleDelete}
      tone="destructive"
      icon={Trash2}
    />
  );
}
