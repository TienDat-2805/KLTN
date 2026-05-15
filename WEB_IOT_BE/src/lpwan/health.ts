import { DeviceStatus, NetworkType } from "@prisma/client";

export type LpwanHealthDevice = {
  id: string;
  name: string;
  deviceUid: string;
  devEui: string | null;
  gatewayId: string | null;
  networkType: NetworkType | null;
  lastJoinAt: Date | null;
  lastSeenAt: Date | null;
  lastRssi: number | null;
  lastSnr: number | null;
  lastSpreadingFactor: number | null;
  lastBatteryPct: number | null;
  lastUplinkCounter: number | null;
  status: DeviceStatus;
};

export type LpwanHealthLevel = "GOOD" | "FAIR" | "POOR" | "CRITICAL";
export type LpwanHealthCheckStatus =
  | "GOOD"
  | "FAIR"
  | "POOR"
  | "CRITICAL"
  | "UNKNOWN";

export type LpwanHealthCheck = {
  key: string;
  label: string;
  status: LpwanHealthCheckStatus;
  value: string;
  detail: string;
};

const RSSI_FAIR_DBM = -105;
const RSSI_POOR_DBM = -115;
const RSSI_CRITICAL_DBM = -120;
const SNR_FAIR_DB = 0;
const SNR_POOR_DB = -5;
const SNR_CRITICAL_DB = -10;
const BATTERY_FAIR_PCT = 35;
const BATTERY_POOR_PCT = 20;
const BATTERY_CRITICAL_PCT = 10;
const STALE_MINUTES = 15;

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function fmtNumber(value: number | null, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return value.toFixed(digits);
}

function minutesSince(date: Date | null, now: Date) {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
}

function levelFromScore(score: number): LpwanHealthLevel {
  if (score >= 80) return "GOOD";
  if (score >= 60) return "FAIR";
  if (score >= 35) return "POOR";
  return "CRITICAL";
}

function buildSummary(level: LpwanHealthLevel, checks: LpwanHealthCheck[]) {
  const problems = checks.filter(
    (c) => c.status === "POOR" || c.status === "CRITICAL",
  );

  if (level === "GOOD") {
    return "LPWAN link is healthy. Recent uplinks, radio signal and battery are within expected range.";
  }

  if (problems.length === 0) {
    return "LPWAN link is usable but should be watched because one or more checks are only fair.";
  }

  return `LPWAN link needs attention: ${problems
    .map((p) => p.detail)
    .join("; ")}`;
}

