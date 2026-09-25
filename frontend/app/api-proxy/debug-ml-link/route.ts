import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sku = request.nextUrl.searchParams.get('sku') || '';
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/$/, '');

    const response = await fetch(`${backendUrl}/bling/debug-ml-link?sku=${encodeURIComponent(sku)}`, {
      method: 'GET',
      headers: { cookie: request.headers.get('cookie') || '' },
      cache: 'no-store',
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';

    return new NextResponse(text, {
      status: response.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: `[api-proxy/debug-ml-link] ${error?.message || 'Erro ao consultar debug-ml-link'}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
