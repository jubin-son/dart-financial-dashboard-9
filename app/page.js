'use client';
import PdfUpload from './components/PdfUpload';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const REPORT_OPTIONS = [
  { code: '11011', label: '사업보고서', shortLabel: '연간' },
  { code: '11013', label: '1분기보고서', shortLabel: '1분기' },
  { code: '11012', label: '반기보고서', shortLabel: '반기' },
  { code: '11014', label: '3분기보고서', shortLabel: '3분기' },
];
const reportName = (code) => REPORT_OPTIONS.find((item) => item.code === code)?.label || '사업보고서';
const reportShortName = (code) => REPORT_OPTIONS.find((item) => item.code === code)?.shortLabel || '연간';

async function fetchJsonWithTimeout(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('요청 시간이 너무 길어 중단했습니다. 잠시 후 다시 시도해 주세요.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const money = (value) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}조`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)}만`;
  return value.toLocaleString('ko-KR');
};
const pct = (value, digits = 1) => Number.isFinite(value) ? `${value.toFixed(digits)}%` : '-';
const growth = (current, previous) => current != null && previous ? ((current - previous) / Math.abs(previous)) * 100 : null;
const ratio = (a, b) => a != null && b ? (a / b) * 100 : null;
const avg = (a, b) => a != null && b != null ? (a + b) / 2 : a ?? b;

function calculateMetrics(years) {
  const current = years.at(-1) || {};
  const previous = years.at(-2) || {};
  return {
    current,
    previous,
    revenueGrowth: growth(current.revenue, previous.revenue),
    operatingGrowth: growth(current.operatingIncome, previous.operatingIncome),
    netGrowth: growth(current.netIncome, previous.netIncome),
    assetGrowth: growth(current.totalAssets, previous.totalAssets),
    operatingMargin: ratio(current.operatingIncome, current.revenue),
    netMargin: ratio(current.netIncome, current.revenue),
    roa: ratio(current.netIncome, avg(current.totalAssets, previous.totalAssets)),
    roe: ratio(current.netIncome, avg(current.totalEquity, previous.totalEquity)),
    debtRatio: ratio(current.totalLiabilities, current.totalEquity),
    currentRatio: ratio(current.currentAssets, current.currentLiabilities),
    equityRatio: ratio(current.totalEquity, current.totalAssets),
    cashConversion: ratio(current.operatingCashFlow, current.netIncome),
    freeCashFlow: current.operatingCashFlow != null && current.capex != null
      ? current.operatingCashFlow - Math.abs(current.capex)
      : current.operatingCashFlow,
  };
}


const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function scaledScore(value, low, high) {
  if (!Number.isFinite(value)) return null;
  if (high === low) return value >= high ? 1 : 0;
  return clamp((value - low) / (high - low));
}

function inverseScore(value, good, bad) {
  if (!Number.isFinite(value)) return null;
  if (value <= good) return 1;
  if (value >= bad) return 0;
  return 1 - (value - good) / (bad - good);
}

function bandScore(value, minGood, maxGood, lowBad, highBad) {
  if (!Number.isFinite(value)) return null;
  if (value >= minGood && value <= maxGood) return 1;
  if (value < minGood) return scaledScore(value, lowBad, minGood);
  return inverseScore(value, maxGood, highBad);
}

function calculateHealthScore(m) {
  const sections = [
    {
      key: 'profitability', label: '수익성', max: 25, color: '#7c3aed',
      metrics: [
        { label: '영업이익률', value: m.operatingMargin, weight: 10, score: scaledScore(m.operatingMargin, 0, 15) },
        { label: '순이익률', value: m.netMargin, weight: 7, score: scaledScore(m.netMargin, 0, 12) },
        { label: 'ROE', value: m.roe, weight: 8, score: scaledScore(m.roe, 0, 15) },
      ],
    },
    {
      key: 'stability', label: '안정성', max: 25, color: '#f97316',
      metrics: [
        { label: '부채비율', value: m.debtRatio, weight: 10, score: inverseScore(m.debtRatio, 50, 250) },
        { label: '유동비율', value: m.currentRatio, weight: 8, score: bandScore(m.currentRatio, 150, 250, 50, 500) },
        { label: '자기자본비율', value: m.equityRatio, weight: 7, score: scaledScore(m.equityRatio, 20, 70) },
      ],
    },
    {
      key: 'growth', label: '성장성', max: 25, color: '#2457d6',
      metrics: [
        { label: '매출 증가율', value: m.revenueGrowth, weight: 9, score: scaledScore(m.revenueGrowth, -10, 20) },
        { label: '영업이익 증가율', value: m.operatingGrowth, weight: 9, score: scaledScore(m.operatingGrowth, -20, 30) },
        { label: '총자산 증가율', value: m.assetGrowth, weight: 7, score: scaledScore(m.assetGrowth, -10, 20) },
      ],
    },
    {
      key: 'cashflow', label: '현금흐름', max: 25, color: '#12a594',
      metrics: [
        { label: '영업현금흐름', value: m.current.operatingCashFlow, weight: 8, score: Number.isFinite(m.current.operatingCashFlow) ? (m.current.operatingCashFlow > 0 ? 1 : 0) : null },
        { label: '현금전환율', value: m.cashConversion, weight: 10, score: bandScore(m.cashConversion, 100, 200, 0, 400) },
        { label: '잉여현금흐름', value: m.freeCashFlow, weight: 7, score: Number.isFinite(m.freeCashFlow) ? (m.freeCashFlow > 0 ? 1 : 0) : null },
      ],
    },
  ].map((section) => {
    const available = section.metrics.filter((metric) => metric.score !== null);
    const availableWeight = available.reduce((sum, metric) => sum + metric.weight, 0);
    const earned = available.reduce((sum, metric) => sum + metric.score * metric.weight, 0);
    const score = availableWeight ? (earned / availableWeight) * section.max : null;
    return { ...section, score, available: available.length, total: section.metrics.length };
  });

  const availableSections = sections.filter((section) => Number.isFinite(section.score));
  const total = availableSections.length
    ? availableSections.reduce((sum, section) => sum + section.score, 0) * (4 / availableSections.length)
    : null;
  const availableMetrics = sections.reduce((sum, section) => sum + section.available, 0);
  const totalMetrics = sections.reduce((sum, section) => sum + section.total, 0);
  const coverage = totalMetrics ? (availableMetrics / totalMetrics) * 100 : 0;
  const grade = total == null ? '산정 불가' : total >= 85 ? '매우 양호' : total >= 70 ? '양호' : total >= 55 ? '보통' : total >= 40 ? '주의' : '취약';
  return { total, grade, coverage, sections };
}

function generateInsights(m) {
  const lines = [];
  if (m.revenueGrowth != null && m.operatingGrowth != null) {
    if (m.revenueGrowth > 0 && m.operatingGrowth > m.revenueGrowth) lines.push('매출 증가와 함께 영업이익이 더 빠르게 증가해 수익성이 개선되는 흐름입니다.');
    else if (m.revenueGrowth > 0 && m.operatingGrowth < 0) lines.push('매출은 증가했지만 영업이익은 감소했습니다. 원가율과 판매관리비 증가 여부를 추가로 확인해야 합니다.');
    else if (m.revenueGrowth < 0) lines.push('매출이 전년 대비 감소했습니다. 수요 둔화, 판매단가 또는 사업구조 변화의 영향을 검토할 필요가 있습니다.');
  }
  if (m.debtRatio != null) {
    if (m.debtRatio < 100) lines.push('부채비율이 100% 미만으로 자기자본 대비 부채 부담은 비교적 낮은 수준입니다.');
    else if (m.debtRatio > 200) lines.push('부채비율이 200%를 넘어 재무안정성에 주의가 필요합니다. 차입금과 이자비용을 함께 확인해야 합니다.');
  }
  if (m.currentRatio != null && m.currentRatio < 100) lines.push('유동비율이 100% 미만이어서 단기 지급능력을 보수적으로 점검할 필요가 있습니다.');
  if (m.cashConversion != null) {
    if (m.cashConversion >= 100) lines.push('영업활동현금흐름이 당기순이익을 상회해 이익의 현금 전환이 양호한 편입니다.');
    else if (m.cashConversion < 50) lines.push('영업활동현금흐름이 당기순이익에 비해 낮습니다. 매출채권과 재고자산 증가 여부를 확인해야 합니다.');
  }
  if (!lines.length) lines.push('제공된 재무계정 범위에서 뚜렷한 위험 신호는 확인되지 않았습니다. 세부 주석과 사업부문 정보까지 함께 검토해야 합니다.');
  return lines;
}

function generateSectionComments(m) {
  const profitability = [];
  if (m.operatingMargin != null) profitability.push(`영업이익률은 ${pct(m.operatingMargin)}로, 매출 100원당 약 ${m.operatingMargin.toFixed(1)}원의 영업이익을 창출한 것으로 나타났습니다.`);
  if (m.operatingGrowth != null && m.revenueGrowth != null) {
    profitability.push(m.operatingGrowth > m.revenueGrowth
      ? `영업이익 증가율(${pct(m.operatingGrowth)})이 매출 증가율(${pct(m.revenueGrowth)})을 상회해 외형 성장과 함께 수익성도 개선된 흐름입니다.`
      : `영업이익 증가율(${pct(m.operatingGrowth)})이 매출 증가율(${pct(m.revenueGrowth)})보다 낮아 원가율 또는 판매관리비 부담을 추가로 확인할 필요가 있습니다.`);
  }
  if (m.roe != null) profitability.push(`ROE는 ${pct(m.roe)}로 자기자본이 순이익 창출에 활용된 효율을 보여줍니다. 업종 평균과 과거 추세를 함께 비교해야 해석의 정확도가 높아집니다.`);

  const stability = [];
  if (m.debtRatio != null) stability.push(`부채비율은 ${pct(m.debtRatio)}입니다. ${m.debtRatio < 100 ? '자기자본보다 부채가 적어 재무구조가 비교적 안정적인 편입니다.' : m.debtRatio > 200 ? '자기자본 대비 부채 부담이 높은 편이므로 차입금과 이자비용을 점검해야 합니다.' : '부채 부담은 관리 가능한 범위로 보이지만 업종 특성과 차입 구조를 함께 확인해야 합니다.'}`);
  if (m.currentRatio != null) stability.push(`유동비율은 ${pct(m.currentRatio)}로, ${m.currentRatio >= 100 ? '유동자산이 유동부채를 상회해 단기 지급능력은 양호한 편입니다.' : '유동부채가 유동자산보다 많아 단기 유동성 관리에 주의가 필요합니다.'}`);
  if (m.equityRatio != null) stability.push(`자기자본비율은 ${pct(m.equityRatio)}이며, 총자산 중 자기자본이 차지하는 비중을 나타냅니다.`);

  const growthComment = [];
  if (m.revenueGrowth != null) growthComment.push(`매출액은 전년 대비 ${pct(m.revenueGrowth)} ${m.revenueGrowth >= 0 ? '증가' : '감소'}했습니다.`);
  if (m.operatingGrowth != null && m.netGrowth != null) growthComment.push(`영업이익은 ${pct(m.operatingGrowth)}, 당기순이익은 ${pct(m.netGrowth)} 변동해 외형 성장과 이익 성장의 방향을 함께 확인할 수 있습니다.`);
  if (m.assetGrowth != null) growthComment.push(`총자산은 전년 대비 ${pct(m.assetGrowth)} 변동했습니다. 자산 증가가 매출 및 이익 증가로 이어지는지 지속적으로 비교할 필요가 있습니다.`);

  const cashflow = [];
  if (m.current.operatingCashFlow != null) cashflow.push(`영업활동현금흐름은 ${money(m.current.operatingCashFlow)}로 ${m.current.operatingCashFlow >= 0 ? '본업에서 현금을 창출하고 있습니다.' : '본업에서 현금이 유출되고 있어 운전자본 변동을 확인해야 합니다.'}`);
  if (m.cashConversion != null) cashflow.push(`현금전환율은 ${pct(m.cashConversion)}입니다. ${m.cashConversion >= 100 ? '영업현금흐름이 당기순이익을 상회해 이익의 현금화가 양호한 편입니다.' : '회계상 이익 대비 현금 유입이 낮아 매출채권과 재고자산 변동을 점검할 필요가 있습니다.'}`);
  if (m.freeCashFlow != null) cashflow.push(`추정 잉여현금흐름은 ${money(m.freeCashFlow)}입니다. 투자 이후에도 내부적으로 활용 가능한 현금 여력을 가늠하는 보조지표입니다.`);

  return { profitability, stability, growth: growthComment, cashflow };
}

function generateWarnings(m) {
  const items = [];
  if (Number.isFinite(m.revenueGrowth) && m.revenueGrowth < 0) items.push({ level: 'high', title: '매출 감소', detail: `매출이 전년 대비 ${Math.abs(m.revenueGrowth).toFixed(1)}% 감소했습니다.` });
  if (Number.isFinite(m.operatingGrowth) && m.operatingGrowth < 0) items.push({ level: 'high', title: '영업이익 감소', detail: `영업이익이 전년 대비 ${Math.abs(m.operatingGrowth).toFixed(1)}% 감소했습니다.` });
  if (Number.isFinite(m.debtRatio) && m.debtRatio > 200) items.push({ level: 'high', title: '높은 부채 부담', detail: `부채비율이 ${m.debtRatio.toFixed(1)}%로 높은 수준입니다.` });
  else if (Number.isFinite(m.debtRatio) && m.debtRatio > 120) items.push({ level: 'medium', title: '부채비율 점검', detail: `부채비율이 ${m.debtRatio.toFixed(1)}%로 상승 여부를 확인해야 합니다.` });
  if (Number.isFinite(m.currentRatio) && m.currentRatio < 100) items.push({ level: 'high', title: '단기 유동성 주의', detail: `유동비율이 ${m.currentRatio.toFixed(1)}%로 100% 미만입니다.` });
  if (Number.isFinite(m.cashConversion) && m.cashConversion < 70) items.push({ level: 'medium', title: '이익의 현금전환 저하', detail: `현금전환율이 ${m.cashConversion.toFixed(1)}%로 낮습니다.` });
  if (Number.isFinite(m.current.operatingCashFlow) && m.current.operatingCashFlow < 0) items.push({ level: 'high', title: '영업현금흐름 음수', detail: '본업에서 현금이 유출되고 있습니다.' });
  if (Number.isFinite(m.freeCashFlow) && m.freeCashFlow < 0) items.push({ level: 'medium', title: '잉여현금흐름 음수', detail: '영업현금으로 투자지출을 충당하지 못한 상태입니다.' });
  if (!items.length) items.push({ level: 'good', title: '중대한 경고 신호 없음', detail: '현재 확인 가능한 핵심 지표에서는 뚜렷한 위험 신호가 감지되지 않았습니다.' });
  return items.slice(0, 5);
}

function generateCheckpoints(m) {
  const items = [];
  if (Number.isFinite(m.operatingGrowth) && Number.isFinite(m.revenueGrowth) && m.operatingGrowth < m.revenueGrowth) items.push('매출원가율과 판매관리비율이 상승했는지 확인');
  if (Number.isFinite(m.cashConversion) && m.cashConversion < 100) items.push('매출채권·재고자산 증가로 현금 회수가 지연되는지 확인');
  if (Number.isFinite(m.assetGrowth) && Number.isFinite(m.revenueGrowth) && m.assetGrowth > m.revenueGrowth + 5) items.push('자산 증가가 매출 성장으로 연결되는지 자산회전율 확인');
  if (Number.isFinite(m.debtRatio) && m.debtRatio > 100) items.push('차입금 만기구조와 이자비용 부담 확인');
  if (Number.isFinite(m.current.investingCashFlow) && m.current.investingCashFlow < 0) items.push('투자현금 유출의 성격이 CAPEX인지 금융자산 취득인지 주석에서 확인');
  items.push('사업부문별 매출·영업이익과 주요 제품의 업황 확인');
  items.push('일회성 손익과 회계정책 변경 여부를 사업보고서 주석에서 확인');
  return [...new Set(items)].slice(0, 5);
}

function generateExecutiveSummary(m, score) {
  const s1 = Number.isFinite(m.revenueGrowth) && Number.isFinite(m.operatingGrowth)
    ? `외형은 전년 대비 매출 ${pct(m.revenueGrowth)}, 영업이익 ${pct(m.operatingGrowth)}의 변화를 보였습니다.`
    : '외형 성장성은 확보된 재무계정 범위에서 제한적으로 확인됩니다.';
  const s2 = Number.isFinite(m.debtRatio)
    ? `부채비율 ${pct(m.debtRatio)}와 유동비율 ${pct(m.currentRatio)}를 기준으로 재무안정성을 점검했습니다.`
    : '안정성 평가는 부채 및 유동성 계정의 추가 확인이 필요합니다.';
  const s3 = Number.isFinite(score.total)
    ? `종합 재무 건강도는 ${Math.round(score.total)}점(${score.grade})이며, 이는 일반 재무비율 구간에 따른 내부 비교용 결과입니다.`
    : '재무 건강도는 데이터 부족으로 산정하지 못했습니다.';
  return [s1, s2, s3];
}

function comparisonRow(company, years) {
  const m = calculateMetrics(years);
  return { company, metrics: m, score: calculateHealthScore(m) };
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' } },
  scales: { y: { ticks: { callback: (v) => money(v) } } },
};

export default function Home() {
  const [auditFinancialData,setAuditFinancialData,] = useState(null);
  const [auditPdf, setAuditPdf] = useState(null);
  const [step, setStep] = useState('search');
  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [years, setYears] = useState([]);
  const [baseYear, setBaseYear] = useState(new Date().getFullYear() - 1);
  const [analysisYear, setAnalysisYear] = useState(new Date().getFullYear() - 1);
  const [fsDiv, setFsDiv] = useState('CFS');
  const [reportCode, setReportCode] = useState('11011');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCompany, setReportCompany] = useState(null);
  const [availableReports, setAvailableReports] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [companyIndexReady, setCompanyIndexReady] = useState(false);
  const [error, setError] = useState('');
  const [peerQuery, setPeerQuery] = useState('');
  const [peerResults, setPeerResults] = useState([]);
  const [peers, setPeers] = useState([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [showDirectPdfUpload, setShowDirectPdfUpload] = useState(false);
  const marginChartRef = useRef(null);
  const stabilityChartRef = useRef(null);
  const growthChartRef = useRef(null);
  const cashChartRef = useRef(null);
  const analysisSource =
  auditFinancialData?.years?.length
    ? 'PDF'
    : 'DART';

const analysisYears = useMemo(() => {
  if (auditFinancialData?.years?.length) {
    return auditFinancialData.years;
  }

  return years;
}, [auditFinancialData, years]);
const analysisYearCount = analysisYears.length;

const analysisPeriodLabel =
  analysisYearCount >= 2
    ? `${analysisYearCount}개년`
    : '단일 연도';

const metrics = useMemo(
  () => calculateMetrics(analysisYears),
  [analysisYears]
);
  const insights = useMemo(() => generateInsights(metrics), [metrics]);
  const sectionComments = useMemo(() => generateSectionComments(metrics), [metrics]);
  const healthScore = useMemo(() => calculateHealthScore(metrics), [metrics]);
  const warnings = useMemo(() => generateWarnings(metrics), [metrics]);
  const checkpoints = useMemo(() => generateCheckpoints(metrics), [metrics]);
  const executiveSummary = useMemo(() => generateExecutiveSummary(metrics, healthScore), [metrics, healthScore]);


  useEffect(() => {
    let active = true;
    fetchJsonWithTimeout('/api/companies?warm=1', 25000)
      .then(() => { if (active) setCompanyIndexReady(true); })
      .catch(() => { if (active) setCompanyIndexReady(false); });
    return () => { active = false; };
  }, []);

  async function searchCompanies(e) {
    e?.preventDefault();
    
    // 이전 PDF 분석 상태 초기화
    setAuditPdf(null);
    setAuditFinancialData(null);

    setLoading(true);
    setError('');

   // 이하 기존 코드 그대로
    setLoading(true); setLoadingMessage(companyIndexReady ? '기업을 검색하고 있습니다.' : '최초 기업 목록을 준비하고 있습니다.'); setError('');
    try {
      const data = await fetchJsonWithTimeout(`/api/companies?q=${encodeURIComponent(query)}`, 25000);
      setCompanies(data.companies || []);
      setCompanyIndexReady(true);
      if (!(data.companies || []).length) setError('검색 결과가 없습니다. 정확한 기업명 또는 종목코드를 입력해 보세요.');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); setLoadingMessage(''); }
  }

  async function openReportSelector(company) {
    setReportCompany(company);
    setSelected(company);
    setReportModalOpen(true);
    setReportLoading(true);
    setAvailableReports([]);
    setError('');
    try {
      const data = await fetchJsonWithTimeout(
        `/api/reports?corpCode=${company.corpCode}&year=${baseYear}`,
        20000,
      );
      setAvailableReports(data.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setReportLoading(false);
    }
  }

  async function analyzeSelectedReport(report) {
    const company = reportCompany;
    if (!company) return;

    setReportCode(report.reportCode);
    setAnalysisYear(report.businessYear || baseYear);
    setReportModalOpen(false);
    setLoading(true);
    setLoadingMessage(`${report.label} 재무데이터를 불러오고 있습니다.`);
    setError('');

    try {
      const [info, fin] = await Promise.all([
        fetchJsonWithTimeout(`/api/company?corpCode=${company.corpCode}`, 20000),
        fetchJsonWithTimeout(
          `/api/financials?corpCode=${company.corpCode}&year=${report.businessYear || baseYear}&fsDiv=${fsDiv}&reportCode=${report.reportCode}`,
          30000,
        ),
      ]);
      setCompanyInfo(info.company);
      setYears(fin.years || []);
      setPeers([]);
      setStep('summary');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }
function analyzeAuditPdf(data) {
  if (!data?.years?.length) {
    setError('분석할 PDF 재무데이터가 없습니다.');
    return;
  }

  setAuditFinancialData(data);
  setYears(data.years);

  // 기업 검색 후 PDF 업로드한 경우
  if (reportCompany) {
    setSelected(reportCompany);
  }

  // 메인 화면에서 PDF를 바로 업로드한 경우
  else if (!selected && auditPdf) {
    const fileName = auditPdf.name
      .replace(/\.pdf$/i, '')
      .replace(/감사보고서.*$/i, '')
      .replace(/[\[\]()]/g, '')
      .trim();

    setSelected({
      corpName: fileName || 'PDF 업로드 기업',
      stockCode: '',
      corpCode: '',
    });

    setCompanyInfo(null);
  }

  setAvailableReports([]);
  setReportCode(null);
  setReportModalOpen(false);
  setShowDirectPdfUpload(false);

  setError('');
  setLoading(false);
  setReportLoading(false);

  setStep('summary');
}
  async function searchPeers(e) {
    e?.preventDefault();
    if (peerQuery.trim().length < 2) return;
    setPeerLoading(true);
    try {
      const res = await fetch(`/api/companies?q=${encodeURIComponent(peerQuery)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPeerResults((data.companies || []).filter((c) => c.corpCode !== selected?.corpCode).slice(0, 6));
    } catch (err) { setError(err.message); }
    finally { setPeerLoading(false); }
  }

  async function addPeer(company) {
    if (peers.some((p) => p.company.corpCode === company.corpCode) || peers.length >= 2) return;
    setPeerLoading(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/financials?corpCode=${company.corpCode}&year=${analysisYear}&fsDiv=${fsDiv}&reportCode=${reportCode}`, 30000);
      setPeers((prev) => [...prev, comparisonRow(company, data.years || [])]);
      setPeerQuery(''); setPeerResults([]);
    } catch (err) { setError(err.message); }
    finally { setPeerLoading(false); }
  }

  function removePeer(corpCode) { setPeers((prev) => prev.filter((p) => p.company.corpCode !== corpCode)); }


  const labels = years.map((y) => `${y.year} ${reportShortName(reportCode)}`);
  const incomeChart = {
    labels,
    datasets: [
      { label: '매출액', data: years.map((y) => y.revenue), borderColor: '#2457d6', backgroundColor: 'rgba(36,87,214,.12)', pointBackgroundColor: '#2457d6', borderWidth: 3, tension: 0.32, fill: false },
      { label: '영업이익', data: years.map((y) => y.operatingIncome), borderColor: '#12a594', backgroundColor: 'rgba(18,165,148,.12)', pointBackgroundColor: '#12a594', borderWidth: 3, tension: 0.32, fill: false },
      { label: '당기순이익', data: years.map((y) => y.netIncome), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.12)', pointBackgroundColor: '#f59e0b', borderWidth: 3, tension: 0.32, fill: false },
    ],
  };
  const marginChart = {
    labels,
    datasets: [
      { label: '영업이익률', data: years.map((y) => ratio(y.operatingIncome, y.revenue)), borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,.10)', pointBackgroundColor: '#7c3aed', borderWidth: 3, tension: 0.32 },
      { label: '순이익률', data: years.map((y) => ratio(y.netIncome, y.revenue)), borderColor: '#ec4899', backgroundColor: 'rgba(236,72,153,.10)', pointBackgroundColor: '#ec4899', borderWidth: 3, tension: 0.32 },
    ],
  };
  const stabilityChart = {
    labels: ['부채', '자본'],
    datasets: [{ data: [metrics.current.totalLiabilities || 0, metrics.current.totalEquity || 0], backgroundColor: ['#f97316', '#2457d6'], borderColor: ['#f97316', '#2457d6'], borderWidth: 1 }],
  };
  const cashChart = {
    labels: ['영업활동', '투자활동', '재무활동'],
    datasets: [{ label: '현금흐름', data: [metrics.current.operatingCashFlow, metrics.current.investingCashFlow, metrics.current.financingCashFlow], backgroundColor: ['#12a594', '#7c3aed', '#f59e0b'], borderRadius: 8 }],
  };

  function chartImage(ref) {
    try {
      return ref.current?.canvas?.toDataURL('image/png', 1) || '';
    } catch {
      return '';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function printReport() {
    const images = {
      profitability: chartImage(marginChartRef),
      stability: chartImage(stabilityChartRef),
      growth: chartImage(growthChartRef),
      cashflow: chartImage(cashChartRef),
    };

    const popup = window.open('', '_blank', 'width=1400,height=900');
    if (!popup) {
      setError('팝업이 차단되었습니다. Safari 주소창의 팝업 차단을 허용한 뒤 다시 시도해 주세요.');
      return;
    }

    const card = (title, tone, image, comment) => `
      <article class="analysis-card ${tone}">
        <h3>${escapeHtml(title)}</h3>
        <div class="card-body">
          <div class="chart-image">${image ? `<img src="${image}" alt="${escapeHtml(title)} 차트" />` : '<div class="chart-fallback">차트 이미지를 불러오지 못했습니다.</div>'}</div>
          <p>${escapeHtml(comment)}</p>
        </div>
      </article>`;

    const reportTitle =
  analysisSource === 'PDF'
    ? `${selected?.corpName || '기업'}_감사보고서_재무분석`
    : `${selected?.corpName || '기업'}_DART_재무분석`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(reportTitle)}</title>
<style>
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;width:297mm;height:210mm;overflow:hidden;background:#fff;color:#14213d;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif}
.sheet{width:297mm;height:210mm;padding:7mm;display:flex;flex-direction:column;overflow:hidden}
.header{height:18mm;display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.2px solid #14213d;padding:0 1mm 3mm;flex:none}
.eyebrow{font-size:7pt;letter-spacing:1.4px;color:#2457d6;font-weight:800}.header h1{font-size:19pt;letter-spacing:-1px;margin:1mm 0 0}.meta{text-align:right;display:flex;flex-direction:column;gap:1mm}.meta b{font-size:9pt}.meta span{font-size:7pt;color:#697386}.pdf-score{display:flex;align-items:baseline;justify-content:flex-end;gap:1.5mm;margin-bottom:.5mm}.pdf-score strong{font-size:15pt;color:#2457d6}.pdf-score small{font-size:6.5pt;color:#697386}
.kpis{height:23mm;display:grid;grid-template-columns:repeat(6,1fr);gap:2mm;padding:3mm 0;flex:none}.kpi{border-radius:3mm;padding:2.5mm 3mm;background:#f4f7ff;border:1px solid #dfe6fa;display:flex;flex-direction:column;justify-content:center}.kpi span{font-size:7pt;color:#697386}.kpi strong{font-size:12.5pt;margin-top:1mm}
.grid{height:124mm;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:2.5mm;flex:none}.analysis-card{border:1px solid #dfe3eb;border-radius:3mm;padding:2.5mm 3mm;display:flex;flex-direction:column;overflow:hidden;background:#fff}.analysis-card h3{font-size:9.5pt;margin:0 0 1.5mm;padding-bottom:1.5mm;border-bottom:2px solid #2457d6}.analysis-card.profitability h3{border-color:#7c3aed}.analysis-card.stability h3{border-color:#f97316}.analysis-card.growth h3{border-color:#2457d6}.analysis-card.cashflow h3{border-color:#12a594}.card-body{display:grid;grid-template-columns:46% 54%;gap:3mm;min-height:0;flex:1;align-items:center}.chart-image{height:47mm;display:flex;align-items:center;justify-content:center;overflow:hidden}.chart-image img{display:block;width:100%;height:100%;object-fit:contain}.chart-fallback{font-size:7pt;color:#94a3b8;text-align:center}.analysis-card p{font-size:6.65pt;line-height:1.48;margin:0;color:#3f4b62;text-align:justify;overflow:hidden}
.bottom{height:28.5mm;margin-top:2.5mm;border-radius:3mm;background:#14213d;color:#fff;padding:3mm 4mm;display:grid;grid-template-columns:1fr 62mm;gap:5mm;align-items:center;overflow:hidden;flex:none}.bottom h3{font-size:9pt;margin:0 0 1mm}.bottom p{font-size:6.8pt;line-height:1.45;margin:0}
.pdf-footer-info{
  display:flex;
  flex-direction:column;
  justify-content:center;
  gap:2mm;
  border-left:1px solid #51617d;
  padding-left:4mm;
}

.pdf-footer-info small{
  font-size:6.2pt;
  line-height:1.45;
  color:#cbd5e1;
  border-left:0;
  padding-left:0;
}

.pdf-footer-info span{
  font-size:6pt;
  color:#94a3b8;
  white-space:nowrap;
}
@media print{html,body,.sheet{width:297mm;height:210mm}.sheet{page-break-after:avoid;break-after:avoid-page}}
</style></head><body><main class="sheet">
<header class="header"><div><div class="eyebrow">DART FINANCIAL INSIGHT</div><h1>${escapeHtml(selected?.corpName)} 재무분석 보고서</h1></div><div class="meta"><div class="pdf-score"><strong>${Number.isFinite(healthScore.total) ? Math.round(healthScore.total) : '-'}점</strong><small>재무 건강도</small></div><b>${escapeHtml(metrics.current.year)} ${escapeHtml(reportName(reportCode))}</b><span>${fsDiv === 'CFS' ? '연결재무제표' : '별도재무제표'} · Open DART</span></div></header>
<section class="kpis">
${[['매출액',money(metrics.current.revenue)],['영업이익',money(metrics.current.operatingIncome)],['당기순이익',money(metrics.current.netIncome)],['자산총계',money(metrics.current.totalAssets)],['부채비율',pct(metrics.debtRatio)],['ROE',pct(metrics.roe)]].map(([l,v])=>`<div class="kpi"><span>${escapeHtml(l)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}
</section>
<section class="grid">
${card('수익성','profitability',images.profitability,sectionComments.profitability.join(' '))}
${card('안정성','stability',images.stability,sectionComments.stability.join(' '))}
${card('성장성','growth',images.growth,sectionComments.growth.join(' '))}
${card('현금흐름','cashflow',images.cashflow,sectionComments.cashflow.join(' '))}
</section>
<section class="bottom">
  <div>
    <h3>종합 의견</h3>
    <p>${escapeHtml(insights.join(' '))}</p>
  </div>

  <div class="pdf-footer-info">
    <small>
      자동 분석 결과는 투자 판단을 위한 단독 자료가 아니며,
      공시 원문과 주석을 함께 검토해야 합니다.
    </small>

    <span>
      Generated by DART Financial Insight · Made by Jubin Son
    </span>
  </div>
</section>
</main><script>
const imgs=[...document.images];Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r}))).then(()=>setTimeout(()=>{window.print()},250));
window.onafterprint=()=>window.close();
<\/script></body></html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  return (
    <main>
      <header className="topbar no-print">
        <div className="brand" onClick={() => setStep('search')}>DART Insight <small>made by Jubin Son</small></div>
        <div className="steps">
          <span className={step === 'search' ? 'active' : ''}>1 기업검색</span>
          <span className={step === 'summary' ? 'active' : ''}>2 기본요약</span>
          <span className={step === 'analysis' ? 'active' : ''}>3 핵심지표</span>
        </div>
      </header>

      {step === 'search' && (
        <section className="hero container">
          <div className="eyebrow">OPEN DART FINANCIAL ANALYSIS</div>
          <h1>공시 데이터를<br />의사결정 정보로 바꿉니다.</h1>
          <p>기업을 검색하고 사업·분기·반기보고서를 선택하면 재무제표 기본 요약과 핵심 재무지표를 자동 분석합니다.</p>
          <form className="searchbox" onSubmit={searchCompanies}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="기업명 또는 종목코드 입력 (예: 삼성전자, 005930)" />
            <button disabled={loading || query.trim().length < 2}>{loading ? '처리 중...' : '기업 검색'}</button>
          </form>
          <div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: '22px 0',
  }}
>
  <div
    style={{
      height: 1,
      flex: 1,
      background: '#e2e8f0',
    }}
  />

  <span
    style={{
      fontSize: 12,
      color: '#94a3b8',
      fontWeight: 600,
    }}
  >
    또는
  </span>

  <div
    style={{
      height: 1,
      flex: 1,
      background: '#e2e8f0',
    }}
  />
</div>

<button
  type="button"
  onClick={() => {
  if (!showDirectPdfUpload) {
    setAuditPdf(null);
    setAuditFinancialData(null);
  }

  setShowDirectPdfUpload((prev) => !prev);
}}
  style={{
    width: '100%',
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid #d7def0',
    background: '#ffffff',
    color: '#2457d6',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  }}
>
  {showDirectPdfUpload
    ? 'PDF 업로드 닫기'
    : '감사보고서 PDF 바로 업로드'}
</button>
{showDirectPdfUpload && (
  <PdfUpload
    selectedFile={auditPdf}
    onFileSelect={setAuditPdf}
    onExtractedData={setAuditFinancialData}
    onAnalyze={analyzeAuditPdf}
  />
)}
          <div className="filters">
            <label>공시연도 <input type="number" value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} /></label>
            <label>재무제표 <select value={fsDiv} onChange={(e) => setFsDiv(e.target.value)}><option value="CFS">연결</option><option value="OFS">별도</option></select></label>
          </div>
          <div className={`index-status ${companyIndexReady ? 'ready' : ''}`}>{companyIndexReady ? '기업 검색 준비 완료' : '기업 목록을 미리 준비하는 중입니다. 첫 검색만 조금 더 걸릴 수 있습니다.'}</div>
          {loading && loadingMessage && <div className="loading-status"><span className="spinner" />{loadingMessage}</div>}
          {error && <div className="error">{error}</div>}
          <div className="results">
            {companies.map((company) => (
              <button className="company-row" key={company.corpCode} onClick={() => openReportSelector(company)} disabled={loading}>
                <div><strong>{company.corpName}</strong><span>{company.stockCode || '비상장'} · DART {company.corpCode}</span></div>
                <span>보고서 선택 →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step !== 'search' && (
        <div className="container report">
          <section className="report-head">
            <div>
              <div className="eyebrow">FINANCIAL ANALYSIS REPORT</div>
              <h1>{selected?.corpName}</h1>
              <p>{metrics.current.year}년 {reportName(reportCode)} · {fsDiv === 'CFS' ? '연결재무제표' : '별도재무제표'} 기준 · 단위: 원</p>
            </div>
            <div className="company-meta">
              <span>종목코드 {selected?.stockCode || '-'}</span>
              <span>대표자 {companyInfo?.ceo_nm || '-'}</span>
              <span>결산월 {companyInfo?.acc_mt || '-'}</span>
            </div>
          </section>

          {step === 'summary' && (
            <>
              <section className="kpi-grid">
                {[
                  ['매출액', metrics.current.revenue, metrics.revenueGrowth],
                  ['영업이익', metrics.current.operatingIncome, metrics.operatingGrowth],
                  ['당기순이익', metrics.current.netIncome, metrics.netGrowth],
                  ['자산총계', metrics.current.totalAssets, metrics.assetGrowth],
                ].map(([label, value, change]) => (
                  <article className="kpi" key={label}><span>{label}</span><strong>{money(value)}</strong><em className={change >= 0 ? 'up' : 'down'}>{change == null ? '비교 불가' : `전년 대비 ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}</em></article>
                ))}
              </section>
              <section className="panel chart-panel"><h2>{analysisPeriodLabel} 손익 추세</h2><div className="chart"><Line data={incomeChart} options={chartOptions} /></div></section>
              <section className="panel"><h2>재무제표 기본 요약</h2>
              <div
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 18,
    padding: '8px 14px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    background:
      analysisSource === 'PDF'
        ? '#f3e8ff'
        : '#ecfdf5',
    color:
      analysisSource === 'PDF'
        ? '#7c3aed'
        : '#047857',
  }}
>
  {analysisSource === 'PDF'
    ? '📄 감사보고서 PDF 분석'
    : '🟢 DART 사업보고서 분석'}
</div>
              <div className="table-wrap"><table><thead><tr><th>항목</th>{years.map((y) => <th key={y.year}>{y.year}</th>)}<th>전년 대비</th></tr></thead><tbody>
                {[
                  ['매출액','revenue'],['영업이익','operatingIncome'],['당기순이익','netIncome'],['자산총계','totalAssets'],['부채총계','totalLiabilities'],['자본총계','totalEquity']
                ].map(([label,key]) => <tr key={key}><td>{label}</td>{years.map((y) => <td key={y.year}>{money(y[key])}</td>)}<td>{pct(growth(metrics.current[key], metrics.previous[key]))}</td></tr>)}
              </tbody></table></div></section>
              <section className="insight"><h2>기본 분석</h2>{insights.slice(0,3).map((line) => <p key={line}>{line}</p>)}</section>
              <div className="actions no-print">
                <button
                 className="secondary"
                 onClick={() => {
                  setAuditPdf(null);
                  setAuditFinancialData(null);
                  setYears([]);
                  setSelected(null);
                  setCompanyInfo(null);
                  setStep('search');
                 }}
                >
                 다른 기업 검색
                </button>
                <button onClick={() => setStep('analysis')}>핵심 분석지표 보기 →</button></div>
            </>
          )}

          {step === 'analysis' && (
            <>
              <section className="health-score-panel">
                <div className="health-score-main">
                  <div className="score-gauge" style={{'--score': Number.isFinite(healthScore.total) ? healthScore.total : 0}}>
                    <div><strong>{Number.isFinite(healthScore.total) ? Math.round(healthScore.total) : '-'}</strong><span>/ 100</span></div>
                  </div>
                  <div className="score-summary">
                    <div className="eyebrow">FINANCIAL HEALTH SCORE</div>
                    <h2>재무 건강도 <em>{healthScore.grade}</em></h2>
                    <p>수익성·안정성·성장성·현금흐름을 각각 25점으로 환산한 내부 비교용 지표입니다. 확보되지 않은 계정은 0점 처리하지 않고, 확인 가능한 지표끼리 재가중했습니다.</p>
                    <small>데이터 충족률 {healthScore.coverage.toFixed(0)}% · 투자등급 또는 신용등급이 아닙니다.</small>
                  </div>
                </div>
                <div className="score-breakdown">
                  {healthScore.sections.map((section) => (
                    <article key={section.key}>
                      <div><span>{section.label}</span><strong>{Number.isFinite(section.score) ? section.score.toFixed(1) : '-'}<small>/25</small></strong></div>
                      <div className="score-track"><i style={{width: `${Number.isFinite(section.score) ? section.score / 25 * 100 : 0}%`, background: section.color}} /></div>
                      <p>{section.available}/{section.total}개 지표 반영</p>
                    </article>
                  ))}
                </div>
                <details className="score-method"><summary>점수 산식 보기</summary><p>수익성은 영업이익률·순이익률·ROE, 안정성은 부채비율·유동비율·자기자본비율, 성장성은 매출·영업이익·총자산 증가율, 현금흐름은 영업현금흐름·현금전환율·잉여현금흐름을 사용합니다. 기준값은 업종 평균이 아닌 일반적인 재무분석 구간이므로 기업 간 비교 시 동일 업종과 동일 기간을 함께 확인해야 합니다.</p></details>
              </section>

              <section className="decision-dashboard">
                <article className="executive-card">
                  <div className="eyebrow">EXECUTIVE SUMMARY</div><h2>3줄 핵심 요약</h2>
                  {executiveSummary.map((line) => <p key={line}>{line}</p>)}
                </article>
                <article className="warning-card"><div className="eyebrow">RISK SIGNALS</div><h2>위험 신호</h2><div className="warning-list">
                  {warnings.map((item) => <div className={`warning-item ${item.level}`} key={item.title}><span>{item.level === 'good' ? '✓' : '!'}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}
                </div></article>
                <article className="checkpoint-card"><div className="eyebrow">NEXT CHECKPOINTS</div><h2>추가 확인 항목</h2><ol>{checkpoints.map((item) => <li key={item}>{item}</li>)}</ol></article>
              </section>

              <section className="peer-panel">
                <div className="peer-head"><div><div className="eyebrow">PEER COMPARISON</div><h2>비교기업 분석</h2><p>DART에서 비교기업을 최대 2개 선택해 동일 기준연도의 핵심지표와 건강도를 비교합니다.</p></div></div>
                <form className="peer-search" onSubmit={searchPeers}><input value={peerQuery} onChange={(e) => setPeerQuery(e.target.value)} placeholder="비교기업 검색"/><button disabled={peerLoading || peerQuery.trim().length < 2}>{peerLoading ? '조회 중' : '검색'}</button></form>
                {peerResults.length > 0 && <div className="peer-results">{peerResults.map((c) => <button key={c.corpCode} onClick={() => addPeer(c)} disabled={peers.length >= 2}><strong>{c.corpName}</strong><span>{c.stockCode || '비상장'} · 추가</span></button>)}</div>}
                <div className="peer-table-wrap"><table className="peer-table"><thead><tr><th>기업</th><th>건강도</th><th>영업이익률</th><th>ROE</th><th>부채비율</th><th>매출증가율</th><th></th></tr></thead><tbody>
                  <tr className="primary-company"><td>{selected?.corpName}</td><td>{Number.isFinite(healthScore.total) ? Math.round(healthScore.total) : '-'}</td><td>{pct(metrics.operatingMargin)}</td><td>{pct(metrics.roe)}</td><td>{pct(metrics.debtRatio)}</td><td>{pct(metrics.revenueGrowth)}</td><td>분석대상</td></tr>
                  {peers.map((peer) => <tr key={peer.company.corpCode}><td>{peer.company.corpName}</td><td>{Number.isFinite(peer.score.total) ? Math.round(peer.score.total) : '-'}</td><td>{pct(peer.metrics.operatingMargin)}</td><td>{pct(peer.metrics.roe)}</td><td>{pct(peer.metrics.debtRatio)}</td><td>{pct(peer.metrics.revenueGrowth)}</td><td><button className="remove-peer" onClick={() => removePeer(peer.company.corpCode)}>삭제</button></td></tr>)}
                </tbody></table></div>
                <p className="peer-note">※ 이는 사용자가 선택한 비교기업 평균이며 공식 업종 평균이 아닙니다. 동일 업종·결산월·연결 기준 여부를 확인해야 합니다.</p>
              </section>

              <section className="metric-section"><div className="section-title"><span>01</span><div><h2>수익성 분석</h2><p>매출이 실제 이익으로 전환되는 수준과 자산·자본 활용 효율을 확인합니다.</p></div></div>
                <div className="analysis-grid"><div className="metric-cards">{[['영업이익률',metrics.operatingMargin],['순이익률',metrics.netMargin],['ROA',metrics.roa],['ROE',metrics.roe]].map(([l,v])=><article className="mini" key={l}><span>{l}</span><strong>{pct(v)}</strong></article>)}</div><div className="panel chart-panel"><h3>이익률 추세</h3><div className="chart small"><Line ref={marginChartRef} data={marginChart} options={{...chartOptions, scales:{y:{ticks:{callback:(v)=>`${v}%`}}}}} /></div></div></div><div className="section-comment profitability-comment"><strong>분석 코멘트</strong><p>{sectionComments.profitability.join(' ')}</p></div>
              </section>

              <section className="metric-section"><div className="section-title"><span>02</span><div><h2>안정성 분석</h2><p>부채 부담과 단기 지급능력, 자기자본 구성비를 확인합니다.</p></div></div>
                <div className="analysis-grid"><div className="metric-cards">{[['부채비율',metrics.debtRatio],['유동비율',metrics.currentRatio],['자기자본비율',metrics.equityRatio]].map(([l,v])=><article className="mini" key={l}><span>{l}</span><strong>{pct(v)}</strong></article>)}</div><div className="panel chart-panel"><h3>자본구조 구성</h3><div className="chart small doughnut"><Doughnut ref={stabilityChartRef} data={stabilityChart} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}} /></div></div></div><div className="section-comment stability-comment"><strong>분석 코멘트</strong><p>{sectionComments.stability.join(' ')}</p></div>
              </section>

              <section className="metric-section"><div className="section-title"><span>03</span><div><h2>성장성 분석</h2><p>전년 대비 외형과 이익, 자산의 증감 속도를 비교합니다.</p></div></div>
                <div className="panel chart-panel"><div className="chart small"><Bar ref={growthChartRef} data={{labels:['매출액','영업이익','당기순이익','총자산'],datasets:[{label:'전년 대비 증감률',data:[metrics.revenueGrowth,metrics.operatingGrowth,metrics.netGrowth,metrics.assetGrowth],backgroundColor:['#2457d6','#12a594','#f59e0b','#7c3aed'],borderRadius:8}]}} options={{...chartOptions,scales:{y:{ticks:{callback:(v)=>`${v}%`}}}}} /></div></div><div className="section-comment growth-comment"><strong>분석 코멘트</strong><p>{sectionComments.growth.join(' ')}</p></div>
              </section>

              <section className="metric-section"><div className="section-title"><span>04</span><div><h2>현금흐름 분석</h2><p>영업에서 창출한 현금과 투자·재무활동의 현금 방향을 확인합니다.</p></div></div>
                <div className="analysis-grid"><div className="metric-cards">{[['영업현금흐름',money(metrics.current.operatingCashFlow)],['현금전환율',pct(metrics.cashConversion)],['추정 잉여현금흐름',money(metrics.freeCashFlow)]].map(([l,v])=><article className="mini" key={l}><span>{l}</span><strong>{v}</strong></article>)}</div><div className="panel chart-panel"><h3>활동별 현금흐름</h3><div className="chart small"><Bar ref={cashChartRef} data={cashChart} options={chartOptions} /></div></div></div><div className="section-comment cash-comment"><strong>분석 코멘트</strong><p>{sectionComments.cashflow.join(' ')}</p></div>
              </section>

              <section className="insight final screen-only"><h2>종합 재무분석</h2>{insights.map((line) => <p key={line}>{line}</p>)}<div className="notice">본 분석은 DART 공시 재무계정을 기반으로 한 자동 분석이며, 기업가치나 투자 적합성을 단독으로 판단하는 자료가 아닙니다. 계정 누락 가능성과 산업별 차이를 고려해 공시 주석 및 사업보고서 원문을 함께 확인해야 합니다.</div></section>

              <div className="actions no-print"><button className="secondary" onClick={() => setStep('summary')}>← 기본 요약</button><button onClick={printReport}>PDF 분석보고서 저장</button></div>
            </>
          )}
        </div>
      )}
      {reportModalOpen && (
        <div className="modal-backdrop no-print" role="presentation" onMouseDown={() => setReportModalOpen(false)}>
          <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setReportModalOpen(false)} aria-label="닫기">×</button>
            <div className="eyebrow">AVAILABLE DART REPORTS</div>
            <h2 id="report-modal-title">{reportCompany?.corpName} · {baseYear}년 보고서</h2>
            <p className="modal-description">DART에 실제 제출된 정기보고서만 표시합니다. 분석할 보고서를 선택하세요.</p>

            <div className="modal-settings">
              <span>{fsDiv === 'CFS' ? '연결재무제표 기준' : '별도재무제표 기준'}</span>
              <span>공시연도 {baseYear}</span>
            </div>

            {reportLoading && <div className="modal-loading"><span className="spinner" /> 제출 보고서를 확인하고 있습니다.</div>}

            {!reportLoading && availableReports.length === 0 && (
              <div className="empty-reports">
                <strong>선택한 연도에 분석 가능한 정기보고서가 없습니다.</strong>
                <p>기준연도를 변경하거나 별도재무제표로 다시 시도해 주세요.</p>

                <PdfUpload
  selectedFile={auditPdf}
  onFileSelect={setAuditPdf}
  onExtractedData={setAuditFinancialData}
  onAnalyze={analyzeAuditPdf}
/>
              </div>
            )}

            {!reportLoading && availableReports.length > 0 && (
              <div className="report-list">
                {availableReports.map((report) => (
                  <button key={`${report.rceptNo}-${report.reportCode}`} type="button" onClick={() => analyzeSelectedReport(report)}>
                    <div>
                      <strong>{report.label}</strong>
                      <span>{report.reportName}</span>
                    </div>
                    <div className="report-date">
                      <b>{report.rceptDateFormatted}</b>
                      <span>분석하기 →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="no-print">Portfolio project · Data source: Open DART · made by Jubin Son</footer>
    </main>
  );
}