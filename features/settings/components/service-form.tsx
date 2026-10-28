"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import {
  AlignLeft,
  Calendar,
  ChevronDown,
  Eye,
  GripVertical,
  Hash,
  ListChecks,
  MoreHorizontal,
  PencilLine,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react";

import { FloatingFormActions } from "@/components/shared/floating-form-actions";
import { FormSection } from "@/components/shared/form-layout";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  inquiryCustomFieldTypeMeta,
  inquiryContactFieldKeys,
  inquiryContactMethodLabels,
  inquiryContactMethods,
  getInquiryFormFieldInputName,
  type InquiryContactFieldConfig,
  type InquiryContactFieldKey,
  type InquiryFormCustomFieldDefinition,
  type InquiryCustomFieldType,
  type InquiryFieldOption,
  type InquiryFormConfig,
  type InquiryFormFieldDefinition,
  type InquiryFormSystemFieldDefinition,
  getNormalizedInquiryFormConfig,
} from "@/features/inquiries/form-config";
import type {
  ServiceActionState,
  ServicePreviewDraft,
  ServiceSettingsView,
} from "@/features/settings/types";
import {
  getInquiryCustomFieldLimit,
  getPublicInquiryAttachmentHelpText,
} from "@/features/inquiries/plan-rules";
import { cn } from "@/lib/utils";
import { prefixedId } from "@/lib/ids";

const MAX_CUSTOM_FIELD_OPTIONS = 12;
const inquiryProjectFieldsDndContextId = "service-project-fields-dnd";
const inquiryProjectFieldsSortableContextId =
  "service-project-fields-sortable";
