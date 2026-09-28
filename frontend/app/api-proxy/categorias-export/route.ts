import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333').replace(/\/$/, '');

    const response = await fetch(`${backendUrl}/bling/categorias-export`, {
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
      { ok: false, error: `[api-proxy/categorias-export] ${error?.message || 'Erro ao exportar categorias'}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
