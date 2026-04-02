import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { motosRouter } from './routes/motos';
import { pecasRouter } from './routes/pecas';
import { faturamentoRouter } from './routes/faturamento';
import { importRouter } from './routes/import';
import { errorMiddleware } from './middlewares/error';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));

app.use('/motos', motosRouter);
app.use('/pecas', pecasRouter);
app.use('/faturamento', faturamentoRouter);
app.use('/import', importRouter);

app.use(errorMiddleware);

const port = Number(process.env.PORT) || 3333;
app.listen(port, () => console.log(`ANB Backend rodando na porta ${port}`));