const inquirySortableTransition = {
  duration: 150,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;
const contactMethodOptions = inquiryContactMethods.map((method) => ({
  label: inquiryContactMethodLabels[method],
  value: method,
}));

type ServiceFormProps = {
  saveAction: (
    state: ServiceActionState,
    formData: FormData,
  ) => Promise<ServiceActionState>;
  onDraftChange: (draft: ServicePreviewDraft) => void;
  onPreview: () => void;
  draft: ServicePreviewDraft;
  isActive: boolean;
  settings: ServiceSettingsView;
};

const initialState: ServiceActionState = {};

export function ServiceForm({
  saveAction,
  onDraftChange,
  onPreview,
  draft,
  isActive,
  settings,
}: ServiceFormProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const normalizedSettingsConfig = useMemo(
    () =>
      getNormalizedInquiryFormConfig(settings.inquiryFormConfig, {
        businessType: settings.businessType,
      }),
    [settings.businessType, settings.inquiryFormConfig],
  );
  const [saveState, saveFormAction, isSavePending] =
    useActionStateWithSonner(saveAction, initialState);
  const [contactFields, setContactFields] = useState(draft.inquiryFormConfig.contactFields);
  const [projectFields, setProjectFields] = useState(draft.inquiryFormConfig.projectFields);
  const [groupLabels, setGroupLabels] = useState(draft.inquiryFormConfig.groupLabels);
  const [isEditingProjectGroupLabel, setIsEditingProjectGroupLabel] = useState(false);
  const [projectGroupLabelDraft, setProjectGroupLabelDraft] = useState(
    draft.inquiryFormConfig.groupLabels.project,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const projectFieldLabelInputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const projectFieldCardRefs = useRef(new Map<string, HTMLDivElement | null>());
  const projectFieldRectsRef = useRef(new Map<string, DOMRect>());
  const projectFieldAnimationsRef = useRef(new Map<string, Animation>());
  const projectFieldTimeoutsRef = useRef<number[]>([]);
  const skipNextProjectFieldLayoutAnimationRef = useRef(false);
  const [enteringProjectFieldIds, setEnteringProjectFieldIds] = useState<string[]>([]);
  const [exitingProjectFieldIds, setExitingProjectFieldIds] = useState<string[]>([]);
  const [pendingProjectFieldFocusId, setPendingProjectFieldFocusId] = useState<
    string | null
  >(null);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [optionsEditFieldId, setOptionsEditFieldId] = useState<string | null>(null);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (!saveState.success) {
      return;
    }

    // Refresh to pull normalized config from the server, so
    // "unsaved changes" clears and public form previews update.
    scheduleRefresh();
  }, [scheduleRefresh, saveState.success]);

  const activeProjectFields = useMemo(
    () =>
      exitingProjectFieldIds.length === 0
        ? projectFields
        : projectFields.filter(
            (field) => !exitingProjectFieldIds.includes(getFieldId(field)),
          ),
    [exitingProjectFieldIds, projectFields],
  );
  const editableProjectFields = useMemo(
    () =>
      projectFields.filter(
        (field) => !(field.kind === "system" && field.key === "attachment"),
      ),
    [projectFields],
  );
  const attachmentField = useMemo(
    () =>
      projectFields.find(
        (field): field is InquiryFormSystemFieldDefinition =>
          field.kind === "system" && field.key === "attachment",
      ) ?? null,
    [projectFields],
  );
  const serializedConfig = JSON.stringify({
    version: 1,
    businessType: settings.businessType,
    groupLabels,
    contactFields,
    projectFields: activeProjectFields,
  } satisfies InquiryFormConfig);
  const initialSerializedConfig = useMemo(
    () =>
      JSON.stringify({
        version: 1,
        businessType: settings.businessType,
        groupLabels: normalizedSettingsConfig.groupLabels,
        contactFields: normalizedSettingsConfig.contactFields,
        projectFields: normalizedSettingsConfig.projectFields,
      } satisfies InquiryFormConfig),
    [
      settings.businessType,
      normalizedSettingsConfig.contactFields,
      normalizedSettingsConfig.groupLabels,
      normalizedSettingsConfig.projectFields,
    ],
  );

  const hasUnsavedChanges = serializedConfig !== initialSerializedConfig;
  const previewDraft = useMemo(
    () => ({
      businessType: settings.businessType,
      serviceName: settings.serviceName,
      serviceSlug: settings.serviceSlug,
      inquiryFormConfig: {
        version: 1,
        businessType: settings.businessType,
        groupLabels,
        contactFields,
        projectFields: activeProjectFields,
      } satisfies InquiryFormConfig,
      inquiryPageConfig: settings.inquiryPageConfig,
    }),
    [
      activeProjectFields,
      contactFields,
      groupLabels,
      settings.inquiryPageConfig,
      settings.businessType,
      settings.serviceName,
      settings.serviceSlug,
    ],
  );
  const [shouldRenderFloatingActions, setShouldRenderFloatingActions] = useState(false);
  const [floatingActionsState, setFloatingActionsState] = useState<"open" | "closed">(
    "closed",
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    onDraftChange(previewDraft);
  }, [isActive, onDraftChange, previewDraft]);

  useEffect(() => {
    if (!isActive || wasActiveRef.current) {
      wasActiveRef.current = isActive;
      return;
    }

    wasActiveRef.current = isActive;

    if (draftMatchesState({ draft, previewDraft })) {
      return;
    }

    queueMicrotask(() => {
      clearProjectFieldTimers(projectFieldTimeoutsRef);
      projectFieldRectsRef.current = new Map();
      for (const animation of projectFieldAnimationsRef.current.values()) {
        animation.cancel();
      }
      projectFieldAnimationsRef.current.clear();
      setContactFields(draft.inquiryFormConfig.contactFields);
      setProjectFields(draft.inquiryFormConfig.projectFields);
      setGroupLabels(draft.inquiryFormConfig.groupLabels);
      setProjectGroupLabelDraft(draft.inquiryFormConfig.groupLabels.project);
      setIsEditingProjectGroupLabel(false);
      setEnteringProjectFieldIds([]);
      setExitingProjectFieldIds([]);
      setPendingProjectFieldFocusId(null);
    });
  }, [draft, isActive, previewDraft]);

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();

    for (const field of projectFields) {
      const fieldId = getFieldId(field);
      const node = projectFieldCardRefs.current.get(fieldId);

      if (!node) {
        continue;
      }

      const nextRect = node.getBoundingClientRect();
      nextRects.set(fieldId, nextRect);

      if (prefersReducedMotion || skipNextProjectFieldLayoutAnimationRef.current) {
        continue;
      }

      const previousRect = projectFieldRectsRef.current.get(fieldId);

      if (!previousRect) {
        continue;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        continue;
      }

      const currentAnimation = projectFieldAnimationsRef.current.get(fieldId);
      currentAnimation?.cancel();

      const animation = node.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        },
      );

      projectFieldAnimationsRef.current.set(fieldId, animation);

      void animation.finished
        .catch(() => undefined)
        .then(() => {
          if (projectFieldAnimationsRef.current.get(fieldId) === animation) {
            projectFieldAnimationsRef.current.delete(fieldId);
          }
        });
    }

    if (skipNextProjectFieldLayoutAnimationRef.current) {
      skipNextProjectFieldLayoutAnimationRef.current = false;
    }

    projectFieldRectsRef.current = nextRects;
  }, [prefersReducedMotion, projectFields]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => clearProjectFieldTimers(projectFieldTimeoutsRef);
  }, []);

  useEffect(() => {
    if (hasUnsavedChanges) {
      queueMicrotask(() => {
        setShouldRenderFloatingActions(true);
        setFloatingActionsState("open");
      });
      return;
    }

    queueMicrotask(() => {
      setFloatingActionsState("closed");
    });
    const timeout = window.setTimeout(
      () => setShouldRenderFloatingActions(false),
      prefersReducedMotion ? 0 : 180,
    );
    return () => window.clearTimeout(timeout);
  }, [hasUnsavedChanges, prefersReducedMotion]);

  useEffect(() => {
    if (!pendingProjectFieldFocusId) {
      return;
    }

    const input = projectFieldLabelInputRefs.current.get(pendingProjectFieldFocusId);

    if (!input) {
      return;
    }

    queueMicrotask(() => {
      input.focus();
      input.select();
      setPendingProjectFieldFocusId(null);
    });
  }, [pendingProjectFieldFocusId, projectFields]);

  function updateProjectField(
    fieldId: string,
    patch: Partial<InquiryFormFieldDefinition>,
  ) {
    skipNextProjectFieldLayoutAnimationRef.current = true;
    setProjectFields((currentFields) =>
      currentFields.map((field) =>
        getFieldId(field) === fieldId ? ({ ...field, ...patch } as InquiryFormFieldDefinition) : field,
      ),
    );
  }

  function updateContactField(
    contactKey: InquiryContactFieldKey,
    patch: Partial<InquiryContactFieldConfig>,
  ) {
    setContactFields((currentFields) => ({
      ...currentFields,
      [contactKey]: {
        ...currentFields[contactKey],
        ...patch,
      },
    }));
  }

  function moveProjectField(fieldId: string, direction: "up" | "down") {
    setProjectFields((currentFields) => {
      const editableFieldIds = currentFields
        .filter(
          (field) =>
            !(field.kind === "system" && field.key === "attachment"),
        )
        .map((field) => getFieldId(field));
      const index = editableFieldIds.findIndex((currentId) => currentId === fieldId);

      if (index < 0) {
        return currentFields;
      }

      const nextIndex = direction === "up" ? index - 1 : index + 1;

      if (nextIndex < 0 || nextIndex >= editableFieldIds.length) {
        return currentFields;
      }

      const activeIndex = currentFields.findIndex(
        (field) => getFieldId(field) === fieldId,
      );
      const overIndex = currentFields.findIndex(
        (field) => getFieldId(field) === editableFieldIds[nextIndex],
      );

      if (activeIndex < 0 || overIndex < 0) {
        return currentFields;
      }

      return arrayMove(currentFields, activeIndex, overIndex);
    });
  }

  function removeProjectField(fieldId: string) {
    if (exitingProjectFieldIds.includes(fieldId)) {
      return;
    }

    setExitingProjectFieldIds((currentIds) =>
      currentIds.includes(fieldId) ? currentIds : [...currentIds, fieldId],
    );
    scheduleProjectFieldTimeout(
      projectFieldTimeoutsRef,
      () => {
        setProjectFields((currentFields) =>
          currentFields.filter((field) => getFieldId(field) !== fieldId),
        );
        setExitingProjectFieldIds((currentIds) =>
          currentIds.filter((currentId) => currentId !== fieldId),
        );
      },
      prefersReducedMotion ? 0 : 220,
    );
  }

  function addCustomField(fieldType: InquiryCustomFieldType = "short_text") {
    if (hasReachedCustomFieldLimit) {
      return;
    }

    const draft = createCustomFieldDraft({
      label: "New field",
      placeholder: "",
      fieldType,
    });
    const fieldId = getFieldId(draft);

    setProjectFields((currentFields) => [...currentFields, draft]);
    setEnteringProjectFieldIds((currentIds) =>
      currentIds.includes(fieldId) ? currentIds : [...currentIds, fieldId],
    );
    setPendingProjectFieldFocusId(fieldId);
    scheduleProjectFieldTimeout(
      projectFieldTimeoutsRef,
      () =>
        setEnteringProjectFieldIds((currentIds) =>
          currentIds.filter((currentId) => currentId !== fieldId),
        ),
      prefersReducedMotion ? 0 : 240,
    );
  }

  const optionsEditField = useMemo(() => {
    if (!optionsEditFieldId) return null;
    const field = projectFields.find(
      (f) => getFieldId(f) === optionsEditFieldId,
    );
    return field?.kind === "custom" ? field : null;
  }, [optionsEditFieldId, projectFields]);

  function changeCustomFieldType(
    fieldId: string,
    fieldType: InquiryCustomFieldType,
  ) {
    skipNextProjectFieldLayoutAnimationRef.current = true;
    setProjectFields((currentFields) =>
      currentFields.map((field) => {
        if (getFieldId(field) !== fieldId || field.kind !== "custom") {
          return field;
        }

        if (fieldType === "select" || fieldType === "multi_select") {
          return {
            ...field,
            fieldType,
            options:
              field.options?.length ? field.options : [createFieldOptionDraft()],
          };
        }

        return {
          ...field,
          fieldType,
          options: undefined,
        };
      }),
    );
  }

  function updateCustomFieldOption(
    fieldId: string,
    optionId: string,
    patch: Partial<InquiryFieldOption>,
  ) {
    skipNextProjectFieldLayoutAnimationRef.current = true;
    setProjectFields((currentFields) =>
      currentFields.map((field) => {
        if (
          getFieldId(field) !== fieldId ||
          field.kind !== "custom" ||
          !field.options
        ) {
          return field;
        }

        return {
          ...field,
          options: field.options.map((option) =>
            option.id === optionId ? { ...option, ...patch } : option,
          ),
        };
      }),
    );
  }

  function addCustomFieldOption(fieldId: string) {
    skipNextProjectFieldLayoutAnimationRef.current = true;
    setProjectFields((currentFields) =>
      currentFields.map((field) => {
        if (
          getFieldId(field) !== fieldId ||
          field.kind !== "custom" ||
          (field.fieldType !== "select" && field.fieldType !== "multi_select")
        ) {
          return field;
        }

        return {
          ...field,
          options: [...(field.options ?? []), createFieldOptionDraft()],
        };
      }),
    );
  }

  function removeCustomFieldOption(fieldId: string, optionId: string) {
    skipNextProjectFieldLayoutAnimationRef.current = true;
    setProjectFields((currentFields) =>
      currentFields.map((field) => {
        if (
          getFieldId(field) !== fieldId ||
          field.kind !== "custom" ||
          !field.options
        ) {
          return field;
        }

        return {
          ...field,
          options:
            field.options.length === 1
              ? field.options
              : field.options.filter((option) => option.id !== optionId),
        };
      }),
    );
  }

  const configError = saveState.fieldErrors?.inquiryFormConfig?.[0];
  const businessTypeError = saveState.fieldErrors?.businessType?.[0];

  function handleCancelChanges() {
    formRef.current?.reset();
    clearProjectFieldTimers(projectFieldTimeoutsRef);
    setGroupLabels(normalizedSettingsConfig.groupLabels);
    setContactFields(normalizedSettingsConfig.contactFields);
    setProjectFields(normalizedSettingsConfig.projectFields);
    setIsEditingProjectGroupLabel(false);
    setEnteringProjectFieldIds([]);
    setExitingProjectFieldIds([]);
    setPendingProjectFieldFocusId(null);
    setOptionsEditFieldId(null);
    setAddFieldDialogOpen(false);
  }

  function startEditingProjectGroupLabel() {
    setProjectGroupLabelDraft(groupLabels.project);
    setIsEditingProjectGroupLabel(true);
  }

  function saveProjectGroupLabel() {
    const trimmed = projectGroupLabelDraft.trim();

    if (!trimmed) {
      cancelProjectGroupLabelEdit();
      return;
    }

    setGroupLabels((current) => ({ ...current, project: trimmed }));
    setProjectGroupLabelDraft(trimmed);
    setIsEditingProjectGroupLabel(false);
  }

  function cancelProjectGroupLabelEdit() {
    setProjectGroupLabelDraft(groupLabels.project);
    setIsEditingProjectGroupLabel(false);
  }

  const customProjectFieldCount = useMemo(
    () => activeProjectFields.filter((field) => field.kind === "custom").length,
    [activeProjectFields],
  );
  const customFieldLimit = getInquiryCustomFieldLimit(settings.plan);
  const hasReachedCustomFieldLimit =
    customProjectFieldCount >= customFieldLimit;
  const attachmentHelpText = getPublicInquiryAttachmentHelpText(settings.plan);
  const isFieldInteractionLocked = isSavePending || exitingProjectFieldIds.length > 0;
  const projectFieldSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function resetProjectFieldAnimations() {
    for (const animation of projectFieldAnimationsRef.current.values()) {
      animation.cancel();
    }

    projectFieldAnimationsRef.current.clear();
  }

  function handleProjectFieldDragStart() {
    resetProjectFieldAnimations();
  }

  function handleProjectFieldDragCancel() {
    skipNextProjectFieldLayoutAnimationRef.current = false;
  }

  function handleProjectFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    skipNextProjectFieldLayoutAnimationRef.current = true;
    setProjectFields((currentFields) => {
      const activeIndex = currentFields.findIndex(
        (field) => getFieldId(field) === active.id,
      );
      const overIndex = currentFields.findIndex(
        (field) => getFieldId(field) === over.id,
      );

      if (activeIndex < 0 || overIndex < 0) {
        return currentFields;
      }

      return arrayMove(currentFields, activeIndex, overIndex);
    });
  }

  return (
    <>
      <form
        action={saveFormAction}
        className="form-stack pb-28"
        ref={formRef}
      >
        <input name="businessType" type="hidden" value={settings.businessType} />
        <input name="inquiryFormConfig" type="hidden" value={serializedConfig} />

        <section className="flex flex-col gap-5 sm:gap-6">
          <div className="flex flex-col gap-1.5 sm:px-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              Fields
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Drag to reorder. This preview mirrors what customers see on the public inquiry form.
            </p>
          </div>

          {businessTypeError ? (
            <FieldError errors={[{ message: businessTypeError }]} />
          ) : null}

          {configError ? (
            <FieldError errors={[{ message: configError }]} />
          ) : null}

          <Card className="gap-0 border-border/75 bg-card/96">
            <CardHeader className="gap-2 pb-5">
              <CardTitle className="text-2xl">
                {settings.inquiryPageConfig.formTitle}
              </CardTitle>
              {settings.inquiryPageConfig.formDescription ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {settings.inquiryPageConfig.formDescription}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="pt-0">
              <div className="form-stack">
                <FormSection title={groupLabels.contact}>
                  <FieldGroup>
                    <div className="grid gap-5 sm:grid-cols-2">
                      {inquiryContactFieldKeys.map((contactKey) => {
                        const field = contactFields[contactKey];
                        if (!field) return null;
                        return (
                          <ContactFieldCard
                            contactKey={contactKey}
                            field={field}
                            isPending={isFieldInteractionLocked}
                            key={contactKey}
                            onUpdate={updateContactField}
                          />
                        );
                      })}
                    </div>
                  </FieldGroup>
                </FormSection>

                <FormSection
                  action={
                    hasReachedCustomFieldLimit ? (
                      // The custom-field count is a usage limit, not a plan
                      // entitlement, so there is no feature to gate on — the
                      // button stays disabled and the limit is spelled out in
                      // the "Field limit reached" notice below.
                      <Button
                        className="w-full sm:w-auto"
                        disabled
                        title={`Your plan supports up to ${customFieldLimit} custom fields per form.`}
                        type="button"
                        variant="outline"
                      >
                        <Plus data-icon="inline-start" />
                        Add field
                      </Button>
                    ) : (
                      <Button
                        className="w-full sm:w-auto"
                        disabled={isFieldInteractionLocked}
                        onClick={() => setAddFieldDialogOpen(true)}
                        type="button"
                        variant="outline"
                      >
                        <Plus data-icon="inline-start" />
                        Add field
                      </Button>
                    )
                  }
                  title={
                    isEditingProjectGroupLabel ? (
                      <input
                        autoFocus
                        className="h-auto w-full bg-transparent px-0 py-0 text-sm font-semibold tracking-tight text-foreground outline-none sm:w-auto sm:min-w-[14rem]"
                        maxLength={40}
                        onBlur={saveProjectGroupLabel}
                        onChange={(event) =>
                          setProjectGroupLabelDraft(event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveProjectGroupLabel();
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelProjectGroupLabelEdit();
                          }
                        }}
                        value={projectGroupLabelDraft}
                      />
                    ) : (
                      <button
                        className="text-left outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
                        onClick={startEditingProjectGroupLabel}
                        type="button"
                      >
                        {groupLabels.project}
                      </button>
                    )
                  }
                >
                  <FieldGroup>
                    <DndContext
                      collisionDetection={closestCenter}
                      id={inquiryProjectFieldsDndContextId}
                      onDragCancel={handleProjectFieldDragCancel}
                      onDragEnd={handleProjectFieldDragEnd}
                      onDragStart={handleProjectFieldDragStart}
                      sensors={projectFieldSensors}
                    >
                      <SortableContext
                        id={inquiryProjectFieldsSortableContextId}
                        items={editableProjectFields.map((field) => getFieldId(field))}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid gap-5 sm:grid-cols-2">
                          {editableProjectFields.map((field, index) => {
                            const fieldId = getFieldId(field);

                            return (
                              <ProjectFieldCard
                                cardRef={(node) => {
                                  if (node) {
                                    projectFieldCardRefs.current.set(fieldId, node);
                                    return;
                                  }

                                  projectFieldCardRefs.current.delete(fieldId);
                                }}
                                field={field}
                                index={index}
                                inputRef={(node) => {
                                  if (node) {
                                    projectFieldLabelInputRefs.current.set(fieldId, node);
                                    return;
                                  }

                                  projectFieldLabelInputRefs.current.delete(fieldId);
                                }}
                                isEntering={enteringProjectFieldIds.includes(fieldId)}
                                isExiting={exitingProjectFieldIds.includes(fieldId)}
                                isPending={isFieldInteractionLocked}
                                key={fieldId}
                                onChangeCustomType={changeCustomFieldType}
                                onEditOptions={setOptionsEditFieldId}
                                onMove={moveProjectField}
                                onRemove={removeProjectField}
                                onUpdate={updateProjectField}
                                totalFields={editableProjectFields.length}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </FieldGroup>

                  {hasReachedCustomFieldLimit ? (
                    <Alert>
                      <AlertTitle>Field limit reached</AlertTitle>
                      <AlertDescription>
                        Your plan supports up to {customFieldLimit} custom
                        fields per form.
                      </AlertDescription>
                    </Alert>
                  ) : editableProjectFields.length <= 2 ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Add fields for location, quantity, or preferences.
                    </p>
                  ) : null}
                </FormSection>

                {attachmentField ? (
                  <AttachmentFieldSection
                    helpText={attachmentHelpText}
                    field={attachmentField}
                    isPending={isFieldInteractionLocked}
                    onUpdate={updateProjectField}
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>

        <FloatingFormActions
          className="max-w-4xl"
          disableSubmit={exitingProjectFieldIds.length > 0}
          extraAction={
            <Button
              className="w-full sm:w-auto"
              disabled={isSavePending}
              onClick={onPreview}
              type="button"
              variant="outline"
            >
              <Eye data-icon="inline-start" />
              Preview
            </Button>
          }
          isPending={isSavePending}
          onCancel={handleCancelChanges}
          stackActionsOnMobile
          state={floatingActionsState}
          visible={shouldRenderFloatingActions}
        />
      </form>

      <AddFieldDialog
        disabled={isFieldInteractionLocked || hasReachedCustomFieldLimit}
        onOpenChange={setAddFieldDialogOpen}
        onSelectType={(fieldType) => {
          addCustomField(fieldType);
          setAddFieldDialogOpen(false);
        }}
        open={addFieldDialogOpen}
      />

      <OptionsEditDialog
        field={optionsEditField}
        isPending={isFieldInteractionLocked}
        maxOptions={MAX_CUSTOM_FIELD_OPTIONS}
        onAddOption={addCustomFieldOption}
        onOpenChange={(open) => {
          if (!open) setOptionsEditFieldId(null);
        }}
        onRemoveOption={removeCustomFieldOption}
        onUpdateOption={updateCustomFieldOption}
        open={optionsEditFieldId !== null}
      />
    </>
  );
}

function ContactFieldCard({
  contactKey,
  field,
  isPending,
  onUpdate,
}: {
  contactKey: InquiryContactFieldKey;
  field: InquiryContactFieldConfig;
  isPending: boolean;
  onUpdate: (
    contactKey: InquiryContactFieldKey,
    patch: Partial<InquiryContactFieldConfig>,
  ) => void;
}) {
  const fieldId =
    contactKey === "customerName"
      ? "inquiry-customerName"
      : contactKey === "email"
        ? "inquiry-customerEmail"
        : "inquiry-contactMethod";

  return (
    <Field>
      <FieldTitle className="w-full min-w-0 justify-between gap-2">
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
        >
          {field.label}
        </span>
        <Badge className="shrink-0" variant={field.required ? "secondary" : "outline"}>
          {field.required ? "Required" : "Optional"}
        </Badge>
      </FieldTitle>
      <FieldContent>
        {contactKey === "preferredContact" ? (
          <Combobox
            disabled={isPending}
            id={fieldId}
            onValueChange={() => undefined}
            options={contactMethodOptions}
            placeholder={field.placeholder ?? "Choose how to reach you"}
            value=""
          />
        ) : contactKey === "email" ? (
          <Input
            autoComplete="email"
            className="text-muted-foreground"
            disabled={isPending}
            id={fieldId}
            maxLength={320}
            onChange={(event) =>
              onUpdate(contactKey, { placeholder: event.currentTarget.value })
            }
            placeholder="you@example.com"
            type="email"
            value={field.placeholder ?? ""}
          />
        ) : (
          <Input
            autoComplete="name"
            className="text-muted-foreground"
            disabled={isPending}
            id={fieldId}
            maxLength={120}
            minLength={2}
            onChange={(event) =>
              onUpdate(contactKey, { placeholder: event.currentTarget.value })
            }
            placeholder="e.g. Alicia Cruz"
            value={field.placeholder ?? ""}
          />
        )}
      </FieldContent>
      <p className="text-xs leading-5 text-muted-foreground">
        Used by Requo for customer contact details. This label cannot be changed.
      </p>
    </Field>
  );
}

function ProjectFieldCard({
  cardRef,
  field,
  index,
  inputRef,
  isEntering,
  isExiting,
  isPending,
  onChangeCustomType,
  onEditOptions,
  onMove,
  onRemove,
  onUpdate,
  totalFields,
}: {
  cardRef?: (node: HTMLDivElement | null) => void;
  field: InquiryFormFieldDefinition;
  index: number;
  inputRef: (node: HTMLInputElement | null) => void;
  isEntering: boolean;
  isExiting: boolean;
  isPending: boolean;
  onChangeCustomType: (fieldId: string, fieldType: InquiryCustomFieldType) => void;
  onEditOptions: (fieldId: string) => void;
  onMove: (fieldId: string, direction: "up" | "down") => void;
  onRemove: (fieldId: string) => void;
  onUpdate: (fieldId: string, patch: Partial<InquiryFormFieldDefinition>) => void;
  totalFields: number;
}) {
  const fieldId = getFieldId(field);
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: fieldId,
    disabled: isPending || isExiting,
    transition: inquirySortableTransition,
  });
  const isSystem = field.kind === "system";
  const isHiddenSystemField = isSystem && !field.enabled;
  const isLockedRequired = isSystem && field.key === "details";
  const canToggleEnabled = isSystem && !isLockedRequired;
  const canToggleRequired =
    field.kind === "custom"
      ? true
      : field.key !== "attachment" && !isLockedRequired;
  const hasSelectableOptions =
    field.kind === "custom" &&
    (field.fieldType === "select" || field.fieldType === "multi_select");
  const optionCount =
    field.kind === "custom" ? (field.options?.length ?? 0) : 0;
  const fieldIsWide = isWideField(field);
  const title =
    field.label || (isSystem ? getSystemFieldTitle(field) : "New field");
  const inputId = `editor-${getInquiryFormFieldInputName(field)}`;
  const sortableStyle = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    willChange: isDragging ? "transform" : undefined,
  } satisfies CSSProperties;
  const handleCardRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      cardRef?.(node);
    },
    [cardRef, setNodeRef],
  );

  return (
    <div
      className={cn(
        "flex gap-2",
        fieldIsWide && "sm:col-span-2",
        isDragging && "relative z-10 drop-shadow-lg",
      )}
      ref={handleCardRef}
      style={sortableStyle}
    >
      <button
        aria-label={`Reorder ${title}`}
        className="mt-1 shrink-0 cursor-grab touch-none self-start text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing"
        disabled={isPending || isExiting}
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div
        className="motion-list-item flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg p-2"
        data-motion-state={
          isExiting ? "exiting" : isEntering ? "entering" : undefined
        }
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="group flex min-w-0 flex-1 items-center gap-1.5">
            <input
                aria-label={`${title} label`}
                className="min-w-0 flex-1 bg-transparent px-0 py-0 text-sm font-medium text-foreground outline-none"
                disabled={isPending}
                maxLength={80}
                onBlur={(event) => {
                  const trimmed = event.currentTarget.value.trim();

                  if (!trimmed) {
                    onUpdate(fieldId, { label: title });
                    return;
                  }

                  if (trimmed !== field.label) {
                    onUpdate(fieldId, { label: trimmed });
                  }
                }}
                onChange={(event) =>
                  onUpdate(fieldId, { label: event.currentTarget.value })
                }
                ref={inputRef}
                value={field.label}
              />
            <PencilLine className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-70 group-hover:opacity-70" />
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <Badge
              variant={
                isHiddenSystemField
                  ? "outline"
                  : field.required
                    ? "secondary"
                    : "outline"
              }
            >
              {isHiddenSystemField
                ? "Hidden"
                : field.required
                  ? "Required"
                  : "Optional"}
            </Badge>
            <FieldCardMenu
              deleteDisabled={isSystem || isPending}
              hasSelectableOptions={hasSelectableOptions}
              moveDownDisabled={isPending || index === totalFields - 1}
              moveUpDisabled={isPending || index === 0}
              optionCount={optionCount}
              requiredChecked={field.required}
              requiredDisabled={
                !canToggleRequired ||
                (isSystem && !field.enabled) ||
                isPending
              }
              showChecked={field.kind === "system" ? field.enabled : true}
              showDisabled={
                field.kind === "custom" || !canToggleEnabled || isPending
              }
              title={title}
              typeDisabled={field.kind !== "custom" || isPending}
              typeLabel={getFieldTypeLabel(field)}
              typeValue={
                field.kind === "custom" ? field.fieldType : undefined
              }
              onDelete={() => onRemove(fieldId)}
              onEditOptions={() => onEditOptions(fieldId)}
              onMoveDown={() => onMove(fieldId, "down")}
              onMoveUp={() => onMove(fieldId, "up")}
              onRequiredChange={(required) =>
                onUpdate(fieldId, { required })
              }
              onShowChange={(enabled) => {
                if (field.kind !== "system") {
                  return;
                }

                onUpdate(fieldId, {
                  enabled,
                  required:
                    field.key === "attachment"
                      ? false
                      : enabled
                        ? field.required
                        : false,
                });
              }}
              onTypeChange={(fieldType) =>
                onChangeCustomType(fieldId, fieldType)
              }
            />
          </span>
        </div>
        <ProjectFieldEditorControl
          field={field}
          inputId={inputId}
          isPending={isPending}
          onEditOptions={() => onEditOptions(fieldId)}
          onUpdate={(patch) => onUpdate(fieldId, patch)}
        />
      </div>
    </div>
  );
}

