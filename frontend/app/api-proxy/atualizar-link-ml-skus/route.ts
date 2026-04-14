import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 280_000);

    let response: Response;
    try {
      response = await fetch(`${backendUrl}/bling/atualizar-link-ml-skus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: payload,
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';

    return new NextResponse(text, {
      status: response.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: `[api-proxy/atualizar-link-ml-skus] ${error?.message || 'Erro ao atualizar links ML'}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
