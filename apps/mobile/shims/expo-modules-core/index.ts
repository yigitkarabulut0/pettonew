import React from "react";
import {
  DevSettings,
  NativeEventEmitter,
  NativeModules,
  Platform as RNPlatform,
  requireNativeComponent
} from "react-native";

const appConfig = require("../../app.json");

type Listener = (...args: any[]) => void;

type ListenerMap = Map<string, Set<Listener>>;

function getExpoModulesProxy(): Record<string, any> {
  const globalExpoModules =
    (globalThis as any)?.expo?.modules ??
    (globalThis as any)?.ExpoModules ??
    (globalThis as any)?.ExpoDomWebView?.expoModulesProxy;

  return (
    globalExpoModules ??
    NativeModules.NativeUnimoduleProxy ??
    NativeModules.NativeModulesProxy ??
    NativeModules.EXNativeModulesProxy ??
    {}
  );
}

function ensureEventMethods<T extends Record<string, any> | null>(module: T): T {
  if (!module || typeof module !== "object") {
    return module;
  }

  if (typeof module.addListener !== "function") {
    module.addListener = () => {};
  }

  if (typeof module.removeListeners !== "function") {
    module.removeListeners = () => {};
  }

  return module;
}

function getNativeModuleByName(name: string) {
  if (name === "ExponentConstants") {
    const expoConfig = appConfig?.expo ?? {};

    return {
      name: "ExponentConstants",
      appOwnership: "expo",
      executionEnvironment: "storeClient",
      debugMode: __DEV__,
      expoVersion: "54.0.33",
      expoRuntimeVersion: null,
      isHeadless: false,
      linkingUri: "exp://127.0.0.1:8081",
      experienceUrl: "exp://127.0.0.1:8081",
      manifest: expoConfig,
      statusBarHeight: 0,
      systemFonts: [],
      supportedExpoSdks: ["54.0.0"]
    };
  }

  const proxy = getExpoModulesProxy();
  const candidates = [
    proxy[name],
    proxy?.modulesConstants?.[name],
    proxy?.ExpoModules?.[name],
    proxy?.NativeModulesProxy?.[name],
    NativeModules[name],
    NativeModules?.NativeUnimoduleProxy?.[name],
    NativeModules?.NativeModulesProxy?.[name],
    NativeModules?.EXNativeModulesProxy?.[name]
  ];

  if (name === "ExpoLocation") {
    candidates.push(
      proxy.LocationModule,
      proxy.EXLocation,
      proxy.ExpoLocation,
      proxy?.modulesConstants?.LocationModule,
      proxy?.modulesConstants?.EXLocation,
      proxy?.modulesConstants?.ExpoLocation,
      NativeModules.LocationModule,
      NativeModules.EXLocation,
      NativeModules.ExpoLocation,
      NativeModules?.NativeUnimoduleProxy?.LocationModule,
      NativeModules?.NativeUnimoduleProxy?.EXLocation,
      NativeModules?.NativeModulesProxy?.LocationModule,
      NativeModules?.NativeModulesProxy?.EXLocation
    );
  }

  const module = candidates.find(
    (candidate) => candidate && typeof candidate === "object"
  );

  return ensureEventMethods(module ?? null);
}

class JsEventEmitter {
  private listeners: ListenerMap = new Map();

  addListener(eventName: string, listener: Listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName)?.add(listener);

    return {
      remove: () => {
        this.removeListener(eventName, listener);
      }
    };
  }

  removeListener(eventName: string, listener: Listener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  removeAllListeners(eventName: string) {
    this.listeners.get(eventName)?.clear();
  }

  removeSubscription(subscription?: { remove?: () => void } | null) {
    subscription?.remove?.();
  }

  emit(eventName: string, ...args: any[]) {
    const listeners = Array.from(this.listeners.get(eventName) ?? []);
    for (const listener of listeners) {
      listener(...args);
    }
  }

  listenerCount(eventName: string) {
    return this.listeners.get(eventName)?.size ?? 0;
  }
}

