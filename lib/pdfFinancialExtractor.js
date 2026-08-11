function parseAmount(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (
    text === '-' ||
    text === '–' ||
    text === '—'
  ) {
    return null;
  }

  const negative =
    text.startsWith('(') &&
    text.endsWith(')');

  const cleaned = text
    .replace(/[(),]/g, '')
    .replace(/[^\d.-]/g, '');

  const number = Number(cleaned);

  if (!Number.isFinite(number)) {
    return null;
  }

  return negative
    ? -Math.abs(number)
    : number;
}


/*
  계정명 뒤에 등장하는 큰 숫자 2개를 찾습니다.

  예:
  매출액(주석2,9)
  154,903,877,193 160,009,514,490

  → current  = 154,903,877,193
  → previous = 160,009,514,490
*/
function findFinancialPair(text, aliases) {
  const source = String(text)
    .replace(/\s+/g, ' ')
    .trim();

  for (const alias of aliases) {
    const index = source.indexOf(alias);

    if (index === -1) {
      continue;
    }

    // 계정명 뒤 약 250자만 확인
    const nearby = source.slice(
      index + alias.length,
      index + alias.length + 250
    );

    const matches =
      nearby.match(
        /\(?-?\d{1,3}(?:,\d{3})+\)?/g
      ) || [];

    const numbers = matches
      .map(parseAmount)
      .filter(Number.isFinite);

    if (numbers.length >= 2) {
      return {
        current: numbers[0],
        previous: numbers[1],
        source: `${alias} ${nearby.slice(
          0,
          150
        )}`,
      };
    }
  }

  return {
    current: null,
    previous: null,
    source: null,
  };
}


function detectYears(text) {
  const source = String(text);

  const matches =
    source.match(/20\d{2}/g) || [];

  const years = [
    ...new Set(
      matches.map(Number)
    ),
  ]
    .filter(
      (year) =>
        year >= 2000 &&
        year <= 2100
    )
    .sort((a, b) => b - a);

  return {
    current: years[0] ?? null,
    previous: years[1] ?? null,
  };
}


export function extractFinancialData(text) {
  const years = detectYears(text);

  const fields = {
    revenue: findFinancialPair(
      text,
      [
        '매출액',
        '수익(매출액)',
        '영업수익',
      ]
    ),

    operatingIncome:
      findFinancialPair(
        text,
        [
          '영업이익',
          '영업이익(손실)',
          '영업손익',
        ]
      ),

    netIncome: findFinancialPair(
      text,
      [
        '당기순이익',
        '당기순이익(손실)',
      ]
    ),

    currentAssets:
      findFinancialPair(
        text,
        ['유동자산']
      ),

    totalAssets:
      findFinancialPair(
        text,
        ['자산총계']
      ),

    currentLiabilities:
      findFinancialPair(
        text,
        ['유동부채']
      ),

    totalLiabilities:
      findFinancialPair(
        text,
        ['부채총계']
      ),

    totalEquity:
      findFinancialPair(
        text,
        ['자본총계']
      ),

    operatingCashFlow:
      findFinancialPair(
        text,
        [
          '영업활동으로 인한 현금흐름',
          '영업활동현금흐름',
        ]
      ),

    investingCashFlow:
      findFinancialPair(
        text,
        [
          '투자활동으로 인한 현금흐름',
          '투자활동현금흐름',
        ]
      ),

    financingCashFlow:
      findFinancialPair(
        text,
        [
          '재무활동으로 인한 현금흐름',
          '재무활동현금흐름',
        ]
      ),
  };


  function makeYear(side, year) {
    return {
      year,

      revenue:
        fields.revenue[side],

      operatingIncome:
        fields.operatingIncome[
          side
        ],

      netIncome:
        fields.netIncome[side],

      currentAssets:
        fields.currentAssets[
          side
        ],

      totalAssets:
        fields.totalAssets[side],

      currentLiabilities:
        fields.currentLiabilities[
          side
        ],

      totalLiabilities:
        fields.totalLiabilities[
          side
        ],

      totalEquity:
        fields.totalEquity[side],

      operatingCashFlow:
        fields.operatingCashFlow[
          side
        ],

      investingCashFlow:
        fields.investingCashFlow[
          side
        ],

      financingCashFlow:
        fields.financingCashFlow[
          side
        ],

      capex: null,
    };
  }


  const current = makeYear(
    'current',
    years.current
  );

  const previous = makeYear(
    'previous',
    years.previous
  );


  const requiredKeys = [
    'revenue',
    'operatingIncome',
    'netIncome',
    'totalAssets',
    'totalLiabilities',
    'totalEquity',
  ];

  const detected =
    requiredKeys.filter(
      (key) =>
        Number.isFinite(
          current[key]
        )
    ).length;


  return {
    success: detected > 0,

    coverage:
      (detected /
        requiredKeys.length) *
      100,

    current,
    previous,

    years: [
      previous,
      current,
    ],

    sources: fields,
  };
}