import type {
  InquiryEditorService,
  ManualInquiryActionState,
} from "@/features/inquiries/types";

export type ManualInquiryEditorProps = {
  action: (
    state: ManualInquiryActionState,
    formData: FormData,
  ) => Promise<ManualInquiryActionState>;
  businessName: string;
  businessSlug: string;
  services: InquiryEditorService[];
  initialServiceSlug: string;
  uploadHelpText: string;
};

export type ProjectFieldValue = string | string[];
export type ProjectValues = Record<string, ProjectFieldValue | undefined>;
