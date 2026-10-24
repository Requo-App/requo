"use client";

import { useMemo, useOptimistic, useState } from "react";
import {
  Copy,
  MoreHorizontal,
  RotateCw,
  Search,
  Send,
  Trash2,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";

import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
} from "@/components/ui/responsive-overlay";
import { ConfirmationHeader } from "@/components/shared/confirmation-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FeatureGate } from "@/features/entitlements";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  BusinessMemberInviteActionState,
  BusinessMemberAction,
} from "@/features/business-members/action-types";
import type {
  BusinessMemberInviteView,
  BusinessMemberView,
  BusinessMembersSettingsView,
} from "@/features/business-members/types";
import { getBusinessMemberInvitePath } from "@/features/businesses/routes";
import { useDeferredActionState } from "@/hooks/use-deferred-action-state";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  businessMemberRoleMeta,
  type BusinessMemberAssignableRole,
  type BusinessMemberRole,
} from "@/lib/business-members";
import type { PlanTier } from "@/lib/plans/plans";

type MembersManagerProps = {
  view: BusinessMembersSettingsView;
  plan: PlanTier;
  /** Reusable shareable invite-link token, or null when none exists yet. */
  inviteLinkToken: string | null;
  createInviteAction: BusinessMemberAction;
  cancelInviteAction: BusinessMemberAction;
  updateRoleAction: BusinessMemberAction;
  removeMemberAction: BusinessMemberAction;
  getOrCreateInviteLinkAction: BusinessMemberAction;
  regenerateInviteLinkAction: BusinessMemberAction;
  readOnly?: boolean;
};

type AssignableRole = BusinessMemberRole;
type InviteAssignableRole = BusinessMemberAssignableRole;

const initialState: BusinessMemberInviteActionState = {};
const assignableRoles: readonly AssignableRole[] = ["owner", "manager", "staff"];
const inviteAssignableRoles: readonly InviteAssignableRole[] = [
  "manager",
  "staff",
];

const roleOptions: ComboboxOption[] = inviteAssignableRoles.map((value) => ({
  label: businessMemberRoleMeta[value].label,
  searchText: `${businessMemberRoleMeta[value].label} ${businessMemberRoleMeta[value].description}`,
  value,
}));