function ProjectFieldEditorControl({
  field,
  inputId,
  isPending,
  onEditOptions,
  onUpdate,
}: {
  field: InquiryFormFieldDefinition;
  inputId: string;
  isPending: boolean;
  onEditOptions: () => void;
  onUpdate: (patch: Partial<InquiryFormFieldDefinition>) => void;
}) {
  const disabled = isPending || (field.kind === "system" && !field.enabled);
  const placeholder = field.placeholder ?? "";

  if (field.kind === "system") {
    if (field.key === "requestedDeadline") {
      return (
        <DatePicker
          disabled={disabled}
          id={inputId}
          onChange={() => undefined}
          value=""
        />
      );
    }

    if (field.key === "details") {
      return (
        <Textarea
          className="text-muted-foreground"
          disabled={disabled}
          id={inputId}
          maxLength={160}
          onChange={(event) =>
            onUpdate({ placeholder: event.currentTarget.value })
          }
          placeholder={field.label}
          rows={7}
          value={placeholder}
        />
      );
    }

    return (
      <Input
        className="text-muted-foreground"
        disabled={disabled}
        id={inputId}
        maxLength={160}
        onChange={(event) =>
          onUpdate({ placeholder: event.currentTarget.value })
        }
        placeholder={field.label}
        value={placeholder}
      />
    );
  }

  switch (field.fieldType) {
    case "long_text":
      return (
        <Textarea
          className="text-muted-foreground"
          disabled={disabled}
          id={inputId}
          maxLength={160}
          onChange={(event) =>
            onUpdate({ placeholder: event.currentTarget.value })
          }
          placeholder={field.label}
          rows={5}
          value={placeholder}
        />
      );
    case "select":
      return (
        <div className="flex flex-col gap-2">
          <Combobox
            disabled={disabled}
            id={inputId}
            onValueChange={() => undefined}
            options={(field.options ?? []).map((option) => ({
              label: option.label || "Untitled option",
              searchText: `${option.label} ${option.value}`,
              value: option.value || option.id,
            }))}
            placeholder={field.placeholder ?? "Select an option"}
            value=""
          />
          <OptionSummaryButton
            disabled={isPending}
            field={field}
            onClick={onEditOptions}
          />
        </div>
      );
    case "multi_select":
      return (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {(field.options ?? []).map((option) => {
              const optionId = `${inputId}-${option.id}`;

              return (
                <label
                  data-padding="none"
                  className="soft-panel flex items-center gap-3 px-3 py-3 shadow-none"
                  htmlFor={optionId}
                  key={option.id}
                >
                  <input
                    className="size-4 rounded border border-[var(--control-border)]"
                    disabled={disabled}
                    id={optionId}
                    onClick={(event) => event.preventDefault()}
                    type="checkbox"
                    value={option.value}
                  />
                  <span className="text-sm text-foreground">
                    {option.label || "Untitled option"}
                  </span>
                </label>
              );
            })}
          </div>
          <OptionSummaryButton
            disabled={isPending}
            field={field}
            onClick={onEditOptions}
          />
        </div>
      );
    case "number":
      return (
        <Input
          className="text-muted-foreground"
          disabled={disabled}
          id={inputId}
          inputMode="decimal"
          maxLength={160}
          onChange={(event) =>
            onUpdate({ placeholder: event.currentTarget.value })
          }
          placeholder={field.label}
          value={placeholder}
        />
      );
    case "date":
      return (
        <DatePicker
          disabled={disabled}
          id={inputId}
          onChange={() => undefined}
          value=""
        />
      );
    case "boolean":
      return (
        <Combobox
          disabled={disabled}
          id={inputId}
          onValueChange={() => undefined}
          options={[
            { label: "Yes", searchText: "Yes true", value: "true" },
            { label: "No", searchText: "No false", value: "false" },
          ]}
          placeholder={field.placeholder ?? "Choose an option"}
          value=""
        />
      );
    case "short_text":
    default:
      return (
        <Input
          className="text-muted-foreground"
          disabled={disabled}
          id={inputId}
          maxLength={160}
          onChange={(event) =>
            onUpdate({ placeholder: event.currentTarget.value })
          }
          placeholder={field.label}
          value={placeholder}
        />
      );
  }
}

