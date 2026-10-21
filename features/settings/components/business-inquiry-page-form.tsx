"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Eye } from "lucide-react";

import { FloatingFormActions } from "@/components/shared/floating-form-actions";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { getFieldError } from "@/lib/action-state";
import {
  createInquiryPageBusinessContact,
  maxInquiryPageCards,
  type InquiryPageCard,
  type InquiryPageMobileLayout,
  type InquiryPageShowcaseImageCrop,
  type InquiryPageShowcaseImageFrame,
  type InquiryPageShowcaseImageSize,
  type InquiryPageTemplate,
} from "@/features/inquiries/page-config";
import type {
  BusinessInquiryPageActionState,
  BusinessInquiryPagePreviewDraft,
  BusinessInquiryPageSettingsView,
} from "@/features/settings/types";
import { isInquiryPageCustomizationLocked } from "@/features/inquiries/plan-rules";
import { prefixedId } from "@/lib/ids";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import {
  BasicsSection,
  ContentSection,
  LayoutSection,
  CardsSection,
  ShowcaseSection,
  ContactSection,
  CropDialog,
} from "./inquiry-page-form";

type BusinessInquiryPageFormProps = {
  action: (
    state: BusinessInquiryPageActionState,
    formData: FormData,
  ) => Promise<BusinessInquiryPageActionState>;
  settings: BusinessInquiryPageSettingsView;
  logoPreviewUrl: string | null;
  generalSettingsHref: string | null;
  settingsHref: string;
  onDraftChange: (draft: BusinessInquiryPagePreviewDraft) => void;
  onPreview: () => void;
};

const initialState: BusinessInquiryPageActionState = {};

