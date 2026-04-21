import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText, UploadCloud, X } from "lucide-react-native";

import { uploadCertificateFromUri } from "@/lib/apply-api";
import { theme } from "@/lib/theme";

// Tap to pick a certificate (PDF/JPG/PNG up to 10MB). Uses
// expo-document-picker which handles both PDFs and images — expo-image-
// picker alone can't open the Files app on iOS and would lock us out of
// PDF uploads.

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/jpeg", "image/png"] as const;

type Props = {
  value: string;
  fileName: string | null;
  onChange: (url: string | "", fileName: string | null) => void;
  error?: string;
};

export function CertificatePicker({ value, fileName, onChange, error }: Props) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = async () => {
    setLocalError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ACCEPT],
        copyToCacheDirectory: true,
        multiple: false
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset) return;

      const mimeType = asset.mimeType ?? "application/octet-stream";
      if (!ACCEPT.includes(mimeType as (typeof ACCEPT)[number])) {
        setLocalError("Only PDF, JPG, or PNG files are accepted");
        return;
      }
      if (asset.size && asset.size > MAX_BYTES) {
        setLocalError("File is larger than 10MB");
        return;
      }

      setUploading(true);
      const url = await uploadCertificateFromUri({
        uri: asset.uri,
        fileName: asset.name,
        mimeType
      });
      onChange(url, asset.name);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clear = () => onChange("", null);

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={value ? () => {} : pick}
        disabled={uploading}
        style={({ pressed }) => ({
          borderWidth: 2,
          borderStyle: "dashed",
          borderColor: value
            ? theme.colors.primary
            : pressed
              ? theme.colors.primary
              : theme.colors.border,
          borderRadius: theme.radius.xl,
          padding: 20,
          backgroundColor: value
            ? theme.colors.primaryBg
            : pressed
              ? theme.colors.primaryBg
              : "#FFFFFF",
          opacity: uploading ? 0.6 : 1,
          alignItems: "center",
          justifyContent: "center"
        })}
      >
        {value ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              width: "100%"
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: theme.colors.primary,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <FileText size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: theme.colors.ink
                }}
              >
                {fileName ?? "Certificate uploaded"}
              </Text>
              <Pressable
                onPress={() => Linking.openURL(value)}
                style={{ marginTop: 2 }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.primary }}>
                  Open file
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={clear}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.7 : 1
              })}
              accessibilityLabel="Remove file"
            >
              <X size={16} color={theme.colors.muted} />
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: theme.colors.primaryBg,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {uploading ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <UploadCloud size={22} color={theme.colors.primary} />
              )}
            </View>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: theme.colors.ink }}
            >
              {uploading
                ? "Uploading…"
                : "Tap to upload certificate"}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.muted }}>
              PDF, JPG, or PNG · up to 10MB
            </Text>
          </View>
        )}
      </Pressable>
      {(error || localError) && (
        <Text style={{ fontSize: 12, color: theme.colors.danger }}>
          {localError ?? error}
        </Text>
      )}
    </View>
  );
}
