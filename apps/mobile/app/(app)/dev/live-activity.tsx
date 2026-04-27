import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import LiveActivities, {
  type ActivePlaydateActivity,
  nativeLoadError,
} from "petto-live-activities";

const ACCENT = "#E6694A";
const CREAM = "#FFF8F0";
const TEXT = "#181818";
const SUBTLE = "#6B7280";

/**
 * Manual Live Activity test harness. Opens at petto://dev/live-activity
 * (or through navigation). All actions are local to ActivityKit — no
 * backend involvement — so we can iterate on the SwiftUI views without
 * touching the server.
 */
export default function LiveActivityDevScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [moduleLoaded, setModuleLoaded] = useState<boolean | null>(null);
  const [active, setActive] = useState<ActivePlaydateActivity[]>([]);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState(3);
  const [diagError, setDiagError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await LiveActivities.listActive();
      setActive(list);
      setModuleLoaded(true);
    } catch (err) {
      setModuleLoaded(false);
      setDiagError(String(err));
    }
  }, []);

  useEffect(() => {
    if (nativeLoadError) {
      setDiagError(`requireNativeModule failed: ${nativeLoadError}`);
    }
    LiveActivities.isSupported()
      .then(setSupported)
      .catch((err) => {
        setSupported(false);
        setDiagError(String(err));
      });
    refresh();
    const sub = LiveActivities.addActivityEndedListener((e) => {
      if (e.activityId === activityId) setActivityId(null);
      refresh();
    });
    return () => sub?.remove?.();
  }, [activityId, refresh]);

  const startUpcoming = async () => {
    try {
      const startsAt = Math.floor(Date.now() / 1000) + 45 * 60;
      const id = await LiveActivities.startPlaydate(
        {
          playdateId: `test-${Date.now()}`,
          title: "Pati Parkı Buluşması",
          city: "Levent, İstanbul",
          hostName: "Yigit",
          emoji: "🐾",
        },
        {
          status: "upcoming",
          startsAt,
          endsAt: startsAt + 2 * 60 * 60,
          attendeeCount: attendees,
          maxPets: 6,
          firstAvatars: [],
        },
      );
      setActivityId(id);
      refresh();
    } catch (err) {
      Alert.alert("Live Activity error", String(err));
    }
  };

  const startInProgress = async () => {
    try {
      const startsAt = Math.floor(Date.now() / 1000) - 10 * 60;
      const id = await LiveActivities.startPlaydate(
        {
          playdateId: `test-${Date.now()}`,
          title: "Sahil Yürüyüşü",
          city: "Caddebostan",
          hostName: "Bora",
          emoji: "🐶",
        },
        {
          status: "in_progress",
          startsAt,
          endsAt: startsAt + 90 * 60,
          attendeeCount: attendees,
          maxPets: 6,
          firstAvatars: [],
        },
      );
      setActivityId(id);
      refresh();
    } catch (err) {
      Alert.alert("Live Activity error", String(err));
    }
  };

  const startWaitlist = async () => {
    try {
      const startsAt = Math.floor(Date.now() / 1000) + 90 * 60;
      const id = await LiveActivities.startPlaydate(
        {
          playdateId: `test-${Date.now()}`,
          title: "Köpek Eğitim Buluşması",
          city: "Maçka Parkı",
          hostName: "Ayşe",
          emoji: "🐕",
        },
        {
          status: "upcoming",
          startsAt,
          attendeeCount: 6,
          maxPets: 6,
          firstAvatars: [],
          waitlistPosition: 3,
        },
      );
      setActivityId(id);
      refresh();
    } catch (err) {
      Alert.alert("Live Activity error", String(err));
    }
  };

  const incrementAttendees = async () => {
    if (!activityId) {
      Alert.alert("Önce bir activity başlat");
      return;
    }
    const next = attendees + 1;
    setAttendees(next);
    try {
      const list = await LiveActivities.listActive();
      const a = list.find((x) => x.id === activityId);
      if (!a) return;
      await LiveActivities.updatePlaydate(activityId, {
        status: "upcoming",
        startsAt: Math.floor(Date.now() / 1000) + 45 * 60,
        attendeeCount: next,
        maxPets: 6,
        firstAvatars: [],
      });
    } catch (err) {
      Alert.alert("Update error", String(err));
    }
  };

  const cancelActivity = async () => {
    if (!activityId) return;
    try {
      await LiveActivities.endPlaydate(
        activityId,
        {
          status: "cancelled",
          startsAt: Math.floor(Date.now() / 1000),
          attendeeCount: attendees,
          maxPets: 6,
          firstAvatars: [],
          statusMessage: "İptal edildi",
        },
        0,
      );
      setActivityId(null);
      refresh();
    } catch (err) {
      Alert.alert("End error", String(err));
    }
  };

  const endNow = async () => {
    if (!activityId) return;
    try {
      await LiveActivities.endPlaydate(activityId, undefined, 0);
      setActivityId(null);
      refresh();
    } catch (err) {
      Alert.alert("End error", String(err));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(0,0,0,0.06)",
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={24} color={TEXT} />
        </Pressable>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: TEXT }}>
            Live Activity Test
          </Text>
          <Text style={{ fontSize: 12, color: SUBTLE }}>
            iOS Dynamic Island + Lock Screen
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}
      >
        <Card>
          <Row label="iOS sürümü">
            <Text style={{ fontSize: 13, color: TEXT, fontWeight: "600" }}>
              {String(Platform.Version)}
            </Text>
          </Row>
          <Row label="Native module">
            <Status
              ok={moduleLoaded === true}
              text={
                moduleLoaded === null
                  ? "Kontrol ediliyor..."
                  : moduleLoaded
                    ? "Yüklendi"
                    : "YÜKLENMEDİ"
              }
            />
          </Row>
          <Row label="Live Activity izni">
            <Status
              ok={supported === true}
              text={
                supported === null
                  ? "Kontrol ediliyor..."
                  : supported
                    ? "Verildi"
                    : "Reddedildi (Settings → Face ID → Live Activities)"
              }
            />
          </Row>
          <Row label="Aktif activity sayısı">
            <Text style={{ fontSize: 15, fontWeight: "600", color: TEXT }}>
              {active.length}
            </Text>
          </Row>
          {activityId ? (
            <Row label="Activity ID">
              <Text style={{ fontSize: 12, color: SUBTLE }} numberOfLines={1}>
                {activityId.slice(0, 18)}…
              </Text>
            </Row>
          ) : null}
          {diagError ? (
            <View
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                padding: 10,
                borderRadius: 10,
                marginTop: 4,
              }}
            >
              <Text style={{ fontSize: 11, color: "#B42318" }}>
                {diagError}
              </Text>
            </View>
          ) : null}
        </Card>

        <Section title="Senaryo başlat">
          <Btn label="🐾 Yaklaşan playdate (45dk)" onPress={startUpcoming} />
          <Btn label="🐶 Devam eden playdate" onPress={startInProgress} />
          <Btn label="🐕 Waitlist (#3)" onPress={startWaitlist} />
        </Section>

        <Section title="Aktif activity'i güncelle">
          <Btn
            label={`👥 Katılımcı sayısı +1 (şu an ${attendees})`}
            onPress={incrementAttendees}
            disabled={!activityId}
          />
          <Btn
            label="❌ İptal et (anında dismiss)"
            onPress={cancelActivity}
            disabled={!activityId}
            destructive
          />
          <Btn
            label="🛑 Bitir (anında)"
            onPress={endNow}
            disabled={!activityId}
            destructive
          />
        </Section>

        <Section title="Nasıl test ederim?">
          <Tip>1. Yukarıdan bir senaryo seç.</Tip>
          <Tip>
            2. iPhone'unu kilitle — lock screen'de banner görmelisin.
          </Tip>
          <Tip>
            3. iPhone 14 Pro+'da app'ten çıkıp Dynamic Island'a bak.
          </Tip>
          <Tip>
            4. Bu sayfaya geri gel, "Katılımcı sayısı +1" e bas — banner ve
            DI anında güncellenir.
          </Tip>
          <Tip>
            5. "İptal et" basınca banner üstü çizili "İptal edildi" olup
            kaybolur.
          </Tip>
        </Section>
      </ScrollView>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "white",
        borderRadius: 16,
        padding: 14,
        gap: 10,
        shadowColor: "rgba(0,0,0,0.04)",
        shadowOpacity: 1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 13, color: SUBTLE }}>{label}</Text>
      {children}
    </View>
  );
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: ok ? "rgba(63,182,128,0.12)" : "rgba(156,163,175,0.18)",
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: ok ? "#3FB680" : SUBTLE,
        }}
      />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: ok ? "#1F8A5B" : SUBTLE,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: SUBTLE,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginLeft: 4,
        }}
      >
        {title}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function Btn({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: disabled
          ? "rgba(0,0,0,0.05)"
          : destructive
            ? "rgba(239,68,68,0.10)"
            : "white",
        borderWidth: 1.5,
        borderColor: disabled
          ? "rgba(0,0,0,0.06)"
          : destructive
            ? "rgba(239,68,68,0.30)"
            : ACCENT,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: disabled ? SUBTLE : destructive ? "#B42318" : ACCENT,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 13, color: SUBTLE, lineHeight: 19 }}>
      {children}
    </Text>
  );
}
