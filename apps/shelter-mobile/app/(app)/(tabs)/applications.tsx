import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Inbox } from "lucide-react-native";

import { listShelterApplications } from "@/lib/api";
import { theme } from "@/lib/theme";

const FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "chat_open", label: "In chat" },
  { value: "rejected", label: "Rejected" },
  { value: "adopted", label: "Adopted" }
] as const;

export default function ApplicationsScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof FILTERS)[number]["value"]>("pending");
  const { data: apps = [] } = useQuery({
    queryKey: ["shelter-applications", status],
    queryFn: () => listShelterApplications(status)
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: theme.colors.ink }}>Applications</Text>
      </View>

      <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.sm, flexDirection: "row", gap: 4 }}>
        {FILTERS.map((f) => {
          const on = status === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setStatus(f.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: theme.radius.pill,
                backgroundColor: on ? theme.colors.primary : theme.colors.surface,
                borderWidth: 1,
                borderColor: on ? theme.colors.primary : theme.colors.border
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: on ? "#FFFFFF" : theme.colors.ink }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={apps}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/applications/${item.id}` as any)}
            style={({ pressed }) => ({
              flexDirection: "row",
              gap: theme.spacing.md,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.85 : 1
            })}
          >
            {item.petPhoto ? (
              <Image
                source={{ uri: item.petPhoto }}
                style={{ width: 56, height: 56, borderRadius: theme.radius.md, backgroundColor: theme.colors.border }}
                contentFit="cover"
              />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: theme.radius.md, backgroundColor: theme.colors.border }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.ink }} numberOfLines={1}>
                {item.petName ?? "Pet"}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 11, color: theme.colors.muted }} numberOfLines={1}>
                From {item.userName}
              </Text>
              {item.housingType ? (
                <Text style={{ marginTop: 4, fontSize: 10, color: theme.colors.muted }} numberOfLines={1}>
                  {item.housingType}
                  {item.hasOtherPets ? " · has other pets" : ""}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
            <Inbox size={32} color={theme.colors.muted} />
            <Text style={{ fontSize: 13, color: theme.colors.muted }}>
              No applications in this view
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
