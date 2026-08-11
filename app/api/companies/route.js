import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

let companyCache = null;

function normalizeText(value) {
  return String(value ?? '').replace(/\s/g, '').toLowerCase();
}

async function loadCompanies() {
  if (companyCache) return companyCache;

  const filePath = path.join(process.cwd(), 'data', 'companies.json');
  try {
    const json = await fs.readFile(filePath, 'utf8');
    companyCache = JSON.parse(json);
    return companyCache;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('data/companies.json이 없습니다. npm run build:companies를 먼저 실행해 주세요.');
    }
    throw error;
  }
}

export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (query.length < 2) return Response.json({ companies: [] });

    const companies = await loadCompanies();
    const normalizedQuery = normalizeText(query);
    const results = companies
      .filter((company) => normalizeText(company.corpName).includes(normalizedQuery) || company.stockCode === query)
      .sort((a, b) => {
        const aExact = normalizeText(a.corpName) === normalizedQuery || a.stockCode === query ? 0 : 1;
        const bExact = normalizeText(b.corpName) === normalizedQuery || b.stockCode === query ? 0 : 1;
        const aListed = a.stockCode ? 0 : 1;
        const bListed = b.stockCode ? 0 : 1;
        return aExact - bExact || aListed - bListed || a.corpName.localeCompare(b.corpName, 'ko-KR');
      })
      .slice(0, 20);

    return Response.json({ companies: results });
  } catch (error) {
    return Response.json({ error: error.message || '기업 검색에 실패했습니다.' }, { status: 500 });
  }
}