export const Platform = RNPlatform;

export const PermissionStatus = {
  GRANTED: "granted",
  DENIED: "denied",
  UNDETERMINED: "undetermined"
} as const;

export class CodedError extends Error {
  code: string;
  info?: any;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CodedError";
    this.code = code;
  }
}

export class UnavailabilityError extends CodedError {
  constructor(moduleName: string, propertyName: string) {
    super(
      "ERR_UNAVAILABLE",
      `The method or property ${moduleName}.${propertyName} is not available on ${RNPlatform.OS}, are you sure you've linked all the native dependencies properly?`
    );
  }
}

export class EventEmitter<TEventsMap extends Record<string, Listener> = Record<string, Listener>>
  extends JsEventEmitter {
  _TEventsMap_DONT_USE_IT?: TEventsMap;
}

export class LegacyEventEmitter<
  TEventsMap extends Record<string, Listener> = Record<string, Listener>
> extends EventEmitter<TEventsMap> {
  private nativeEmitter: NativeEventEmitter | null = null;

  constructor(nativeModule?: any) {
    super();

    if (nativeModule) {
      try {
        this.nativeEmitter = new NativeEventEmitter(nativeModule);
      } catch {
        this.nativeEmitter = null;
      }
    }
  }

  override addListener(eventName: string, listener: Listener) {
    if (this.nativeEmitter) {
      const subscription = this.nativeEmitter.addListener(eventName, listener);
      return {
        remove: () => {
          subscription.remove();
        }
      };
    }

    return super.addListener(eventName, listener);
  }
}

export class NativeModule<
  TEventsMap extends Record<string, Listener> = Record<string, Listener>
> extends EventEmitter<TEventsMap> {
  [key: string]: any;
  ViewPrototypes?: { [viewName: string]: object };
  __expo_module_name__?: string;
}

export class SharedObject<
  TEventsMap extends Record<string, Listener> = Record<string, Listener>
> extends EventEmitter<TEventsMap> {
  release(): void {}
}

export class SharedRef<
  TNativeRefType extends string = "unknown",
  TEventsMap extends Record<string, Listener> = Record<string, Listener>
> extends SharedObject<TEventsMap> {
  _TNativeRefType_DONT_USE_IT?: TNativeRefType;
  nativeRefType = "unknown";
}

export function requireNativeModule<T = any>(name: string): T {
  const module = getNativeModuleByName(name);
  if (!module) {
    throw new UnavailabilityError(name, "default");
  }
  return module as T;
}

export function requireOptionalNativeModule<T = any>(name: string): T | null {
  return getNativeModuleByName(name) as T | null;
}

export function requireNativeViewManager<T = any>(
  moduleName: string,
  viewName?: string
): T {
  return requireNativeComponent(viewName ?? moduleName) as T;
}

export function registerWebModule<T>(moduleImplementation: T): T {
  return moduleImplementation;
}

export async function reloadAppAsync(): Promise<void> {
  DevSettings.reload();
}

export function createSnapshotFriendlyRef<T = any>() {
  return React.createRef<T>();
}

export function createPermissionHook<Options = any, Response = any>({
  getMethod,
  requestMethod
}: {
  getMethod?: (options?: Options) => Promise<Response>;
  requestMethod?: (options?: Options) => Promise<Response>;
}) {
  return function usePermission(options?: Options) {
    const [permission, setPermission] = React.useState<Response | null>(null);

    const getPermission = React.useCallback(async () => {
      if (!getMethod) {
        return null;
      }
      const response = await getMethod(options);
      setPermission(response);
      return response;
    }, [options]);

    const requestPermission = React.useCallback(async () => {
      const method = requestMethod ?? getMethod;
      if (!method) {
        return null;
      }
      const response = await method(options);
      setPermission(response);
      return response;
    }, [options]);

    React.useEffect(() => {
      void getPermission();
    }, [getPermission]);

    return [permission, requestPermission, getPermission] as const;
  };
}
