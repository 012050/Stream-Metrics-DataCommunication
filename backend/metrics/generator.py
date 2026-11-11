"""모의 스트리밍 지표 생성기 — 실제 네트워크의 통계 특성을 흉내낸다.

프론트엔드 mockMetrics.js의 고정 파동(sin/cos) 방식에서 개선했다:
- **제한된 랜덤워크** (OU 프로세스) + 가우시안 노이즈: 지표가 자연스럽게 기우다 돌아옴
- **랜덤 버스트 스파이크** (초당 확률, 시나리오별 상이): 실제 네트워크 장애처럼
  예측 불가능하게 발생하고 2~6초 후 서서히 회복
- **패킷 손실**: 대부분 0% 부근, 버스트 시 2~15%로 튀었다 소멸
- **VOD 버퍼**: 드레인/리필 동역학 — 네트워크 악화 시 줄고 바닥나면 리버퍼링 발생
- **ABR 비트레이트**: VOD는 비트레이트 래더(250~8000kbps)를 따라 계단식으로 전환
- **시드** (env `STREAM_METRICS_SEED`): 발표 데모 재현성을 위한 고정 시드 지원

실제 측정으로 교체할 때(LIVE: WebRTC getStats / VOD: Wireshark·PyShark)는
MetricsGenerator의 next_sample() 출력만 실제 값으로 대체하면 된다.
"""
from __future__ import annotations

import math
import os
import random
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

# -- 난수 모델 파라미터 --------------------------------------------------------

WALK_THETA = 0.05   # 랜덤워크 평균 회귀 강도 (OU 프로세스)
WALK_SIGMA = 0.07   # 랜덤워크 스텝 노이즈
WALK_LIMIT = 0.30   # 워크 오프셋 상한 (±30%)

BURST_PROB: dict[str, float] = {"normal": 0.03, "bandwidth": 0.06, "loss": 0.14}
"""초당 버스트 발생 확률 — 'loss' 시나리오에서 장애가 훨씬 잦아진다."""

BURST_LOSS_PEAK: dict[str, tuple[float, float]] = {
    "normal": (2.0, 6.0),
    "bandwidth": (2.5, 7.0),
    "loss": (6.0, 15.0),
}
"""버스트 동안 추가되는 패킷 손실률(%) 범위."""

BURST_LAT_BOOST: tuple[float, float] = (0.25, 0.9)
"""버스트 동안 지연시간 추가 배율 범위 (+25% ~ +90%)."""

VOD_RATE: dict[str, float] = {"normal": 1.03, "bandwidth": 0.75, "loss": 0.75}
"""VOD 1초당 확보되는 콘텐츠량(초) — 1.0 미만이면 버퍼가 비어간다."""

BURST_DRAIN: dict[str, float] = {"normal": 0.5, "bandwidth": 0.65, "loss": 1.0}
"""버스트 중 VOD 버퍼 추가 드레인 속도."""

VOD_BUFFER_INIT: tuple[float, float] = (6.0, 12.0)  # VOD 초기 버퍼 (sec)
VOD_BUFFER_CAP = 30.0                                # 플레이어 버퍼 상한 (sec)
REBUFFER_REFILL = 1.6                                # 리버퍼링 중 재충전 속도 (sec/sec)
REBUFFER_MIN_BUFFER = 2.0                            # 리버퍼링 종료 조건 (sec)

BITRATE_LADDER: tuple[float, ...] = (
    250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000,
)
"""VOD ABR 비트레이트 레벨 (kbps) — 실제 스트리머처럼 계단식 전환."""


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def now_ms() -> int:
    """epoch milliseconds (프론트엔드 Date.now() 대응)."""
    return int(time.time() * 1000)


def seed_from_env() -> int | None:
    """재현성을 위한 시드 — env `STREAM_METRICS_SEED`로 지정 가능."""
    raw = os.environ.get("STREAM_METRICS_SEED", "").strip()
    return int(raw) if raw.isdigit() else None


