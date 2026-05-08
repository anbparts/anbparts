import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { blingRouter, startBlingAuditoriaScheduler } from './routes/bling';
import { cadastroRouter } from './routes/cadastro';
import { configuracoesGeraisRouter } from './routes/configuracoes-gerais';
import { configuracoesUsuariosRouter } from './routes/configuracoes-usuarios';
import { detranRouter } from './routes/detran';
import { devolucoesRouter } from './routes/devolucoes';
import { empresaRouter } from './routes/empresa';
import { etiquetasDetranRouter } from './routes/etiquetas-detran';
import { etiquetasRouter } from './routes/etiquetas';
import { faturamentoRouter } from './routes/faturamento';
import { financeiroRouter, startFinanceiroSchedulers } from './routes/financeiro';
import { googleDriveRouter } from './routes/google-drive';
import { importRouter } from './routes/import';
import { inventarioRouter } from './routes/inventario';
import { mercadoLivreRouter, startMercadoLivreScheduler } from './routes/mercado-livre';
import { motosRouter } from './routes/motos';
import { notificacoesRouter } from './routes/notificacoes';
import { nuvemshopRouter } from './routes/nuvemshop';
import { pecasRouter } from './routes/pecas';
import { authMiddleware } from './middlewares/auth';
import { errorMiddleware } from './middlewares/error';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json({ limit: '35mb' }));

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));
app.use('/auth', authRouter);
app.use(authMiddleware);

app.use('/bling', blingRouter);
app.use('/cadastro', cadastroRouter);
app.use('/configuracoes-gerais', configuracoesGeraisRouter);
app.use('/configuracoes', configuracoesUsuariosRouter);
app.use('/detran', detranRouter);
app.use('/devolucoes', devolucoesRouter);
app.use('/empresa', empresaRouter);
app.use('/etiquetas-detran', etiquetasDetranRouter);
app.use('/etiquetas', etiquetasRouter);
app.use('/faturamento', faturamentoRouter);
app.use('/financeiro', financeiroRouter);
app.use('/google', googleDriveRouter);
app.use('/import', importRouter);
app.use('/inventario', inventarioRouter);
app.use('/mercado-livre', mercadoLivreRouter);
app.use('/motos', motosRouter);
app.use('/notificacoes', notificacoesRouter);
app.use('/nuvemshop', nuvemshopRouter);
app.use('/pecas', pecasRouter);

app.use(errorMiddleware);

const port = Number(process.env.PORT) || 3333;
app.listen(port, () => {
  startBlingAuditoriaScheduler();
  startFinanceiroSchedulers();
  startMercadoLivreScheduler();
  console.log(`ANB Backend rodando na porta ${port}`);
});
