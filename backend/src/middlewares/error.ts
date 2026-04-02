import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor' });
}