export function calculateLpwanHealth(device: LpwanHealthDevice, now = new Date()) {
  let score = 100;
  const checks: LpwanHealthCheck[] = [];

  const ageMinutes = minutesSince(device.lastSeenAt, now);

  if (device.status === DeviceStatus.OFFLINE || ageMinutes === null) {
    score -= 35;
    checks.push({
      key: "last_seen",
      label: "Last uplink",
      status: "CRITICAL",
      value: ageMinutes === null ? "N/A" : `${ageMinutes} min ago`,
      detail: "No recent uplink has been accepted by the backend.",
    });
  } else if (ageMinutes > STALE_MINUTES) {
    score -= 25;
    checks.push({
      key: "last_seen",
      label: "Last uplink",
      status: "POOR",
      value: `${ageMinutes} min ago`,
      detail: `Last accepted uplink is older than ${STALE_MINUTES} minutes.`,
    });
  } else {
    checks.push({
      key: "last_seen",
      label: "Last uplink",
      status: "GOOD",
      value: `${ageMinutes} min ago`,
      detail: "Device has sent a recent uplink.",
    });
  }

  if (device.lastRssi === null) {
    score -= 10;
    checks.push({
      key: "rssi",
      label: "RSSI",
      status: "UNKNOWN",
      value: "N/A",
      detail: "No RSSI value has been received yet.",
    });
  } else if (device.lastRssi < RSSI_CRITICAL_DBM) {
    score -= 35;
    checks.push({
      key: "rssi",
      label: "RSSI",
      status: "CRITICAL",
      value: `${fmtNumber(device.lastRssi)} dBm`,
      detail: `RSSI ${fmtNumber(device.lastRssi)} dBm is extremely weak.`,
    });
  } else if (device.lastRssi < RSSI_POOR_DBM) {
    score -= 25;
    checks.push({
      key: "rssi",
      label: "RSSI",
      status: "POOR",
      value: `${fmtNumber(device.lastRssi)} dBm`,
      detail: `RSSI ${fmtNumber(device.lastRssi)} dBm is weak for LPWAN.`,
    });
  } else if (device.lastRssi < RSSI_FAIR_DBM) {
    score -= 10;
    checks.push({
      key: "rssi",
      label: "RSSI",
      status: "FAIR",
      value: `${fmtNumber(device.lastRssi)} dBm`,
      detail: "RSSI is acceptable but close to weak-signal range.",
    });
  } else {
    checks.push({
      key: "rssi",
      label: "RSSI",
      status: "GOOD",
      value: `${fmtNumber(device.lastRssi)} dBm`,
      detail: "RSSI is stable.",
    });
  }

  if (device.lastSnr === null) {
    score -= 5;
    checks.push({
      key: "snr",
      label: "SNR",
      status: "UNKNOWN",
      value: "N/A",
      detail: "No SNR value has been received yet.",
    });
  } else if (device.lastSnr < SNR_CRITICAL_DB) {
    score -= 30;
    checks.push({
      key: "snr",
      label: "SNR",
      status: "CRITICAL",
      value: `${fmtNumber(device.lastSnr, 1)} dB`,
      detail: `SNR ${fmtNumber(device.lastSnr, 1)} dB is extremely noisy.`,
    });
  } else if (device.lastSnr < SNR_POOR_DB) {
    score -= 20;
    checks.push({
      key: "snr",
      label: "SNR",
      status: "POOR",
      value: `${fmtNumber(device.lastSnr, 1)} dB`,
      detail: `SNR ${fmtNumber(device.lastSnr, 1)} dB indicates weak link quality.`,
    });
  } else if (device.lastSnr < SNR_FAIR_DB) {
    score -= 10;
    checks.push({
      key: "snr",
      label: "SNR",
      status: "FAIR",
      value: `${fmtNumber(device.lastSnr, 1)} dB`,
      detail: "SNR is acceptable but should be monitored.",
    });
  } else {
    checks.push({
      key: "snr",
      label: "SNR",
      status: "GOOD",
      value: `${fmtNumber(device.lastSnr, 1)} dB`,
      detail: "SNR is stable.",
    });
  }

  if (device.lastBatteryPct === null) {
    score -= 5;
    checks.push({
      key: "battery",
      label: "Battery",
      status: "UNKNOWN",
      value: "N/A",
      detail: "No battery value has been received yet.",
    });
  } else if (device.lastBatteryPct < BATTERY_CRITICAL_PCT) {
    score -= 30;
    checks.push({
      key: "battery",
      label: "Battery",
      status: "CRITICAL",
      value: `${fmtNumber(device.lastBatteryPct, 1)}%`,
      detail: `Battery ${fmtNumber(device.lastBatteryPct, 1)}% is critically low.`,
    });
  } else if (device.lastBatteryPct < BATTERY_POOR_PCT) {
    score -= 20;
    checks.push({
      key: "battery",
      label: "Battery",
      status: "POOR",
      value: `${fmtNumber(device.lastBatteryPct, 1)}%`,
      detail: `Battery ${fmtNumber(device.lastBatteryPct, 1)}% is below the low-battery threshold.`,
    });
  } else if (device.lastBatteryPct < BATTERY_FAIR_PCT) {
    score -= 10;
    checks.push({
      key: "battery",
      label: "Battery",
      status: "FAIR",
      value: `${fmtNumber(device.lastBatteryPct, 1)}%`,
      detail: "Battery is usable but should be replaced soon.",
    });
  } else {
    checks.push({
      key: "battery",
      label: "Battery",
      status: "GOOD",
      value: `${fmtNumber(device.lastBatteryPct, 1)}%`,
      detail: "Battery level is healthy.",
    });
  }

  if (device.lastSpreadingFactor === null) {
    checks.push({
      key: "spreading_factor",
      label: "Spreading factor",
      status: "UNKNOWN",
      value: "N/A",
      detail: "No spreading factor value has been received yet.",
    });
  } else if (device.lastSpreadingFactor >= 12) {
    score -= 8;
    checks.push({
      key: "spreading_factor",
      label: "Spreading factor",
      status: "FAIR",
      value: `SF${device.lastSpreadingFactor}`,
      detail: "Device is using a high spreading factor, so airtime is longer.",
    });
  } else if (device.lastSpreadingFactor >= 11) {
    score -= 4;
    checks.push({
      key: "spreading_factor",
      label: "Spreading factor",
      status: "FAIR",
      value: `SF${device.lastSpreadingFactor}`,
      detail: "Spreading factor is moderately high.",
    });
  } else {
    checks.push({
      key: "spreading_factor",
      label: "Spreading factor",
      status: "GOOD",
      value: `SF${device.lastSpreadingFactor}`,
      detail: "Spreading factor is efficient.",
    });
  }

  const finalScore = clampScore(score);
  const level = levelFromScore(finalScore);

  return {
    score: finalScore,
    level,
    summary: buildSummary(level, checks),
    calculatedAt: now,
    radio: {
      devEui: device.devEui,
      gatewayId: device.gatewayId,
      networkType: device.networkType,
      lastJoinAt: device.lastJoinAt,
      lastSeenAt: device.lastSeenAt,
      lastRssi: device.lastRssi,
      lastSnr: device.lastSnr,
      lastSpreadingFactor: device.lastSpreadingFactor,
      lastBatteryPct: device.lastBatteryPct,
      lastUplinkCounter: device.lastUplinkCounter,
    },
    checks,
  };
}
