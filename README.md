# Fluxo · Finanças pessoais

Aplicativo web de controle financeiro pessoal, feito para funcionar bem no celular (instalável como app) e no computador.

![Node.js](https://img.shields.io/badge/Node.js-Express_5-12B886) ![SQLite](https://img.shields.io/badge/banco-SQLite-0B1B2B)

## Funcionalidades

- **Contas** (corrente, poupança, carteira, investimento) com saldo calculado a partir dos lançamentos
- **Lançamentos** de receitas, despesas e transferências, com filtros, busca e status pago/pendente
- **Despesas fixas** que se repetem por N meses
- **Cartões de crédito** com cálculo automático da fatura pelo dia de fechamento, compras **parceladas**, limite disponível e pagamento da fatura
- **Orçamentos**: limite mensal por categoria com barra de progresso
- **Painel** com saldo total, receitas x despesas do mês, gráfico por categoria e contas a pagar/receber
- **Relatórios** dos últimos 6 meses (Chart.js)
- **Categorias** personalizáveis (ícone e cor)
- **Exportação CSV** (abre no Excel / Google Sheets)
- Login com senha (bcrypt), sessão por cookie assinado, proteção contra força bruta
- PWA: "Adicionar à tela inicial" no Android e iPhone · tema escuro automático

## Stack

| Camada | Tecnologia |
|---|---|
| Back-end | Node.js, Express 5 |
| Banco | SQLite (better-sqlite3), valores em centavos (inteiros) |
| Front-end | HTML, CSS e JavaScript puro (SPA com rotas por hash), Chart.js |
| Deploy | Oracle Cloud VPS · PM2 · Nginx (proxy reverso) · Let's Encrypt |

## Rodando localmente

```bash
npm install
npm start          # http://localhost:3100
```

No primeiro acesso o app pede para criar o usuário e a senha. O banco fica em `data/fluxo.db` (criado automaticamente).

## Estrutura

```
server.js          # Express, sessão, arquivos estáticos
src/db.js          # criação das tabelas + categorias padrão
src/api.js         # rotas REST (/api/...)
src/util.js        # datas, cálculo de fatura, conversão de valores
public/            # front-end (index.html, app.js, app.css, PWA)
```

## Backup

Basta copiar a pasta `data/` (contém o banco `fluxo.db`).
