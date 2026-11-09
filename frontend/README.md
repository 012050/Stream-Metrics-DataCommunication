# Stream Metrics Frontend

데이터통신 4팀의 React 기반 스트리밍 네트워크 모니터링 대시보드입니다.

## 실행

```bash
cd frontend
npm install
npm run dev
```

Windows PowerShell에서 `npm.ps1` 실행이 차단되면 `npm.cmd install`, `npm.cmd run dev`를 사용합니다.

## 화면 구성

- 대시보드: 주요 지표 및 LIVE/VOD 개요
- LIVE 모니터링: 영상 영역, 네트워크 수치, 지연·손실률 그래프
- VOD 모니터링: 영상 영역, 네트워크 수치, 지연·손실률 그래프
- LIVE/VOD 비교: 두 플레이어와 지표 비교표
- 통계 분석: 평균, 최솟값, 최댓값, 95백분위 통계
- 네트워크 실험: 가상 대역폭 제한 및 손실 상황 미리보기
- 리포트: 데모 데이터 CSV 내보내기
- 설정: 브라우저에서 재생 가능한 영상 URL과 데모 갱신 주기

## 중요한 구분

현재 수치는 전부 `src/data/mockMetrics.js`에서 만드는 **데모 데이터**입니다.
네트워크 실험도 실제 통신 환경을 바꾸지 않는 가상 시뮬레이션입니다.
영상 소스가 연결되지 않은 상태에서는 플레이어 대신 안내 화면이 나타납니다.

백엔드·패킷 분석 팀의 실제 데이터 수집이 준비되면 아래를 합의한 후 연동해야 합니다.

1. LIVE와 VOD의 지연 시간 및 패킷 손실률 정의(측정 위치와 기준)
2. 시간 기준과 데이터 갱신 주기
3. API 경로, JSON 필드 이름과 단위
4. LIVE 영상 WebRTC 세션 연결 및 VOD HLS 플레이어 처리 방법

### 프론트엔드가 현재 사용하는 데이터 형태 (예시)

```json
{
  "timestamp": 1794211200000,
  "latency": 52,
  "packetLoss": 0.7,
  "bitrate": 2450,
  "buffer": 2.4,
  "jitter": 10
}
```

단위: `timestamp` Unix 밀리초, `latency`/`jitter` ms, `packetLoss` %, `bitrate` kbps, `buffer` 초.
이 필드는 **프론트엔드 내부의 제안 형식**이며, 백엔드 API 계약이 확정된 것은 아닙니다.

현재는 각 화면이 `App.jsx`에 정리되어 있고, 모의 지표 생성 로직은 `mockMetrics.js`로 분리되어 있습니다.
