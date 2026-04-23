import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Link2, Search, Users, X } from "lucide-react-native";

import {
  buildPlaydateShareUrl,
  createPlaydateInvites,
  listInvitableUsers
} from "@/lib/api";
import { DraggableSheet } from "@/components/draggable-sheet";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import { Avatar } from "@/components/avatar";

type InvitePeopleModalProps = {
  visible: boolean;
  onClose: () => void;
  playdateId: string;
  playdateTitle?: string;
  /** Host-only share token. When present, shareExternal embeds it in the URL
   *  so WhatsApp recipients can claim access to private playdates. */
  shareToken?: string;
  onInvited?: (count: number) => void;
};

export function InvitePeopleModal({
  visible,
  onClose,
  playdateId,
  playdateTitle,
  shareToken,
  onInvited
}: InvitePeopleModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      setSearch("");
    }
  }, [visible]);

  const usersQuery = useQuery({
    queryKey: ["playdate-invitable-users", playdateId],
    queryFn: () => listInvitableUsers(token, playdateId),
    enabled: Boolean(token && playdateId && visible)
  });
  const users = usersQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.firstName ?? "").toLowerCase().includes(q));
  }, [users, search]);

  const inviteMutation = useMutation({
    mutationFn: () => createPlaydateInvites(token, playdateId, selectedIds),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["playdate-detail", playdateId] });
      queryClient.invalidateQueries({ queryKey: ["playdate-invitable-users", playdateId] });
      onInvited?.(res.invites.length);
      onClose();
    },
    onError: (err: any) => {
      Alert.alert(
        t("playdates.invites.errorTitle") as string,
        err?.message ?? (t("playdates.invites.errorBody") as string)
      );
    }
  });

  const toggle = (uid: string) => {
    setSelectedIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  // v0.11.0 — external share fallback for users with no matches yet, or who
  // want to invite someone outside their match graph (e.g. WhatsApp).
  const shareExternal = async () => {
    try {
      const url = buildPlaydateShareUrl(playdateId, shareToken);
      const intro = playdateTitle
        ? (t("playdates.detail.inviteMessage", { title: playdateTitle }) as string)
        : (t("playdates.invites.externalCta") as string);
      await Share.share({ message: `${intro}\n\n${url}` });
    } catch {
      // user cancelled
    }
  };

  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      initialSnap="large"
      snapPoints={{ medium: 0.7, large: 0.92 }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 22,
              marginBottom: 12
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 19,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.invites.title")}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("playdates.invites.subtitle")}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <X size={18} color={theme.colors.muted} />
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 22, marginBottom: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                borderRadius: mobileTheme.radius.md,
                backgroundColor: theme.colors.background
              }}
            >
              <Search size={15} color={theme.colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("playdates.invites.searchPlaceholder") as string}
                placeholderTextColor={theme.colors.muted}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: theme.colors.ink,
                  fontFamily: "Inter_500Medium"
                }}
              />
            </View>
          </View>

          {/* List */}
          {usersQuery.isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View
              style={{
                paddingHorizontal: 22,
                paddingVertical: 40,
                alignItems: "center",
                gap: 10
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: theme.colors.primaryBg,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Users size={26} color={theme.colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold",
                  textAlign: "center"
                }}
              >
                {t("playdates.invites.emptyTitle")}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium",
                  textAlign: "center",
                  paddingHorizontal: 30,
                  lineHeight: 18
                }}
              >
                {t("playdates.invites.emptyBody")}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{
                paddingHorizontal: 22,
                paddingBottom: 8,
                gap: 8
              }}
              showsVerticalScrollIndicator={false}
            >
              {filtered.map((u) => {
                const selected = selectedIds.includes(u.userId);
                return (
                  <Pressable
                    key={u.userId}
                    onPress={() => toggle(u.userId)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: mobileTheme.radius.lg,
                      backgroundColor: selected
                        ? theme.colors.primaryBg
                        : theme.colors.background,
                      borderWidth: 2,
                      borderColor: selected ? theme.colors.primary : "transparent",
                      opacity: pressed ? 0.92 : 1
                    })}
                  >
                    <Avatar uri={u.avatarUrl} name={u.firstName || "?"} size="md" />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: theme.colors.ink,
                        fontFamily: "Inter_700Bold"
                      }}
                    >
                      {u.firstName}
                    </Text>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.primary
                          : "transparent",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {selected ? (
                        <Check size={13} color={theme.colors.white} strokeWidth={3} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* CTA */}
          <View style={{ paddingHorizontal: 22, paddingTop: 12, gap: 10 }}>
            {selectedIds.length > 0 ? (
              <Pressable
                onPress={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending}
                style={({ pressed }) => ({
                  paddingVertical: 15,
                  borderRadius: mobileTheme.radius.pill,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  opacity: pressed ? 0.88 : 1,
                  ...mobileTheme.shadow.sm
                })}
              >
                {inviteMutation.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text
                    style={{
                      color: theme.colors.white,
                      fontSize: 15,
                      fontFamily: "Inter_700Bold"
                    }}
                  >
                    {t("playdates.invites.sendCta", {
                      count: selectedIds.length
                    })}
                  </Text>
                )}
              </Pressable>
            ) : null}

            {/* External share fallback — always visible so users can reach
                friends who aren't on Petto yet. */}
            <Pressable
              onPress={shareExternal}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: mobileTheme.radius.pill,
                backgroundColor: theme.colors.white,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                opacity: pressed ? 0.88 : 1
              })}
            >
              <Link2 size={16} color={theme.colors.primary} />
              <Text
                style={{
                  color: theme.colors.ink,
                  fontSize: 14,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.invites.externalCta")}
              </Text>
            </Pressable>
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.muted,
                fontFamily: "Inter_500Medium",
                textAlign: "center"
              }}
            >
              {t("playdates.invites.externalHint")}
            </Text>
          </View>
        </View>
      </View>
    </DraggableSheet>
  );
}
