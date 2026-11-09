// Demo-only values. Replace this module with the team's actual metrics adapter later.
// In particular, LIVE and VOD latency/loss need shared measurement definitions.
const BASE = {
  live: { latency: 52, packetLoss: 0.7, bitrate: 2450, buffer: 2.4, jitter: 10 },
  vod: { latency: 72, packetLoss: 0.2, bitrate: 3850, buffer: 17.8, jitter: 5 },
};

const EFFECTS = {
  normal: { latency: 1, packetLoss: 1, bitrate: 1, buffer: 1, jitter: 1 },
  bandwidth: { latency: 1.55, packetLoss: 1.8, bitrate: 0.55, buffer: 0.57, jitter: 1.6 },
  loss: { latency: 1.35, packetLoss: 7, bitrate: 0.8, buffer: 0.72, jitter: 2.2 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 1) => Number(value.toFixed(digits));

export function makeSample(mode, index, scenario = 'normal', timestamp = Date.now()) {
  const base = BASE[mode];
  const effect = EFFECTS[scenario] ?? EFFECTS.normal;
  const swing = Math.sin(index * 0.28 + (mode === 'vod' ? 1.6 : 0));
  const pulse = Math.cos(index * 0.11 + (mode === 'vod' ? 0.8 : 2.2));
  const spike = index % 23 >= 18 && index % 23 <= 20 ? 1.35 : 1;

  return {
    timestamp,
    latency: round(clamp(base.latency * effect.latency * spike + swing * 11 + pulse * 5, 4, 500), 0),
    packetLoss: round(clamp(base.packetLoss * effect.packetLoss * (1 + swing * 0.24) * spike, 0, 100), 2),
    bitrate: round(clamp(base.bitrate * effect.bitrate + swing * 175 + pulse * 85, 0, 20000), 0),
    buffer: round(clamp(base.buffer * effect.buffer + swing * (mode === 'vod' ? 1.8 : 0.34), 0, 60), 1),
    jitter: round(clamp(base.jitter * effect.jitter + pulse * 3, 0, 100), 1),
  };
}

export function initialHistory(mode, scenario = 'normal', count = 72) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) =>
    makeSample(mode, i, scenario, now - (count - 1 - i) * 1000),
  );
}

export function getLatest(history) {
  return history.at(-1);
}

export function getStats(history, key) {
  if (!history.length) return { average: 0, max: 0, min: 0, p95: 0 };
  const values = history.map((sample) => sample[key]);
  const ordered = [...values].sort((a, b) => a - b);
  return {
    average: round(values.reduce((sum, v) => sum + v, 0) / values.length, 1),
    max: Math.max(...values),
    min: Math.min(...values),
    p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
  };
}

export function getMergedHistory(live, vod) {
  return live.map((sample, index) => ({
    timestamp: sample.timestamp,
    liveLatency: sample.latency,
    vodLatency: vod[index]?.latency ?? 0,
    liveLoss: sample.packetLoss,
    vodLoss: vod[index]?.packetLoss ?? 0,
  }));
}

export const SCENARIOS = [
  { id: 'normal', title: '일반 환경', caption: '기본 대역폭과 안정적인 연결', icon: 'wifi' },
  { id: 'bandwidth', title: '대역폭 제한', caption: '비트레이트 감소 상황 시뮬레이션', icon: 'gauge' },
  { id: 'loss', title: '패킷 손실 증가', caption: '손실률 증가 상황 시뮬레이션', icon: 'alert' },
];