function OptionSummaryButton({
  disabled,
  field,
  onClick,
}: {
  disabled: boolean;
  field: InquiryFormCustomFieldDefinition;
  onClick: () => void;
}) {
  const optionCount = field.options?.length ?? 0;

  return (
    <button
      className="flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <ListChecks className="size-3" />
      {optionCount} {optionCount === 1 ? "option" : "options"}
    </button>
  );
}

function AttachmentFieldSection({
  field,
  helpText,
  isPending,
  onUpdate,
}: {
  field: InquiryFormSystemFieldDefinition;
  helpText: string;
  isPending: boolean;
  onUpdate: (fieldId: string, patch: Partial<InquiryFormFieldDefinition>) => void;
}) {
  const fieldId = getFieldId(field);
  const title = field.label || getSystemFieldTitle(field);
  const isHidden = !field.enabled;

  return (
    <FormSection title={title}>
      <FieldGroup>
        <Field data-disabled={isHidden || undefined}>
          <FieldTitle className="w-full min-w-0 justify-between gap-2">
            <input
              aria-label={`${title} label`}
              className="h-auto min-w-0 flex-1 bg-transparent px-0 py-0 text-sm font-medium text-foreground outline-none"
              disabled={isPending}
              maxLength={80}
              onBlur={(event) => {
                const trimmed = event.currentTarget.value.trim();

                if (!trimmed) {
                  onUpdate(fieldId, { label: title });
                  return;
                }

                if (trimmed !== field.label) {
                  onUpdate(fieldId, { label: trimmed });
                }
              }}
              onChange={(event) =>
                onUpdate(fieldId, { label: event.currentTarget.value })
              }
              value={field.label}
            />
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Badge variant="outline">{isHidden ? "Hidden" : "Optional"}</Badge>
              <FieldCardMenu
                deleteDisabled
                hasSelectableOptions={false}
                moveDownDisabled
                moveUpDisabled
                optionCount={0}
                requiredChecked={false}
                requiredDisabled
                showChecked={field.enabled}
                showDisabled={isPending}
                title={title}
                typeDisabled
                typeLabel={getFieldTypeLabel(field)}
                onShowChange={(enabled) =>
                  onUpdate(fieldId, { enabled, required: false })
                }
              />
            </span>
          </FieldTitle>
          <FieldContent>
            <Input disabled={isPending || isHidden} id="inquiry-attachment-preview" type="file" />
            <p className="text-xs leading-5 text-muted-foreground">
              {helpText}
            </p>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FormSection>
  );
}

