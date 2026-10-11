"use client";

import { useMemo, useState } from "react";
import {
  FileUp,
  FileText,
  Layers,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { MobileHeaderSlot, mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardActionsRow, DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImporterDialog } from "@/features/importer/components/importer-dialog";
import type { ProductDraft } from "@/features/importer/components/importer-product-review";
import type {
  ImporterAnalyzeResult,
  ImporterCommitResult,
} from "@/features/importer/types";
import {
  QuoteLibraryEntryForm,
  type QuoteLibraryBlockReference,
} from "@/features/quotes/components/quote-library-entry-form";
import {
  centsToMoneyInput,
  formatQuoteMoney,
} from "@/features/quotes/utils";
import type {
  DashboardQuoteLibraryEntry,
  QuoteLibraryActionState,
  QuoteLibraryDeleteActionState,
  QuoteLibraryEntryKind,
} from "@/features/quotes/types";
import { useAnimatedList, type MotionState } from "@/hooks/use-animated-list";
import type { OptimisticActionResult } from "@/hooks/use-optimistic-mutation";

type BusinessProductLibraryManagerProps = {
  quoteLibrary: DashboardQuoteLibraryEntry[];
  productLimit: number | null;
  createAction: (
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  updateAction: (
    entryId: string,
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  deleteAction: (
    entryId: string,
    state: QuoteLibraryDeleteActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryDeleteActionState>;
  importerEnabled: boolean;
  analyzeImportAction: (formData: FormData) => Promise<ImporterAnalyzeResult>;
  commitProductImportAction: (payload: {
    sourceName: string;
    entries: ProductDraft[];
  }) => Promise<ImporterCommitResult>;
};

type FilterTab = "all" | "block" | "package";
type SortValue = "newest" | "name" | "total-desc" | "total-asc";

type EditorState =
  | { mode: "create"; kind: QuoteLibraryEntryKind }
  | { mode: "edit"; entry: DashboardQuoteLibraryEntry }
  | null;

const sortOptions = [
  { label: "Newest first", value: "newest" },
  { label: "Name A–Z", value: "name" },
  { label: "Price: high to low", value: "total-desc" },
  { label: "Price: low to high", value: "total-asc" },
];

export function BusinessProductLibraryManager({
  quoteLibrary,
  productLimit,
  createAction,
  updateAction,
  deleteAction,
  importerEnabled,
  analyzeImportAction,
  commitProductImportAction,
}: BusinessProductLibraryManagerProps) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortValue>("newest");
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<DashboardQuoteLibraryEntry | null>(null);
  const [importerOpen, setImporterOpen] = useState(false);
  const totalCount = quoteLibrary.length;
  const isAtLimit = productLimit !== null && totalCount >= productLimit;

  const blockCount = quoteLibrary.filter((e) => e.kind === "block").length;
  const packageCount = quoteLibrary.filter((e) => e.kind === "package").length;
  const availableBlocks = useMemo<QuoteLibraryBlockReference[]>(
    () =>
      quoteLibrary
        .filter((entry) => entry.kind === "block")
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          currency: entry.currency,
          totalInCents: entry.totalInCents,
          items: entry.items.map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unitPriceInCents: item.unitPriceInCents,
          })),
        })),
    [quoteLibrary],
  );

  const filtered = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const matches =
      filter === "all"
        ? quoteLibrary
        : quoteLibrary.filter((e) => e.kind === filter);
    const searched = trimmedQuery
      ? matches.filter((entry) =>
          [
            entry.name,
            entry.description ?? "",
            ...entry.items.map((item) => item.description),
          ]
            .join(" ")
            .toLowerCase()
            .includes(trimmedQuery),
        )
      : matches;
    return [...searched].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "total-desc":
          return b.totalInCents - a.totalInCents;
        case "total-asc":
          return a.totalInCents - b.totalInCents;
        case "newest":
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    });
  }, [quoteLibrary, filter, query, sort]);

  const { items: animatedFiltered, getMotionState, getItemRef, removeItem } = useAnimatedList(filtered);

  function openCreate(kind: QuoteLibraryEntryKind) {
    setEditorState({ mode: "create", kind });
  }

  function openEdit(entry: DashboardQuoteLibraryEntry) {
    setEditorState({ mode: "edit", entry });
  }

  function closeEditor() {
    setEditorState(null);
  }

  function clearFilters() {
    setQuery("");
    setFilter("all");
    setSort("newest");
  }

  const canClear =
    query.trim() !== "" || filter !== "all" || sort !== "newest";
  const resultLabel = `${filtered.length} of ${totalCount} ${totalCount === 1 ? "product" : "products"}`;
  const usageLabel =
    productLimit === null
      ? `${totalCount} ${totalCount === 1 ? "entry" : "entries"}`
      : `${totalCount} of ${productLimit} entries used${isAtLimit ? " — limit reached" : ""}`;

  // First-run empty state: focused creation CTAs, no list chrome.
  if (totalCount === 0) {
    return (
      <div className="flex flex-col gap-4">
        <DashboardEmptyState
          description="Create reusable blocks and packages to drop into quotes with one click."
          icon={Layers}
          title="Nothing saved yet"
          variant="section"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                disabled={isAtLimit}
                onClick={() => openCreate("block")}
                size="sm"
                type="button"
              >
                <Plus data-icon="inline-start" />
                New block
              </Button>
              <Button
                disabled={isAtLimit}
                onClick={() => openCreate("package")}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus data-icon="inline-start" />
                New package
              </Button>
              {importerEnabled ? (
                <Button
                  disabled={isAtLimit}
                  onClick={() => setImporterOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <FileUp data-icon="inline-start" />
                  Import from file
                </Button>
              ) : null}
            </div>
          }
        />

        <EditorOverlay
          editorState={editorState}
          availableBlocks={availableBlocks}
          createAction={createAction}
          updateAction={updateAction}
          onClose={closeEditor}
        />

        {importerEnabled ? (
          <ImporterDialog
            analyzeAction={analyzeImportAction}
            commitProductAction={commitProductImportAction}
            onOpenChange={setImporterOpen}
            open={importerOpen}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Actions row: usage hint + creation actions */}
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs text-muted-foreground">{usageLabel}</p>
        <MobileHeaderSlot desktopClassName="flex flex-wrap justify-end gap-2">
          {importerEnabled ? (
            <Button
              aria-label="Import from file"
              title="Import from file"
              disabled={isAtLimit}
              onClick={() => setImporterOpen(true)}
              size="sm"
              className={mobileNavbarIconButtonClassName}
              type="button"
              variant="outline"
            >
              <FileUp data-icon="inline-start" />
              <span className="hidden lg:inline">Import from file</span>
            </Button>
          ) : null}
          <Button
            aria-label="New block"
            title="New block"
            disabled={isAtLimit}
            onClick={() => openCreate("block")}
            size="sm"
            className={mobileNavbarIconButtonClassName}
            type="button"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            <span className="hidden lg:inline">New block</span>
          </Button>
          <Button
            aria-label="New package"
            title="New package"
            disabled={isAtLimit}
            onClick={() => openCreate("package")}
            size="sm"
            className={mobileNavbarIconButtonClassName}
            type="button"
          >
            <Plus data-icon="inline-start" />
            <span className="hidden lg:inline">New package</span>
          </Button>
        </MobileHeaderSlot>
      </div>

      {/* Results card: toolbar strip + table + mobile list as one object */}
      <div className="dashboard-table-shell" data-list-card>
        <div className="data-list-toolbar-strip">
          <div className="data-list-toolbar-grid">
            <Field className="min-w-0 flex-1">
              <FieldLabel className="sr-only" htmlFor="product-search">
                Search products
              </FieldLabel>
              <FieldContent>
                <Input
                  id="product-search"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search name or description"
                  aria-label="Search products"
                  autoComplete="off"
                />
              </FieldContent>
            </Field>
            <Field className="min-w-0 sm:max-w-44">
              <FieldLabel className="sr-only" htmlFor="product-sort">
                Sort products
              </FieldLabel>
              <FieldContent>
                <Combobox
                  id="product-sort"
                  value={sort}
                  onValueChange={(value) => setSort(value as SortValue)}
                  options={sortOptions}
                  placeholder="Sort by"
                  searchPlaceholder="Search sorting"
                />
              </FieldContent>
            </Field>
            <DashboardActionsRow className="data-list-toolbar-actions">
              <Button
                aria-label="Clear filters"
                className="size-9 shrink-0 px-0 sm:hidden"
                disabled={!canClear}
                onClick={clearFilters}
                size="icon"
                title="Clear filters"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
              <Button
                className="hidden shrink-0 sm:inline-flex"
                size="sm"
                disabled={!canClear}
                onClick={clearFilters}
                type="button"
                variant="ghost"
              >
                <X data-icon="inline-start" />
                Clear
              </Button>
            </DashboardActionsRow>
          </div>

          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as FilterTab)}
          >
            <TabsList>
              <TabsTrigger value="all">
                All <span className="ml-1.5 text-muted-foreground">{totalCount}</span>
              </TabsTrigger>
              <TabsTrigger value="block">
                Blocks <span className="ml-1.5 text-muted-foreground">{blockCount}</span>
              </TabsTrigger>
              <TabsTrigger value="package">
                Packages <span className="ml-1.5 text-muted-foreground">{packageCount}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <p className="data-list-toolbar-count">{resultLabel}</p>
        </div>

        {filtered.length > 0 ? (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto no-scrollbar sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[7rem]">Type</TableHead>
                    <TableHead className="w-[6rem]">Items</TableHead>
                    <TableHead className="w-[8rem] text-right">Total</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {animatedFiltered.map((entry) => (
                    <ProductTableRow
                      entry={entry}
                      key={entry.id}
                      motionState={getMotionState(entry.id)}
                      itemRef={getItemRef(entry.id)}
                      onDelete={() => setDeleteTarget(entry)}
                      onEdit={() => openEdit(entry)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile stacked rows */}
            <div className="divide-y divide-border/60 sm:hidden">
              {animatedFiltered.map((entry) => (
                <ProductMobileRow
                  entry={entry}
                  key={entry.id}
                  motionState={getMotionState(entry.id)}
                  itemRef={getItemRef(entry.id)}
                  onDelete={() => setDeleteTarget(entry)}
                  onEdit={() => openEdit(entry)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="p-4">
            <DashboardEmptyState
              description={
                query.trim()
                  ? "Try another search or clear the filters."
                  : filter === "package"
                    ? "Create your first package to bundle offerings together."
                    : "Create your first product block to speed up quoting."
              }
              icon={filter === "package" ? Package : Layers}
              title={
                query.trim()
                  ? "No products match"
                  : filter === "package"
                    ? "No packages yet"
                    : "No blocks yet"
              }
              variant="list"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {query.trim() ? null : (
                    <Button
                      disabled={isAtLimit}
                      onClick={() =>
                        openCreate(filter === "package" ? "package" : "block")
                      }
                      size="sm"
                      type="button"
                    >
                      <Plus data-icon="inline-start" />
                      New
                    </Button>
                  )}
                  <Button
                    disabled={!canClear}
                    onClick={clearFilters}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <X data-icon="inline-start" />
                    Clear filters
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>

      {/* Editor dialog */}
      <EditorOverlay
        editorState={editorState}
        availableBlocks={availableBlocks}
        createAction={createAction}
        updateAction={updateAction}
        onClose={closeEditor}
      />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        deleteAction={deleteAction}
        entry={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onOptimisticRemove={removeItem}
      />

      {/* File importer */}
      {importerEnabled ? (
        <ImporterDialog
          analyzeAction={analyzeImportAction}
          commitProductAction={commitProductImportAction}
          onOpenChange={setImporterOpen}
          open={importerOpen}
        />
      ) : null}
    </div>
  );
}

function ProductIcon({ kind }: { kind: QuoteLibraryEntryKind }) {
  const Icon = kind === "package" ? Package : kind === "template" ? FileText : Layers;
  return <Icon className="size-4 text-muted-foreground" />;
}

function ProductTypeBadge({ kind }: { kind: QuoteLibraryEntryKind }) {
  return (
    <Badge variant="outline" className="shrink-0">
      {kind === "template" ? "Template" : kind === "package" ? "Package" : "Block"}
    </Badge>
  );
}

function ProductSupportingText({ entry }: { entry: DashboardQuoteLibraryEntry }) {
  const preview =
    entry.kind !== "block" && entry.items.length > 0
      ? ` · ${entry.items
          .slice(0, 2)
          .map((i) => i.description)
          .join(", ")}${entry.items.length > 2 ? ` +${entry.items.length - 2}` : ""}`
      : "";
  return (
    <p className="table-supporting-text">
      {entry.itemCount} {entry.itemCount === 1 ? "item" : "items"}
      {preview}
    </p>
  );
}

function ProductRowActions({
  entryName,
  onDelete,
  onEdit,
}: {
  entryName: string;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Actions for ${entryName}`}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProductTableRow({
  entry,
  motionState,
  itemRef,
  onDelete,
  onEdit,
}: {
  entry: DashboardQuoteLibraryEntry;
  motionState?: MotionState;
  itemRef?: (node: HTMLElement | null) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <TableRow ref={itemRef} className="motion-list-item group/row" data-motion-state={motionState}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted/60 p-2">
            <ProductIcon kind={entry.kind} />
          </div>
          <div className="table-meta-stack min-w-0">
            <button
              type="button"
              onClick={onEdit}
              className="table-emphasis cursor-pointer text-left transition-colors hover:text-primary"
            >
              {entry.name}
            </button>
            <ProductSupportingText entry={entry} />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <ProductTypeBadge kind={entry.kind} />
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {entry.itemCount}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
        {formatQuoteMoney(entry.totalInCents, entry.currency)}
      </TableCell>
      <TableCell>
        <ProductRowActions
          entryName={entry.name}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      </TableCell>
    </TableRow>
  );
}

function ProductMobileRow({
  entry,
  motionState,
  itemRef,
  onDelete,
  onEdit,
}: {
  entry: DashboardQuoteLibraryEntry;
  motionState?: MotionState;
  itemRef?: (node: HTMLElement | null) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      ref={itemRef}
      className="motion-list-item group flex items-start gap-3 px-4 py-3.5"
      data-motion-state={motionState}
    >
      <div className="mt-0.5 rounded-lg bg-muted/60 p-2">
        <ProductIcon kind={entry.kind} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="truncate text-left text-sm font-medium text-foreground"
          >
            {entry.name}
          </button>
          <ProductTypeBadge kind={entry.kind} />
        </div>
        <ProductSupportingText entry={entry} />
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatQuoteMoney(entry.totalInCents, entry.currency)}
        </p>
      </div>

      <ProductRowActions
        entryName={entry.name}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    </div>
  );
}

function EditorOverlay({
  editorState,
  availableBlocks,
  createAction,
  updateAction,
  onClose,
}: {
  editorState: EditorState;
  availableBlocks: QuoteLibraryBlockReference[];
  createAction: (
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  updateAction: (
    entryId: string,
    state: QuoteLibraryActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryActionState>;
  onClose: () => void;
}) {
  return (
    <ResponsiveOverlay
      open={editorState !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResponsiveOverlayContent className="sm:max-w-2xl">
        {editorState ? (
          <>
            <ResponsiveOverlayHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                  {(editorState.mode === "create"
                    ? editorState.kind
                    : editorState.entry.kind) === "package" ? (
                    <Package className="size-5 text-muted-foreground" />
                  ) : (editorState.mode === "create"
                    ? editorState.kind
                    : editorState.entry.kind) === "template" ? (
                    <FileText className="size-5 text-muted-foreground" />
                  ) : (
                    <Layers className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <ResponsiveOverlayTitle>
                    {editorState.mode === "create" ? (
                      editorState.kind === "package" ? (
                        "Create package"
                      ) : editorState.kind === "template" ? (
                        "Create quote template"
                      ) : (
                        "Create product block"
                      )
                    ) : editorState.entry.kind === "package" ? (
                      "Edit package"
                    ) : editorState.entry.kind === "template" ? (
                      "Edit quote template"
                    ) : (
                      "Edit product block"
                    )}
                  </ResponsiveOverlayTitle>
                  <ResponsiveOverlayDescription>
                    {editorState.mode === "create" &&
                    editorState.kind === "package"
                      ? "Bundle line items into a reusable package. Add them manually or import from saved blocks."
                      : editorState.mode === "create" &&
                          editorState.kind === "template"
                        ? "A full quote blueprint that pre-fills title, notes, terms, validity, and line items."
                        : editorState.mode === "create"
                          ? "A reusable product line item you can drop into any quote with one click."
                          : "Update the details and line items."}
                  </ResponsiveOverlayDescription>
                </div>
              </div>
            </ResponsiveOverlayHeader>

            <div
              className="contents"
              key={
                editorState.mode === "create"
                  ? `create-${editorState.kind}`
                  : `edit-${editorState.entry.id}`
              }
            >
              <QuoteLibraryEntryForm
                action={
                  editorState.mode === "create"
                    ? createAction
                    : updateAction.bind(null, editorState.entry.id)
                }
                availableBlocks={
                  editorState.mode === "create" &&
                  editorState.kind === "package"
                    ? availableBlocks
                    : undefined
                }
                fixedKind={
                  editorState.mode === "create"
                    ? editorState.kind
                    : editorState.entry.kind
                }
                idPrefix={
                  editorState.mode === "create"
                    ? `quote-library-create-${editorState.kind}`
                    : `quote-library-edit-${editorState.entry.id}`
                }
                initialValues={
                  editorState.mode === "edit"
                    ? {
                        kind: editorState.entry.kind,
                        name: editorState.entry.name,
                        description: editorState.entry.description ?? "",
                        title: editorState.entry.title ?? "",
                        notes: editorState.entry.notes ?? "",
                        terms: editorState.entry.terms ?? "",
                        validityDays: editorState.entry.validityDays != null
                          ? String(editorState.entry.validityDays)
                          : "14",
                        items: editorState.entry.items.map((item) => ({
                          id: item.id,
                          description: item.description,
                          quantity: String(item.quantity),
                          unitPrice: centsToMoneyInput(item.unitPriceInCents),
                        })),
                      }
                    : undefined
                }
                layout="dialog"
                onCancel={onClose}
                onSuccess={onClose}
                submitLabel={
                  editorState.mode === "create" ? "Create" : "Save changes"
                }
                submitPendingLabel="Saving..."
              />
            </div>
          </>
        ) : null}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function DeleteConfirmDialog({
  deleteAction,
  entry,
  onClose,
  onOptimisticRemove,
}: {
  deleteAction: (
    entryId: string,
    state: QuoteLibraryDeleteActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryDeleteActionState>;
  entry: DashboardQuoteLibraryEntry | null;
  onClose: () => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
}) {
  if (!entry) return null;
  return (
    <DeleteConfirmDialogInner
      deleteAction={deleteAction}
      entry={entry}
      onClose={onClose}
      onOptimisticRemove={onOptimisticRemove}
    />
  );
}

function DeleteConfirmDialogInner({
  deleteAction,
  entry,
  onClose,
  onOptimisticRemove,
}: {
  deleteAction: (
    entryId: string,
    state: QuoteLibraryDeleteActionState,
    formData: FormData,
  ) => Promise<QuoteLibraryDeleteActionState>;
  entry: DashboardQuoteLibraryEntry;
  onClose: () => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
}) {
  function handleDelete() {
    onClose();
    onOptimisticRemove(entry.id, async () => {
      const result = await deleteAction(entry.id, {}, new FormData());
      return {
        error: result.error,
        success: result.success ? "Deleted" : undefined,
      };
    });
  }

  const kindLabel = entry.kind === "package" ? "package" : entry.kind === "template" ? "template" : "block";

  return (
    <ConfirmationDialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Delete ${kindLabel}?`}
      description={
        <>
          This permanently removes &ldquo;{entry.name}&rdquo; from your
          product library. Quotes already using this {kindLabel} are not
          affected.
        </>
      }
      confirmLabel="Delete"
      onConfirm={handleDelete}
      tone="destructive"
      icon={Trash2}
    />
  );
}
