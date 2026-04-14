import { memo } from "react";
import { Text, TextStyle } from "react-native";
import { useTheme } from "@/lib/theme";

type HashtagTextProps = {
  body: string;
  style?: TextStyle;
  accentColor?: string;
};

const HASHTAG_RE = /(#[\p{L}0-9_]+)/gu;

/**
 * Renders a chat message body with styled #hashtags inline.
 * v1: hashtags are purely visual — no tap handler yet.
 */
function HashtagTextBase({ body, style, accentColor }: HashtagTextProps) {
  const theme = useTheme();
  const color = accentColor ?? theme.colors.primary;
  const pieces = body.split(HASHTAG_RE);
  return (
    <Text selectable style={style}>
      {pieces.map((piece, idx) => {
        if (HASHTAG_RE.test(piece)) {
          // Reset the lastIndex because of the /g flag
          HASHTAG_RE.lastIndex = 0;
          return (
            <Text
              key={idx}
              style={{ color, fontWeight: "600", fontFamily: "Inter_600SemiBold" }}
            >
              {piece}
            </Text>
          );
        }
        HASHTAG_RE.lastIndex = 0;
        return (
          <Text key={idx} style={{ color: style?.color }}>
            {piece}
          </Text>
        );
      })}
    </Text>
  );
}

export const HashtagText = memo(HashtagTextBase);