export function BusinessMembersManager({
  view,
  plan,
  inviteLinkToken,
  createInviteAction,
  cancelInviteAction,
  updateRoleAction,
  removeMemberAction,
  getOrCreateInviteLinkAction,
  regenerateInviteLinkAction,
  readOnly = false,
}: MembersManagerProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteAssignableRole>("staff");
  const [search, setSearch] = useState("");
  const [accessMember, setAccessMember] = useState<BusinessMemberView | null>(
    null,
  );
  const [accessRole, setAccessRole] = useState<AssignableRole>("staff");
  const [removeMember, setRemoveMember] = useState<BusinessMemberView | null>(
    null,
  );

  const [optimisticMembers, setOptimisticMembers] = useOptimistic(
    view.members,
    (
      current,
      action:
        | { type: "remove"; membershipId: string }
        | { type: "updateRole"; membershipId: string; role: AssignableRole }
        | { type: "restore"; members: BusinessMemberView[] },
    ) => {
      if (action.type === "restore") {
        return action.members;
      }
      if (action.type === "remove") {
        return current.filter((member) => member.membershipId !== action.membershipId);
      }

      return current.map((member) =>
        member.membershipId === action.membershipId
          ? { ...member, role: action.role }
          : member,
      );
    },
  );

  const [, inviteFormAction, isInvitePending] =
    useActionStateWithSonner(createInviteAction, initialState);
  const [, cancelInviteFormAction, isCancelInvitePending] =
    useActionStateWithSonner(cancelInviteAction, initialState);
  const [, updateRoleFormAction, isRoleUpdatePending] = useDeferredActionState(
    updateRoleAction,
    initialState,
    {
      onOptimistic: () => {
        if (!accessMember) {
          return;
        }

        setOptimisticMembers({
          type: "updateRole",
          membershipId: accessMember.membershipId,
          role: accessRole,
        });
      },
      onRevert: () => {
        setOptimisticMembers({ type: "restore", members: view.members });
      },
      onSuccess: () => setAccessMember(null),
    },
  );
  const [, removeMemberFormAction, isRemoveMemberPending] = useDeferredActionState(
    removeMemberAction,
    initialState,
    {
      onOptimistic: () => {
        if (!removeMember) {
          return;
        }

        setOptimisticMembers({
          type: "remove",
          membershipId: removeMember.membershipId,
        });
      },
      onRevert: () => {
        setOptimisticMembers({ type: "restore", members: view.members });
      },
      onSuccess: () => setRemoveMember(null),
    },
  );
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [pendingInvitesOpen, setPendingInvitesOpen] = useState(false);

  const [linkState, linkFormAction, isLinkPending] =
    useActionStateWithSonner(getOrCreateInviteLinkAction, initialState);
  const [regenState, regenFormAction, isRegenPending] =
    useActionStateWithSonner(regenerateInviteLinkAction, initialState);

  const inviteLinkPath =
    regenState.inviteLink ??
    linkState.inviteLink ??
    (inviteLinkToken ? getBusinessMemberInvitePath(inviteLinkToken) : null);
  const inviteLinkUrl = inviteLinkPath ? `${origin}${inviteLinkPath}` : null;
  const isInviteLinkPending = isLinkPending || isRegenPending;

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return optimisticMembers;
    }

    return optimisticMembers.filter(
      (member) =>
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query),
    );
  }, [optimisticMembers, search]);

  const isFiltering = search.trim().length > 0;

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function openAccessDialog(member: BusinessMemberView) {
    setAccessRole(member.role);
    setAccessMember(member);
  }

  return (
    <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Search team members"
                className="pl-9"
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search a team member..."
                type="search"
                value={search}
              />
            </div>
            {!readOnly && view.invites.length ? (
              <Button
                className="shrink-0"
                type="button"
                variant="outline"
                onClick={() => setPendingInvitesOpen(true)}
              >
                {view.invites.length} pending
              </Button>
            ) : null}
            <FeatureGate variant="action" feature="members" plan={plan}>
              <Button
                className="shrink-0"
                type="button"
                onClick={() => setInviteOpen(true)}
                disabled={readOnly}
              >
                <UserPlus data-icon="inline-start" />
                Invite
              </Button>
            </FeatureGate>
          </div>

          {isFiltering ? (
            <p className="text-sm text-muted-foreground" role="status">
              {filteredMembers.length} of {optimisticMembers.length} member
              {optimisticMembers.length === 1 ? "" : "s"}
            </p>
          ) : null}

          <div className="flex flex-col">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] items-center gap-4 border-b border-border py-2 md:grid"
            >
              <span className="meta-label">Name</span>
              <span className="meta-label">Email</span>
              <span className="meta-label">Role</span>
              <span className="meta-label sr-only">Actions</span>
            </div>
            <div className="flex flex-col" role="list">
              {filteredMembers.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  member={member}
                  onManageAccess={openAccessDialog}
                  onRemove={setRemoveMember}
                  ownerCount={optimisticMembers.filter((m) => m.role === "owner").length}
                  readOnly={readOnly}
                />
              ))}
            </div>
            {filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  No team members match “{search.trim()}”.
                </p>
                <p className="text-sm text-muted-foreground">
                  Try a different name or email address.
                </p>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </Button>
              </div>
            ) : null}
          </div>

      {view.invites.length ? (
        <PendingInvitesDialog
          invites={view.invites}
          inviteOrigin={origin}
          isCancelPending={isCancelInvitePending}
          onCancelInvite={cancelInviteFormAction}
          onCopyInvite={copyText}
          open={pendingInvitesOpen}
          onOpenChange={setPendingInvitesOpen}
        />
      ) : null}

      <InviteMemberDialog
        email={email}
        isPending={isInvitePending}
        onEmailChange={setEmail}
        onOpenChange={setInviteOpen}
        onRoleChange={setRole}
        onSubmit={inviteFormAction}
        open={inviteOpen}
        role={role}
        inviteLinkUrl={inviteLinkUrl}
        isInviteLinkPending={isInviteLinkPending}
        onCreateInviteLink={linkFormAction}
        onRegenerateInviteLink={regenFormAction}
        readOnly={readOnly}
      />

      <ManageAccessDialog
        member={accessMember}
        onMemberChange={setAccessMember}
        onRoleChange={setAccessRole}
        onSubmit={updateRoleFormAction}
        role={accessRole}
        submitting={isRoleUpdatePending}
      />

      <RemoveMemberDialog
        member={removeMember}
        onMemberChange={setRemoveMember}
        onSubmit={removeMemberFormAction}
        submitting={isRemoveMemberPending}
      />
    </div>
  );
}

