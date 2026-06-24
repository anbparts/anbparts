const SP_TZ = 'America/Sao_Paulo';

const spTimeFmt = new Intl.DateTimeFormat('en', {
  timeZone: SP_TZ,
  hour: 'numeric', minute: 'numeric', second: 'numeric',
  hourCycle: 'h23', // forca 0-23: evita "24" pra meia-noite (quirk que variava por ambiente e quebrava o spDayStart)
});

// Retorna o UTC Date correspondente a 00:00:00 no fuso de São Paulo para a data informada (YYYY-MM-DD)
export function spDayStart(dateStr: string): Date {
  // Estima midnight SP como UTC+3h (pior caso), depois corrige usando Intl
  const candidate = new Date(`${dateStr}T03:00:00.000Z`);
  const parts = spTimeFmt.formatToParts(candidate);
  const h = parseInt(parts.find(p => p.type === 'hour')!.value) % 24; // % 24: se algum ambiente retornar "24" (meia-noite), vira 0
  const m = parseInt(parts.find(p => p.type === 'minute')!.value);
  const s = parseInt(parts.find(p => p.type === 'second')!.value);
  return new Date(candidate.getTime() - (h * 3600 + m * 60 + s) * 1000);
}

// Retorna o UTC Date correspondente a 23:59:59.999 no fuso de São Paulo para a data informada (YYYY-MM-DD)
export function spDayEnd(dateStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextStr = nextDate.toISOString().slice(0, 10);
  return new Date(spDayStart(nextStr).getTime() - 1);
}

// Retorna YYYY-MM-DD no fuso de São Paulo para um Date
export function spDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ }).format(date);
}
