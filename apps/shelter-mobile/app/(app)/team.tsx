import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react-native";
import type {
  ShelterMember,
  ShelterMemberInvite,
  ShelterMemberRole
} from "@petto/contracts";

import { useSession } from "@/store/session";
import {
  auditActionLabels,
  createInvite,
  fetchAuditLog,
  fetchTeam,
  resendInvite,
  revokeInvite,
  revokeMember,
  updateMemberRole
} from "@/lib/team-api";
import { theme } from "@/lib/theme";

// Single-screen Team management: member list, pending invites, audit
// log sections stacked vertically. Invite flow uses a Modal rather
// than a separate route so the back gesture feels native.

const ROLE_OPTIONS: ShelterMemberRole[] = ["admin", "editor", "viewer"];
const ROLE_LABEL: Record<ShelterMemberRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer"
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function timeLeft(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  const diff = target - Date.now();
  if (Number.isNaN(target)) return "";
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m left`;
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

export default function TeamScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const member = useSession((s) => s.member);
  const role = (member?.role ?? "viewer") as ShelterMemberRole;
  const myMemberID = member?.id;
  const isAdmin = role === "admin";
  const canSeeAudit = role === "admin" || role === "editor";

  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: team, isLoading } = useQuery({
    queryKey: ["shelter-team"],
    queryFn: fetchTeam,
    staleTime: 30_000
  });
  const { data: audit = [] } = useQuery({
    queryKey: ["shelter-audit-log"],
    queryFn: () => fetchAuditLog(50, 0),
    staleTime: 60_000,
    enabled: canSeeAudit
  });

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["shelter-team"] }),
    [qc]
  );

  const resendMut = useMutation({
    mutationFn: (id: string) => resendInvite(id),
    onSuccess: async (res) => {
      invalidate();
      try {
        await Share.share({ message: res.inviteUrl });
      } catch {
        /* ignore */
      }
    },
    onError: (err: Error) => Alert.alert("Resend failed", err.message)
  });

  const revokeInviteMut = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: invalidate,
    onError: (err: Error) => Alert.alert("Revoke failed", err.message)
  });

  const roleMut = useMutation({
    mutationFn: ({ id, r }: { id: string; r: ShelterMemberRole }) =>
      updateMemberRole(id, r),
    onSuccess: invalidate,
    onError: (err: Error) => Alert.alert("Role change failed", err.message)
  });

  const revokeMemberMut = useMutation({
    mutationFn: (id: string) => revokeMember(id),
    onSuccess: invalidate,
    onError: (err: Error) => Alert.alert("Revoke failed", err.message)
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top"]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          gap: 10
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.colors.primaryBg : "#FFFFFF",
            borderWidth: 1,
            borderColor: theme.colors.border
          })}
        >
          <ArrowLeft size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700" }}>Team</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Users size={16} color={theme.colors.muted} />
            <Text style={styles.cardTitle}>Members</Text>
          </View>
          <Text style={styles.cardHint}>
            {(team?.members.filter((m) => m.status === "active").length ?? 0)}{" "}
            active · {(team?.pendingInvites.length ?? 0)} pending · 20 max
          </Text>

          {isLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={{ gap: 10, marginTop: 10 }}>
              {(team?.members ?? [])
                .filter((m) => m.status === "active")
                .map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isSelf={m.id === myMemberID}
                    canManage={isAdmin && m.id !== myMemberID}
                    onRoleChange={(r) => roleMut.mutate({ id: m.id, r })}
                    onRevoke={() =>
                      Alert.alert(
                        "Revoke member?",
                        `${m.email} will lose access on their next request.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Revoke",
                            style: "destructive",
                            onPress: () => revokeMemberMut.mutate(m.id)
                          }
                        ]
                      )
                    }
                  />
                ))}
            </View>
          )}

          {isAdmin && (
            <Pressable
              onPress={() => setInviteOpen(true)}
              style={({ pressed }) => ({
                marginTop: 14,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primary,
                opacity: pressed ? 0.9 : 1
              })}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                Invite member
              </Text>
            </Pressable>
          )}
        </View>

        {(team?.pendingInvites?.length ?? 0) > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>Pending invites</Text>
            <View style={{ gap: 10, marginTop: 10 }}>
              {team!.pendingInvites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  invite={inv}
                  canManage={isAdmin}
                  onResend={() => resendMut.mutate(inv.id)}
                  onRevoke={() => revokeInviteMut.mutate(inv.id)}
                />
              ))}
            </View>
          </View>
        )}

        {canSeeAudit && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Clock size={16} color={theme.colors.muted} />
              <Text style={styles.cardTitle}>Audit log</Text>
            </View>
            <Text style={styles.cardHint}>Append-only activity history.</Text>
            <FlatList
              data={audit}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View
                  style={{ height: 1, backgroundColor: theme.colors.border }}
                />
              )}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <View style={{ paddingVertical: 10 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.colors.muted,
                      marginBottom: 2
                    }}
                  >
                    {relTime(item.createdAt)}
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.colors.ink }}>
                    <Text style={{ fontWeight: "700" }}>
                      {item.actorName?.trim() || item.actorEmail || "—"}
                    </Text>{" "}
                    {auditActionLabels[item.action] ?? item.action}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  No activity yet.
                </Text>
              }
              style={{ marginTop: 6 }}
            />
          </View>
        )}
      </ScrollView>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={invalidate}
      />
    </SafeAreaView>
  );
}

