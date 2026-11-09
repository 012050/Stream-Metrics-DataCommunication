import { useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BarChart3,
  CalendarDays, CheckCircle2, Clock3, Database, Download,
  FileText, FlaskConical, Gauge, GitCompareArrows, Info, LayoutDashboard,
  Menu, Play, Settings, Signal, SlidersHorizontal, Radio,
  Video, Wifi, X, Zap,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  getLatest, getMergedHistory, getStats, initialHistory, makeSample, SCENARIOS,
} from './data/mockMetrics.js';
import './App.css';

const COLORS = { live: '#42cce5', vod: '#a68cff', good: '#55dda7', warning: '#f6b65f' };
const NAV_GROUPS = [
  { label: 'OVERVIEW', items: [{ id: 'dashboard', name: '대시보드', icon: LayoutDashboard }] },
  {
    label: 'STREAMING', items: [
      { id: 'live', name: 'LIVE 모니터링', icon: Radio },
      { id: 'vod', name: 'VOD 모니터링', icon: Video },
      { id: 'compare', name: 'LIVE / VOD 비교', icon: GitCompareArrows },
    ],
  },
  {
    label: 'ANALYTICS', items: [
      { id: 'statistics', name: '통계 분석', icon: BarChart3 },
      { id: 'tests', name: '네트워크 실험', icon: FlaskConical },
      { id: 'reports', name: '리포트', icon: FileText },
    ],
  },
  { label: 'SYSTEM', items: [{ id: 'settings', name: '설정', icon: Settings }] },
];

const PAGE_INFO = {
  dashboard: ['대시보드', '스트리밍 네트워크 성능을 한눈에 확인하세요.'],
  live: ['LIVE 모니터링', '실시간 스트리밍 영상과 네트워크 상태를 확인하세요.'],
  vod: ['VOD 모니터링', 'VOD 재생 품질과 전송 지표를 확인하세요.'],
  compare: ['LIVE / VOD 비교', '동일한 조건에서 두 스트리밍 방식의 지표를 비교하세요.'],
  statistics: ['통계 분석', '수집된 데이터의 추세와 요약 통계를 살펴보세요.'],
  tests: ['네트워크 실험', '네트워크 조건 변화에 따른 지표 반응을 미리 살펴보세요.'],
  reports: ['리포트', '측정 기록을 검토하고 CSV로 내려받으세요.'],
  settings: ['설정', '영상 소스와 대시보드 표시 방식을 설정하세요.'],
};

function format(value, digits = 0) {
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

function clock(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Sidebar({ page, onNavigate, visible, onClose }) {
  return (
    <>
      {visible && <button className="mobile-scrim" aria-label="메뉴 닫기" onClick={onClose} />}
      <aside className={`sidebar ${visible ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={24} strokeWidth={2.6} /></div>
          <div><strong>stream<span>metrics</span></strong><small>NETWORK OBSERVATORY</small></div>
          <button className="mobile-close icon-button" onClick={onClose} aria-label="메뉴 닫기"><X size={18} /></button>
        </div>

        <div className="project-summary">
          <span>TEAM PROJECT</span>
          <strong>데이터통신 · 4팀</strong>
        </div>

        <nav aria-label="주요 메뉴" className="side-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-link ${page === id ? 'active' : ''}`}
                  onClick={() => { onNavigate(id); onClose(); }}
                  aria-current={page === id ? 'page' : undefined}
                >
                  <Icon size={18} strokeWidth={1.85} /><span>{name}</span>
                  {page === id && <span className="active-indicator" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help"><div className="sidebar-help-icon"><Zap size={17} /></div><strong>프로젝트 개발 중</strong><p>현재 표시되는 네트워크 지표는 예시 데이터입니다.</p></div>
        </div>
      </aside>
    </>
  );
}

function Badge({ children, variant = 'neutral', dot = false }) {
  return <span className={`badge badge-${variant}`}>{dot && <span className="badge-dot" />}{children}</span>;
}

function Card({ children, className = '', ...props }) {
  return <section className={`card ${className}`} {...props}>{children}</section>;
}

function SectionTitle({ title, subtitle, action }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, unit, icon: Icon = Activity, accent = 'cyan', helper, compact = false }) {
  return (
    <Card className={`metric-card ${compact ? 'metric-card-compact' : ''}`}>
      <div className="metric-top"><span>{label}</span><span className={`metric-icon accent-${accent}`}><Icon size={17} /></span></div>
      <div className="metric-number">{value}<small>{unit}</small></div>
      {helper && <div className="metric-helper">{helper}</div>}
    </Card>
  );
}

function ChartTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{clock(label)}</strong>
      {payload.map((entry) => (
        <div key={entry.dataKey}><span style={{ background: entry.color }} />{entry.name}<b>{format(entry.value, suffix === '%' ? 2 : 0)}{suffix}</b></div>
      ))}
    </div>
  );
}

