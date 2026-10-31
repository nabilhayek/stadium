"use client";

import { useState } from "react";
import { Check, ChevronRight, MailPlus, MoreHorizontal, Plus, Send, SlidersHorizontal, Trash2, UserCheck, UserX } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/toast/toast-provider";
import { useTRPC } from "@/lib/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Badge, Card, FilterTabs, ghostButton, primaryButton, secondaryButton } from "../ui";
import { PERMISSIONS, type AdminSettings, type Edit, type Member, type StaffRole } from "./model";

type Props = { stadiumSlug: string; settings: AdminSettings; edit: Edit };

const menuButton =
  "grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 data-[state=open]:bg-neutral-200/60!";

export function TeamTab({ stadiumSlug, settings, edit }: Props) {
  const [filter, setFilter] = useState("all");
  const [inviting, setInviting] = useState(false);
  const [session, setSession] = useState(0);
  const [accessId, setAccessId] = useState<string | null>(null);
  const [accessSession, setAccessSession] = useState(0);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; moveTo: string } | null>(null);
  const { toast } = useToast();
  const trpc = useTRPC();
  const resend = useMutation(trpc.admin.resendInvite.mutationOptions());
  const { members, kitchens, roles } = settings;
  const roleFilter = filter === "all" || roles.some((r) => r.id === filter) ? filter : "all";
  const shown = roleFilter === "all" ? members : members.filter((m) => m.role === roleFilter);
  const admins = members.filter((m) => m.role === "admin" && m.status === "active").length;
  const access = members.find((m) => m.id === accessId) ?? null;

  const update = (id: string, change: Partial<Member>) => edit((s) => ({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, ...change } : m)) }));
  const patchRole = (id: string, change: Partial<StaffRole>) => edit((s) => ({ ...s, roles: s.roles.map((r) => (r.id === id ? { ...r, ...change } : r)) }));
  const kitchenNames = (ids: string[]) =>
    ids.length ? ids.map((id) => kitchens.find((k) => k.id === id)?.name ?? "Removed kitchen").join(", ") : "All kitchens";
  const roleLabel = (id: string) => roles.find((r) => r.id === id)?.label ?? "Removed role";

  function addRole() {
    const id = `role-${Date.now()}`;
    const from = roles.find((r) => r.id === "kitchen") ?? roles[0];
    edit((s) => ({ ...s, roles: [...s.roles, { id, label: "New role", description: "", builtin: false, permissions: [...(from?.permissions ?? [])] }] }));
    setOpenRole(id);
    setDrop(null);
  }

  function removeRole(id: string, moveTo: string) {
    edit((s) => ({
      ...s,
      roles: s.roles.filter((r) => r.id !== id),
      members: s.members.map((m) => (m.role === id ? { ...m, role: moveTo } : m)),
    }));
    setDrop(null);
    setOpenRole(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          label="Filter by role"
          value={roleFilter}
          onChange={setFilter}
          options={[
            { id: "all", label: "Everyone", count: members.length },
            ...roles.map((r) => ({ id: r.id, label: r.label || "Untitled", count: members.filter((m) => m.role === r.id).length })),
          ]}
        />
        <button
          type="button"
          onClick={() => {
            setSession((n) => n + 1);
            setInviting(true);
          }}
          className={cn(primaryButton, "ml-auto")}
        >
          <MailPlus className="size-4" aria-hidden />
          Invite staff
        </button>
      </div>

      <Card title="Staff" description="Everyone who can sign in to this kitchen desk.">
        {shown.length ? (
          <ul className="divide-y divide-neutral-200">
            {shown.map((m) => {
              const lastAdmin = m.role === "admin" && m.status === "active" && admins <= 1;
              return (
                <li key={m.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", m.status === "disabled" && "bg-neutral-50/60")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-200 text-[13px] font-semibold text-neutral-700 uppercase">
                    {m.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-[14px] font-medium", m.status === "disabled" && "text-neutral-500")}>{m.name}</span>
                      {m.permissions ? <Badge tone="bg-blue-500">Custom</Badge> : null}
                      {m.status === "invited" ? <Badge tone="bg-amber-500">Invited</Badge> : null}
                      {m.status === "disabled" ? <Badge tone="bg-neutral-500">Disabled</Badge> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                      {m.email} · {kitchenNames(m.kitchens)}
                    </span>
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-[12px] text-neutral-500 md:block">{m.lastSeen ?? "Never"}</span>
                  <Select
                    value={roles.some((r) => r.id === m.role) ? m.role : undefined}
                    onValueChange={(role) => update(m.id, { role, permissions: role === "admin" ? null : m.permissions })}
                    disabled={lastAdmin}
                  >
                    <SelectTrigger size="sm" aria-label={`Role for ${m.name}`} className="w-36" title={lastAdmin ? "Keep at least one admin" : undefined}>
                      <SelectValue placeholder={roleLabel(m.role)} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label || "Untitled"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={`More actions for ${m.name}`} className={menuButton}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onSelect={() => {
                          setAccessId(m.id);
                          setAccessSession((n) => n + 1);
                        }}
                      >
                        <SlidersHorizontal />
                        Permissions
                      </DropdownMenuItem>
                      {m.status === "invited" ? (
                        <DropdownMenuItem
                          onSelect={() => {
                            resend.mutate(
                              { stadium: stadiumSlug, memberId: m.id },
                              {
                                onSuccess: (result) =>
                                  toast({ message: result.ok ? `Invite sent again to ${m.email}` : result.error, status: result.ok ? "success" : "error" }),
                                onError: () => toast({ message: "The invite email did not send.", status: "error" }),
                              },
                            );
                          }}
                        >
                          <Send />
                          Resend invite
                        </DropdownMenuItem>
                      ) : null}
                      {m.status === "disabled" ? (
                        <DropdownMenuItem onSelect={() => update(m.id, { status: "active" })}>
                          <UserCheck />
                          Enable sign in
                        </DropdownMenuItem>
                      ) : m.status === "active" ? (
                        <DropdownMenuItem disabled={lastAdmin} onSelect={() => update(m.id, { status: "disabled" })}>
                          <UserX />
                          Disable sign in
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={lastAdmin}
                        onSelect={() => edit((s) => ({ ...s, members: s.members.filter((x) => x.id !== m.id) }))}
                      >
                        <Trash2 />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-[13px] text-neutral-500">No one with this role yet.</p>
        )}
      </Card>

      <Card
        title="Roles"
        description="Admin, Manager, Kitchen and Runner come with the venue. Pickup is part of Kitchen. Add a role, or change what each one can do."
        action={
          <button type="button" onClick={addRole} className={ghostButton}>
            <Plus className="size-3.5" aria-hidden />
            New role
          </button>
        }
      >
        <ul className="divide-y divide-neutral-200">
          {roles.map((role) => {
            const open = openRole === role.id;
            const count = members.filter((m) => m.role === role.id).length;
            const locked = role.id === "admin";
            const others = roles.filter((r) => r.id !== role.id);
            return (
              <li key={role.id}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRole(open ? null : role.id);
                      setDrop(null);
                    }}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
                  >
                    <ChevronRight className={cn("size-4 shrink-0 text-neutral-400 transition-transform duration-150", open && "rotate-90")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium">{role.label || "Untitled"}</span>
                        {role.builtin ? <Badge tone="bg-neutral-500">Default</Badge> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                        {count} {count === 1 ? "person" : "people"} ·{" "}
                        {locked ? "Full access" : `${role.permissions.length} of ${PERMISSIONS.length} permissions`}
                      </span>
                    </span>
                  </button>
                  {locked ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRole(role.id);
                        if (!count) removeRole(role.id, others[0]?.id ?? "admin");
                        else setDrop({ id: role.id, moveTo: others.find((r) => r.id === "kitchen")?.id ?? others[0].id });
                      }}
                      disabled={!others.length}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-red-50! hover:text-red-600 focus-visible:outline-2 focus-visible:outline-blue-500"
                      aria-label={`Remove ${role.label}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                {open ? (
                  <div className="mx-4 mb-4 flex flex-col gap-4 rounded-xl border border-neutral-200 p-4">
                    {drop?.id === role.id ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-[13px]">
                        <span>
                          Move {count} {count === 1 ? "person" : "people"} to
                        </span>
                        <Select value={drop.moveTo} onValueChange={(moveTo) => setDrop({ id: role.id, moveTo })}>
                          <SelectTrigger size="sm" aria-label="Move people to" className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="start">
                            {others.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.label || "Untitled"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button type="button" onClick={() => removeRole(role.id, drop.moveTo)} className={cn(primaryButton, "h-8 px-3 text-[13px]")}>
                          Remove role
                        </button>
                        <button type="button" onClick={() => setDrop(null)} className={ghostButton}>
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium text-neutral-700">Name</span>
                        <Input value={role.label} maxLength={32} onChange={(e) => patchRole(role.id, { label: e.target.value })} aria-label="Role name" />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium text-neutral-700">Description</span>
                        <Input
                          value={role.description}
                          maxLength={120}
                          onChange={(e) => patchRole(role.id, { description: e.target.value })}
                          aria-label={`${role.label} description`}
                        />
                      </label>
                    </div>
                    <fieldset>
                      <legend className="mb-1 text-[13px] font-medium text-neutral-700">
                        {locked ? "Admins always have every permission" : "Permissions"}
                      </legend>
                      <div className="grid sm:grid-cols-2">
                        {PERMISSIONS.map((p) => (
                          <PermissionToggle
                            key={p.id}
                            label={p.label}
                            on={locked || role.permissions.includes(p.id)}
                            locked={locked}
                            onToggle={() =>
                              patchRole(role.id, {
                                permissions: role.permissions.includes(p.id) ? role.permissions.filter((x) => x !== p.id) : [...role.permissions, p.id],
                              })
                            }
                          />
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Sheet open={inviting} onOpenChange={(v) => !v && setInviting(false)}>
        {session > 0 ? (
          <InviteSheet
            key={session}
            roles={roles}
            kitchens={kitchens}
            onCancel={() => setInviting(false)}
            onInvite={(member) => {
              edit((s) => ({ ...s, members: [...s.members, member] }));
              setInviting(false);
              toast({ message: `Invite for ${member.email} goes out when you save.`, status: "success" });
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={access !== null} onOpenChange={(v) => !v && setAccessId(null)}>
        {access ? (
          <AccessSheet
            key={accessSession}
            member={access}
            roles={roles}
            kitchens={kitchens}
            onCancel={() => setAccessId(null)}
            onSave={(change) => {
              update(access.id, change);
              setAccessId(null);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function PermissionToggle({ label, on, locked, onToggle }: { label: string; on: boolean; locked?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={locked}
      onClick={onToggle}
      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-neutral-50 disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          "inline-grid size-5 shrink-0 place-items-center rounded-md border",
          on ? "border-neutral-900 bg-neutral-900! text-white" : "border-neutral-300 bg-white! text-transparent",
          locked && "opacity-60",
        )}
      >
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
      <span className={on ? "text-neutral-800" : "text-neutral-500"}>{label}</span>
    </button>
  );
}

function KitchenPicker({ kitchens, picked, onChange }: { kitchens: AdminSettings["kitchens"]; picked: string[]; onChange: (next: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Kitchens</legend>
      <p className="mb-2 text-[12px] text-neutral-500">Leave empty to give access to every kitchen.</p>
      <div className="flex flex-wrap gap-1.5">
        {kitchens.map((k) => {
          const on = picked.includes(k.id);
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? picked.filter((x) => x !== k.id) : [...picked, k.id])}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150",
                on ? "border-neutral-900 bg-neutral-900! text-white" : "border-neutral-200 bg-white! hover:bg-neutral-50!",
              )}
            >
              {on ? <Check className="size-3.5" aria-hidden /> : null}
              {k.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function InviteSheet({
  roles,
  kitchens,
  onCancel,
  onInvite,
}: {
  roles: StaffRole[];
  kitchens: AdminSettings["kitchens"];
  onCancel: () => void;
  onInvite: (m: Member) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles.find((r) => r.id === "kitchen")?.id ?? roles[0]?.id ?? "kitchen");
  const [picked, setPicked] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const chosen = roles.find((r) => r.id === role);

  return (
    <SheetContent closeLabel="Close invite" className="sm:max-w-[480px]">
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-5 pr-14">
        <div className="min-w-0">
          <SheetTitle>Invite staff</SheetTitle>
          <SheetDescription className="truncate">The invite email goes out when you save.</SheetDescription>
        </div>
      </header>
      <form
        id="invite-form"
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!name.trim() || !emailOk) return;
          onInvite({
            id: `m-${Date.now()}`,
            name: name.trim(),
            email: email.trim(),
            role,
            permissions: null,
            kitchens: role === "admin" ? [] : picked,
            status: "invited",
            lastSeen: null,
          });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-neutral-700">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            aria-invalid={tried && !name.trim()}
            className="aria-invalid:border-red-500"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-neutral-700">Email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            aria-invalid={tried && !emailOk}
            className="aria-invalid:border-red-500"
          />
          {tried && !emailOk ? <span className="text-[12px] text-red-600">Enter a valid email address.</span> : null}
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Role</legend>
          <div className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200">
            {roles.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-3 px-3.5 py-3 first:rounded-t-xl last:rounded-b-xl hover:bg-neutral-50">
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="mt-0.5 accent-neutral-900" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{r.label || "Untitled"}</span>
                  {r.description ? <span className="block text-[13px] leading-snug text-neutral-500">{r.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {role !== "admin" ? <KitchenPicker kitchens={kitchens} picked={picked} onChange={setPicked} /> : null}
        <p className="text-[12px] text-neutral-500">
          {chosen?.label ?? "This role"} follows the role’s permissions. You can give this account its own set afterwards.
        </p>
      </form>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" form="invite-form" className={primaryButton}>
          <Send className="size-4" aria-hidden />
          Send invite
        </button>
      </footer>
    </SheetContent>
  );
}

function AccessSheet({
  member,
  roles,
  kitchens,
  onCancel,
  onSave,
}: {
  member: Member;
  roles: StaffRole[];
  kitchens: AdminSettings["kitchens"];
  onCancel: () => void;
  onSave: (change: Pick<Member, "role" | "permissions" | "kitchens">) => void;
}) {
  const [role, setRole] = useState(roles.some((r) => r.id === member.role) ? member.role : (roles[0]?.id ?? "admin"));
  const [custom, setCustom] = useState(member.permissions !== null && member.role !== "admin");
  const [perms, setPerms] = useState<string[]>(member.permissions ?? roles.find((r) => r.id === member.role)?.permissions ?? []);
  const [picked, setPicked] = useState(member.kitchens);
  const chosen = roles.find((r) => r.id === role);
  const admin = role === "admin";
  const shown = admin ? PERMISSIONS.map((p) => p.id) : custom ? perms : (chosen?.permissions ?? []);

  function chooseRole(next: string) {
    setRole(next);
    if (next === "admin") setCustom(false);
    else if (!custom) setPerms(roles.find((r) => r.id === next)?.permissions ?? []);
  }

  return (
    <SheetContent closeLabel="Close permissions" className="sm:max-w-[480px]">
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-5 pr-14">
        <div className="min-w-0">
          <SheetTitle>{member.name}</SheetTitle>
          <SheetDescription className="truncate">{custom && !admin ? "Own permissions" : `Follows ${chosen?.label ?? "the role"}`}</SheetDescription>
        </div>
      </header>
      <form
        id="access-form"
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ role, permissions: admin || !custom ? null : perms, kitchens: admin ? [] : picked });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-neutral-700">Role</span>
          <Select value={role} onValueChange={chooseRole}>
            <SelectTrigger aria-label="Role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label || "Untitled"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {admin ? null : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">Own permissions</p>
              <p className="mt-0.5 text-[13px] text-neutral-500">Replaces what {chosen?.label ?? "the role"} allows, for this account only.</p>
            </div>
            <Switch
              checked={custom}
              onCheckedChange={(on) => {
                setCustom(on);
                if (on) setPerms(chosen?.permissions ?? []);
              }}
              aria-label="Own permissions"
            />
          </div>
        )}
        <fieldset disabled={!admin && !custom} className={cn(!admin && !custom && "opacity-60")}>
          <legend className="sr-only">Permissions</legend>
          <div className="grid">
            {PERMISSIONS.map((p) => (
              <PermissionToggle
                key={p.id}
                label={p.label}
                on={shown.includes(p.id)}
                locked={admin || !custom}
                onToggle={() => setPerms((list) => (list.includes(p.id) ? list.filter((x) => x !== p.id) : [...list, p.id]))}
              />
            ))}
          </div>
        </fieldset>
        {admin ? null : <KitchenPicker kitchens={kitchens} picked={picked} onChange={setPicked} />}
      </form>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-3">
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" form="access-form" className={primaryButton}>
          Save
        </button>
      </footer>
    </SheetContent>
  );
}
