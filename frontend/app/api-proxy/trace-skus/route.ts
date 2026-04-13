import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/$/, '');

    const response = await fetch(`${backendUrl}/bling/auditoria-automatica/trace-skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: payload,
      cache: 'no-store',
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';

    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: `[api-proxy/trace-skus] ${error?.message || 'Erro ao encaminhar trace de SKUs'}`,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
