"""Stream Metrics API의 Pydantic 스키마.

필드명을 프론트엔드 JS의 camelCase(packetLoss 등)와 일치시키기 위해
alias를 사용한다. FastAPI는 alias로 직렬화한다(response_model_by_alias 기본값).
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class MetricSample(BaseModel):
    """한 시점의 스트리밍 전송 지표. (frontend mockMetrics.js sample 형식)"""

    timestamp: int = Field(description="epoch milliseconds")
    latency: float = Field(description="지연 시간 (ms)")
    packetLoss: float = Field(description="패킷 손실률 (%)")
    bitrate: float = Field(description="비트레이트 (kbps)")
    buffer: float = Field(description="버퍼 잔여량 (sec)")
    jitter: float = Field(description="지터 (ms)")


class LatestResponse(BaseModel):
    mode: str
    scenario: str
    source: str = "mock"
    sample: MetricSample


class HistoryResponse(BaseModel):
    mode: str
    scenario: str
    source: str = "mock"
    count: int
    samples: list[MetricSample]


class MergedRow(BaseModel):
    """LIVE/VOD 비교 차트용 병합 행. (frontend getMergedHistory() 형식)"""

    timestamp: int
    liveLatency: float
    vodLatency: float
    liveLoss: float
    vodLoss: float


class StatValues(BaseModel):
    average: float
    max: float
    min: float
    p95: float


class StatResponse(BaseModel):
    mode: str
    key: str
    scenario: str
    count: int
    stats: StatValues


class ScenarioInfo(BaseModel):
    id: str
    title: str
    caption: str


class ScenariosResponse(BaseModel):
    current: str
    scenarios: list[ScenarioInfo]


class ScenarioUpdate(BaseModel):
    scenario: str


class ScenarioUpdateResponse(BaseModel):
    scenario: str
    samples: int
    message: str
