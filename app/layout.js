import './globals.css';

export const metadata = {
  title: 'DART 재무분석 대시보드',
  description: 'Open DART API 기반 기업 재무제표 분석 포트폴리오',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
