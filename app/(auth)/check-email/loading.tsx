import { AuthShell } from "@/components/shell/auth-shell";
import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";

export default function CheckEmailLoading() {
  return (
    <AuthShell badge="Verify email" title="Check your inbox" layout="centered">
      <AuthFormSkeleton />
    </AuthShell>
  );
}
