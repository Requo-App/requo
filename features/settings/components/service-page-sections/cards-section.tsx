"use client";

import { type CSSProperties } from "react";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  maxInquiryPageCardDescriptionLength,
  maxInquiryPageCardTitleLength,
  type InquiryPageCard,
  type InquiryPageCardIcon,
} from "@/features/inquiries/page-config";
import { inquiryPageCardIconMeta } from "@/features/inquiries/components/inquiry-page-card-icon-meta";
import { FeatureGate } from "@/features/entitlements";
import type { PlanTier } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

import { BuilderSection, SectionVisibilityToggle } from "./shared";

const inquiryPageCardsDndContextId = "service-page-cards-dnd";
const inquiryPageCardsSortableContextId = "service-page-cards-sortable";
const inquiryPageSortableTransition = {
  duration: 160,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
} as const;

export type CardsSectionProps = {
  cards: InquiryPageCard[];
  effectiveShowSupportingCards: boolean;
  isPending: boolean;
  pageCustomizationLocked: boolean;
  plan: PlanTier;
  hasReachedCardLimit: boolean;
  prefersReducedMotion: boolean;
  cardsError: string | undefined;
  onAddCard: () => void;
  onRemoveCard: (cardId: string) => void;
  onUpdateCard: (cardId: string, key: keyof InquiryPageCard, nextValue: string) => void;
  onCardDragEnd: (event: DragEndEvent) => void;
  onShowSupportingCardsChange: (nextValue: boolean) => void;
};

