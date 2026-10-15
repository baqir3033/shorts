export type DeviceMode = "full" | "safari-optimised";

export type DeviceCapability = {
  mode: DeviceMode;
  cores: number;
  isIOS: boolean;
  isSafari: boolean;
  reason: string;
};

export function detectDeviceCapability(): DeviceCapability {
  if (typeof navigator === "undefined") {
    return {
      mode: "full",
      cores: 4,
      isIOS: false,
      isSafari: false,
      reason: "server",
    };
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari =
    /^((?!chrome|android).)*safari/i.test(ua) || isIOS;
  const cores = navigator.hardwareConcurrency || 4;

  if (isIOS || (isSafari && cores <= 4)) {
    return {
      mode: "safari-optimised",
      cores,
      isIOS,
      isSafari,
      reason: "Safari/iOS WASM memory limits — Whisper skipped by default",
    };
  }

  return {
    mode: "full",
    cores,
    isIOS,
    isSafari,
    reason: "Desktop-class environment",
  };
}
