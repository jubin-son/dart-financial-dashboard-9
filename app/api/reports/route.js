export const dynamic = 'force-dynamic';

const REPORT_ORDER = {
  '11013': 1,
  '11012': 2,
  '11014': 3,
  '11011': 4,
};

function getReportCode(reportName) {
  const normalized = String(reportName || '').replace(/\s/g, '');

  if (normalized.includes('사업보고서')) return '11011';
  if (normalized.includes('반기보고서')) return '11012';

  if (normalized.includes('분기보고서')) {
    const periodMatch = normalized.match(/\((\d{4})\.(\d{2})\)/);
    const month = periodMatch?.[2];

    if (month === '03') return '11013';
    if (month === '09') return '11014';

    if (normalized.includes('1분기')) return '11013';
    if (normalized.includes('3분기')) return '11014';
  }

  return null;
}

function getLabel(reportCode) {
  return {
    '11011': '사업보고서',
    '11012': '반기보고서',
    '11013': '1분기보고서',
    '11014': '3분기보고서',
  }[reportCode] || '정기보고서';
}

function getBusinessYear(reportName, fallbackYear) {
  const normalized = String(reportName || '');
  const periodMatch = normalized.match(/\((\d{4})\.(\d{2})\)/);
  return periodMatch ? Number(periodMatch[1]) : Number(fallbackYear);
}

function formatDate(value) {
  const text = String(value || '');
  if (!/^\d{8}$/.test(text)) return text || '-';
  return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)}`;
}

export async function GET(request) {
  try {
    const apiKey = process.env.DART_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'DART_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const params = new URL(request.url).searchParams;
    const corpCode = params.get('corpCode');
    const year = Number(params.get('year'));

    if (!corpCode) {
      return Response.json({ error: '기업 고유번호가 필요합니다.' }, { status: 400 });
    }

    if (!Number.isInteger(year) || year < 2015 || year > 2100) {
      return Response.json({ error: '올바른 기준연도가 필요합니다.' }, { status: 400 });
    }

    const url = new URL('https://opendart.fss.or.kr/api/list.json');
    url.searchParams.set('crtfc_key', apiKey);
    url.searchParams.set('corp_code', corpCode);
    url.searchParams.set('bgn_de', `${year}0101`);
    url.searchParams.set('end_de', `${year}1231`);
    url.searchParams.set('last_reprt_at', 'Y');
    url.searchParams.set('pblntf_ty', 'A');
    url.searchParams.set('sort', 'date');
    url.searchParams.set('sort_mth', 'desc');
    url.searchParams.set('page_count', '100');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let data;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        next: { revalidate: 3600 },
      });
      data = await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('DART 보고서 목록 조회가 15초를 초과했습니다.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (data.status === '013') {
      return Response.json({ reports: [] });
    }

    if (data.status !== '000') {
      throw new Error(data.message || `보고서 목록 조회 실패: ${data.status}`);
    }

    const seen = new Set();
    const reports = (data.list || [])
      .map((item) => {
        const reportCode = getReportCode(item.report_nm);
        if (!reportCode) return null;
        if (String(item.rm || '').includes('철')) return null;

        return {
          reportCode,
          label: getLabel(reportCode),
          reportName: item.report_nm,
          rceptNo: item.rcept_no,
          rceptDate: item.rcept_dt,
          rceptDateFormatted: formatDate(item.rcept_dt),
          businessYear: getBusinessYear(item.report_nm, year),
        };
      })
      .filter(Boolean)
      .filter((item) => {
        if (seen.has(item.reportCode)) return false;
        seen.add(item.reportCode);
        return true;
      })
      .sort((a, b) => REPORT_ORDER[a.reportCode] - REPORT_ORDER[b.reportCode]);

    return Response.json(
      { reports },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    return Response.json({ error: error.message || '보고서 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}
