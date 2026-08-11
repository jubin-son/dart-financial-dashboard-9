export const dynamic = 'force-dynamic';

const REPORTS = {
  '11011': { label: '사업보고서', shortLabel: '연간' },
  '11012': { label: '반기보고서', shortLabel: '반기' },
  '11013': { label: '1분기보고서', shortLabel: '1분기' },
  '11014': { label: '3분기보고서', shortLabel: '3분기' },
};

const ACCOUNT_ALIASES = {
  revenue: ['매출액', '수익(매출액)', '영업수익', '수익'],
  operatingIncome: ['영업이익', '영업이익(손실)', '영업손익'],
  netIncome: ['당기순이익', '당기순이익(손실)', '연결당기순이익', '분기순이익', '반기순이익'],
  totalAssets: ['자산총계'],
  currentAssets: ['유동자산'],
  totalLiabilities: ['부채총계'],
  currentLiabilities: ['유동부채'],
  totalEquity: ['자본총계'],
  operatingCashFlow: ['영업활동현금흐름', '영업활동으로 인한 현금흐름'],
  investingCashFlow: ['투자활동현금흐름', '투자활동으로 인한 현금흐름'],
  financingCashFlow: ['재무활동현금흐름', '재무활동으로 인한 현금흐름'],
  capex: ['유형자산의 취득', '유형자산 취득'],
};

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).replace(/,/g, '').replace(/^\((.*)\)$/, '-$1').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function findAccount(rows, aliases) {
  for (const alias of aliases) {
    const exact = rows.find((r) => String(r.account_nm).replace(/\s/g, '') === alias.replace(/\s/g, ''));
    if (exact) return exact;
  }
  for (const alias of aliases) {
    const partial = rows.find((r) => String(r.account_nm).replace(/\s/g, '').includes(alias.replace(/\s/g, '')));
    if (partial) return partial;
  }
  return null;
}

function normalizeYear(rows, year, reportCode) {
  const result = { year: Number(year), reportCode };
  for (const [key, aliases] of Object.entries(ACCOUNT_ALIASES)) {
    const row = findAccount(rows, aliases);
    result[key] = row ? parseAmount(row.thstrm_amount || row.thstrm_add_amount) : null;
  }
  return result;
}

async function fetchYear(apiKey, corpCode, year, fsDiv, reportCode) {
  const url = new URL('https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json');
  url.searchParams.set('crtfc_key', apiKey);
  url.searchParams.set('corp_code', corpCode);
  url.searchParams.set('bsns_year', String(year));
  url.searchParams.set('reprt_code', reportCode);
  url.searchParams.set('fs_div', fsDiv);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 21600 },
    });
    const data = await response.json();
    if (data.status === '013') return null;
    if (data.status !== '000') throw new Error(`${year}년 ${REPORTS[reportCode].label} 조회 실패: ${data.message || data.status}`);
    return normalizeYear(data.list || [], year, reportCode);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${year}년 재무제표 조회가 15초를 초과했습니다.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  try {
    const apiKey = process.env.DART_API_KEY;
    if (!apiKey) return Response.json({ error: 'DART_API_KEY가 설정되지 않았습니다.' }, { status: 500 });

    const params = new URL(request.url).searchParams;
    const corpCode = params.get('corpCode');
    const requestedYear = Number(params.get('year')) || new Date().getFullYear() - 1;
    const fsDiv = params.get('fsDiv') === 'OFS' ? 'OFS' : 'CFS';
    const reportCode = REPORTS[params.get('reportCode')] ? params.get('reportCode') : '11011';
    if (!corpCode) return Response.json({ error: '기업 고유번호가 필요합니다.' }, { status: 400 });

    // 같은 보고서 유형의 최근 3개년을 병렬로 조회합니다.
    const targetYears = [requestedYear, requestedYear - 1, requestedYear - 2];
    let years = (await Promise.all(
      targetYears.map((year) => fetchYear(apiKey, corpCode, year, fsDiv, reportCode)),
    )).filter(Boolean);

    // 선택연도에 자료가 없을 때만 한 해를 추가 조회합니다.
    if (years.length < 2) {
      const fallback = await fetchYear(apiKey, corpCode, requestedYear - 3, fsDiv, reportCode);
      if (fallback) years.push(fallback);
    }

    if (!years.length) {
      throw new Error(`조회 가능한 ${REPORTS[reportCode].label} 재무제표가 없습니다. 기준연도 또는 재무제표 유형을 변경해 보세요.`);
    }

    years.sort((a, b) => a.year - b.year);
    return Response.json(
      {
        years,
        fsDiv,
        reportCode,
        reportLabel: REPORTS[reportCode].label,
        reportShortLabel: REPORTS[reportCode].shortLabel,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