export function CardsSection({
  cards,
  effectiveShowSupportingCards,
  isPending,
  pageCustomizationLocked,
  plan,
  hasReachedCardLimit,
  prefersReducedMotion,
  cardsError,
  onAddCard,
  onRemoveCard,
  onUpdateCard,
  onCardDragEnd,
  onShowSupportingCardsChange,
}: CardsSectionProps) {
  const cardSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <div>
      <BuilderSection
        action={
          <FeatureGate variant="action" feature="servicePageCustomization" plan={plan}>
            <Button
              className="w-full sm:w-auto"
              disabled={isPending || hasReachedCardLimit}
              onClick={onAddCard}
              type="button"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              Add card
            </Button>
          </FeatureGate>
        }
        title="Cards"
      >
        <SectionVisibilityToggle
          checked={effectiveShowSupportingCards}
          description="Keep the cards saved, but hide them from the public page when this is off."
          disabled={isPending || pageCustomizationLocked}
          label="Show supporting cards"
          locked={pageCustomizationLocked}
          plan={plan}
          onCheckedChange={onShowSupportingCardsChange}
        />

        {cards.length ? (
          <DndContext
            collisionDetection={closestCenter}
            id={inquiryPageCardsDndContextId}
            onDragEnd={onCardDragEnd}
            sensors={cardSensors}
          >
            <SortableContext
              id={inquiryPageCardsSortableContextId}
              items={cards.map((card) => card.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-4">
                {cards.map((card, index) => (
                  <SortableInquiryPageCard
                    card={card}
                    index={index}
                    isPending={isPending || pageCustomizationLocked}
                    key={card.id}
                    prefersReducedMotion={prefersReducedMotion}
                    onRemove={onRemoveCard}
                    onUpdate={onUpdateCard}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
 <div className="soft-panel">
            <p className="text-sm font-medium text-foreground">
              No supporting cards saved
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add cards if you want to highlight what customers should send,
              what files help most, or how the owner reviews new inquiries.
            </p>
          </div>
        )}

        <FieldError
          errors={cardsError ? [{ message: cardsError }] : undefined}
        />
      </BuilderSection>
    </div>
  );
}

function SortableInquiryPageCard({
  card,
  index,
  isPending,
  prefersReducedMotion,
  onRemove,
  onUpdate,
}: {
  card: InquiryPageCard;
  index: number;
  isPending: boolean;
  prefersReducedMotion: boolean;
  onRemove: (cardId: string) => void;
  onUpdate: (cardId: string, key: keyof InquiryPageCard, nextValue: string) => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: isPending,
    transition: prefersReducedMotion ? null : inquiryPageSortableTransition,
  });
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    willChange: isDragging ? "transform" : undefined,
  } satisfies CSSProperties;
  const Icon = inquiryPageCardIconMeta[card.icon].icon;
  const dragHandleLabel = card.title.trim()
    ? `Reorder ${card.title}`
    : `Reorder card ${index + 1}`;

  return (
    <div
      className={cn(
        "soft-panel overflow-hidden shadow-none",
        isDragging && "relative z-10 ring-2 ring-primary/20 shadow-lg",
      )}
      ref={setNodeRef}
      style={sortableStyle}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/85 text-accent-foreground shadow-[inset_0_1px_0_var(--surface-highlight)]">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                Card {index + 1}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Supporting detail shown beside the inquiry form.
              </p>
            </div>
          </div>

          <div className="dashboard-actions self-start">
            <Button
              aria-label={dragHandleLabel}
              className="cursor-grab touch-none active:cursor-grabbing"
              disabled={isPending}
              ref={setActivatorNodeRef}
              size="icon-sm"
              type="button"
              variant="outline"
              {...attributes}
              {...listeners}
            >
              <GripVertical />
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onRemove(card.id)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-[12rem_minmax(0,1fr)]">
            <Field>
              <FieldLabel>Icon</FieldLabel>
              <FieldContent>
                <div onPointerDownCapture={(event) => event.stopPropagation()}>
                  <Combobox
                    disabled={isPending}
                    id={`inquiry-card-icon-${card.id}`}
                    onValueChange={(value) => onUpdate(card.id, "icon", value)}
                    options={(
                      Object.keys(inquiryPageCardIconMeta) as InquiryPageCardIcon[]
                    ).map((iconKey) => ({
                      icon: inquiryPageCardIconMeta[iconKey].icon,
                      label: inquiryPageCardIconMeta[iconKey].label,
                      searchText: inquiryPageCardIconMeta[iconKey].label,
                      value: iconKey,
                    }))}
                    placeholder="Choose an icon"
                    renderOption={(option) => {
                      const OptionIcon = option.icon;

                      return (
                        <span className="inline-flex items-center gap-2">
                          <OptionIcon className="size-4" />
                          {option.label}
                        </span>
                      );
                    }}
                    renderValue={(option) => {
                      const OptionIcon = option.icon;

                      return (
                        <span className="inline-flex min-w-0 items-center gap-2 text-left">
                          <OptionIcon className="size-4 shrink-0" />
                          <span className="truncate">{option.label}</span>
                        </span>
                      );
                    }}
                    searchPlaceholder="Search icon"
                    value={card.icon}
                  />
                </div>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor={`inquiry-card-title-${card.id}`}>Title</FieldLabel>
              <FieldContent>
                <Input
                  disabled={isPending}
                  id={`inquiry-card-title-${card.id}`}
                  maxLength={maxInquiryPageCardTitleLength}
                  onChange={(event) =>
                    onUpdate(card.id, "title", event.currentTarget.value)
                  }
                  onPointerDownCapture={(event) => event.stopPropagation()}
                  placeholder="Clear details"
                  required
                  value={card.title}
                />
              </FieldContent>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`inquiry-card-description-${card.id}`}>
              Description
            </FieldLabel>
            <FieldContent>
              <Textarea
                disabled={isPending}
                id={`inquiry-card-description-${card.id}`}
                maxLength={maxInquiryPageCardDescriptionLength}
                onChange={(event) =>
                  onUpdate(card.id, "description", event.currentTarget.value)
                }
                onPointerDownCapture={(event) => event.stopPropagation()}
                placeholder="Explain why this detail matters and what customers should include."
                rows={3}
                required
                value={card.description}
              />
            </FieldContent>
          </Field>
        </div>
      </div>
    </div>
  );
}
