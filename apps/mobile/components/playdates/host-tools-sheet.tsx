import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import type { Playdate } from "@petto/contracts";
import { DraggableSheet } from "@/components/draggable-sheet";
import {
  Crown,
  Edit3,
  Lock,
  Megaphone,
  Unlock,
  UserCog,
  UserPlus,
  X
} from "lucide-react-native";
import { Trash2 } from "lucide-react-native";

import { setPlaydateLock, transferPlaydateOwnership } from "@/lib/api";
import { mobileTheme, useTheme } from "@/lib/theme";
import { useSessionStore } from "@/store/session";
import { Avatar } from "@/components/avatar";

type HostAction =
  | "edit"
  | "announce"
  | "invite"
  | "lock"
  | "transfer"
  | "cancel";

type HostToolsSheetProps = {
  visible: boolean;
  onClose: () => void;
  playdate: Playdate;
  onAction: (action: HostAction) => void;
};

/**
 * Consolidated host-tools panel. Surfaces every organizer-only control in a
 * single bottom sheet so the sticky CTA bar stays clean ("View chat" primary,
 * "Host tools" secondary). Individual actions route back to the caller via
 * `onAction` so the parent screen owns the destructive confirmations and the
 * modal-orchestration state machine.
 *
 * The transfer-ownership picker is handled in-place because it needs access
 * to the attendee list and has no natural parent modal.
 */
