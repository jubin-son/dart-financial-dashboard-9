export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const apiKey = process.env.DART_API_KEY;
    const corpCode = new URL(request.url).searchParams.get('corpCode');
    if (!apiKey) return Response.json({ error: 'DART_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    if (!corpCode) return Response.json({ error: '기업 고유번호가 필요합니다.' }, { status: 400 });

    const url = new URL('https://opendart.fss.or.kr/api/company.json');
    url.searchParams.set('crtfc_key', apiKey);
    url.searchParams.set('corp_code', corpCode);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        next: { revalidate: 86400 },
      });
      const data = await response.json();
      if (data.status !== '000') throw new Error(data.message || '기업개황 조회에 실패했습니다.');
      return Response.json(
        { company: data },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return Response.json({ error: '기업개황 조회가 12초를 초과했습니다.' }, { status: 504 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}
