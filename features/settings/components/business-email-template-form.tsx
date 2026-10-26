"use client";

import { useEffect, useMemo, useState } from "react";
import { RiFileTextLine, RiReceiptLine, RiSendPlaneLine } from "@remixicon/react";

import {
  FloatingFormActions,
  useFloatingUnsavedChanges,
} from "@/components/shared/floating-form-actions";
import { Tab, TabList, Tabs } from "@/components/shared/tabs";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useHashTab } from "@/hooks/use-hash-tab";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import {
  EMAIL_TEMPLATE_KIND_DESCRIPTIONS,
  EMAIL_TEMPLATE_KIND_LABELS,
  EMAIL_TEMPLATE_KINDS,
  MAX_EMAIL_TEMPLATE_BLOCKS,
  getMergeTagsForKind,
  normalizeEmailTemplateForKind,
  type EmailTemplateBlock,
  type EmailTemplateKind,
} from "@/features/settings/email-templates";
import type {
  BusinessEmailTemplateActionState,
  BusinessSettingsView,
} from "@/features/settings/types";

import { EmailCanvas } from "./email-template-builder/email-canvas";
import { EmailTemplateInspector } from "./email-template-builder/email-template-inspector";
import {
  createDividerBlock,
  createSpacerBlock,
  createTextBlock,
} from "./email-template-builder/default-blocks";

type BusinessEmailTemplateFormProps = {
  action: (
    state: BusinessEmailTemplateActionState,
    formData: FormData,
  ) => Promise<BusinessEmailTemplateActionState>;
  settings: BusinessSettingsView;
};

const initialState: BusinessEmailTemplateActionState = {};

const EMAIL_TEMPLATE_KIND_ICONS = {
  quote: RiFileTextLine,
  invoice: RiReceiptLine,
  "follow-up": RiSendPlaneLine,
} as const;

type DraftValues = {
  subject: string;
  blocks: EmailTemplateBlock[];
};

function toDraft(kind: EmailTemplateKind, template: unknown): DraftValues {
  const normalized = normalizeEmailTemplateForKind(kind, template);
  return {
    subject: normalized.subject,
    blocks: normalized.blocks.map((block) => ({
      ...block,
      style: block.style ? { ...block.style } : undefined,
    })),
  };
}

function draftSerialized(draft: DraftValues) {
  return JSON.stringify(draft);
}

function getTemplateForKind(
  settings: BusinessSettingsView,
  kind: EmailTemplateKind,
): unknown {
  if (kind === "invoice") {
    return (
      (settings as Partial<BusinessSettingsView>).invoiceEmailTemplate ?? null
    );
  }
  if (kind === "follow-up") {
    return (
      (settings as Partial<BusinessSettingsView>).quoteFollowUpTemplate ?? null
    );
  }
  return settings.quoteEmailTemplate;
}

