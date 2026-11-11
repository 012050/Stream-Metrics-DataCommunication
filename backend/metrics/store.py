"""인메모리 지표 저장소 + 1초 단위 백그라운드 틱.

프론트엔드 App.jsx의 tick 루프와 동일하게 동작한다:
- mode별 72개 샘플 롤링 윈도우(deque)를 유지
- 1초마다 MetricsGenerator의 1틱을 호출해 양쪽 mode에 새 샘플 추가
- 시나리오 변경 시 생성기 상태 리셋 + 히스토리 재초기화
"""
from __future__ import annotations

import asyncio
from collections import deque

from . import generator
from .generator import HISTORY_SIZE, MetricsGenerator, seed_from_env

TICK_INTERVAL_SEC = 1.0


class MetricsStore:
    """LIVE/VOD 모의 지표를 1초 주기로 갱신하는 단일 저장소."""

    def __init__(self) -> None:
        self._scenario = "normal"
        self._gen = MetricsGenerator(seed=seed_from_env())
        self._history: dict[str, deque] = {
            mode: deque(maxlen=HISTORY_SIZE) for mode in generator.MODES
        }
        self._task: asyncio.Task | None = None
        self._rebuild_history()

    # -- 내부 ---------------------------------------------------------------

    def _rebuild_history(self) -> None:
        """현재 시나리오로 과거 72초 치 히스토리를 (재)생성한다."""
        for mode in generator.MODES:
            window = self._history[mode]
            window.clear()
            for sample in self._gen.warmup(mode):
                window.append(sample)

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(TICK_INTERVAL_SEC)
            ts = generator.now_ms()
            for mode in generator.MODES:
                self._history[mode].append(self._gen.next_sample(mode, ts))

    # -- 공개 API -------------------------------------------------------------

    async def start(self) -> None:
        """백그라운드 틱 태스크를 시작한다. (FastAPI lifespan에서 호출)"""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    @property
    def seed(self) -> int | None:
        """사용 중인 난수 시드 (None이면 시드 없음). 데모 재현성 확인용."""
        return self._gen.seed

    @property
    def scenario(self) -> str:
        return self._scenario

    def set_scenario(self, scenario: str) -> None:
        """시나리오 변경. (frontend handleScenarioChange 대응: 상태 리셋 + 재초기화)"""
        if scenario not in generator.EFFECTS:
            raise ValueError(f"알 수 없는 시나리오: {scenario} ({', '.join(generator.EFFECTS)})")
        self._scenario = scenario
        self._gen.set_scenario(scenario)
        self._rebuild_history()

    def latest(self, mode: str) -> dict:
        return self._history[mode][-1]

    def history(self, mode: str, count: int | None = None) -> list[dict]:
        window = self._history[mode]
        samples = list(window)
        if count is not None:
            samples = samples[-count:]
        return samples

    def merged(self) -> list[dict]:
        """LIVE/VOD 비교 차트용 병합 히스토리. (frontend getMergedHistory 대응)"""
        live = self._history["live"]
        vod = self._history["vod"]
        merged: list[dict] = []
        for i, sample in enumerate(live):
            vod_sample = vod[i] if i < len(vod) else None
            merged.append(
                {
                    "timestamp": sample["timestamp"],
                    "liveLatency": sample["latency"],
                    "vodLatency": vod_sample["latency"] if vod_sample else 0,
                    "liveLoss": sample["packetLoss"],
                    "vodLoss": vod_sample["packetLoss"] if vod_sample else 0,
                }
            )
        return merged