function FieldCardMenu({
  deleteDisabled = false,
  hasSelectableOptions = false,
  moveDownDisabled = false,
  moveUpDisabled = false,
  onDelete,
  onEditOptions,
  onMoveDown,
  onMoveUp,
  onRequiredChange,
  onShowChange,
  onTypeChange,
  optionCount = 0,
  requiredChecked,
  requiredDisabled,
  showChecked,
  showDisabled,
  title,
  typeDisabled,
  typeLabel,
  typeValue,
}: {
  deleteDisabled?: boolean;
  hasSelectableOptions?: boolean;
  moveDownDisabled?: boolean;
  moveUpDisabled?: boolean;
  onDelete?: () => void;
  onEditOptions?: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onRequiredChange?: (checked: boolean) => void;
  onShowChange?: (checked: boolean) => void;
  onTypeChange?: (fieldType: InquiryCustomFieldType) => void;
  optionCount?: number;
  requiredChecked: boolean;
  requiredDisabled: boolean;
  showChecked: boolean;
  showDisabled: boolean;
  title: string;
  typeDisabled: boolean;
  typeLabel: string;
  typeValue?: InquiryCustomFieldType;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${title} field actions`}
          className="size-7 rounded-full"
          size="icon"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <p className="px-2 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showChecked}
          disabled={showDisabled}
          onCheckedChange={(checked) => {
            if (typeof checked !== "boolean") {
              return;
            }

            onShowChange?.(checked);
          }}
        >
          Show
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={requiredChecked}
          disabled={requiredDisabled}
          onCheckedChange={(checked) => {
            if (typeof checked !== "boolean") {
              return;
            }

            onRequiredChange?.(checked);
          }}
        >
          Required
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={typeDisabled}>
            <span>Type</span>
            <span className="ml-auto text-xs text-muted-foreground">{typeLabel}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44 rounded-xl">
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                onTypeChange?.(value as InquiryCustomFieldType)
              }
              value={typeValue ?? ""}
            >
              {Object.entries(inquiryCustomFieldTypeMeta).map(([value, meta]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {meta.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {hasSelectableOptions ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEditOptions}>
              Edit options
              <span className="ml-auto text-xs text-muted-foreground">
                {optionCount}
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={moveUpDisabled} onSelect={onMoveUp}>
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={moveDownDisabled} onSelect={onMoveDown}>
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={deleteDisabled} onSelect={onDelete} variant="destructive">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const addFieldTypeOptions: Array<{
  type: InquiryCustomFieldType;
  label: string;
  description: string;
  icon: typeof Type;
}> = [
  { type: "short_text", label: "Short text", description: "Single-line text input", icon: Type },
  { type: "long_text", label: "Long text", description: "Multi-line text area", icon: AlignLeft },
  { type: "select", label: "Select", description: "Dropdown with options", icon: ChevronDown },
  { type: "multi_select", label: "Multi-select", description: "Checkboxes with options", icon: ListChecks },
  { type: "number", label: "Number", description: "Numeric input", icon: Hash },
  { type: "date", label: "Date", description: "Date picker", icon: Calendar },
  { type: "boolean", label: "Yes / No", description: "Binary choice", icon: ToggleLeft },
];

function AddFieldDialog({
  disabled,
  onOpenChange,
  onSelectType,
  open,
}: {
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectType: (fieldType: InquiryCustomFieldType) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a field</DialogTitle>
          <DialogDescription>
            Choose a field type to add to your inquiry form.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3 sm:grid-cols-2">
          {addFieldTypeOptions.map(({ type, label, description, icon: Icon }) => (
            <button
              data-padding="none"
              className="soft-panel flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/60"
              disabled={disabled}
              key={type}
              onClick={() => onSelectType(type)}
              type="button"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </button>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function OptionsEditDialog({
  field,
  isPending,
  maxOptions,
  onAddOption,
  onOpenChange,
  onRemoveOption,
  onUpdateOption,
  open,
}: {
  field: InquiryFormCustomFieldDefinition | null;
  isPending: boolean;
  maxOptions: number;
  onAddOption: (fieldId: string) => void;
  onOpenChange: (open: boolean) => void;
  onRemoveOption: (fieldId: string, optionId: string) => void;
  onUpdateOption: (
    fieldId: string,
    optionId: string,
    patch: Partial<InquiryFieldOption>,
  ) => void;
  open: boolean;
}) {
  if (!field) {
    return null;
  }

  const fieldId = field.id;
  const optionCount = field.options?.length ?? 0;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit options</DialogTitle>
          <DialogDescription>
            Manage the choices for &ldquo;{field.label || "this field"}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 overflow-y-auto">
          {(field.options ?? []).map((option) => (
            <div className="flex items-center gap-2" key={option.id}>
              <Input
                disabled={isPending}
                maxLength={80}
                onChange={(event) =>
                  onUpdateOption(fieldId, option.id, {
                    label: event.currentTarget.value,
                    value: normalizeOptionValue(event.currentTarget.value),
                  })
                }
                placeholder="Option label"
                value={option.label}
              />
              <Button
                disabled={isPending || optionCount === 1}
                onClick={() => onRemoveOption(fieldId, option.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {optionCount}/{maxOptions} options
            </p>
            <Button
              disabled={isPending || optionCount >= maxOptions}
              onClick={() => onAddOption(fieldId)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              Add option
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isWideField(field: InquiryFormFieldDefinition) {
  return (
    (field.kind === "system" && field.key === "details") ||
    (field.kind === "custom" &&
      (field.fieldType === "long_text" || field.fieldType === "multi_select"))
  );
}

function getFieldId(field: InquiryFormFieldDefinition) {
  return field.kind === "system" ? field.key : field.id;
}

function clearProjectFieldTimers(timeoutRef: MutableRefObject<number[]>) {
  for (const timeoutId of timeoutRef.current) {
    window.clearTimeout(timeoutId);
  }

  timeoutRef.current = [];
}

function scheduleProjectFieldTimeout(
  timeoutRef: MutableRefObject<number[]>,
  callback: () => void,
  delay: number,
) {
  const timeoutId = window.setTimeout(() => {
    timeoutRef.current = timeoutRef.current.filter((currentId) => currentId !== timeoutId);
    callback();
  }, delay);

  timeoutRef.current = [...timeoutRef.current, timeoutId];
}

function getFieldTypeLabel(field: InquiryFormFieldDefinition) {
  return field.kind === "system"
    ? getSystemFieldInputKindLabel(field)
    : inquiryCustomFieldTypeMeta[field.fieldType].label;
}

function getSystemFieldTitle(field: InquiryFormSystemFieldDefinition) {
  switch (field.key) {
    case "requestedDeadline":
      return "Requested deadline";
    case "budgetText":
      return "Budget";
    case "details":
      return "Details";
    case "attachment":
      return "Attachment";
  }
}

function getSystemFieldInputKindLabel(field: InquiryFormSystemFieldDefinition) {
  switch (field.key) {
    case "requestedDeadline":
      return "Date";
    case "details":
      return "Long text";
    case "attachment":
      return "File upload";
    default:
      return "Text";
  }
}

function normalizeOptionValue(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

function createCustomFieldDraft(
  overrides: Partial<
    Pick<InquiryFormCustomFieldDefinition, "label" | "placeholder" | "fieldType">
  > = {},
): InquiryFormCustomFieldDefinition {
  const fieldType = overrides.fieldType ?? "short_text";

  return {
    kind: "custom",
    id: prefixedId("custom"),
    fieldType,
    label: overrides.label ?? "",
    placeholder: overrides.placeholder ?? "",
    required: false,
    options:
      fieldType === "select" || fieldType === "multi_select"
        ? [createFieldOptionDraft()]
        : undefined,
  };
}

function createFieldOptionDraft(): InquiryFieldOption {
  const id = prefixedId("option");

  return {
    id,
    label: "",
    value: "",
  };
}

function draftMatchesState({
  draft,
  previewDraft,
}: {
  draft: ServicePreviewDraft;
  previewDraft: ServicePreviewDraft;
}) {
  return JSON.stringify(draft) === JSON.stringify(previewDraft);
}
