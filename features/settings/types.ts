import type { BusinessRecordState } from "@/features/businesses/lifecycle";
import type { BusinessType } from "@/features/inquiries/business-types";
import type {
  InquiryFormConfig,
  InquiryFormFieldDefinition,
} from "@/features/inquiries/form-config";
import type { InquiryPageConfig } from "@/features/inquiries/page-config";
import type { ServiceSummary } from "@/features/inquiries/types";
import type {
  InvoiceEmailTemplateConfigV2,
  QuoteEmailTemplateConfigV2,
  QuoteFollowUpTemplateConfigV2,
} from "@/features/settings/email-templates";
import type { PlanTier as plan } from "@/lib/plans/plans";

export type BusinessSettingsView = {
  id: string;
  businessId: string;
  businessSlug: string;
  plan: plan;
  name: string;
  slug: string;
  recordState: BusinessRecordState;
  archivedAt: Date | null;
  deletedAt: Date | null;
  activeBusinessCount: number;
  countryCode: string | null;
  shortDescription: string | null;
  contactEmail: string | null;
  website: string | null;
  logoStoragePath: string | null;
  logoContentType: string | null;
  defaultEmailSignature: string | null;
  defaultQuoteNotes: string | null;
  defaultQuoteTerms: string | null;
  quoteEmailTemplate: QuoteEmailTemplateConfigV2;
  invoiceEmailTemplate: InvoiceEmailTemplateConfigV2;
  quoteFollowUpTemplate: QuoteFollowUpTemplateConfigV2;
  defaultQuoteValidityDays: number;
  sendInquiryAckEmail: boolean;
  autoDraftQuoteOnQualify: boolean;
  autoArchiveStaleInquiries: boolean;
  autoArchiveStaleInquiryDays: number;
  autoFollowUpOnQuoteViewed: boolean;
  quoteViewedFollowUpDelayDays: number;
  notifyInAppOnNewInquiry: boolean;
  notifyInAppOnQuoteSent: boolean;
  notifyInAppOnQuoteResponse: boolean;
  notifyInAppOnMemberInviteResponse: boolean;
  notifyPushOnNewInquiry: boolean;
  notifyPushOnQuoteSent: boolean;
  notifyPushOnQuoteResponse: boolean;
  notifyPushOnMemberInviteResponse: boolean;
  notifyInAppOnFollowUpReminder: boolean;
  notifyInAppOnQuoteExpiring: boolean;
  defaultCurrency: string;
  agentEnabled: boolean;
  agentTone: "friendly" | "professional" | "casual";
  /** Owner-authored guidance injected into both AI surfaces. Empty when unset. */
  agentInstructions: string;
  updatedAt: Date;
};

export type BusinessGeneralSettingsFieldName =
  | "name"
  | "slug"
  | "countryCode"
  | "shortDescription"
  | "contactEmail"
  | "website"
  | "defaultCurrency"
  | "defaultEmailSignature"
  | "logo";

export type BusinessSettingsFieldErrors = Partial<
  Record<BusinessGeneralSettingsFieldName, string[] | undefined>
>;

export type BusinessSettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: BusinessSettingsFieldErrors;
};

export type BusinessNotificationSettingsFieldName =
  | "notifyInAppOnNewInquiry"
  | "notifyInAppOnQuoteSent"
  | "notifyInAppOnQuoteResponse"
  | "notifyInAppOnMemberInviteResponse"
  | "notifyPushOnNewInquiry"
  | "notifyPushOnQuoteSent"
  | "notifyPushOnQuoteResponse"
  | "notifyPushOnMemberInviteResponse"
  | "notifyInAppOnFollowUpReminder"
  | "notifyInAppOnQuoteExpiring";

export type BusinessNotificationSettingsFieldErrors = Partial<
  Record<BusinessNotificationSettingsFieldName, string[] | undefined>
>;

export type BusinessNotificationSettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: BusinessNotificationSettingsFieldErrors;
};

export type BusinessAgentSettingsFieldName =
  | "agentEnabled"
  | "tone"
  | "agentInstructions";

export type BusinessAgentSettingsFieldErrors = Partial<
  Record<BusinessAgentSettingsFieldName, string[] | undefined>
>;

export type BusinessAgentSettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: BusinessAgentSettingsFieldErrors;
};

export type BusinessQuoteSettingsFieldName =
  | "defaultQuoteNotes"
  | "defaultQuoteTerms"
  | "defaultQuoteValidityDays"
  | "sendInquiryAckEmail"
  | "autoDraftQuoteOnQualify"
  | "autoArchiveStaleInquiries"
  | "autoArchiveStaleInquiryDays"
  | "autoFollowUpOnQuoteViewed"
  | "quoteViewedFollowUpDelayDays";

export type BusinessQuoteSettingsFieldErrors = Partial<
  Record<BusinessQuoteSettingsFieldName, string[] | undefined>
