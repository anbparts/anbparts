# ANB Parts — Sistema de Gestão de Peças

Stack: Next.js 14 + Node.js/Express + PostgreSQL (Prisma) + Railway

---

## 🚀 Deploy no Railway (passo a passo)

### 1. Suba o projeto no GitHub

Abra o terminal no Windows (CMD ou PowerShell) e rode:

```bash
cd C:\Users\Bruno
git clone https://github.com/anbparts/anbparts.git || mkdir anbparts && cd anbparts && git init
```

Copie a pasta do projeto para dentro de `anbparts`, depois:

```bash
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/anbparts/anbparts.git
git push -u origin main
```

---

### 2. Deploy do Backend no Railway

1. Acesse **railway.com/dashboard**
2. Clique em **+ New Project**
3. Clique em **Deploy from GitHub repo**
4. Selecione o repositório `anbparts`
5. Quando perguntar, escolha a pasta **backend**
6. Clique em **Add Variables** e adicione:
   ```
   NODE_ENV=production
   ```
7. Clique em **Add Service → Database → PostgreSQL**
8. O Railway vai criar o banco automaticamente e injetar `DATABASE_URL`
9. Aguarde o build terminar ✅

Após o deploy, copie a URL do backend (ex: `https://anbparts-backend.up.railway.app`)

---

### 3. Deploy do Frontend no Railway

1. No mesmo projeto, clique em **+ New Service**
2. Clique em **Deploy from GitHub repo** → pasta **frontend**
3. Adicione a variável:
   ```
   NEXT_PUBLIC_API_URL=https://anbparts-backend.up.railway.app
   ```
4. Aguarde o build ✅

Acesse a URL do frontend e o sistema estará online!

---

### 4. Configurar CORS no Backend

Volte ao serviço de backend no Railway e adicione:
```
FRONTEND_URL=https://anbparts-frontend.up.railway.app
```

---

### 5. Importar dados do Excel

1. Acesse o sistema pelo browser
2. No menu lateral, clique em **Importar Excel**
3. Selecione seu arquivo `.xlsm`
4. Aguarde a importação (pode levar 1-2 minutos com 1400 peças)

---

## 💻 Rodar localmente (opcional)

### Backend
```bash
cd backend
cp .env.example .env
# Edite .env com sua conexão PostgreSQL local
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

### Frontend
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Acesse: http://localhost:3000

---

## 📁 Estrutura do Projeto

```
anbparts/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma       # Modelos do banco
│   ├── src/
│   │   ├── routes/
│   │   │   ├── motos.ts        # CRUD de motos
│   │   │   ├── pecas.ts        # CRUD de peças + venda
│   │   │   ├── faturamento.ts  # Relatórios
│   │   │   └── import.ts       # Importação do Excel
│   │   ├── lib/prisma.ts
│   │   ├── middlewares/error.ts
│   │   └── server.ts
│   └── package.json
│
└── frontend/
    ├── app/
    │   ├── page.tsx             # Dashboard
    │   ├── motos/page.tsx       # Gestão de motos
    │   ├── estoque/page.tsx     # Estoque de peças
    │   ├── faturamento/page.tsx # Fat. por moto
    │   ├── faturamento/geral/   # Fat. geral
    │   └── import/page.tsx      # Importar Excel
    ├── components/layout/Sidebar.tsx
    ├── lib/api.ts               # Chamadas à API
    └── package.json
```

---

## 🔌 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /health | Healthcheck |
| GET | /motos | Lista motos com stats |
| POST | /motos | Cria moto |
| PUT | /motos/:id | Edita moto |
| GET | /pecas | Lista peças (filtros + paginação) |
| POST | /pecas | Cria peça |
| PUT | /pecas/:id | Edita peça |
| PATCH | /pecas/:id/vender | Marca peça como vendida |
| GET | /faturamento/dashboard | Stats do dashboard |
| GET | /faturamento/geral | Faturamento por mês |
| GET | /faturamento/por-moto | Faturamento por moto/mês |
| POST | /import/motos | Importa motos do Excel |
| POST | /import/pecas | Importa peças do Excel |

---

## 🔜 Próximos passos

- [ ] Integração com API do Bling (sync de vendas automático)
- [ ] Módulo DRE
- [ ] Login e controle de acesso por usuário
- [ ] Relatório de prejuízos
