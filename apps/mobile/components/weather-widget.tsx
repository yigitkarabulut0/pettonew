import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Cloud, CloudRain, Sun, Snowflake, Wind } from "lucide-react-native";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";

import { mobileTheme, useTheme } from "@/lib/theme";

interface WeatherData {
  temp: number;
  conditionKey: string;
  suggestionKey: string;
  icon: "sun" | "cloud" | "rain" | "snow" | "wind";
}

function getCondition(temp: number, weatherCode: number): WeatherData {
  if (weatherCode >= 71) return { temp, conditionKey: "weather.conditionSnowy", suggestionKey: "weather.snowy", icon: "snow" };
  if (weatherCode >= 61) return { temp, conditionKey: "weather.conditionRainy", suggestionKey: "weather.rainy", icon: "rain" };
  if (weatherCode >= 51) return { temp, conditionKey: "weather.conditionDrizzle", suggestionKey: "weather.rainy", icon: "rain" };
  if (weatherCode >= 3) return { temp, conditionKey: "weather.conditionCloudy", suggestionKey: "weather.cloudy", icon: "cloud" };
  if (temp >= 32) return { temp, conditionKey: "weather.conditionHot", suggestionKey: "weather.hot", icon: "sun" };
  if (temp <= 5) return { temp, conditionKey: "weather.conditionCold", suggestionKey: "weather.cold", icon: "snow" };
  return { temp, conditionKey: "weather.conditionSunny", suggestionKey: "weather.sunny", icon: "sun" };
}

const ICONS = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: Snowflake,
  wind: Wind
};

interface WeatherWidgetProps {
  /** Optional explicit coordinates. When omitted, falls back to device location. */
  latitude?: number;
  longitude?: number;
  /** Optional ISO timestamp — when the target moment is in the future we fetch
   *  the nearest hourly forecast instead of the current weather. */
  atISO?: string;
}

export function WeatherWidget(props: WeatherWidgetProps = {}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const explicitLat = props.latitude;
  const explicitLng = props.longitude;
  const atISO = props.atISO;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let lat = explicitLat;
        let lng = explicitLng;
        if (lat == null || lng == null) {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== "granted") {
            setLoading(false);
            return;
          }
          const loc = await Location.getLastKnownPositionAsync();
          if (!loc || cancelled) {
            setLoading(false);
            return;
          }
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }

        // If we have a future target time, pull hourly forecast and pick the
        // slot nearest to that moment. Otherwise use current_weather.
        const useForecast =
          atISO != null && new Date(atISO).getTime() - Date.now() > 60 * 60 * 1000;

        let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`;
        if (useForecast) {
          url += `&hourly=temperature_2m,weathercode&forecast_days=7`;
        } else {
          url += `&current_weather=true`;
        }

        const res = await fetch(url);
        if (cancelled) return;
        const json = await res.json();

        if (useForecast && atISO && json?.hourly?.time && json.hourly.temperature_2m && json.hourly.weathercode) {
          const target = new Date(atISO).getTime();
          const times: string[] = json.hourly.time;
          let bestIdx = 0;
          let bestDelta = Infinity;
          for (let i = 0; i < times.length; i++) {
            const slot = times[i];
            if (!slot) continue;
            const delta = Math.abs(new Date(slot).getTime() - target);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestIdx = i;
            }
          }
          const temp = json.hourly.temperature_2m[bestIdx];
          const code = json.hourly.weathercode[bestIdx];
          if (typeof temp === "number" && typeof code === "number") {
            setWeather(getCondition(temp, code));
          }
        } else {
          const current = json?.current_weather;
          if (current) {
            setWeather(getCondition(current.temperature, current.weathercode));
          }
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [explicitLat, explicitLng, atISO]);

  if (loading || !weather) return null;

  const IconComponent = ICONS[weather.icon];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: mobileTheme.spacing.md,
        padding: mobileTheme.spacing.lg,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: theme.colors.white,
        ...mobileTheme.shadow.sm
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: theme.colors.primaryBg,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <IconComponent size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: mobileTheme.typography.bodySemiBold.fontSize,
            fontFamily: "Inter_600SemiBold",
            color: theme.colors.ink
          }}
        >
          {Math.round(weather.temp)}°C {t(weather.conditionKey)}
        </Text>
        <Text
          style={{
            fontSize: mobileTheme.typography.caption.fontSize,
            fontFamily: "Inter_400Regular",
            color: theme.colors.muted,
            marginTop: 2
          }}
        >
          {t(weather.suggestionKey)}
        </Text>
      </View>
    </View>
  );
}
