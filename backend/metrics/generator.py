"""모의 스트리밍 지표 생성기.

frontend/src/data/mockMetrics.js의 수식을 그대로 이식해
백엔드와 프론트엔드가 동일한 시뮬레이션 값을 보이도록 만든 것이다.

실제 측정으로 교체할 때(LIVE: WebRTC getStats / VOD: Wireshark·PyShark)는
이 모듈의 make_sample()만 교체하면 된다.
"""
from __future__ import annotations

import math
import time

MODES: tuple[str, ...] = ("live", "vod")

# 롤링 히스토리 윈도우 크기 (초 단위 샘플 개수) — frontend 72 samples와 동일
HISTORY_SIZE = 72

# 기본 지표 (mode별) — frontend mockMetrics.js BASE와 동일
BASE: dict[str, dict[str, float]] = {
    "live": {"latency": 52, "packetLoss": 0.7, "bitrate": 2450, "buffer": 2.4, "jitter": 10},
    "vod": {"latency": 72, "packetLoss": 0.2, "bitrate": 3850, "buffer": 17.8, "jitter": 5},
}

# 시나리오별 효과 계수 (scenario별) — frontend EFFECTS와 동일
EFFECTS: dict[str, dict[str, float]] = {
    "normal": {"latency": 1, "packetLoss": 1, "bitrate": 1, "buffer": 1, "jitter": 1},
    "bandwidth": {"latency": 1.55, "packetLoss": 1.8, "bitrate": 0.55, "buffer": 0.57, "jitter": 1.6},
    "loss": {"latency": 1.35, "packetLoss": 7, "bitrate": 0.8, "buffer": 0.72, "jitter": 2.2},
}

# 스트레스 테스트 시나리오 목록 — frontend SCENARIOS와 동일
SCENARIOS: list[dict[str, str]] = [
    {"id": "normal", "title": "일반 환경", "caption": "기본 대역폭과 안정적인 연결"},
    {"id": "bandwidth", "title": "대역폭 제한", "caption": "비트레이트 감소 상황 시뮬레이션"},
    {"id": "loss", "title": "패킷 손실 증가", "caption": "손실률 증가 상황 시뮬레이션"},
]

METRIC_KEYS: tuple[str, ...] = ("latency", "packetLoss", "bitrate", "buffer", "jitter")


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def now_ms() -> int:
    """epoch milliseconds (프론트엔드 Date.now() 대응)."""
    return int(time.time() * 1000)


def make_sample(
    mode: str,
    index: int,
    scenario: str = "normal",
    timestamp_ms: int | None = None,
) -> dict[str, float | int]:
    """한 시점의 모의 지표를 생성한다. (frontend makeSample()과 동일 수식)"""
    base = BASE[mode]
    effect = EFFECTS.get(scenario, EFFECTS["normal"])
    swing = math.sin(index * 0.28 + (1.6 if mode == "vod" else 0.0))
    pulse = math.cos(index * 0.11 + (0.8 if mode == "vod" else 2.2))
    spike = 1.35 if 18 <= index % 23 <= 20 else 1
    ts = timestamp_ms if timestamp_ms is not None else now_ms()

    return {
        "timestamp": ts,
        "latency": round(clamp(base["latency"] * effect["latency"] * spike + swing * 11 + pulse * 5, 4, 500)),
        "packetLoss": round(clamp(base["packetLoss"] * effect["packetLoss"] * (1 + swing * 0.24) * spike, 0, 100), 2),
        "bitrate": round(clamp(base["bitrate"] * effect["bitrate"] + swing * 175 + pulse * 85, 0, 20000)),
        "buffer": round(clamp(base["buffer"] * effect["buffer"] + swing * (1.8 if mode == "vod" else 0.34), 0, 60), 1),
        "jitter": round(clamp(base["jitter"] * effect["jitter"] + pulse * 3, 0, 100), 1),
    }


def initial_history(mode: str, scenario: str = "normal", count: int = HISTORY_SIZE) -> list[dict]:
    """과거 count초 치의 초기 히스토리를 생성한다. (frontend initialHistory() 대응)"""
    now = now_ms()
    return [
        make_sample(mode, i, scenario, now - (count - 1 - i) * 1000)
        for i in range(count)
    ]


def compute_stats(samples: list[dict], key: str) -> dict[str, float]:
    """average/max/min/p95 통계. (frontend getStats() 대응)"""
    if not samples:
        return {"average": 0, "max": 0, "min": 0, "p95": 0}
    values = [float(s[key]) for s in samples]
    ordered = sorted(values)
    return {
        "average": round(sum(values) / len(values), 1),
        "max": max(values),
        "min": min(values),
        "p95": ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)],
    }