class MetricsGenerator:
    """상태형 mock 생성기: 1초 1틱(next_sample)으로 상태가 진화한다."""

    def __init__(self, seed: int | None = None) -> None:
        self.seed = seed
        self._rng = random.Random(seed)
        self._scenario = "normal"
        self._state = {mode: self._fresh_state(mode) for mode in MODES}

    # -- 상태 관리 -------------------------------------------------------------

    def _fresh_state(self, mode: str) -> dict:
        return {
            "walk": {key: 0.0 for key in ("latency", "packetLoss", "bitrate", "jitter")},
            "burst_t": 0,
            "burst_dur": 1,
            "burst_sev": 0.0,
            "burst_loss_peak": 0.0,
            "burst_lat_boost": 0.0,
            "buffer": self._rng.uniform(*VOD_BUFFER_INIT) if mode == "vod" else None,
            "rebuffer_t": 0,
        }

    def _reset_state(self) -> None:
        self._state = {mode: self._fresh_state(mode) for mode in MODES}

    @property
    def scenario(self) -> str:
        return self._scenario

    def set_scenario(self, scenario: str) -> None:
        """시나리오 변경. 변경 시 랜덤 상태를 리셋한다 (새로운 실험 시작 의미)."""
        if scenario not in EFFECTS:
            raise ValueError(f"알 수 없는 시나리오: {scenario} ({', '.join(EFFECTS)})")
        if scenario != self._scenario:
            self._scenario = scenario
            self._reset_state()

    # -- 샘플 생성 -------------------------------------------------------------

    def next_sample(self, mode: str, timestamp_ms: int | None = None) -> dict:
        """1틱(1초) 상태 진화 후 현재 시점의 지표를 반환한다."""
        rng = self._rng
        st = self._state[mode]
        base = BASE[mode]
        eff = EFFECTS[self._scenario]
        ts = timestamp_ms if timestamp_ms is not None else now_ms()

        # 1) 제한된 랜덤워크 (평균 회귀) — 값이 자연스럽게 기우는 편
        for key in ("latency", "packetLoss", "bitrate", "jitter"):
            w = st["walk"][key] - WALK_THETA * st["walk"][key] + WALK_SIGMA * rng.gauss()
            st["walk"][key] = clamp(w, -WALK_LIMIT, WALK_LIMIT)

        # 2) 랜덤 버스트: 초당 확률로 발생, 2~6초 지속, 선형 감쇠
        sev = 0.0
        if st["burst_t"] > 0:
            st["burst_t"] -= 1
            if st["burst_t"] > 0:
                sev = st["burst_sev"] * (st["burst_t"] / st["burst_dur"])
        elif rng.random() < BURST_PROB[self._scenario]:
            st["burst_dur"] = rng.randint(2, 6)
            st["burst_t"] = st["burst_dur"]
            st["burst_sev"] = rng.uniform(0.5, 1.0)
            peak_lo, peak_hi = BURST_LOSS_PEAK[self._scenario]
            st["burst_loss_peak"] = rng.uniform(peak_lo, peak_hi)
            boost_lo, boost_hi = BURST_LAT_BOOST
            st["burst_lat_boost"] = rng.uniform(boost_lo, boost_hi)
            sev = st["burst_sev"]

        # 3) 지연 / 패킷손실 / 지터
        latency = (
            base["latency"] * eff["latency"] * (1 + st["walk"]["latency"])
            * (1 + st["burst_lat_boost"] * sev)
            + rng.uniform(-3, 3)
        )
        packet_loss = max(
            0.0,
            base["packetLoss"] * eff["packetLoss"] * (1 + st["walk"]["packetLoss"])
            + st["burst_loss_peak"] * sev
            + abs(rng.gauss()) * 0.03,
        )
        jitter = (
            base["jitter"] * eff["jitter"] * (1 + st["walk"]["jitter"])
            * (1 + 1.2 * sev)
            + abs(rng.gauss()) * 1.5
        )

        # 4) 비트레이트 & 버퍼
        if mode == "vod":
            # ABR: 목표 비트레이트에 대응하는 래더 레벨로 계단식 전환
            target = (
                base["bitrate"] * eff["bitrate"]
                * (1 + st["walk"]["bitrate"]) * (1 - 0.45 * sev)
            )
            if st["rebuffer_t"] > 0:
                level = BITRATE_LADDER[0]
            else:
                level = max(
                    (lv for lv in BITRATE_LADDER if lv <= target),
                    default=BITRATE_LADDER[0],
                )
            bitrate = level * (1 + rng.uniform(-0.03, 0.03))

            # 버퍼 드레인/리필 동역학
            if st["rebuffer_t"] > 0:
                st["rebuffer_t"] -= 1
                st["buffer"] = min(VOD_BUFFER_CAP, st["buffer"] + REBUFFER_REFILL)
                if st["rebuffer_t"] <= 0 and st["buffer"] >= REBUFFER_MIN_BUFFER:
                    st["rebuffer_t"] = 0
            else:
                rate = VOD_RATE[self._scenario] - BURST_DRAIN[self._scenario] * sev
                rate += rng.gauss() * 0.02
                st["buffer"] = max(0.0, min(VOD_BUFFER_CAP, st["buffer"] + rate - 1.0))
                if st["buffer"] <= 0.05:
                    st["rebuffer_t"] = rng.randint(2, 4)  # 리버퍼링 시작
            buffer = st["buffer"]
        else:
            # Live: 버퍼가 짧고(1~4sec) 버스트 시 딥(dip)
            bitrate = (
                base["bitrate"] * eff["bitrate"] * (1 + st["walk"]["bitrate"])
                * (1 - 0.35 * sev)
                + rng.uniform(-60, 60)
            )
            buffer = clamp(
                base["buffer"] * eff["buffer"] * (1 + 0.3 * st["walk"]["bitrate"])
                - 1.6 * sev
                + rng.uniform(-0.15, 0.15),
                0.2,
                6.0,
            )

        # 5) 기존 출력 포맷 유지 (프론트엔드 연동용)
        return {
            "timestamp": ts,
            "latency": round(clamp(latency, 4, 500)),
            "packetLoss": round(clamp(packet_loss, 0, 100), 2),
            "bitrate": round(clamp(bitrate, 0, 20000)),
            "buffer": round(clamp(buffer, 0, 60), 1),
            "jitter": round(clamp(jitter, 0, 100), 1),
        }

    def warmup(self, mode: str, count: int = HISTORY_SIZE) -> list[dict]:
        """과거 count초 치 히스토리를 상태가 순차 진화하도록 생성한다."""
        now = now_ms()
        return [
            self.next_sample(mode, now - (count - 1 - i) * 1000)
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
