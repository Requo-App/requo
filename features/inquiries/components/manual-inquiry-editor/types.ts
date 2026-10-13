import type {
  InquiryEditorForm,
  ManualInquiryActionState,
} from "@/features/inquiries/types";

export type ManualInquiryEditorProps = {
  action: (
    state: ManualInquiryActionState,
    formData: FormData,
  ) => Promise<ManualInquiryActionState>;
  businessName: string;
  forms: InquiryEditorForm[];
  initialFormSlug: string;
  uploadHelpText: string;
};

export type ProjectFieldValue = string | string[];
export type ProjectValues = Record<string, ProjectFieldValue | undefined>;
