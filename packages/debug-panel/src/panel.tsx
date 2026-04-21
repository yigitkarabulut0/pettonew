// Full-screen debug panel UI. Apps mount a single <DebugPanel /> at the
// root of their layout tree so it can overlay every screen/modal.

import * as React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";

import { useDebug, useOverridesVersion, useRegistryVersion } from "./provider";
import { getAllEntries, getAllScenarios } from "./registry";
import {
  getOverrides,
  resetOverrides,
  setOverrides
} from "./overrides";
import type {
  DebugEntry,
  DebugGroup,
  MockOverrides,
  PermissionKey,
  PermissionState
} from "./types";

const GROUPS: DebugGroup[] = [
  "Screens",
  "Modals",
  "Sheets",
  "Flows",
  "Scenarios",
  "Mocks",
  "Environment"
];

const PERMISSION_LIST: PermissionKey[] = [
  "location.foreground",
  "location.background",
  "notifications",
  "camera",
  "media-library",
  "contacts"
];

const PERMISSION_STATES: PermissionState[] = [
  "granted",
  "denied",
  "limited",
  "undetermined"
];

export function DebugPanel() {
  const { isOpen, close, env } = useDebug();
  const router = useRouter();
  const registryVersion = useRegistryVersion();
  const overridesVersion = useOverridesVersion();

  const [query, setQuery] = React.useState("");
  const [activeGroup, setActiveGroup] = React.useState<DebugGroup>("Screens");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = React.useMemo(() => getAllEntries(), [registryVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scenarios = React.useMemo(() => getAllScenarios(), [registryVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overrides = React.useMemo(() => getOverrides(), [overridesVersion]);

  const filtered = React.useMemo(() => {
    const text = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (e.group !== activeGroup) return false;
      if (!text) return true;
      const hay = `${e.title} ${e.subtitle ?? ""} ${(e.tags ?? []).join(" ")}`
        .toLowerCase();
      return hay.includes(text);
    });
  }, [entries, query, activeGroup]);

  const toast = React.useCallback((msg: string) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-console
      console.log(`[debug] ${msg}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[debug] ${msg}`);
  }, []);

  const runEntry = React.useCallback(
    (entry: DebugEntry) => {
      void entry.run({
        close,
        navigate: (href) => router.push(href as never),
        toast
      });
    },
    [close, router, toast]
  );

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>DEBUG PANEL</Text>
            <Text style={styles.title}>{env.appName}</Text>
            <Text style={styles.subtitle}>
              v{env.version}
              {env.buildNumber ? ` (${env.buildNumber})` : ""} ·{" "}
              {env.platform} · {env.isDev ? "dev" : "prod"}
            </Text>
          </View>
          <Pressable
            onPress={close}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.6 }
            ]}
            accessibilityLabel="Close debug panel"
          >
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search screens, modals, scenarios…"
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
            clearButtonMode="while-editing"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {GROUPS.map((g) => {
            const active = g === activeGroup;
            return (
              <Pressable
                key={g}
                onPress={() => setActiveGroup(g)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {g}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
          {activeGroup === "Mocks" ? (
            <MocksTab overrides={overrides} toast={toast} />
          ) : activeGroup === "Scenarios" ? (
            <ScenariosTab scenarios={scenarios} toast={toast} />
          ) : activeGroup === "Environment" ? (
            <EnvironmentTab env={env} />
          ) : filtered.length === 0 ? (
            <Text style={styles.empty}>
              Nothing registered for {activeGroup} yet.
            </Text>
          ) : (
            filtered.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => runEntry(entry)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: "#f5f1ea" }
                ]}
              >
                <Text style={styles.rowTitle}>{entry.title}</Text>
                {entry.subtitle ? (
                  <Text style={styles.rowSubtitle}>{entry.subtitle}</Text>
                ) : null}
              </Pressable>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => {
              resetOverrides();
              toast("Overrides reset");
            }}
            style={({ pressed }) => [
              styles.footerBtn,
              pressed && { opacity: 0.7 }
            ]}
          >
            <Text style={styles.footerBtnLabel}>Reset all overrides</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Tabs ────────────────────────────────────────────────── */

function MocksTab({
  overrides,
  toast
}: {
  overrides: MockOverrides;
  toast: (msg: string) => void;
}) {
  return (
    <View>
      <Section title="API errors">
        <Text style={styles.helper}>
          Force a status code for requests whose URL contains the given
          substring (leave empty for all requests).
        </Text>
        <TextInput
          value={overrides.apiErrorPath ?? ""}
          onChangeText={(v) => setOverrides({ apiErrorPath: v || null })}
          placeholder="URL substring (e.g. /v1/me)"
          placeholderTextColor="#888"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.statusRow}>
          {[null, 401, 403, 404, 408, 500].map((status) => {
            const active = overrides.apiErrorStatus === status;
            return (
              <Pressable
                key={String(status)}
                onPress={() => setOverrides({ apiErrorStatus: status })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {status === null ? "Off" : String(status)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Latency">
        <View style={styles.statusRow}>
          {[0, 500, 1500, 3000, 8000].map((ms) => {
            const active = (overrides.apiLatencyMs ?? 0) === ms;
            return (
              <Pressable
                key={String(ms)}
                onPress={() => setOverrides({ apiLatencyMs: ms })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {ms === 0 ? "Off" : `${ms}ms`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Permissions">
        {PERMISSION_LIST.map((key) => (
          <View key={key} style={styles.permRow}>
            <Text style={styles.permName}>{key}</Text>
            <View style={styles.statusRow}>
              {PERMISSION_STATES.map((state) => {
                const active = overrides.permissions[key] === state;
                return (
                  <Pressable
                    key={state}
                    onPress={() =>
                      setOverrides({
                        permissions: { [key]: active ? undefined : state }
                      })
                    }
                    style={[styles.chipSm, active && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipLabelSm,
                        active && styles.chipLabelActive
                      ]}
                    >
                      {state}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Location override">
        <View style={styles.statusRow}>
          {[
            { label: "Off", value: null },
            {
              label: "Istanbul",
              value: { latitude: 41.0082, longitude: 28.9784, label: "Istanbul, TR" }
            },
            {
              label: "London",
              value: {
                latitude: 51.5072,
                longitude: -0.1276,
                label: "London, UK"
              }
            },
            {
              label: "SF",
              value: {
                latitude: 37.7749,
                longitude: -122.4194,
                label: "San Francisco, US"
              }
            }
          ].map((opt) => {
            const active = overrides.locationOverride?.label === opt.value?.label;
            return (
              <Pressable
                key={opt.label}
                onPress={() => setOverrides({ locationOverride: opt.value })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Theme">
        <View style={styles.statusRow}>
          {(["system", "light", "dark"] as const).map((t) => {
            const active = (overrides.themeOverride ?? "system") === t;
            return (
              <Pressable
                key={t}
                onPress={() => setOverrides({ themeOverride: t })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Session / user">
        <Pressable
          onPress={() => {
            setOverrides({
              sessionOverride: overrides.sessionOverride
                ? null
                : {
                    userId: "debug-user",
                    name: "QA Tester",
                    email: "qa@fetcht.test"
                  }
            });
            toast(
              overrides.sessionOverride
                ? "Session override cleared"
                : "Mock session applied"
            );
          }}
          style={styles.btnRow}
        >
          <Text style={styles.btnRowLabel}>
            {overrides.sessionOverride
              ? "Clear mock session"
              : "Apply mock session"}
          </Text>
          <Switch value={!!overrides.sessionOverride} onValueChange={() => {}} />
        </Pressable>
      </Section>

      <Section title="Onboarding">
        <Pressable
          onPress={() => {
            setOverrides({ onboardingResetAt: Date.now() });
            toast("Onboarding reset marker set");
          }}
          style={styles.btnRow}
        >
          <Text style={styles.btnRowLabel}>Mark onboarding as not-seen</Text>
        </Pressable>
      </Section>
    </View>
  );
}

function ScenariosTab({
  scenarios,
  toast
}: {
  scenarios: ReturnType<typeof getAllScenarios>;
  toast: (msg: string) => void;
}) {
  if (scenarios.length === 0) {
    return <Text style={styles.empty}>No scenarios registered.</Text>;
  }
  return (
    <View>
      {scenarios.map((s) => (
        <View key={s.id} style={styles.row}>
          <Text style={styles.rowTitle}>{s.title}</Text>
          {s.description ? (
            <Text style={styles.rowSubtitle}>{s.description}</Text>
          ) : null}
          <View style={[styles.statusRow, { marginTop: 8 }]}>
            <Pressable
              onPress={() => {
                void Promise.resolve(
                  s.apply({
                    setQueryData: () => {},
                    invalidateQueries: async () => {}
                  })
                );
                toast(`Applied: ${s.title}`);
              }}
              style={[styles.chip, styles.chipActive]}
            >
              <Text style={[styles.chipLabel, styles.chipLabelActive]}>Apply</Text>
            </Pressable>
            {s.reset ? (
              <Pressable
                onPress={() => {
                  void Promise.resolve(
                    s.reset!({
                      setQueryData: () => {},
                      invalidateQueries: async () => {}
                    })
                  );
                  toast(`Reset: ${s.title}`);
                }}
                style={styles.chip}
              >
                <Text style={styles.chipLabel}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function EnvironmentTab({
  env
}: {
  env: ReturnType<typeof useDebug>["env"];
}) {
  const rows: { k: string; v: string }[] = [
    { k: "App", v: env.appName },
    { k: "Slug", v: env.appSlug },
    { k: "Version", v: env.version },
    { k: "Build", v: env.buildNumber ?? "—" },
    { k: "Channel", v: env.releaseChannel ?? "—" },
    { k: "API base", v: env.apiBaseUrl ?? "—" },
    { k: "Commit", v: env.commitSha ?? "—" },
    { k: "Platform", v: env.platform },
    { k: "Mode", v: env.isDev ? "development" : "production" },
    { k: "Session", v: env.sessionSummary ?? "none" }
  ];
  return (
    <View>
      {rows.map((r) => (
        <View key={r.k} style={styles.kvRow}>
          <Text style={styles.kvKey}>{r.k}</Text>
          <Text style={styles.kvValue}>{r.v}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fffbf6" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(22,21,20,0.08)"
  },
  eyebrow: {
    color: "#E6694A",
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: "700"
  },
  title: { fontSize: 22, fontWeight: "700", color: "#16141A", marginTop: 4 },
  subtitle: { fontSize: 11, color: "#6B6A6B", marginTop: 2 },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#16141A"
  },
  closeLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  searchWrap: { paddingHorizontal: 20, paddingTop: 12 },
  search: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(22,21,20,0.1)",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#16141A"
  },
  tabs: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    flexDirection: "row"
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(22,21,20,0.08)"
  },
  tabActive: { backgroundColor: "#E6694A", borderColor: "#E6694A" },
  tabLabel: { color: "#16141A", fontSize: 12, fontWeight: "600" },
  tabLabelActive: { color: "#fff" },
  body: { flex: 1 },
  bodyInner: { padding: 16, paddingBottom: 40 },
  empty: { color: "#6B6A6B", fontSize: 13, padding: 24, textAlign: "center" },
  row: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(22,21,20,0.06)"
  },
  rowTitle: { color: "#16141A", fontSize: 14, fontWeight: "600" },
  rowSubtitle: { color: "#6B6A6B", fontSize: 12, marginTop: 3 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(22,21,20,0.06)"
  },
  sectionTitle: {
    color: "#16141A",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10
  },
  helper: { color: "#6B6A6B", fontSize: 11, marginBottom: 8 },
  input: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(22,21,20,0.1)",
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#16141A",
    marginBottom: 10
  },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff6f1",
    borderWidth: 1,
    borderColor: "rgba(230,105,74,0.2)"
  },
  chipSm: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#fff6f1",
    borderWidth: 1,
    borderColor: "rgba(230,105,74,0.2)"
  },
  chipActive: { backgroundColor: "#E6694A", borderColor: "#E6694A" },
  chipLabel: { color: "#E6694A", fontSize: 12, fontWeight: "600" },
  chipLabelSm: { color: "#E6694A", fontSize: 10, fontWeight: "600" },
  chipLabelActive: { color: "#fff" },
  permRow: { marginBottom: 10 },
  permName: { color: "#16141A", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6
  },
  btnRowLabel: { color: "#16141A", fontSize: 13, fontWeight: "600" },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(22,21,20,0.06)"
  },
  kvKey: { color: "#6B6A6B", fontSize: 12, fontWeight: "600" },
  kvValue: {
    color: "#16141A",
    fontSize: 12,
    marginLeft: 12,
    flexShrink: 1,
    textAlign: "right"
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(22,21,20,0.08)",
    padding: 14
  },
  footerBtn: {
    backgroundColor: "#16141A",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center"
  },
  footerBtnLabel: { color: "#fff", fontSize: 13, fontWeight: "700" }
});
