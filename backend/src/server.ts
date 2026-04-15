import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { motosRouter } from './routes/motos';
import { pecasRouter } from './routes/pecas';
import { faturamentoRouter } from './routes/faturamento';
import { importRouter } from './routes/import';
import { blingRouter, startBlingAuditoriaScheduler } from './routes/bling';
import { financeiroRouter, startFinanceiroSchedulers } from './routes/financeiro';
import { inventarioRouter } from './routes/inventario';
import { configuracoesGeraisRouter } from './routes/configuracoes-gerais';
import { empresaRouter } from './routes/empresa';
import { mercadoLivreRouter, startMercadoLivreScheduler } from './routes/mercado-livre';
import { nuvemshopRouter } from './routes/nuvemshop';
import { cadastroRouter } from './routes/cadastro';
import { authMiddleware } from './middlewares/auth';
import { errorMiddleware } from './middlewares/error';

const app = express();

function getAllowedOrigins() {
  return String(process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    if (!origin) {
      return callback(null, true);
    }

    if (!allowedOrigins.length) {
      return callback(null, origin);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem nao permitida pelo CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));
app.use('/auth', authRouter);
app.use(authMiddleware);

app.use('/motos', motosRouter);
app.use('/pecas', pecasRouter);
app.use('/faturamento', faturamentoRouter);
app.use('/import', importRouter);
app.use('/bling', blingRouter);
app.use('/mercado-livre', mercadoLivreRouter);
app.use('/financeiro', financeiroRouter);
app.use('/inventario', inventarioRouter);
app.use('/configuracoes-gerais', configuracoesGeraisRouter);
app.use('/empresa', empresaRouter);
app.use('/nuvemshop', nuvemshopRouter);
app.use('/cadastro', cadastroRouter);

app.use(errorMiddleware);

const port = Number(process.env.PORT) || 3333;
app.listen(port, () => {
  startBlingAuditoriaScheduler();
  startFinanceiroSchedulers();
  startMercadoLivreScheduler();
  console.log(`ANB Backend rodando na porta ${port}`);
});