export function InviteMemberDialog({
  email,
  isPending,
  onEmailChange,
  onOpenChange,
  onRoleChange,
  onSubmit,
  open,
  role,
  inviteLinkUrl,
  isInviteLinkPending = false,
  onCreateInviteLink,
  onRegenerateInviteLink,
  onCopyInviteLink,
  readOnly = false,
}: {
  email: string;
  isPending: boolean;
  onEmailChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRoleChange: (role: InviteAssignableRole) => void;
  onSubmit: ReturnType<typeof useActionStateWithSonner<BusinessMemberInviteActionState>>[1];
  open: boolean;
  role: InviteAssignableRole;
  inviteLinkUrl?: string | null;
  isInviteLinkPending?: boolean;
  onCreateInviteLink?: ReturnType<typeof useActionStateWithSonner<BusinessMemberInviteActionState>>[1];
  onRegenerateInviteLink?: ReturnType<typeof useActionStateWithSonner<BusinessMemberInviteActionState>>[1];
  onCopyInviteLink?: (value: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const showLinkSection =
    inviteLinkUrl !== undefined ||
    onCreateInviteLink !== undefined ||
    onRegenerateInviteLink !== undefined;

  async function handleCopyLink() {
    if (!inviteLinkUrl) {
      return;
    }

    if (onCopyInviteLink) {
      await onCopyInviteLink(inviteLinkUrl);
    } else {
      await navigator.clipboard.writeText(inviteLinkUrl);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite members</DialogTitle>
          <DialogDescription>
            Share an invite link or send an invite email to teammates who help
            manage inquiries, quotes, and follow-ups for this business.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-6">
            {showLinkSection ? (
              <section aria-labelledby="member-invite-link-heading" className="flex flex-col gap-2">
                <h3
                  id="member-invite-link-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  Invite by link
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Share this link to invite users to join this business.
                </p>
                {inviteLinkUrl ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Business invite link"
                      className="min-w-0 flex-1 font-mono text-xs"
                      readOnly
                      value={inviteLinkUrl}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button
                      className="shrink-0"
                      disabled={isInviteLinkPending}
                      onClick={handleCopyLink}
                      type="button"
                    >
                      <Copy data-icon="inline-start" />
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button
                      disabled={readOnly || isInviteLinkPending || !onCreateInviteLink}
                      onClick={async () => onCreateInviteLink?.(new FormData())}
                      type="button"
                      variant="outline"
                    >
                      {isInviteLinkPending ? "Creating link..." : "Create invite link"}
                    </Button>
                  </div>
                )}
                {inviteLinkUrl && !readOnly && onRegenerateInviteLink ? (
                  <div>
                    <Button
                      className="px-0"
                      disabled={isInviteLinkPending}
                      onClick={async () => onRegenerateInviteLink(new FormData())}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <RotateCw data-icon="inline-start" />
                      Regenerate link
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showLinkSection ? <div aria-hidden="true" className="border-t border-border" /> : null}

            <section aria-labelledby="member-invite-email-heading" className="flex flex-col gap-2">
              <h3
                id="member-invite-email-heading"
                className="text-sm font-semibold text-foreground"
              >
                Invite by email
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Send an invite email to your team.
              </p>
              <form
                action={async (formData) => {
                  formData.set("email", email);
                  formData.set("role", role);
                  await onSubmit(formData);
                  onEmailChange("");
                }}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    autoComplete="email"
                    aria-label="Email address"
                    className="min-w-0 flex-1"
                    disabled={isPending || readOnly}
                    id="member-invite-email"
                    name="email"
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="tim@apple.com"
                    type="email"
                    value={email}
                  />
                  <Combobox
                    buttonClassName="sm:w-40"
                    disabled={isPending || readOnly}
                    id="member-invite-role"
                    onValueChange={(value) => {
                      onRoleChange(value as InviteAssignableRole);
                    }}
                    options={roleOptions}
                    placeholder="Default role"
                    renderOption={(option) => {
                      const optionRole = option.value as InviteAssignableRole;

                      return (
                        <div className="flex flex-col gap-1">
                          <span className="truncate">
                            {businessMemberRoleMeta[optionRole].label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {businessMemberRoleMeta[optionRole].description}
                          </span>
                        </div>
                      );
                    }}
                    searchable={false}
                    value={role}
                  />
                  <Button
                    className="shrink-0"
                    disabled={isPending || readOnly || email.trim().length === 0}
                    type="submit"
                  >
                    <Send data-icon="inline-start" />
                    Invite
                  </Button>
                </div>
              </form>
            </section>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvitesDialog({
  invites,
  inviteOrigin,
  isCancelPending,
  onCancelInvite,
  onCopyInvite,
  open,
  onOpenChange,
}: {
  invites: BusinessMemberInviteView[];
  inviteOrigin: string;
  isCancelPending: boolean;
  onCancelInvite: ReturnType<typeof useActionStateWithSonner<BusinessMemberInviteActionState>>[1];
  onCopyInvite: (value: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pending invites</DialogTitle>
          <DialogDescription>
            Copy an invite link or cancel access before the invite is accepted.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-3">
            {invites.map((invite) => {
              const inviteUrl = `${inviteOrigin}${getBusinessMemberInvitePath(invite.token)}`;
              const roleLabel = businessMemberRoleMeta[invite.role].label;

              return (
                <div
                  className="rounded-xl border border-border bg-muted/20 p-4"
                  key={invite.inviteId}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {invite.email}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {roleLabel} invite, expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => onCopyInvite(inviteUrl)}
                      >
                        <Copy data-icon="inline-start" />
                        Copy link
                      </Button>

                      <form action={onCancelInvite}>
                        <input
                          type="hidden"
                          name="inviteId"
                          value={invite.inviteId}
                        />
                        <Button
                          disabled={isCancelPending}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          <Trash2 data-icon="inline-start" />
                          Cancel
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Done
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  member,
  onManageAccess,
  onRemove,
  ownerCount,
  readOnly,
}: {
  member: BusinessMemberView;
  onManageAccess: (member: BusinessMemberView) => void;
  onRemove: (member: BusinessMemberView) => void;
  ownerCount: number;
  readOnly: boolean;
}) {
  const roleMeta = businessMemberRoleMeta[member.role];
  const isOwner = member.role === "owner";
  const isLastOwner = isOwner && ownerCount <= 1;
  const canLeave = member.isCurrentUser && !isLastOwner;
  const canRemove = !member.isCurrentUser;

  const showActions = !readOnly || (member.isCurrentUser && canLeave);

  return (
    <div className="border-b border-border" role="listitem">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] md:py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {member.image ? (
              <AvatarImage alt={member.name} src={member.image} />
            ) : null}
            <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              {member.name}
            </p>
            {member.isCurrentUser ? <Badge variant="outline">You</Badge> : null}
          </div>
        </div>

        <div className="row-start-2 min-w-0 pl-11 md:col-start-2 md:row-start-auto md:pl-0">
          <p className="truncate text-sm text-muted-foreground">
            {member.email}
          </p>
        </div>

        <div className="hidden md:block">
          <Badge variant={isOwner ? "secondary" : "outline"}>
            {roleMeta.label}
          </Badge>
        </div>

        <div className="row-start-1 flex items-center gap-2 justify-self-end md:col-start-4 md:row-start-auto">
          <span className="md:hidden">
            <Badge variant={isOwner ? "secondary" : "outline"}>
              {roleMeta.label}
            </Badge>
          </span>
          {showActions ? (
            <>
              {!readOnly && !member.isCurrentUser ? (
                <Button
                  className="hidden md:inline-flex"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onManageAccess(member)}
                >
                  <UserCog data-icon="inline-start" />
                  Manage access
                </Button>
              ) : null}

              <MemberActionsMenu
                canLeave={canLeave}
                canRemove={!readOnly && canRemove}
                isCurrentUser={member.isCurrentUser}
                member={member}
                onManageAccess={onManageAccess}
                onRemove={onRemove}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MemberActionsMenu({
  canLeave,
  canRemove,
  isCurrentUser,
  member,
  onManageAccess,
  onRemove,
}: {
  canLeave: boolean;
  canRemove: boolean;
  isCurrentUser: boolean;
  member: BusinessMemberView;
  onManageAccess: (member: BusinessMemberView) => void;
  onRemove: (member: BusinessMemberView) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const actionLabel = isCurrentUser ? "Leave" : "Remove";
  const disabled = isCurrentUser ? !canLeave : !canRemove;

  function handleAction() {
    setOpen(false);
    onRemove(member);
  }

  function handleManageAccess() {
    setOpen(false);
    onManageAccess(member);
  }

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            aria-label={`Open actions for ${member.name}`}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal />
            <span className="sr-only">Open actions for {member.name}</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{member.name}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <div className="flex flex-col gap-1">
              {!isCurrentUser ? (
                <Button
                  className="w-full justify-start"
                  type="button"
                  variant="ghost"
                  onClick={handleManageAccess}
                >
                  <UserCog data-icon="inline-start" />
                  Manage access
                </Button>
              ) : null}
              <Button
                className="w-full justify-start text-destructive"
                disabled={disabled}
                type="button"
                variant="ghost"
                onClick={handleAction}
              >
                <UserMinus data-icon="inline-start" />
                {actionLabel}
              </Button>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open actions for ${member.name}`}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
          <span className="sr-only">Open actions for {member.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuGroup>
          {!isCurrentUser ? (
            <DropdownMenuItem onSelect={handleManageAccess}>
              <UserCog />
              Manage access
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={disabled}
            variant="destructive"
            onSelect={handleAction}
          >
            <UserMinus />
            {actionLabel}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ManageAccessDialog({
  member,
  onMemberChange,
  onRoleChange,
  onSubmit,
  role,
  submitting,
}: {
  member: BusinessMemberView | null;
  onMemberChange: (member: BusinessMemberView | null) => void;
  onRoleChange: (role: AssignableRole) => void;
  onSubmit: ReturnType<typeof useActionStateWithSonner<BusinessMemberInviteActionState>>[1];
  role: AssignableRole;
  submitting: boolean;
}) {
  return (
    <Dialog
      open={Boolean(member)}
      onOpenChange={(open) => {
        if (!open) {
          onMemberChange(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        {member ? (
          <form
            action={async (formData) => {
              formData.set("membershipId", member.membershipId);
              formData.set("userId", member.userId);
              formData.set("role", role);
              await onSubmit(formData);
              onMemberChange(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Manage access</DialogTitle>
              <DialogDescription>
                Choose what {member.name} can do in this business.
              </DialogDescription>
            </DialogHeader>

            <DialogBody>
              <FieldSet>
                <FieldLegend>Role</FieldLegend>
                <RadioGroup
                  name="role"
                  value={role}
                  onValueChange={(value) => {
                    onRoleChange(value as AssignableRole);
                  }}
                >
                  {assignableRoles.map((roleValue) => {
                    const id = `member-role-${member.membershipId}-${roleValue}`;
                    const meta = businessMemberRoleMeta[roleValue];

                    return (
                      <Field
                        className="rounded-xl border border-border bg-background/60 p-3"
                        key={roleValue}
                        orientation="horizontal"
                      >
                        <RadioGroupItem
                          disabled={submitting}
                          id={id}
                          value={roleValue}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={id}>{meta.label}</FieldLabel>
                          <FieldDescription>{meta.description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    );
                  })}
                </RadioGroup>
              </FieldSet>
            </DialogBody>

            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={submitting} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={submitting} type="submit">
                Save changes
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({
  member,
  onMemberChange,
  onSubmit,
  submitting,
}: {
  member: BusinessMemberView | null;
  onMemberChange: (member: BusinessMemberView | null) => void;
  onSubmit: ReturnType<typeof useActionStateWithSonner<BusinessMemberInviteActionState>>[1];
  submitting: boolean;
}) {
  const isSelf = member?.isCurrentUser ?? false;

  return (
    <ResponsiveOverlay
      open={Boolean(member)}
      onOpenChange={(open) => {
        if (!open) {
          onMemberChange(null);
        }
      }}
    >
      <ResponsiveOverlayContent className="sm:max-w-md">
        {member ? (
          <>
            <ConfirmationHeader
              tone="destructive"
              icon={UserMinus}
              title={isSelf ? "Leave this business?" : "Remove member?"}
              description={
                isSelf
                  ? "You will lose access to this business, including inquiries, quotes, follow-ups, and settings."
                  : `${member.name} will lose access to this business, including inquiries, quotes, follow-ups, and settings.`
              }
            />
            <form
              action={async (formData) => {
                formData.set("membershipId", member.membershipId);
                formData.set("userId", member.userId);
                await onSubmit(formData);
                onMemberChange(null);
              }}
            >
              <ResponsiveOverlayBody>
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current role: {businessMemberRoleMeta[member.role].label}
                  </p>
                </div>
              </ResponsiveOverlayBody>
              <ResponsiveOverlayFooter>
                <ResponsiveOverlayClose asChild>
                  <Button disabled={submitting} type="button" variant="outline">
                    Cancel
                  </Button>
                </ResponsiveOverlayClose>
                <Button disabled={submitting} type="submit" variant="destructive">
                  {isSelf ? "Leave" : "Remove"}
                </Button>
              </ResponsiveOverlayFooter>
            </form>
          </>
        ) : null}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function MembersStaticFallback() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 flex-1 rounded-md sm:h-8" />
        <Skeleton className="h-8 w-20 shrink-0 rounded-md sm:h-8" />
      </div>
      <div className="flex flex-col">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] items-center gap-4 border-b border-border py-2 md:grid">
          <span className="meta-label">Name</span>
          <span className="meta-label">Email</span>
          <span className="meta-label">Role</span>
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="flex items-center gap-3 border-b border-border py-3"
            key={index}
          >
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32 max-w-full rounded-md" />
              <Skeleton className="h-3.5 w-48 max-w-full rounded-md" />
            </div>
            <Skeleton className="hidden h-5 w-16 shrink-0 rounded-full md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