>;

export type BusinessQuoteSettingsActionState = {
  error?: string;
  success?: string;
  fieldErrors?: BusinessQuoteSettingsFieldErrors;
};

export type BusinessEmailTemplateFieldName = "subject" | "blocks";

export type BusinessEmailTemplateFieldErrors = Partial<
  Record<BusinessEmailTemplateFieldName, string[] | undefined>
>;

export type BusinessEmailTemplateActionState = {
  error?: string;
  success?: string;
  fieldErrors?: BusinessEmailTemplateFieldErrors;
};

export type BusinessDeleteFieldErrors = Partial<
  Record<"confirmation", string[] | undefined>
>;

export type BusinessDeleteActionState = {
  error?: string;
  success?: string;
  fieldErrors?: BusinessDeleteFieldErrors;
};

export type ServicesSettingsView = {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType;
  /**
   * The services list only needs identity, visibility, and counts — the full
   * form and page configs live behind the editor query, so they never travel
   * to the list client.
   */
  services: Array<
    ServiceSummary & {
      submittedInquiryCount: number;
    }
  >;
};

export type ServicePageSettingsView = {
  id: string;
  name: string;
  slug: string;
  plan: plan;
  shortDescription: string | null;
  logoStoragePath: string | null;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  businessType: BusinessType;
  publicInquiryEnabled: boolean;
  isDefault: boolean;
  inquiryFormConfig: InquiryFormConfig;
  inquiryPageConfig: InquiryPageConfig;
  updatedAt: Date;
};

export type ServicePageFieldName =
  | "name"
  | "slug"
  | "businessType"
  | "publicInquiryEnabled"
  | "template"
  | "mobileLayout"
  | "showSupportingCards"
  | "showShowcaseImage"
  | "showBusinessContact"
  | "eyebrow"
  | "headline"
  | "description"
  | "brandTagline"
  | "formTitle"
  | "formDescription"
  | "thankYouMessage"
  | "businessContactPhone"
  | "businessContactEmail"
  | "businessFacebookUrl"
  | "businessInstagramUrl"
  | "businessTwitterXUrl"
  | "businessLinkedinUrl"
  | "showcaseImageUrl"
  | "showcaseImageFrame"
  | "showcaseImageSize"
  | "showcaseImageCropX"
  | "showcaseImageCropY"
  | "showcaseImageCropZoom"
  | "cards";

export type ServicePageFieldErrors = Partial<
  Record<ServicePageFieldName, string[] | undefined>
>;

export type ServicePageActionState = {
  error?: string;
  success?: string;
  fieldErrors?: ServicePageFieldErrors;
};

export type ServiceSettingsView = {
  id: string;
  name: string;
  slug: string;
  plan: plan;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  businessType: BusinessType;
  publicInquiryEnabled: boolean;
  isDefault: boolean;
  inquiryFormConfig: InquiryFormConfig;
  inquiryPageConfig: InquiryPageConfig;
  updatedAt: Date;
};

export type ServiceEditorView = ServiceSettingsView & {
  shortDescription: string | null;
  logoStoragePath: string | null;
  activeFormCount: number;
  submittedInquiryCount: number;
};

/**
 * Identity slice of the service editor: enough to paint the page header and
 * derive page-level links. The normalized form/page configs and the form and
 * inquiry counts stay behind the streamed editor region.
 */
export type ServiceHeaderView = Pick<
  ServiceSettingsView,
  | "id"
  | "name"
  | "slug"
  | "plan"
  | "serviceId"
  | "serviceName"
  | "serviceSlug"
  | "businessType"
  | "publicInquiryEnabled"
  | "isDefault"
  | "updatedAt"
> & {
  logoStoragePath: string | null;
};

export type ServicePreviewDraft = {
  businessType: BusinessType;
  serviceName: string;
  serviceSlug: string;
  inquiryFormConfig: InquiryFormConfig;
  inquiryPageConfig: InquiryPageConfig;
};

export type ServicePagePreviewDraft = {
  businessType: BusinessType;
  serviceName: string;
  serviceSlug: string;
  publicInquiryEnabled: boolean;
  inquiryPageConfig: InquiryPageConfig;
};

export type ServiceFieldName =
  | "serviceId"
  | "businessType"
  | "inquiryFormConfig";

export type ServiceFieldErrors = Partial<
  Record<ServiceFieldName, string[] | undefined>
>;

export type ServiceActionState = {
  error?: string;
  success?: string;
  fieldErrors?: ServiceFieldErrors;
};

export type ServicesActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"name" | "businessType" | "serviceId" | "targetServiceId", string[] | undefined>
  >;
};

export type ServiceDangerActionState = {
  error?: string;
  success?: string;
};

export type BusinessInquiryFieldDraft = InquiryFormFieldDefinition;