function MemberRow({
  member,
  isSelf,
  canManage,
  onRoleChange,
  onRevoke
}: {
  member: ShelterMember;
  isSelf: boolean;
  canManage: boolean;
  onRoleChange: (r: ShelterMemberRole) => void;
  onRevoke: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "center"
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
          {(member.name || member.email)[0]?.toUpperCase() ?? "?"}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 13, fontWeight: "600", color: theme.colors.ink }}
          numberOfLines={1}
        >
          {member.name?.trim() || member.email}{" "}
          {isSelf && (
            <Text style={{ color: theme.colors.muted, fontSize: 10 }}>
              (You)
            </Text>
          )}
        </Text>
        <Text style={{ fontSize: 11, color: theme.colors.muted }} numberOfLines={1}>
          {member.email}
        </Text>
      </View>
      <RolePill role={member.role as ShelterMemberRole} />
      {canManage && (
        <Pressable onPress={() => promptRoleChange(member.role as ShelterMemberRole, onRoleChange)}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>
            Role
          </Text>
        </Pressable>
      )}
      {canManage && (
        <Pressable onPress={onRevoke} hitSlop={8}>
          <Trash2 size={16} color={theme.colors.danger} />
        </Pressable>
      )}
    </View>
  );
}

function promptRoleChange(
  current: ShelterMemberRole,
  onPick: (r: ShelterMemberRole) => void
) {
  Alert.alert(
    "Change role",
    `Current: ${ROLE_LABEL[current]}`,
    [
      ...ROLE_OPTIONS.filter((r) => r !== current).map((r) => ({
        text: ROLE_LABEL[r],
        onPress: () => onPick(r)
      })),
      { text: "Cancel", style: "cancel" as const }
    ],
    { cancelable: true }
  );
}

function RolePill({ role }: { role: ShelterMemberRole }) {
  const bg =
    role === "admin"
      ? theme.colors.dangerBg
      : role === "editor"
        ? "#E6F0FE"
        : theme.colors.border;
  const fg =
    role === "admin"
      ? theme.colors.danger
      : role === "editor"
        ? "#2563EB"
        : theme.colors.muted;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radius.pill,
        backgroundColor: bg
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: fg,
          textTransform: "uppercase"
        }}
      >
        {ROLE_LABEL[role]}
      </Text>
    </View>
  );
}

function InviteRow({
  invite,
  canManage,
  onResend,
  onRevoke
}: {
  invite: ShelterMemberInvite;
  canManage: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 13, color: theme.colors.ink }}
        >
          {invite.email}
        </Text>
        <Text style={{ fontSize: 11, color: theme.colors.muted }}>
          {ROLE_LABEL[invite.role as ShelterMemberRole]} · {timeLeft(invite.expiresAt)}
        </Text>
      </View>
      {canManage && (
        <>
          <Pressable onPress={onResend} hitSlop={8}>
            <RefreshCw size={14} color={theme.colors.primary} />
          </Pressable>
          <Pressable onPress={onRevoke} hitSlop={8}>
            <Trash2 size={14} color={theme.colors.danger} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function InviteModal({
  open,
  onClose,
  onInvited
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShelterMemberRole>("viewer");
  const [result, setResult] = useState<{ url: string; email: string } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  const reset = () => {
    setEmail("");
    setRole("viewer");
    setResult(null);
  };

  const submit = async () => {
    setPending(true);
    try {
      const res = await createInvite({ email: email.trim().toLowerCase(), role });
      setResult({ url: res.inviteUrl, email: res.invite.email });
      onInvited();
    } catch (err) {
      Alert.alert(
        "Invite failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setPending(false);
    }
  };

  const shareLink = async () => {
    if (!result) return;
    try {
      await Share.share({ message: result.url });
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={open}
      onRequestClose={() => {
        onClose();
        reset();
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(22, 21, 20, 0.4)"
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            padding: 20,
            gap: 14
          }}
        >
          {result ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700" }}>
                Invite ready
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                Share this link with {result.email}. It expires in 72 hours.
              </Text>
              <View
                style={{
                  padding: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.background,
                  borderWidth: 1,
                  borderColor: theme.colors.border
                }}
              >
                <Text
                  selectable
                  style={{ fontSize: 12, color: theme.colors.ink }}
                >
                  {result.url}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={shareLink}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.primary,
                    alignItems: "center",
                    opacity: pressed ? 0.9 : 1
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                    Share
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onClose();
                    reset();
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: "center",
                    opacity: pressed ? 0.8 : 1
                  })}
                >
                  <Text style={{ fontWeight: "700", color: theme.colors.ink }}>
                    Done
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 18, fontWeight: "700" }}>
                Invite team member
              </Text>
              <View>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="volunteer@shelter.org"
                  style={styles.input}
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Role</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {ROLE_OPTIONS.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setRole(r)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 14,
                        height: 36,
                        borderRadius: theme.radius.pill,
                        backgroundColor:
                          role === r ? theme.colors.primary : "#FFFFFF",
                        borderWidth: 1,
                        borderColor:
                          role === r
                            ? theme.colors.primary
                            : theme.colors.border,
                        opacity: pressed ? 0.85 : 1
                      })}
                    >
                      {role === r && <Check size={12} color="#FFFFFF" />}
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: role === r ? "#FFFFFF" : theme.colors.ink
                        }}
                      >
                        {ROLE_LABEL[r]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable
                onPress={submit}
                disabled={!email || pending}
                style={({ pressed }) => ({
                  paddingVertical: 13,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  opacity: !email || pending ? 0.5 : pressed ? 0.9 : 1
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  {pending ? "Creating…" : "Create invite"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClose();
                  reset();
                }}
                style={{ alignItems: "center", paddingVertical: 4 }}
              >
                <Text style={{ color: theme.colors.muted }}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  cardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: theme.colors.ink
  },
  cardHint: {
    fontSize: 12,
    color: theme.colors.muted
  },
  cardSectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: theme.colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: theme.colors.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    marginBottom: 6
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
  }
} as const;
