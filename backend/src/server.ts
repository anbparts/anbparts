import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { motosRouter } from './routes/motos';
import { pecasRouter } from './routes/pecas';
import { faturamentoRouter } from './routes/faturamento';
import { importRouter } from './routes/import';
import { blingRouter, startBlingAuditoriaScheduler } from './routes/bling';
import { financeiroRouter, startFinanceiroSchedulers } from './routes/financeiro';
import { inventarioRouter } from './routes/inventario';
import { configuracoesGeraisRouter } from './routes/configuracoes-gerais';
import { errorMiddleware } from './middlewares/error';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));

app.use('/motos', motosRouter);
app.use('/pecas', pecasRouter);
app.use('/faturamento', faturamentoRouter);
app.use('/import', importRouter);
app.use('/bling', blingRouter);
app.use('/financeiro', financeiroRouter);
app.use('/inventario', inventarioRouter);
app.use('/configuracoes-gerais', configuracoesGeraisRouter);

app.use(errorMiddleware);

const port = Number(process.env.PORT) || 3333;
app.listen(port, () => {
  startBlingAuditoriaScheduler();
  startFinanceiroSchedulers();
  console.log(`ANB Backend rodando na porta ${port}`);
});