export function HostToolsSheet({
  visible,
  onClose,
  playdate,
  onAction
}: HostToolsSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const token = session?.tokens.accessToken ?? "";

  const [transferPickerOpen, setTransferPickerOpen] = useState(false);
  const isPrivate = playdate.visibility === "private";
  const isLocked = Boolean(playdate.locked);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["playdates"] });
    queryClient.invalidateQueries({ queryKey: ["playdate-detail", playdate.id] });
    queryClient.invalidateQueries({ queryKey: ["my-playdates"] });
  };

  const lockMutation = useMutation({
    mutationFn: () => setPlaydateLock(token, playdate.id, !isLocked),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: any) =>
      Alert.alert(
        t("playdates.hostTools.errorTitle") as string,
        err?.message ?? ""
      )
  });

  const transferMutation = useMutation({
    mutationFn: (newOwnerId: string) =>
      transferPlaydateOwnership(token, playdate.id, newOwnerId),
    onSuccess: () => {
      invalidate();
      setTransferPickerOpen(false);
      onClose();
      Alert.alert(
        t("playdates.hostTools.transferSuccessTitle") as string,
        t("playdates.hostTools.transferSuccessBody") as string
      );
    },
    onError: (err: any) =>
      Alert.alert(
        t("playdates.hostTools.errorTitle") as string,
        err?.message ?? ""
      )
  });

  // Transferable candidates: every attendee except the current host.
  const transferable = (playdate.attendeesInfo ?? []).filter(
    (a) => a.userId !== playdate.organizerId
  );

  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      initialSnap="large"
      snapPoints={{ medium: 0.6, large: 0.92 }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 22,
              marginBottom: 10
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
              <Crown size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.hostTools.title")}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: theme.colors.muted,
                  fontFamily: "Inter_500Medium"
                }}
              >
                {t("playdates.hostTools.subtitle")}
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

          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            <ActionRow
              icon={<Edit3 size={18} color={theme.colors.ink} />}
              label={t("playdates.hostTools.editDetails") as string}
              description={t("playdates.hostTools.editDetailsHint") as string}
              onPress={() => {
                onClose();
                onAction("edit");
              }}
            />
            <ActionRow
              icon={<Megaphone size={18} color={theme.colors.ink} />}
              label={t("playdates.hostTools.sendAnnouncement") as string}
              description={
                t("playdates.hostTools.sendAnnouncementHint") as string
              }
              onPress={() => {
                onClose();
                onAction("announce");
              }}
            />
            {isPrivate ? (
              <ActionRow
                icon={<UserPlus size={18} color={theme.colors.ink} />}
                label={t("playdates.hostTools.inviteFriends") as string}
                description={
                  t("playdates.hostTools.inviteFriendsHint") as string
                }
                onPress={() => {
                  onClose();
                  onAction("invite");
                }}
              />
            ) : null}
            <ActionRow
              icon={
                isLocked ? (
                  <Unlock size={18} color={theme.colors.ink} />
                ) : (
                  <Lock size={18} color={theme.colors.ink} />
                )
              }
              label={
                isLocked
                  ? (t("playdates.hostTools.unlock") as string)
                  : (t("playdates.hostTools.lock") as string)
              }
              description={
                isLocked
                  ? (t("playdates.hostTools.unlockHint") as string)
                  : (t("playdates.hostTools.lockHint") as string)
              }
              loading={lockMutation.isPending}
              onPress={() => lockMutation.mutate()}
            />
            <ActionRow
              icon={<UserCog size={18} color={theme.colors.ink} />}
              label={t("playdates.hostTools.transferOwnership") as string}
              description={
                t("playdates.hostTools.transferOwnershipHint") as string
              }
              onPress={() => setTransferPickerOpen(true)}
            />
            <ActionRow
              icon={<Trash2 size={18} color={theme.colors.danger} />}
              label={t("playdates.hostTools.cancelPlaydate") as string}
              description={
                t("playdates.hostTools.cancelPlaydateHint") as string
              }
              destructive
              onPress={() => {
                onClose();
                onAction("cancel");
              }}
            />
          </ScrollView>
        </View>
      </View>

      {/* Transfer picker — opened from inside the sheet. */}
      <DraggableSheet
        visible={transferPickerOpen}
        onClose={() => setTransferPickerOpen(false)}
        initialSnap="medium"
        snapPoints={{ medium: 0.6, large: 0.88 }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ paddingTop: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 22,
                marginBottom: 10
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 17,
                  color: theme.colors.ink,
                  fontFamily: "Inter_700Bold"
                }}
              >
                {t("playdates.hostTools.transferTitle")}
              </Text>
              <Pressable
                onPress={() => setTransferPickerOpen(false)}
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
            {transferable.length === 0 ? (
              <View
                style={{
                  paddingHorizontal: 22,
                  paddingVertical: 30,
                  alignItems: "center"
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.muted,
                    fontFamily: "Inter_500Medium",
                    textAlign: "center"
                  }}
                >
                  {t("playdates.hostTools.transferEmpty")}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{
                  paddingHorizontal: 22,
                  paddingBottom: 10,
                  gap: 8
                }}
              >
                {transferable.map((attendee) => (
                  <Pressable
                    key={attendee.userId}
                    onPress={() => {
                      Alert.alert(
                        t("playdates.hostTools.transferConfirmTitle") as string,
                        t("playdates.hostTools.transferConfirmBody", {
                          name: attendee.firstName
                        }) as string,
                        [
                          {
                            text: t("common.cancel") as string,
                            style: "cancel"
                          },
                          {
                            text: t(
                              "playdates.hostTools.transferConfirmAction"
                            ) as string,
                            onPress: () =>
                              transferMutation.mutate(attendee.userId)
                          }
                        ]
                      );
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: mobileTheme.radius.lg,
                      backgroundColor: theme.colors.background,
                      opacity: pressed ? 0.9 : 1
                    })}
                  >
                    <Avatar
                      uri={attendee.avatarUrl}
                      name={attendee.firstName || "?"}
                      size="md"
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.ink,
                          fontFamily: "Inter_700Bold"
                        }}
                      >
                        {attendee.firstName}
                      </Text>
                      {attendee.pets && attendee.pets.length > 0 ? (
                        <Text
                          numberOfLines={1}
                          style={{
                            marginTop: 2,
                            fontSize: 12,
                            color: theme.colors.muted,
                            fontFamily: "Inter_500Medium"
                          }}
                        >
                          {attendee.pets.map((p) => p.name).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </DraggableSheet>
    </DraggableSheet>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onPress,
  destructive,
  loading
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 22,
        paddingVertical: 14,
        opacity: pressed || loading ? 0.7 : 1
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: destructive
            ? theme.colors.dangerBg
            : theme.colors.background,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            color: destructive ? theme.colors.danger : theme.colors.ink,
            fontFamily: "Inter_700Bold"
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: 12,
            color: theme.colors.muted,
            fontFamily: "Inter_500Medium",
            lineHeight: 17
          }}
        >
          {description}
        </Text>
      </View>
    </Pressable>
  );
}
