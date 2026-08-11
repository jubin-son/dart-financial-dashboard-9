import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

const apiKey = process.env.DART_API_KEY;
if (!apiKey) throw new Error('DART_API_KEY가 없습니다.');

const url = new URL('https://opendart.fss.or.kr/api/corpCode.xml');
url.searchParams.set('crtfc_key', apiKey);

console.log('DART 기업목록 다운로드 중...');
const response = await fetch(url);
if (!response.ok) throw new Error(`기업목록 다운로드 실패: HTTP ${response.status}`);

const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
const entry = zip.getEntry('CORPCODE.xml');
if (!entry) throw new Error('CORPCODE.xml을 찾지 못했습니다.');

const xml = entry.getData().toString('utf8').replace(/^\uFEFF/, '');
const parser = new XMLParser({ parseTagValue: false, trimValues: true });
const parsed = parser.parse(xml);
const rawRows = parsed?.result?.list ?? [];
const rows = Array.isArray(rawRows) ? rawRows : [rawRows];

const companies = rows.map((row) => {
  const rawStockCode = String(row.stock_code ?? '').trim();
  return {
    corpCode: String(row.corp_code ?? '').trim().padStart(8, '0'),
    corpName: String(row.corp_name ?? '').trim(),
    stockCode: rawStockCode ? rawStockCode.padStart(6, '0') : '',
    modifyDate: String(row.modify_date ?? '').trim(),
  };
}).filter((company) => company.corpCode && company.corpName);

const outputDir = path.join(process.cwd(), 'data');
await fs.mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'companies.json');
await fs.writeFile(outputPath, JSON.stringify(companies), 'utf8');
console.log(`완료: ${companies.length.toLocaleString()}개 기업 → ${outputPath}`);
