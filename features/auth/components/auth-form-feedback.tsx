"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/shared/notify";

type AuthFormFeedbackProps = {
  error?: string;
  success?: string;
  errorTitle?: string;
  successTitle?: string;
};

export function AuthFormFeedback({
  error,
  success,
  errorTitle = "We couldn't complete that request.",
  successTitle = "Request received.",
}: AuthFormFeedbackProps) {
  const keyRef = useRef("");
  const key = `${error ?? ""}|${success ?? ""}`;

  useEffect(() => {
    if (keyRef.current === key) {
      return;
    }

    keyRef.current = key;

    if (error) {
      toast.error(error, { description: errorTitle });
      return;
    }

    if (success) {
      toast.success(success, { description: successTitle });
    }
  }, [error, errorTitle, key, success, successTitle]);

  return null;
}
