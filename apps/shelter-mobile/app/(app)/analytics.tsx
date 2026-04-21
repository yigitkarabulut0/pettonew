// Shelter analytics — mobile version of the /analytics page on
// shelter-web. Range tabs (30d / 90d / 12m / all), 4 stat cards,
// application-funnel bars, and a per-listing performance table.
// Editor+ gate is enforced server-side; the UI surfaces 403 as a
// polite access-blocked screen.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Heart,
  PawPrint,
  ShieldAlert,
  Sparkles,
  TrendingUp
} from "lucide-react-native";

import {
  getAnalyticsFunnel,
  getAnalyticsListings,
  getAnalyticsOverview,
  type AnalyticsRange,
  type ApplicationFunnel,
  type ListingPerformanceRow
} from "@/lib/api";
import { theme, useTheme } from "@/lib/theme";

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" }
];

type SortKey = "name" | "views" | "saves" | "applications" | "adoptions" | "daysListed";

export default function AnalyticsScreen() {
  const router = useRouter();
  const t = useTheme();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "applications",
    dir: "desc"
  });

  const overview = useQuery({
    queryKey: ["analytics-overview", range],
    queryFn: () => getAnalyticsOverview(range),
    retry: false
  });
  const listings = useQuery({
    queryKey: ["analytics-listings", range],
    queryFn: () => getAnalyticsListings(range),
    retry: false
  });
  const funnel = useQuery({
    queryKey: ["analytics-funnel", range],
    queryFn: () => getAnalyticsFunnel(range),
    retry: false
  });

  // 403 from any of the three → viewer role. Show blocked state.
  const blocked =
    overview.isError &&
    /403|forbidden|insufficient/i.test((overview.error as Error | null)?.message ?? "");

  if (blocked) {
    return <BlockedState theme={t} router={router} />;
  }

  const sortedRows = useMemo(() => {
    const rows = listings.data ?? [];
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sort.dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [listings.data, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color={t.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <BarChart3 size={13} color={t.colors.primary} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: t.colors.primary,
                letterSpacing: 0.6
              }}
            >
              SHELTER ANALYTICS
            </Text>
          </View>
          <Text style={{ marginTop: 2, fontSize: 17, fontWeight: "700", color: t.colors.ink }}>
            How your listings are doing
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.xl,
          gap: theme.spacing.xl,
          paddingBottom: 40
        }}
      >
        {/* Range tabs */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {RANGES.map((r) => {
            const on = range === r.value;
            return (
              <Pressable
                key={r.value}
                onPress={() => setRange(r.value)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: on ? t.colors.primary : t.colors.border,
                  backgroundColor: on ? t.colors.primary : "transparent",
                  opacity: pressed ? 0.85 : 1
                })}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: on ? "#FFFFFF" : t.colors.ink
                  }}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Stat cards */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <StatCard
            label="Active listings"
            value={String(overview.data?.activeListings ?? 0)}
            icon={<PawPrint size={14} color={t.colors.primary} />}
            loading={overview.isLoading}
            theme={t}
          />
          <StatCard
            label="Adoptions (month)"
            value={String(overview.data?.adoptionsThisMonth ?? 0)}
            icon={<Heart size={14} color={t.colors.primary} />}
            loading={overview.isLoading}
            theme={t}
          />
          <StatCard
            label="Adoptions (year)"
            value={String(overview.data?.adoptionsThisYear ?? 0)}
            icon={<TrendingUp size={14} color={t.colors.primary} />}
            loading={overview.isLoading}
            theme={t}
          />
          <StatCard
            label="Avg days to adopt"
            value={
              overview.data && overview.data.avgDaysToAdoption > 0
                ? overview.data.avgDaysToAdoption.toFixed(1)
                : "—"
            }
            hint={
              overview.data && overview.data.avgSampleSize > 0
                ? `${overview.data.avgSampleSize} adoption${overview.data.avgSampleSize === 1 ? "" : "s"}`
                : undefined
            }
            icon={<Clock size={14} color={t.colors.primary} />}
            loading={overview.isLoading}
            theme={t}
          />
        </View>

        {/* Top listing highlight */}
        {overview.data?.topListing ? (
          <View
            style={{
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: t.colors.card,
              borderWidth: 1,
              borderColor: t.colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.md
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: theme.radius.md,
                backgroundColor: t.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Sparkles size={16} color={t.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: t.colors.muted,
                  letterSpacing: 0.4
                }}
              >
                TOP LISTING · {RANGES.find((r) => r.value === range)?.label.toUpperCase()}
              </Text>
              <Text
                style={{ marginTop: 2, fontSize: 15, fontWeight: "700", color: t.colors.ink }}
                numberOfLines={1}
              >
                {overview.data.topListing.name}
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: t.colors.ink }}>
              {overview.data.topListing.applicationCount} app
              {overview.data.topListing.applicationCount === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}

        {/* Funnel */}
        <View>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: t.colors.muted,
              letterSpacing: 0.6,
              marginBottom: 10
            }}
          >
            APPLICATION FUNNEL
          </Text>
          <View
            style={{
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: t.colors.card,
              borderWidth: 1,
              borderColor: t.colors.border
            }}
          >
            {funnel.isLoading ? (
              <ActivityIndicator color={t.colors.primary} />
            ) : (
              <Funnel
                data={
                  funnel.data ?? { submitted: 0, underReview: 0, approved: 0, adopted: 0 }
                }
                theme={t}
              />
            )}
          </View>
        </View>

        {/* Per-listing table */}
        <View>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: t.colors.muted,
              letterSpacing: 0.6,
              marginBottom: 10
            }}
          >
            PER-LISTING PERFORMANCE
          </Text>
          <View
            style={{
              borderRadius: theme.radius.lg,
              backgroundColor: t.colors.card,
              borderWidth: 1,
              borderColor: t.colors.border,
              overflow: "hidden"
            }}
          >
            {listings.isLoading ? (
              <View style={{ padding: theme.spacing.xl, alignItems: "center" }}>
                <ActivityIndicator color={t.colors.primary} />
              </View>
            ) : sortedRows.length === 0 ? (
              <View style={{ padding: theme.spacing.xl, alignItems: "center", gap: 8 }}>
                <PawPrint size={24} color={t.colors.muted} />
                <Text style={{ fontSize: 12, color: t.colors.muted, textAlign: "center" }}>
                  No listings yet. Add a pet to start tracking performance.
                </Text>
              </View>
            ) : (
              <>
                {/* Sort header */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: theme.spacing.md,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 8,
                    backgroundColor: t.colors.background,
                    borderBottomWidth: 1,
                    borderBottomColor: t.colors.border
                  }}
                >
                  <SortHeader
                    label="Listing"
                    col="name"
                    sort={sort}
                    onPress={toggleSort}
                    flex={2}
                    theme={t}
                  />
                  <SortHeader
                    label="Views"
                    col="views"
                    sort={sort}
                    onPress={toggleSort}
                    align="right"
                    theme={t}
                  />
                  <SortHeader
                    label="Apps"
                    col="applications"
                    sort={sort}
                    onPress={toggleSort}
                    align="right"
                    theme={t}
                  />
                  <SortHeader
                    label="Days"
                    col="daysListed"
                    sort={sort}
                    onPress={toggleSort}
                    align="right"
                    theme={t}
                  />
                </View>
                {sortedRows.map((row, i) => (
                  <ListingRow
                    key={row.listingId}
                    row={row}
                    isLast={i === sortedRows.length - 1}
                    theme={t}
                  />
                ))}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Small components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
  theme: t
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  loading?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: "47%",
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: t.colors.card,
        borderWidth: 1,
        borderColor: t.colors.border
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {icon}
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: t.colors.muted,
            letterSpacing: 0.4
          }}
        >
          {label.toUpperCase()}
        </Text>
      </View>
      <Text style={{ marginTop: 8, fontSize: 22, fontWeight: "700", color: t.colors.ink }}>
        {loading ? "…" : value}
      </Text>
      {hint ? (
        <Text style={{ marginTop: 2, fontSize: 10, color: t.colors.muted }}>{hint}</Text>
      ) : null}
    </View>
  );
}