function TrendChart({ data, lines, unit = 'ms', area = false, height = 224, legend = false }) {
  const ChartComponent = area ? AreaChart : LineChart;
  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ChartComponent data={data} margin={{ top: 14, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {lines.map(({ key, color }) => (
              <linearGradient id={`fill-${key}`} key={key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.24} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#1e2c40" strokeDasharray="4 6" vertical={false} />
          <XAxis dataKey="timestamp" tickFormatter={(ts) => clock(ts).slice(3)} stroke="#61748d" tick={{ fill: '#71829a', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
          <YAxis tick={{ fill: '#71829a', fontSize: 11 }} stroke="#61748d" axisLine={false} tickLine={false} width={45} domain={['auto', 'auto']} />
          <Tooltip content={<ChartTooltip suffix={unit === '%' ? '%' : ''} />} />
          {legend && <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: '#91a3b9', paddingTop: 8 }} />}
          {lines.map(({ key, name, color }) => area ? (
            <Area key={key} name={name} type="monotone" dataKey={key} stroke={color} strokeWidth={2.5} fill={`url(#fill-${key})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          ) : (
            <Line key={key} name={name} type="monotone" dataKey={key} stroke={color} strokeWidth={2.3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

function ChartCard({ title, description, data, lines, unit, area = false, legend = false, height = 220, className = '' }) {
  return <Card className={`chart-card ${className}`}><div className="chart-card-head"><div><h3>{title}</h3>{description && <p>{description}</p>}</div><span className="chart-unit">{unit}</span></div><TrendChart data={data} lines={lines} unit={unit} area={area} height={height} legend={legend} /></Card>;
}

function VideoPanel({ mode, url, onConnect, small = false }) {
  const isLive = mode === 'live';
  return (
    <div className={`video-panel video-${mode} ${small ? 'video-small' : ''}`}>
      {url ? (
        <video className="stream-video" key={url} src={url} controls playsInline preload="metadata" aria-label={`${isLive ? 'LIVE' : 'VOD'} 영상 재생`} />
      ) : (
        <div className="video-placeholder">
          <div className="video-orbit video-orbit-one" /><div className="video-orbit video-orbit-two" />
          <div className="video-play-icon">{isLive ? <Radio size={32} /> : <Play size={34} fill="currentColor" />}</div>
          <strong>{isLive ? 'LIVE STREAM' : 'ON-DEMAND VIDEO'}</strong>
          <p>연결된 영상 소스가 없습니다</p>
          {!small && <button className="video-source-btn" onClick={onConnect}>영상 소스 설정 <ArrowRight size={15} /></button>}
        </div>
      )}
      <div className="video-overlay"><Badge variant={isLive ? 'red' : 'purple'} dot>{isLive ? 'LIVE' : 'VOD'}</Badge><span>STREAM 0{isLive ? '1' : '2'}</span></div>
      {!url && <div className="video-corner-mark">DEMO / NO SIGNAL</div>}
    </div>
  );
}

function StreamRow({ mode, latest, onOpen }) {
  const live = mode === 'live';
  return (
    <button className="stream-row" onClick={onOpen}>
      <div className={`stream-row-icon ${live ? 'stream-row-live' : 'stream-row-vod'}`}>{live ? <Radio size={19} /> : <Video size={19} />}</div>
      <div className="stream-row-name"><strong>{live ? 'Live Streaming' : 'VOD Streaming'}</strong><small>{live ? 'Real-time transport' : 'Adaptive playback'}</small></div>
      <Badge variant="green" dot>DEMO</Badge>
      <div className="stream-row-metric"><strong>{format(latest.latency)} ms</strong><small>Latency</small></div>
      <div className="stream-row-metric"><strong>{format(latest.bitrate)} kbps</strong><small>Bitrate</small></div>
      <ArrowRight className="stream-row-arrow" size={17} />
    </button>
  );
}

function DashboardPage({ live, vod, merged, onNavigate, now }) {
  const liveLatest = getLatest(live);
  const vodLatest = getLatest(vod);
  return (
    <>
      <div className="welcome-row"><div><div className="eyebrow"><span /> OVERVIEW / LIVE MONITORING</div><h1>네트워크 상태를 한눈에.</h1><p>LIVE와 VOD 스트리밍의 주요 지표를 확인하고 전송 성능을 비교하세요.</p></div><div className="today-chip"><CalendarDays size={16} />{new Date(now).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
      <div className="section-compact"><SectionTitle title="성능 요약" action={<Badge variant="cyan" dot>예시 데이터 · 자동 갱신</Badge>} /></div>
      <div className="metric-grid">
        <MetricCard label="LIVE 지연 시간" value={format(liveLatest.latency)} unit="ms" icon={Clock3} accent="cyan" helper="실시간 전송 지연" />
        <MetricCard label="VOD 지연 시간" value={format(vodLatest.latency)} unit="ms" icon={Activity} accent="purple" helper="데모 기준 응답 지연" />
        <MetricCard label="LIVE 패킷 손실률" value={format(liveLatest.packetLoss, 2)} unit="%" icon={Signal} accent="yellow" helper="전송 품질 측정 항목" />
        <MetricCard label="VOD 비트레이트" value={format(vodLatest.bitrate)} unit="kbps" icon={Gauge} accent="green" helper="동영상 전송률" />
      </div>
      <div className="main-chart-layout">
        <ChartCard className="overview-main-chart" title="스트리밍 지연 시간 비교" description="최근 72개 데모 샘플 · LIVE vs VOD" data={merged} lines={[{ key: 'liveLatency', name: 'LIVE', color: COLORS.live }, { key: 'vodLatency', name: 'VOD', color: COLORS.vod }]} unit="ms" legend area height={252} />
        <Card className="quality-card"><div className="quality-head"><div><span className="mini-eyebrow">NETWORK QUALITY</span><h3>시스템 모니터링</h3></div><span className="live-pulse" /></div><div className="quality-graphic"><div className="quality-ring"><div><Wifi size={26} /><strong>DEMO</strong><small>SIMULATED</small></div></div></div><div className="quality-footer"><span><span className="dot dot-green" />화면 실시간 갱신 중</span><span>{clock(now)}</span></div><p className="quality-note">측정 서버가 연결되기 전까지 예시 데이터를 표시합니다.</p></Card>
      </div>
      <SectionTitle title="스트리밍 세션" subtitle="모니터링 화면을 선택해 상세 지표를 확인하세요." action={<button className="text-action" onClick={() => onNavigate('compare')}>비교 화면 보기 <ArrowRight size={15} /></button>} />
      <Card className="stream-list"><StreamRow mode="live" latest={liveLatest} onOpen={() => onNavigate('live')} /><StreamRow mode="vod" latest={vodLatest} onOpen={() => onNavigate('vod')} /></Card>
    </>
  );
}

function MonitorPage({ mode, history, videoUrl, onNavigate, scenario }) {
  const live = mode === 'live';
  const latest = getLatest(history);
  const color = live ? COLORS.live : COLORS.vod;
  return (
    <>
      <div className="page-title-row"><div><div className="eyebrow"><span /> STREAMING / {live ? 'LIVE' : 'VOD'}</div><h1>{live ? 'LIVE 모니터링' : 'VOD 모니터링'}</h1><p>{live ? '실시간 송수신 환경의 지연과 패킷 손실을 관찰합니다.' : 'VOD 재생 상태와 비트레이트, 버퍼를 살펴봅니다.'}</p></div><Badge variant={live ? 'red' : 'purple'} dot>{live ? 'LIVE CHANNEL' : 'VOD CHANNEL'}</Badge></div>
      <div className="monitor-layout">
        <Card className="player-card"><div className="card-heading"><div><h3>{live ? 'Live Stream 01' : 'VOD Player 01'}</h3><p>영상 플레이어 · 소스 연결 대기</p></div><span className="card-heading-icon"><Video size={18} /></span></div><VideoPanel mode={mode} url={videoUrl} onConnect={() => onNavigate('settings')} /><div className="player-footer"><span><span className="dot dot-yellow" />{videoUrl ? '영상 소스 연결됨' : '영상 소스 미연결'}</span><span>전송 지표: DEMO</span></div></Card>
        <div className="monitor-sidebar"><Card className="stream-health"><div className="health-title"><span>STREAM STATUS</span><Badge variant="neutral">예시 데이터</Badge></div><strong>네트워크 지표</strong><p>샘플 데이터가 자동 갱신되고 있습니다.</p><div className="health-meta"><span>선택 시나리오</span><b>{SCENARIOS.find((item) => item.id === scenario)?.title}</b></div></Card><div className="monitor-metrics"><MetricCard compact label="Latency" value={format(latest.latency)} unit="ms" icon={Clock3} accent="cyan" /><MetricCard compact label="Packet Loss" value={format(latest.packetLoss, 2)} unit="%" icon={Signal} accent="yellow" /><MetricCard compact label="Bitrate" value={format(latest.bitrate)} unit="kbps" icon={Gauge} accent="purple" /><MetricCard compact label="Buffer Level" value={format(latest.buffer, 1)} unit="sec" icon={Activity} accent="green" /></div></div>
      </div>
      <div className="two-charts"><ChartCard title="Latency Trend" description="시간별 지연 변화" data={history} lines={[{ key: 'latency', name: 'Latency', color }]} unit="ms" area height={214} /><ChartCard title="Packet Loss Trend" description="시간별 패킷 손실률" data={history} lines={[{ key: 'packetLoss', name: 'Packet Loss', color: COLORS.warning }]} unit="%" area height={214} /></div>
      <div className="insight-note"><Info size={17} /><span>현재 측정값은 모두 데모 데이터입니다. 실제 LIVE/WebRTC 및 VOD/HLS 지표 수집 방식은 백엔드·패킷 분석 담당자와 연동할 예정입니다.</span></div>
    </>
  );
}

function ComparePage({ live, vod, merged, urls, onNavigate }) {
  const l = getLatest(live);
  const v = getLatest(vod);
  const rows = [
    ['Latency', `${format(l.latency)} ms`, `${format(v.latency)} ms`],
    ['Packet Loss', `${format(l.packetLoss, 2)} %`, `${format(v.packetLoss, 2)} %`],
    ['Bitrate', `${format(l.bitrate)} kbps`, `${format(v.bitrate)} kbps`],
    ['Buffer Level', `${format(l.buffer, 1)} sec`, `${format(v.buffer, 1)} sec`],
    ['Jitter', `${format(l.jitter, 1)} ms`, `${format(v.jitter, 1)} ms`],
  ];
  return <><div className="page-title-row"><div><div className="eyebrow"><span /> STREAMING / COMPARISON</div><h1>LIVE / VOD 비교</h1><p>두 스트리밍 모드를 같은 화면에서 관찰하고 지표 차이를 확인하세요.</p></div><Badge variant="cyan"><GitCompareArrows size={13} /> SIDE BY SIDE</Badge></div><div className="compare-video-grid"><Card className="compare-video-card"><div className="card-heading"><div><h3><span className="title-dot cyan" />LIVE Streaming</h3><p>실시간 스트리밍</p></div><Badge variant="red" dot>LIVE</Badge></div><VideoPanel mode="live" url={urls.live} small onConnect={() => onNavigate('settings')} /><div className="compare-summary"><span>Latency <b>{format(l.latency)} ms</b></span><span>Packet Loss <b>{format(l.packetLoss, 2)}%</b></span></div></Card><Card className="compare-video-card"><div className="card-heading"><div><h3><span className="title-dot purple" />VOD Streaming</h3><p>주문형 영상</p></div><Badge variant="purple">VOD</Badge></div><VideoPanel mode="vod" url={urls.vod} small onConnect={() => onNavigate('settings')} /><div className="compare-summary"><span>Latency <b>{format(v.latency)} ms</b></span><span>Packet Loss <b>{format(v.packetLoss, 2)}%</b></span></div></Card></div><div className="compare-detail-grid"><ChartCard title="지연 시간 비교" description="같은 시간축에서 두 모드를 비교" data={merged} lines={[{ key: 'liveLatency', name: 'LIVE', color: COLORS.live }, { key: 'vodLatency', name: 'VOD', color: COLORS.vod }]} unit="ms" legend height={264} /><Card className="compare-table-card"><div className="card-heading"><div><h3>지표별 비교</h3><p>가장 최근 데모 샘플</p></div><span className="chart-unit">5 METRICS</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Metric</th><th>LIVE</th><th>VOD</th></tr></thead><tbody>{rows.map(([metric, lv, vv]) => <tr key={metric}><td>{metric}</td><td>{lv}</td><td>{vv}</td></tr>)}</tbody></table></div></Card></div><div className="insight-note"><Info size={17} /><span>이 비교는 화면 구성 검증용입니다. 실제 실험에서는 측정 위치·방식·단위를 통일한 뒤 데이터를 해석해야 합니다.</span></div></>;
}

function StatisticsPage({ live, vod, merged }) {
  const latency = getStats(live, 'latency');
  const loss = getStats(live, 'packetLoss');
  const bitrate = getStats(vod, 'bitrate');
  const buffer = getStats(vod, 'buffer');
  const summary = [
    ['LIVE Latency', 'ms', latency], ['LIVE Packet Loss', '%', loss],
    ['VOD Bitrate', 'kbps', bitrate], ['VOD Buffer', 'sec', buffer],
  ];
  return <><div className="page-title-row"><div><div className="eyebrow"><span /> ANALYTICS / STATISTICS</div><h1>통계 분석</h1><p>최근 72개 데모 샘플의 추세와 기본 통계를 정리했습니다.</p></div><Badge variant="cyan"><BarChart3 size={14} /> 72 SAMPLES</Badge></div><div className="metric-grid"><MetricCard label="LIVE 평균 지연" value={format(latency.average, 1)} unit="ms" icon={Clock3} accent="cyan" helper="최근 샘플 산술평균" /><MetricCard label="LIVE 지연 P95" value={format(latency.p95)} unit="ms" icon={ArrowUpRight} accent="yellow" helper="95백분위 지연" /><MetricCard label="LIVE 평균 손실" value={format(loss.average, 2)} unit="%" icon={Signal} accent="purple" helper="최근 샘플 산술평균" /><MetricCard label="VOD 평균 비트레이트" value={format(bitrate.average)} unit="kbps" icon={Gauge} accent="green" helper="최근 샘플 산술평균" /></div><div className="two-charts"><ChartCard title="Latency Distribution Over Time" description="LIVE와 VOD의 시간별 지연 추이" data={merged} lines={[{ key: 'liveLatency', name: 'LIVE', color: COLORS.live }, { key: 'vodLatency', name: 'VOD', color: COLORS.vod }]} unit="ms" legend height={252} /><ChartCard title="Packet Loss Over Time" description="데모 패킷 손실률 비교" data={merged} lines={[{ key: 'liveLoss', name: 'LIVE', color: COLORS.warning }, { key: 'vodLoss', name: 'VOD', color: COLORS.vod }]} unit="%" legend height={252} /></div><Card className="stats-summary"><div className="card-heading"><div><h3>측정값 요약</h3><p>현재 시뮬레이션 구간 기준</p></div><Badge variant="neutral">LIVE / VOD</Badge></div><div className="table-wrap"><table className="data-table"><thead><tr><th>지표</th><th>평균</th><th>최솟값</th><th>최댓값</th><th>P95</th></tr></thead><tbody>{summary.map(([label, unit, s]) => <tr key={label}><td>{label}</td><td>{format(s.average, 1)} {unit}</td><td>{format(s.min, 1)} {unit}</td><td>{format(s.max, 1)} {unit}</td><td>{format(s.p95, 1)} {unit}</td></tr>)}</tbody></table></div></Card></>;
}

function TestsPage({ scenario, onScenarioChange, live, vod }) {
  return <><div className="page-title-row"><div><div className="eyebrow"><span /> ANALYTICS / NETWORK TESTS</div><h1>네트워크 실험</h1><p>조건을 선택해 가상 지표가 어떻게 달라지는지 확인하세요.</p></div><Badge variant="yellow"><AlertTriangle size={14} /> 가상 시뮬레이션</Badge></div><div className="test-banner"><div className="test-banner-icon"><FlaskConical size={24} /></div><div><strong>실험 환경 미리보기</strong><p>현재는 가상 수치만 변합니다. 추후 실제 네트워크 조건 제어 또는 측정된 실험 데이터 선택 기능을 연동할 수 있습니다.</p></div></div><SectionTitle title="테스트 시나리오" subtitle="하나를 선택하면 모든 예시 차트에 반영됩니다." /><div className="scenario-grid">{SCENARIOS.map((item) => <button key={item.id} className={`scenario-card ${scenario === item.id ? 'scenario-selected' : ''}`} onClick={() => onScenarioChange(item.id)}><span className="scenario-symbol">{item.id === 'normal' ? <Wifi size={23} /> : item.id === 'bandwidth' ? <Gauge size={23} /> : <AlertTriangle size={23} />}</span><strong>{item.title}</strong><span>{item.caption}</span><div className="scenario-choice">{scenario === item.id ? <><CheckCircle2 size={16} /> 적용 중</> : <>미리보기 적용 <ArrowRight size={15} /></>}</div></button>)}</div><SectionTitle title="현재 시뮬레이션 결과" subtitle="선택한 시나리오의 최신 예시 수치" /><div className="metric-grid"><MetricCard label="LIVE Latency" value={format(getLatest(live).latency)} unit="ms" icon={Clock3} accent="cyan" /><MetricCard label="LIVE Packet Loss" value={format(getLatest(live).packetLoss, 2)} unit="%" icon={Signal} accent="yellow" /><MetricCard label="VOD Bitrate" value={format(getLatest(vod).bitrate)} unit="kbps" icon={Gauge} accent="purple" /><MetricCard label="VOD Buffer" value={format(getLatest(vod).buffer, 1)} unit="sec" icon={Activity} accent="green" /></div><div className="insight-note"><Info size={17} /><span>실제 네트워크 실험 기능은 테스트 환경 및 지표 수집 API가 준비된 뒤 구현해야 합니다.</span></div></>;
}

function downloadCsv(live, vod) {
  const header = 'timestamp,mode,latency_ms,packet_loss_percent,bitrate_kbps,buffer_sec,jitter_ms';
  const rows = [
    ...live.map((s) => [new Date(s.timestamp).toISOString(), 'LIVE', s.latency, s.packetLoss, s.bitrate, s.buffer, s.jitter]),
    ...vod.map((s) => [new Date(s.timestamp).toISOString(), 'VOD', s.latency, s.packetLoss, s.bitrate, s.buffer, s.jitter]),
  ];
  const csv = '\uFEFF' + [header, ...rows.map((row) => row.join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `stream-metrics-demo-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportsPage({ live, vod }) {
  const latest = [...live.slice(-4).map((s) => ({ ...s, mode: 'LIVE' })), ...vod.slice(-4).map((s) => ({ ...s, mode: 'VOD' }))].sort((a, b) => b.timestamp - a.timestamp);
  return <><div className="page-title-row"><div><div className="eyebrow"><span /> ANALYTICS / REPORTS</div><h1>리포트</h1><p>측정 기록을 확인하고 데이터 파일을 내려받으세요.</p></div><button className="primary-button" onClick={() => downloadCsv(live, vod)}><Download size={17} /> CSV 다운로드</button></div><div className="report-summary"><Card><div className="report-icon accent-cyan"><Database size={20} /></div><strong>{live.length + vod.length}</strong><span>수집된 데모 샘플</span></Card><Card><div className="report-icon accent-purple"><Activity size={20} /></div><strong>2</strong><span>스트리밍 모드</span></Card><Card><div className="report-icon accent-green"><CheckCircle2 size={20} /></div><strong>CSV</strong><span>지원 내보내기 형식</span></Card></div><Card className="report-table-card"><div className="card-heading"><div><h3>최근 샘플 기록</h3><p>최신 데이터 8건 미리보기</p></div><Badge variant="neutral">DEMO DATA</Badge></div><div className="table-wrap"><table className="data-table"><thead><tr><th>측정 시각</th><th>스트리밍</th><th>Latency</th><th>Packet Loss</th><th>Bitrate</th><th>Buffer</th></tr></thead><tbody>{latest.map((s) => <tr key={`${s.mode}-${s.timestamp}`}><td>{clock(s.timestamp)}</td><td><Badge variant={s.mode === 'LIVE' ? 'cyan' : 'purple'}>{s.mode}</Badge></td><td>{format(s.latency)} ms</td><td>{format(s.packetLoss, 2)}%</td><td>{format(s.bitrate)} kbps</td><td>{format(s.buffer, 1)} sec</td></tr>)}</tbody></table></div></Card><div className="insight-note"><Info size={17} /><span>CSV에는 현재 화면의 데모 시계열이 저장됩니다. 실제 측정 기록 저장 및 리포트 기능은 백엔드 연동 후 확장합니다.</span></div></>;
}

function SettingsPage({ urls, onUrlChange, refreshInterval, onRefreshChange }) {
  return <><div className="page-title-row"><div><div className="eyebrow"><span /> SYSTEM / SETTINGS</div><h1>대시보드 설정</h1><p>영상 소스와 데모 데이터 갱신 주기를 설정할 수 있습니다.</p></div><Badge variant="neutral"><Settings size={14} /> LOCAL SETTINGS</Badge></div><div className="settings-grid"><Card className="settings-card"><div className="card-heading"><div><h3>영상 소스</h3><p>브라우저에서 직접 재생할 수 있는 영상 URL을 입력하세요.</p></div><Video size={20} /></div><label className="field-label" htmlFor="live-url">LIVE 영상 URL</label><input id="live-url" type="url" value={urls.live} onChange={(e) => onUrlChange('live', e.target.value)} placeholder="https://.../live.mp4" /><label className="field-label" htmlFor="vod-url">VOD 영상 URL</label><input id="vod-url" type="url" value={urls.vod} onChange={(e) => onUrlChange('vod', e.target.value)} placeholder="https://.../video.mp4" /><div className="settings-note"><Info size={16} /><span>현재는 브라우저가 직접 재생 가능한 형식만 지원합니다. WebRTC 신호 교환 및 HLS 전용 플레이어는 추후 연동이 필요합니다.</span></div></Card><Card className="settings-card"><div className="card-heading"><div><h3>표시 설정</h3><p>데모 차트의 업데이트 간격을 선택하세요.</p></div><SlidersHorizontal size={20} /></div><label className="field-label">데이터 갱신 간격</label><div className="segmented-row">{[1000, 2000, 5000].map((ms) => <button key={ms} className={refreshInterval === ms ? 'selected' : ''} onClick={() => onRefreshChange(ms)}>{ms / 1000}초</button>)}</div><div className="settings-status"><div><span className="dot dot-green" /><strong>프론트엔드</strong></div><Badge variant="green">실행 중</Badge></div><div className="settings-status"><div><span className="dot dot-yellow" /><strong>FastAPI 데이터 연동</strong></div><Badge variant="yellow">연결 예정</Badge></div><div className="settings-status"><div><span className="dot dot-yellow" /><strong>LIVE / VOD 소스</strong></div><Badge variant="yellow">설정 필요</Badge></div></Card></div><div className="insight-note"><Info size={17} /><span>설정값은 현재 브라우저 세션에서만 유지됩니다. 실제 서버 연결 주소 및 API 응답 규격은 백엔드 담당자와 합의한 뒤 추가합니다.</span></div></>;
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [scenario, setScenario] = useState('normal');
  const [refreshInterval, setRefreshInterval] = useState(1000);
  const [videoUrls, setVideoUrls] = useState({ live: '', vod: '' });
  const [live, setLive] = useState(() => initialHistory('live'));
  const [vod, setVod] = useState(() => initialHistory('vod'));
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef(72);
  const scenarioRef = useRef('normal');

  useEffect(() => {
    const timer = window.setInterval(() => {
      tick.current += 1;
      const time = Date.now();
      setLive((history) => [...history.slice(-71), makeSample('live', tick.current, scenarioRef.current, time)]);
      setVod((history) => [...history.slice(-71), makeSample('vod', tick.current, scenarioRef.current, time)]);
      setNow(time);
    }, refreshInterval);
    return () => window.clearInterval(timer);
  }, [refreshInterval]);

  const handleScenarioChange = (next) => {
    scenarioRef.current = next;
    setScenario(next);
    tick.current = 72;
    setLive(initialHistory('live', next));
    setVod(initialHistory('vod', next));
  };
  const merged = getMergedHistory(live, vod);

  let content;
  switch (page) {
    case 'live': content = <MonitorPage mode="live" history={live} videoUrl={videoUrls.live} onNavigate={setPage} scenario={scenario} />; break;
    case 'vod': content = <MonitorPage mode="vod" history={vod} videoUrl={videoUrls.vod} onNavigate={setPage} scenario={scenario} />; break;
    case 'compare': content = <ComparePage live={live} vod={vod} merged={merged} urls={videoUrls} onNavigate={setPage} />; break;
    case 'statistics': content = <StatisticsPage live={live} vod={vod} merged={merged} />; break;
    case 'tests': content = <TestsPage scenario={scenario} onScenarioChange={handleScenarioChange} live={live} vod={vod} />; break;
    case 'reports': content = <ReportsPage live={live} vod={vod} />; break;
    case 'settings': content = <SettingsPage urls={videoUrls} onUrlChange={(mode, url) => setVideoUrls((old) => ({ ...old, [mode]: url }))} refreshInterval={refreshInterval} onRefreshChange={setRefreshInterval} />; break;
    default: content = <DashboardPage live={live} vod={vod} merged={merged} onNavigate={setPage} now={now} />;
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={setPage} visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />
      <div className="main-shell">
        <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={() => setSidebarVisible(true)} aria-label="메뉴 열기"><Menu size={21} /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{PAGE_INFO[page][0]}</strong></div></div><div className="topbar-right"><span className="sync-time"><Clock3 size={14} /> {clock(now)}</span></div></header>
        <main className="main-content" id="main-content">{content}<footer className="footer"><span>© 2026 Stream Metrics · 데이터통신 4팀</span><span>Frontend Preview <b>v0.1.0</b> · Simulated metrics</span></footer></main>
      </div>
    </div>
  );
}