export function BusinessInquiryPageForm({
  action,
  settings,
  logoPreviewUrl,
  generalSettingsHref,
  settingsHref,
  onDraftChange,
  onPreview,
}: BusinessInquiryPageFormProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const pageCustomizationLocked = isInquiryPageCustomizationLocked(
    settings.plan,
  );
  const [formName, setFormName] = useState(settings.formName);
  const [formSlug, setFormSlug] = useState(settings.formSlug);
  const [template, setTemplate] = useState<InquiryPageTemplate>(
    pageCustomizationLocked
      ? "no_supporting_cards"
      : settings.inquiryPageConfig.template,
  );
  const [mobileLayout, setMobileLayout] = useState<InquiryPageMobileLayout>(
    settings.inquiryPageConfig.mobileLayout ?? "full",
  );
  const [showSupportingCards, setShowSupportingCards] = useState(
    pageCustomizationLocked ? false : settings.inquiryPageConfig.showSupportingCards,
  );
  const [showShowcaseImage, setShowShowcaseImage] = useState(
    pageCustomizationLocked ? false : settings.inquiryPageConfig.showShowcaseImage,
  );
  const [showBusinessContact, setShowBusinessContact] = useState(
    settings.inquiryPageConfig.showBusinessContact,
  );
  const [cards, setCards] = useState<InquiryPageCard[]>(
    settings.inquiryPageConfig.cards,
  );
  const [eyebrow, setEyebrow] = useState(
    settings.inquiryPageConfig.eyebrow ?? "",
  );
  const [brandTagline, setBrandTagline] = useState(
    settings.inquiryPageConfig.brandTagline ?? "",
  );
  const [headline, setHeadline] = useState(settings.inquiryPageConfig.headline);
  const [description, setDescription] = useState(
    settings.inquiryPageConfig.description ?? "",
  );
  const [formTitle, setFormTitle] = useState(settings.inquiryPageConfig.formTitle);
  const [formDescription, setFormDescription] = useState(
    settings.inquiryPageConfig.formDescription ?? "",
  );
  const [thankYouMessage, setThankYouMessage] = useState(
    settings.inquiryPageConfig.thankYouMessage ?? "",
  );
  const [businessContactPhone, setBusinessContactPhone] = useState(
    settings.inquiryPageConfig.businessContact?.phone ?? "",
  );
  const [businessContactEmail, setBusinessContactEmail] = useState(
    settings.inquiryPageConfig.businessContact?.email ?? "",
  );
  const [businessFacebookUrl, setBusinessFacebookUrl] = useState(
    settings.inquiryPageConfig.businessContact?.socialLinks?.facebook ?? "",
  );
  const [businessInstagramUrl, setBusinessInstagramUrl] = useState(
    settings.inquiryPageConfig.businessContact?.socialLinks?.instagram ?? "",
  );
  const [businessTwitterXUrl, setBusinessTwitterXUrl] = useState(
    settings.inquiryPageConfig.businessContact?.socialLinks?.twitterX ?? "",
  );
  const [businessLinkedinUrl, setBusinessLinkedinUrl] = useState(
    settings.inquiryPageConfig.businessContact?.socialLinks?.linkedin ?? "",
  );
  const [showcaseImageUrl, setShowcaseImageUrl] = useState(
    settings.inquiryPageConfig.showcaseImage?.url ?? "",
  );
  const [showcaseImageFrame, setShowcaseImageFrame] =
    useState<InquiryPageShowcaseImageFrame>(
      settings.inquiryPageConfig.showcaseImage?.frame ?? "landscape",
    );
  const [showcaseImageSize, setShowcaseImageSize] =
    useState<InquiryPageShowcaseImageSize>(
      settings.inquiryPageConfig.showcaseImage?.size ?? "standard",
    );
  const [showcaseImageCrop, setShowcaseImageCrop] =
    useState<InquiryPageShowcaseImageCrop>(
      settings.inquiryPageConfig.showcaseImage?.crop ?? {
        x: 0,
        y: 0,
        zoom: 1,
      },
    );
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const fieldErrors = state.fieldErrors;
  const nameError = getFieldError(fieldErrors, "name");
  const slugError = getFieldError(fieldErrors, "slug");
  const templateError = getFieldError(fieldErrors, "template");
  const eyebrowError = getFieldError(fieldErrors, "eyebrow");
  const headlineError = getFieldError(fieldErrors, "headline");
  const descriptionError = getFieldError(fieldErrors, "description");
  const brandTaglineError = getFieldError(fieldErrors, "brandTagline");
  const formTitleError = getFieldError(fieldErrors, "formTitle");
  const formDescriptionError = getFieldError(fieldErrors, "formDescription");
  const thankYouMessageError = getFieldError(fieldErrors, "thankYouMessage");
  const businessContactPhoneError = getFieldError(
    fieldErrors,
    "businessContactPhone",
  );
  const businessContactEmailError = getFieldError(
    fieldErrors,
    "businessContactEmail",
  );
  const businessFacebookUrlError = getFieldError(
    fieldErrors,
    "businessFacebookUrl",
  );
  const businessInstagramUrlError = getFieldError(
    fieldErrors,
    "businessInstagramUrl",
  );
  const businessTwitterXUrlError = getFieldError(
    fieldErrors,
    "businessTwitterXUrl",
  );
  const businessLinkedinUrlError = getFieldError(
    fieldErrors,
    "businessLinkedinUrl",
  );
  const showcaseImageUrlError = getFieldError(fieldErrors, "showcaseImageUrl");
  const showcaseImageFrameError = getFieldError(fieldErrors, "showcaseImageFrame");
  const showcaseImageSizeError = getFieldError(fieldErrors, "showcaseImageSize");
  const showcaseImageCropXError = getFieldError(fieldErrors, "showcaseImageCropX");
  const showcaseImageCropYError = getFieldError(fieldErrors, "showcaseImageCropY");
  const showcaseImageCropZoomError = getFieldError(fieldErrors, "showcaseImageCropZoom");
  const cardsError = getFieldError(fieldErrors, "cards");
  const effectiveTemplate = pageCustomizationLocked
    ? "no_supporting_cards"
    : template;
  const effectiveShowSupportingCards = pageCustomizationLocked
    ? false
    : showSupportingCards;
  const effectiveShowShowcaseImage = pageCustomizationLocked
    ? false
    : showShowcaseImage;
  const initialCardsSerialized = useMemo(
    () => JSON.stringify(settings.inquiryPageConfig.cards),
    [settings.inquiryPageConfig.cards],
  );
  const hasControlledChanges =
    formName !== settings.formName ||
    formSlug !== settings.formSlug ||
    (!pageCustomizationLocked &&
      template !== settings.inquiryPageConfig.template) ||
    mobileLayout !== (settings.inquiryPageConfig.mobileLayout ?? "full") ||
    (!pageCustomizationLocked &&
      showSupportingCards !== settings.inquiryPageConfig.showSupportingCards) ||
    (!pageCustomizationLocked &&
      showShowcaseImage !== settings.inquiryPageConfig.showShowcaseImage) ||
    showBusinessContact !== settings.inquiryPageConfig.showBusinessContact ||
    eyebrow !== (settings.inquiryPageConfig.eyebrow ?? "") ||
    brandTagline !== (settings.inquiryPageConfig.brandTagline ?? "") ||
    headline.trim() !== settings.inquiryPageConfig.headline ||
    normalizeOptionalTextDraft(description) !==
      (settings.inquiryPageConfig.description ?? "") ||
    formTitle.trim() !== settings.inquiryPageConfig.formTitle ||
    normalizeOptionalTextDraft(formDescription) !==
      (settings.inquiryPageConfig.formDescription ?? "") ||
    normalizeOptionalTextDraft(thankYouMessage) !==
      (settings.inquiryPageConfig.thankYouMessage ?? "") ||
    businessContactPhone !==
      (settings.inquiryPageConfig.businessContact?.phone ?? "") ||
    businessContactEmail !==
      (settings.inquiryPageConfig.businessContact?.email ?? "") ||
    businessFacebookUrl !==
      (settings.inquiryPageConfig.businessContact?.socialLinks?.facebook ?? "") ||
    businessInstagramUrl !==
      (settings.inquiryPageConfig.businessContact?.socialLinks?.instagram ?? "") ||
    businessTwitterXUrl !==
      (settings.inquiryPageConfig.businessContact?.socialLinks?.twitterX ?? "") ||
    businessLinkedinUrl !==
      (settings.inquiryPageConfig.businessContact?.socialLinks?.linkedin ?? "") ||
    (!pageCustomizationLocked &&
      showcaseImageUrl !==
        (settings.inquiryPageConfig.showcaseImage?.url ?? "")) ||
    (!pageCustomizationLocked &&
      showcaseImageFrame !==
        (settings.inquiryPageConfig.showcaseImage?.frame ?? "landscape")) ||
    (!pageCustomizationLocked &&
      showcaseImageSize !==
        (settings.inquiryPageConfig.showcaseImage?.size ?? "standard")) ||
    (!pageCustomizationLocked &&
      JSON.stringify(showcaseImageCrop) !==
        JSON.stringify(
          settings.inquiryPageConfig.showcaseImage?.crop ?? {
            x: 0,
            y: 0,
            zoom: 1,
          },
        )) ||
    (!pageCustomizationLocked && JSON.stringify(cards) !== initialCardsSerialized);
  const hasUnsavedChanges = hasControlledChanges;
  const [shouldRenderFloatingActions, setShouldRenderFloatingActions] = useState(false);
  const [floatingActionsState, setFloatingActionsState] = useState<"open" | "closed">(
    "closed",
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    scheduleRefresh();
  }, [scheduleRefresh, state.success]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
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

  const draftBusinessContact = useMemo(
    () =>
      createInquiryPageBusinessContact({
        phone: businessContactPhone,
        email: businessContactEmail,
        socialLinks: {
          facebook: businessFacebookUrl,
          instagram: businessInstagramUrl,
          twitterX: businessTwitterXUrl,
          linkedin: businessLinkedinUrl,
        },
      }),
    [
      businessContactEmail,
      businessContactPhone,
      businessFacebookUrl,
      businessInstagramUrl,
      businessLinkedinUrl,
      businessTwitterXUrl,
    ],
  );

  const draftInquiryPageConfig = useMemo(
    () => ({
      template: effectiveTemplate,
      mobileLayout,
      showSupportingCards: effectiveShowSupportingCards,
      showShowcaseImage: effectiveShowShowcaseImage,
      showBusinessContact,
      cards,
      eyebrow: normalizeOptionalTextDraft(eyebrow),
      brandTagline: normalizeOptionalTextDraft(brandTagline),
      headline: headline.trim(),
      description: normalizeOptionalTextDraft(description),
      formTitle: formTitle.trim(),
      formDescription: normalizeOptionalTextDraft(formDescription),
      thankYouMessage: normalizeOptionalTextDraft(thankYouMessage),
      businessContact: draftBusinessContact,
      showcaseImage: showcaseImageUrl.trim()
        ? {
            url: showcaseImageUrl.trim(),
            frame: showcaseImageFrame,
            size: showcaseImageSize,
            crop: showcaseImageCrop,
          }
        : undefined,
    }),
    [
      brandTagline,
      cards,
      description,
      draftBusinessContact,
      effectiveShowShowcaseImage,
      effectiveShowSupportingCards,
      effectiveTemplate,
      eyebrow,
      formDescription,
      formTitle,
      headline,
      mobileLayout,
      showBusinessContact,
      showcaseImageCrop,
      showcaseImageFrame,
      showcaseImageSize,
      showcaseImageUrl,
      thankYouMessage,
    ],
  );

  useEffect(() => {
    onDraftChange({
      businessType: settings.businessType,
      formName,
      formSlug,
      publicInquiryEnabled: settings.publicInquiryEnabled,
      inquiryPageConfig: draftInquiryPageConfig,
    });
  }, [
    draftInquiryPageConfig,
    formName,
    formSlug,
    onDraftChange,
    settings.businessType,
    settings.publicInquiryEnabled,
  ]);

  const hasReachedCardLimit = cards.length >= maxInquiryPageCards;

  function updateCard(
    cardId: string,
    key: keyof InquiryPageCard,
    nextValue: string,
  ) {
    setCards((currentCards) =>
      currentCards.map((card) =>
        card.id === cardId ? { ...card, [key]: nextValue } : card,
      ),
    );
  }

  function removeCard(cardId: string) {
    setCards((currentCards) => currentCards.filter((card) => card.id !== cardId));
  }

  function addCard() {
    if (hasReachedCardLimit) {
      return;
    }

    setCards((currentCards) => [
      ...currentCards,
      {
        id: prefixedId("card"),
        title: "",
        description: "",
        icon: "details",
      },
    ]);
  }

  function handleCardDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setCards((currentCards) => {
      const activeIndex = currentCards.findIndex((card) => card.id === active.id);
      const overIndex = currentCards.findIndex((card) => card.id === over.id);

      if (activeIndex < 0 || overIndex < 0) {
        return currentCards;
      }

      return arrayMove(currentCards, activeIndex, overIndex);
    });
  }

  function handleOpenCropDialog() {
    const trimmedUrl = showcaseImageUrl.trim();

    if (!trimmedUrl) {
      return;
    }

    setIsCropDialogOpen(true);
  }

  function handleCropApply(crop: InquiryPageShowcaseImageCrop) {
    setShowcaseImageCrop(crop);
  }

  function handleCancelChanges() {
    formRef.current?.reset();
    setFormName(settings.formName);
    setFormSlug(settings.formSlug);
    setTemplate(
      pageCustomizationLocked
        ? "no_supporting_cards"
        : settings.inquiryPageConfig.template,
    );
    setMobileLayout(settings.inquiryPageConfig.mobileLayout ?? "full");
    setShowSupportingCards(
      pageCustomizationLocked
        ? false
        : settings.inquiryPageConfig.showSupportingCards,
    );
    setShowShowcaseImage(
      pageCustomizationLocked
        ? false
        : settings.inquiryPageConfig.showShowcaseImage,
    );
    setShowBusinessContact(settings.inquiryPageConfig.showBusinessContact);
    setCards(settings.inquiryPageConfig.cards);
    setEyebrow(settings.inquiryPageConfig.eyebrow ?? "");
    setBrandTagline(settings.inquiryPageConfig.brandTagline ?? "");
    setHeadline(settings.inquiryPageConfig.headline);
    setDescription(settings.inquiryPageConfig.description ?? "");
    setFormTitle(settings.inquiryPageConfig.formTitle);
    setFormDescription(settings.inquiryPageConfig.formDescription ?? "");
    setThankYouMessage(settings.inquiryPageConfig.thankYouMessage ?? "");
    setBusinessContactPhone(
      settings.inquiryPageConfig.businessContact?.phone ?? "",
    );
    setBusinessContactEmail(
      settings.inquiryPageConfig.businessContact?.email ?? "",
    );
    setBusinessFacebookUrl(
      settings.inquiryPageConfig.businessContact?.socialLinks?.facebook ?? "",
    );
    setBusinessInstagramUrl(
      settings.inquiryPageConfig.businessContact?.socialLinks?.instagram ?? "",
    );
    setBusinessTwitterXUrl(
      settings.inquiryPageConfig.businessContact?.socialLinks?.twitterX ?? "",
    );
    setBusinessLinkedinUrl(
      settings.inquiryPageConfig.businessContact?.socialLinks?.linkedin ?? "",
    );
    setShowcaseImageUrl(settings.inquiryPageConfig.showcaseImage?.url ?? "");
    setShowcaseImageFrame(
      settings.inquiryPageConfig.showcaseImage?.frame ?? "landscape",
    );
    setShowcaseImageSize(
      settings.inquiryPageConfig.showcaseImage?.size ?? "standard",
    );
    setShowcaseImageCrop(
      settings.inquiryPageConfig.showcaseImage?.crop ?? {
        x: 0,
        y: 0,
        zoom: 1,
      },
    );
    setIsCropDialogOpen(false);
  }

  return (
    <form
      action={formAction}
      className="form-stack pb-28"
      ref={formRef}
    >
      {/* The service inherits the business's template; it is not editable
          here. Template changes happen in Settings → Template. */}
      <input
        name="businessType"
        type="hidden"
        value={settings.businessType}
      />
      <input
        name="publicInquiryEnabled"
        type="hidden"
        value={String(settings.publicInquiryEnabled)}
      />
      <input name="template" type="hidden" value={effectiveTemplate} />
      <input name="mobileLayout" type="hidden" value={mobileLayout} />
      <input
        name="showSupportingCards"
        type="hidden"
        value={String(effectiveShowSupportingCards)}
      />
      <input
        name="showShowcaseImage"
        type="hidden"
        value={String(effectiveShowShowcaseImage)}
      />
      <input
        name="showBusinessContact"
        type="hidden"
        value={String(showBusinessContact)}
      />
      <input name="showcaseImageUrl" type="hidden" value={showcaseImageUrl} />
      <input
        name="showcaseImageFrame"
        type="hidden"
        value={showcaseImageFrame}
      />
      <input
        name="showcaseImageSize"
        type="hidden"
        value={showcaseImageSize}
      />
      <input
        name="showcaseImageCropX"
        type="hidden"
        value={String(showcaseImageCrop.x)}
      />
      <input
        name="showcaseImageCropY"
        type="hidden"
        value={String(showcaseImageCrop.y)}
      />
      <input
        name="showcaseImageCropZoom"
        type="hidden"
        value={String(showcaseImageCrop.zoom)}
      />
      <input name="cards" type="hidden" value={JSON.stringify(cards)} />

      <div className="flex flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-1.5 sm:px-2">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Page
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Edit what customers see on the public inquiry page.
          </p>
        </div>

        <Accordion
          type="multiple"
          defaultValue={["basics", "content"]}
          className="flex flex-col gap-3"
        >
          <AccordionItem value="basics" data-padding="none" className="section-panel border-none p-0">
            <AccordionTrigger className="gap-4 px-5 py-4 hover:no-underline sm:px-6">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                  Basics
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Service name and link
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="border-t border-border/60 px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
                <BasicsSection
                  formName={formName}
                  formSlug={formSlug}
                  isPending={isPending}
                  nameError={nameError}
                  slugError={slugError}
                  settingsSlug={settings.slug}
                  onFormNameChange={setFormName}
                  onFormSlugChange={setFormSlug}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="content" data-padding="none" className="section-panel border-none p-0">
            <AccordionTrigger className="gap-4 px-5 py-4 hover:no-underline sm:px-6">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                  Content
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Headline, form heading, and page copy
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="border-t border-border/60 px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
                <ContentSection
                  headline={headline}
                  formTitle={formTitle}
                  thankYouMessage={thankYouMessage}
                  eyebrow={eyebrow}
                  brandTagline={brandTagline}
                  description={description}
                  formDescription={formDescription}
                  isPending={isPending}
                  pageCustomizationLocked={pageCustomizationLocked}
                  plan={settings.plan}
                  businessName={settings.name}
                  shortDescription={settings.shortDescription}
                  headlineError={headlineError}
                  formTitleError={formTitleError}
                  thankYouMessageError={thankYouMessageError}
                  eyebrowError={eyebrowError}
                  brandTaglineError={brandTaglineError}
                  descriptionError={descriptionError}
                  formDescriptionError={formDescriptionError}
                  onHeadlineChange={setHeadline}
                  onFormTitleChange={setFormTitle}
                  onThankYouMessageChange={setThankYouMessage}
                  onEyebrowChange={setEyebrow}
                  onBrandTaglineChange={setBrandTagline}
                  onDescriptionChange={setDescription}
                  onFormDescriptionChange={setFormDescription}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="layout" data-padding="none" className="section-panel border-none p-0">
            <AccordionTrigger className="gap-4 px-5 py-4 hover:no-underline sm:px-6">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                  Layout
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  Template, mobile layout, and branding
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="border-t border-border/60 px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
                <LayoutSection
                  effectiveTemplate={effectiveTemplate}
                  mobileLayout={mobileLayout}
                  isPending={isPending}
                  pageCustomizationLocked={pageCustomizationLocked}
                  plan={settings.plan}
                  templateError={templateError}
                  logoPreviewUrl={logoPreviewUrl}
                  generalSettingsHref={generalSettingsHref}
                  settingsHref={settingsHref}
                  businessName={settings.name}
                  onTemplateChange={setTemplate}
                  onMobileLayoutChange={setMobileLayout}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {(effectiveTemplate !== "no_supporting_cards" || pageCustomizationLocked) ? (
            <AccordionItem value="cards" data-padding="none" className="section-panel border-none p-0">
              <AccordionTrigger className="gap-4 px-5 py-4 hover:no-underline sm:px-6">
                <div className="flex flex-col gap-0.5">
                  <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                    Supporting cards
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Short prompts shown beside the form
                    {cards.length > 0 ? ` · ${cards.length} card${cards.length === 1 ? "" : "s"}` : ""}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <div className="border-t border-border/60 px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
                  <CardsSection
                    cards={cards}
                    effectiveShowSupportingCards={effectiveShowSupportingCards}
                    isPending={isPending}
                    pageCustomizationLocked={pageCustomizationLocked}
                    plan={settings.plan}
                    hasReachedCardLimit={hasReachedCardLimit}
                    prefersReducedMotion={prefersReducedMotion}
                    cardsError={cardsError}
                    onAddCard={addCard}
                    onRemoveCard={removeCard}
                    onUpdateCard={updateCard}
                    onCardDragEnd={handleCardDragEnd}
                    onShowSupportingCardsChange={setShowSupportingCards}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          ) : null}

          <AccordionItem value="showcase" data-padding="none" className="section-panel border-none p-0">
            <AccordionTrigger className="gap-4 px-5 py-4 hover:no-underline sm:px-6">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                  Showcase image
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {effectiveShowShowcaseImage && showcaseImageUrl.trim()
                    ? "Image visible on public page"
                    : "Optional hero image"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="border-t border-border/60 px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
                <ShowcaseSection
                  showcaseImageUrl={showcaseImageUrl}
                  showcaseImageFrame={showcaseImageFrame}
                  showcaseImageSize={showcaseImageSize}
                  showcaseImageCrop={showcaseImageCrop}
                  effectiveShowShowcaseImage={effectiveShowShowcaseImage}
                  isPending={isPending}
                  pageCustomizationLocked={pageCustomizationLocked}
                  plan={settings.plan}
                  showcaseImageUrlError={showcaseImageUrlError}
                  showcaseImageFrameError={showcaseImageFrameError}
                  showcaseImageSizeError={showcaseImageSizeError}
                  cropError={null}
                  showcaseImageCropXError={showcaseImageCropXError}
                  showcaseImageCropYError={showcaseImageCropYError}
                  showcaseImageCropZoomError={showcaseImageCropZoomError}
                  onShowcaseImageUrlChange={setShowcaseImageUrl}
                  onShowcaseImageFrameChange={setShowcaseImageFrame}
                  onShowcaseImageSizeChange={setShowcaseImageSize}
                  onShowShowcaseImageChange={setShowShowcaseImage}
                  onOpenCropDialog={handleOpenCropDialog}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="contact" data-padding="none" className="section-panel border-none p-0">
            <AccordionTrigger className="gap-4 px-5 py-4 hover:no-underline sm:px-6">
              <div className="flex flex-col gap-0.5">
                <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                  Business contact
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {showBusinessContact
                    ? "Shown on the public form"
                    : "Hidden from public page"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="border-t border-border/60 px-5 pt-5 pb-5 sm:px-6 sm:pb-6">
                <ContactSection
                  showBusinessContact={showBusinessContact}
                  businessContactPhone={businessContactPhone}
                  businessContactEmail={businessContactEmail}
                  businessFacebookUrl={businessFacebookUrl}
                  businessInstagramUrl={businessInstagramUrl}
                  businessTwitterXUrl={businessTwitterXUrl}
                  businessLinkedinUrl={businessLinkedinUrl}
                  isPending={isPending}
                  businessContactPhoneError={businessContactPhoneError}
                  businessContactEmailError={businessContactEmailError}
                  businessFacebookUrlError={businessFacebookUrlError}
                  businessInstagramUrlError={businessInstagramUrlError}
                  businessTwitterXUrlError={businessTwitterXUrlError}
                  businessLinkedinUrlError={businessLinkedinUrlError}
                  onShowBusinessContactChange={setShowBusinessContact}
                  onBusinessContactPhoneChange={setBusinessContactPhone}
                  onBusinessContactEmailChange={setBusinessContactEmail}
                  onBusinessFacebookUrlChange={setBusinessFacebookUrl}
                  onBusinessInstagramUrlChange={setBusinessInstagramUrl}
                  onBusinessTwitterXUrlChange={setBusinessTwitterXUrl}
                  onBusinessLinkedinUrlChange={setBusinessLinkedinUrl}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <FloatingFormActions
        extraAction={
          <Button disabled={isPending} onClick={onPreview} type="button" variant="outline">
            <Eye data-icon="inline-start" />
            Preview
          </Button>
        }
        isPending={isPending}
        onCancel={handleCancelChanges}
        stackActionsOnMobile
        state={floatingActionsState}
        visible={shouldRenderFloatingActions}
      />

      <CropDialog
        isOpen={isCropDialogOpen}
        showcaseImageUrl={showcaseImageUrl}
        showcaseImageFrame={showcaseImageFrame}
        showcaseImageCrop={showcaseImageCrop}
        onClose={() => setIsCropDialogOpen(false)}
        onApply={handleCropApply}
      />
    </form>
  );
}

function normalizeOptionalTextDraft(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}