export function BusinessEmailTemplateForm({
  action,
  settings,
}: BusinessEmailTemplateFormProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const { selected: activeKind, handleSelectionChange: syncTemplateHash } =
    useHashTab(EMAIL_TEMPLATE_KINDS, "quote");
  const initialDrafts = useMemo(
    () =>
      ({
        quote: toDraft("quote", getTemplateForKind(settings, "quote")),
        invoice: toDraft("invoice", getTemplateForKind(settings, "invoice")),
        "follow-up": toDraft(
          "follow-up",
          getTemplateForKind(settings, "follow-up"),
        ),
      }) as Record<EmailTemplateKind, DraftValues>,
    [settings],
  );
  const [drafts, setDrafts] =
    useState<Record<EmailTemplateKind, DraftValues>>(initialDrafts);
  const [saved, setSaved] =
    useState<Record<EmailTemplateKind, DraftValues>>(initialDrafts);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const draft = drafts[activeKind];
  const hasUnsavedChanges = EMAIL_TEMPLATE_KINDS.some(
    (kind) => draftSerialized(drafts[kind]) !== draftSerialized(saved[kind]),
  );
  const { shouldRenderFloatingActions, floatingActionsState } =
    useFloatingUnsavedChanges(hasUnsavedChanges);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    setSaved(drafts);
    scheduleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRefresh, state.success]);

  useEffect(() => {
    setDrafts(initialDrafts);
    setSaved(initialDrafts);
    setSelectedBlockId(null);
    setEditingBlockId(null);
  }, [initialDrafts]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  function handleKindChange(kind: EmailTemplateKind) {
    syncTemplateHash(kind);
    setSelectedBlockId(null);
    setEditingBlockId(null);
  }

  function handleCancelChanges() {
    setDrafts(saved);
    setSelectedBlockId(null);
    setEditingBlockId(null);
  }

  function handleSelectBlock(id: string | null) {
    setSelectedBlockId(id);
    if (id === null) return;
    if (editingBlockId !== null && editingBlockId !== id) {
      setEditingBlockId(null);
    }
  }

  function handleEditBlock(id: string | null) {
    setEditingBlockId(id);
    if (id !== null) {
      setSelectedBlockId(id);
    }
  }

  function updateSubject(value: string) {
    setDrafts((current) => ({
      ...current,
      [activeKind]: { ...current[activeKind], subject: value },
    }));
  }

  function updateBlock(id: string, patch: Partial<EmailTemplateBlock>) {
    setDrafts((current) => ({
      ...current,
      [activeKind]: {
        ...current[activeKind],
        blocks: current[activeKind].blocks.map((block) =>
          block.id === id ? { ...block, ...patch } : block,
        ),
      },
    }));
  }

  function updateBlockStyle(
    id: string,
    key: keyof NonNullable<EmailTemplateBlock["style"]>,
    value: string | undefined,
  ) {
    setDrafts((current) => ({
      ...current,
      [activeKind]: {
        ...current[activeKind],
        blocks: current[activeKind].blocks.map((block) => {
          if (block.id !== id) return block;
          const nextStyle = { ...(block.style ?? {}) };
          if (value === undefined || value === "") {
            delete nextStyle[key];
          } else {
            (nextStyle as Record<string, string>)[key] = value;
          }
          return {
            ...block,
            style: Object.keys(nextStyle).length ? nextStyle : undefined,
          };
        }),
      },
    }));
  }

  function toggleBlockVisibility(id: string) {
    setDrafts((current) => ({
      ...current,
      [activeKind]: {
        ...current[activeKind],
        blocks: current[activeKind].blocks.map((block) =>
          block.id === id
            ? { ...block, visible: block.visible === false ? true : false }
            : block,
        ),
      },
    }));
  }

  function removeBlock(id: string) {
    setDrafts((current) => ({
      ...current,
      [activeKind]: {
        ...current[activeKind],
        blocks: current[activeKind].blocks.filter(
          (block) => block.id !== id,
        ),
      },
    }));
    setSelectedBlockId((current) => (current === id ? null : current));
    setEditingBlockId((current) => (current === id ? null : current));
  }

  function addBlock(type: "text" | "divider" | "spacer", index?: number) {
    let insertedId: string | null = null;
    setDrafts((current) => {
      const active = current[activeKind];
      if (active.blocks.length >= MAX_EMAIL_TEMPLATE_BLOCKS) return current;
      const next =
        type === "text"
          ? createTextBlock()
          : type === "divider"
            ? createDividerBlock()
            : createSpacerBlock();
      insertedId = next.id;
      if (index === undefined || index < 0 || index > active.blocks.length) {
        return {
          ...current,
          [activeKind]: { ...active, blocks: [...active.blocks, next] },
        };
      }
      const blocks = [...active.blocks];
      blocks.splice(index, 0, next);
      return { ...current, [activeKind]: { ...active, blocks } };
    });
    if (insertedId) {
      const id = insertedId;
      setSelectedBlockId(id);
      if (type === "text") {
        setEditingBlockId(id);
      }
    }
  }

  const blocksError = state.fieldErrors?.blocks?.[0];
  const subjectError = state.fieldErrors?.subject?.[0];
  const mergeTags = getMergeTagsForKind(activeKind);
  const selectedBlock =
    draft.blocks.find((block) => block.id === selectedBlockId) ?? null;

  return (
    <form action={formAction} className="pb-28">
      <Tabs
        className="gap-0"
        data-settings-subnav=""
        selectedKey={activeKind}
        onSelectionChange={(key) =>
          handleKindChange(key as EmailTemplateKind)
        }
      >
        <div className="sticky top-0 z-20 bg-muted">
          <TabList aria-label="Email templates" className="justify-center">
            {EMAIL_TEMPLATE_KINDS.map((kind) => {
              const Icon = EMAIL_TEMPLATE_KIND_ICONS[kind];
              const dirty =
                draftSerialized(drafts[kind]) !==
                draftSerialized(saved[kind]);
              return (
                <Tab key={kind} id={kind} icon={Icon}>
                  {EMAIL_TEMPLATE_KIND_LABELS[kind]}
                  {dirty ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-current opacity-70"
                      />
                      <span className="sr-only">(unsaved changes)</span>
                    </>
                  ) : null}
                </Tab>
              );
            })}
          </TabList>
        </div>

        <div className="px-3 pt-4 sm:px-5 sm:pt-5 xl:px-6 xl:pt-6">
          <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {EMAIL_TEMPLATE_KIND_LABELS[activeKind]}
              </h2>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {EMAIL_TEMPLATE_KIND_DESCRIPTIONS[activeKind]}
              </p>
            </div>

            <div className="flex w-full max-w-xl flex-col gap-5">
              <Field data-invalid={Boolean(subjectError) || undefined}>
                <FieldLabel htmlFor="email-template-subject">
                  Subject line
                </FieldLabel>
                <FieldContent>
                  <Input
                    disabled={isPending}
                    id="email-template-subject"
                    maxLength={200}
                    name="subject"
                    onChange={(event) => updateSubject(event.currentTarget.value)}
                    placeholder={
                      activeKind === "invoice"
                        ? "Invoice {{invoiceNumber}} from {{businessName}} — due {{dueDate}}"
                        : activeKind === "follow-up"
                          ? "Following up: {{quoteNumber}} from {{businessName}}"
                          : "{{quoteNumber}} from {{businessName}}"
                    }
                    value={draft.subject}
                  />
                  <FieldError
                    errors={subjectError ? [{ message: subjectError }] : undefined}
                  />
                </FieldContent>
              </Field>
              <input type="hidden" name="templateKind" value={activeKind} />
              <input
                type="hidden"
                name="blocks"
                value={JSON.stringify(draft.blocks)}
              />
              <Field>
                <FieldLabel>Available merge tags</FieldLabel>
                <FieldContent>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {mergeTags.map((tag, index) => (
                      <span key={tag.tag}>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                          {tag.tag}
                        </code>
                        <span className="text-xs"> ({tag.label})</span>
                        {index < mergeTags.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                </FieldContent>
              </Field>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">Email content</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This is your actual email. Click a block to edit it in the
                inspector, drag blocks to reorder, hide blocks to skip them
                without deleting.
              </p>
            </div>

            <div className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,640px)_320px] lg:justify-center">
              <div className="mx-auto w-full max-w-[640px] min-w-0 lg:mx-0">
                <EmailCanvas
                  blocks={draft.blocks}
                  selectedBlockId={selectedBlockId}
                  editingBlockId={editingBlockId}
                  isPending={isPending}
                  prefersReducedMotion={prefersReducedMotion}
                  templateKind={activeKind}
                  onReorder={(next) =>
                    setDrafts((current) => ({
                      ...current,
                      [activeKind]: { ...current[activeKind], blocks: next },
                    }))
                  }
                  onSelect={handleSelectBlock}
                  onEdit={handleEditBlock}
                  onUpdate={updateBlock}
                  onUpdateStyle={updateBlockStyle}
                  onToggleVisibility={toggleBlockVisibility}
                  onRemove={removeBlock}
                  onInsert={addBlock}
                />
              </div>
              <div className="mx-auto w-full max-w-[640px] min-w-0 lg:mx-0 lg:w-[320px] lg:max-w-none lg:sticky lg:top-13">
                <EmailTemplateInspector
                  block={selectedBlock}
                  templateKind={activeKind}
                  disabled={isPending}
                  onUpdate={updateBlock}
                  onUpdateStyle={updateBlockStyle}
                  onDone={() => handleEditBlock(null)}
                />
              </div>
            </div>
            {blocksError ? (
              <p className="text-sm text-destructive" role="alert">
                {blocksError}
              </p>
            ) : null}
          </div>
        </div>
      </Tabs>

      <FloatingFormActions
        disableSubmit={!hasUnsavedChanges}
        isPending={isPending}
        message="You have unsaved email template changes."
        onCancel={handleCancelChanges}
        state={floatingActionsState}
        submitLabel="Save email template"
        submitPendingLabel="Saving..."
        visible={shouldRenderFloatingActions}
      />
    </form>
  );
}
