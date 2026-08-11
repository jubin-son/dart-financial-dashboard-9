# DART Financial Insight v9

Open DART API를 이용해 기업을 검색하고, 실제 제출된 정기보고서를 선택한 뒤 재무제표를 자동 분석하는 포트폴리오 프로젝트입니다.

## v9.5

* ✅ DART에 정기보고서가 없는 기업 대응
* ✅ 감사보고서 PDF 업로드
* ✅ 브라우저에서 PDF 읽기
* ✅ 재무제표 핵심 계정 자동 추출
* ✅ 추출 결과 표 출력

## v9.0

* ✅ DART 기업 검색
* ✅ 기업 선택
* ✅ 보고서(사업/반기/분기) 선택
* ✅ 재무제표 분석
* ✅ 건강도 Score
* ✅ PDF 저장

## v8 주요 흐름

1. 기업명 또는 종목코드 검색
2. 검색 결과에서 기업 선택
3. 선택한 기준연도에 실제 제출된 사업·1분기·반기·3분기보고서 목록 표시
4. 보고서 선택 후 재무제표 기본 요약
5. 핵심 재무지표·건강도·위험 신호·비교기업 분석
6. A4 가로형 PDF 보고서 저장

## 환경변수

`.env.local` 파일에 아래 값을 등록합니다.

```env
DART_API_KEY=발급받은_오픈다트_API키
```

## 실행

```bash
npm install
npm run dev
```

## 배포

GitHub에 Push하면 연결된 Vercel 프로젝트가 자동 재배포됩니다. Vercel 환경변수에도 `DART_API_KEY`를 등록해야 합니다.

Data source: Open DART  
Made by Jubin Son