function Funnel({
  data,
  theme: t
}: {
  data: ApplicationFunnel;
  theme: ReturnType<typeof useTheme>;
}) {
  const stages = [
    { label: "Submitted", value: data.submitted },
    { label: "Under review", value: data.underReview },
    { label: "Approved", value: data.approved },
    { label: "Adopted", value: data.adopted }
  ];
  const max = Math.max(1, data.submitted);

  if (data.submitted === 0) {
    return (
      <Text style={{ fontSize: 12, color: t.colors.muted, textAlign: "center", paddingVertical: 8 }}>
        No applications in the selected range yet.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {stages.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const dropOff =
          i > 0 && stages[i - 1]!.value > 0
            ? Math.round(100 - (s.value / stages[i - 1]!.value) * 100)
            : null;
        return (
          <View key={s.label} style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.colors.ink }}>
                {s.label}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: t.colors.ink }}>
                  {s.value}
                </Text>
                {dropOff != null && dropOff > 0 ? (
                  <Text style={{ fontSize: 9, color: t.colors.danger }}>
                    −{dropOff}%
                  </Text>
                ) : null}
              </View>
            </View>
            <View
              style={{
                height: 18,
                borderRadius: theme.radius.pill,
                backgroundColor: t.colors.border,
                overflow: "hidden"
              }}
            >
              <View
                style={{
                  width: `${Math.max(4, pct)}%`,
                  height: "100%",
                  borderRadius: theme.radius.pill,
                  backgroundColor: t.colors.primary
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SortHeader({
  label,
  col,
  sort,
  onPress,
  align = "left",
  flex,
  theme: t
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onPress: (col: SortKey) => void;
  align?: "left" | "right";
  flex?: number;
  theme: ReturnType<typeof useTheme>;
}) {
  const active = sort.key === col;
  return (
    <Pressable
      onPress={() => onPress(col)}
      style={{ flex: flex ?? 1 }}
      hitSlop={6}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: active ? t.colors.ink : t.colors.muted,
          textAlign: align,
          letterSpacing: 0.4,
          textTransform: "uppercase"
        }}
      >
        {label} {active ? (sort.dir === "asc" ? "↑" : "↓") : ""}
      </Text>
    </Pressable>
  );
}

function ListingRow({
  row,
  isLast,
  theme: t
}: {
  row: ListingPerformanceRow;
  isLast: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: t.colors.border,
        alignItems: "center"
      }}
    >
      <View style={{ flex: 2 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 13, fontWeight: "700", color: t.colors.ink }}
        >
          {row.name || "(unnamed)"}
        </Text>
        <Text style={{ fontSize: 10, color: t.colors.muted, marginTop: 1 }}>
          {row.species || "—"} · {row.listingState.replace(/_/g, " ")}
        </Text>
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: "600",
          color: t.colors.ink,
          textAlign: "right"
        }}
      >
        {row.views}
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: "600",
          color: t.colors.ink,
          textAlign: "right"
        }}
      >
        {row.applications}
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: "600",
          color: t.colors.ink,
          textAlign: "right"
        }}
      >
        {row.daysListed}
      </Text>
    </View>
  );
}

function BlockedState({
  theme: t,
  router
}: {
  theme: ReturnType<typeof useTheme>;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: t.colors.background, padding: theme.spacing.xl }}
    >
      <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginBottom: theme.spacing.xl }}>
        <ArrowLeft size={22} color={t.colors.ink} />
      </Pressable>
      <View style={{ alignItems: "center", paddingTop: 40, gap: 12 }}>
        <ShieldAlert size={40} color={t.colors.warning} />
        <Text style={{ fontSize: 17, fontWeight: "700", color: t.colors.ink }}>
          Analytics is editor-only
        </Text>
        <Text style={{ fontSize: 13, color: t.colors.muted, textAlign: "center", lineHeight: 18 }}>
          Ask a team admin to bump your role to Editor or higher to see the dashboard.
        </Text>
      </View>
    </SafeAreaView>
  );
}
