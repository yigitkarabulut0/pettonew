import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { useSessionStore } from "@/store/session";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, string> | undefined;
    const activeId = useSessionStore.getState().activeConversationId;

    // Suppress notification if user is currently viewing this conversation
    if (data?.type === "message" && data?.conversationId && data.conversationId === activeId) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }

    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  }
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E6694A"
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: "a9e0171b-e3bc-4986-9b43-766757cd6b08"
    });
    return token.data;
  } catch {
    return null;
  }
}

export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
