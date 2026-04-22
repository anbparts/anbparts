export const detranShell: any = {
  topbar: {
    height: 'var(--topbar-h)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'var(--white)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  },
  title: {
    fontFamily: 'Fraunces, serif',
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: '-0.3px',
  },
  sub: {
    fontSize: 12,
    color: 'var(--ink-muted)',
    marginTop: 2,
  },
  card: {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden',
  },
  sectionHead: {
    padding: '16px 18px',
    borderBottom: '1px solid var(--border)',
  },
  sectionTitle: {
    fontFamily: 'Fraunces, serif',
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--ink)',
  },
  sectionSub: {
    fontSize: 12,
    color: 'var(--ink-muted)',
    marginTop: 4,
    lineHeight: 1.6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ink-soft)',
    display: 'block',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13.5,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    color: 'var(--ink)',
  },
  textarea: {
    width: '100%',
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13.5,
    fontFamily: 'Geist, sans-serif',
    outline: 'none',
    color: 'var(--ink)',
    minHeight: 108,
    resize: 'vertical' as const,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '9px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
    fontFamily: 'Geist, sans-serif',
    textDecoration: 'none',
  },
  tableWrap: {
    overflowX: 'auto' as const,
  },
  th: {
    padding: '10px 14px',
    textAlign: 'left' as const,
    fontFamily: 'Geist Mono, monospace',
    fontSize: 10.5,
    letterSpacing: '0.7px',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-muted)',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '12px 14px',
    verticalAlign: 'top' as const,
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    color: 'var(--ink)',
  },
  mono: {
    fontFamily: 'Geist Mono, monospace',
  },
};

export function formatDetranDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatDetranDuration(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) return '-';
  if (durationMs < 1000) return `${durationMs} ms`;

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function formatDetranFlow(flow?: string | null) {
  if (!flow) return '-';
  if (flow === 'peca_avulsa_poc') return 'Peca Avulsa POC';
  if (flow === 'autenticacao_poc') return 'Autenticacao POC';
  return flow;
}

export function getDetranStatusMeta(status?: string | null) {
  const key = String(status || '').trim().toLowerCase();

  if (key === 'sucesso' || key === 'success') {
    return {
      label: 'Sucesso',
      color: 'var(--green)',
      background: 'var(--green-light)',
      border: '1px solid #86efac',
    };
  }

  if (key === 'erro' || key === 'error') {
    return {
      label: 'Erro',
      color: 'var(--red)',
      background: 'var(--red-light)',
      border: '1px solid #fca5a5',
    };
  }

  if (key === 'executando' || key === 'running') {
    return {
      label: 'Executando',
      color: 'var(--amber)',
      background: 'var(--amber-light)',
      border: '1px solid #fcd34d',
    };
  }

  if (key === 'cancelada' || key === 'skipped') {
    return {
      label: 'Cancelada',
      color: 'var(--ink-soft)',
      background: 'var(--gray-100)',
      border: '1px solid var(--border)',
    };
  }

  return {
    label: 'Pendente',
    color: 'var(--blue-500)',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
  };
}
