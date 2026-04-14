import { memo } from "react";
import { Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { mobileTheme, useTheme } from "@/lib/theme";

type SingleProps = {
  kind: "single";
  selected?: boolean;
};

type GroupProps = {
  kind: "group";
  count: number;
};

function PinInner({ selected }: { selected?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: selected ? 44 : 38,
        height: selected ? 44 : 38,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.primary,
        borderWidth: 3,
        borderColor: theme.colors.white,
        ...mobileTheme.shadow.md
      }}
    >
      <CalendarDays
        size={selected ? 20 : 17}
        color={theme.colors.white}
        strokeWidth={2.4}
      />
    </View>
  );
}

function ClusterInner({ count }: { count: number }) {
  const theme = useTheme();
  const size = count > 50 ? 56 : count > 10 ? 50 : 46;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.primary,
        borderWidth: 4,
        borderColor: "rgba(255,255,255,0.9)",
        ...mobileTheme.shadow.md
      }}
    >
      <Text
        style={{
          color: theme.colors.white,
          fontSize: count > 99 ? 14 : 16,
          fontFamily: "Inter_700Bold"
        }}
      >
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}

function MarkerBase(props: SingleProps | GroupProps) {
  if (props.kind === "single") {
    return <PinInner selected={props.selected} />;
  }
  return <ClusterInner count={props.count} />;
}

export const PlaydateMarker = memo(MarkerBase);
