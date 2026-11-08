// Funções de data e dinheiro usadas pelo servidor.

const pad = (n) => String(n).padStart(2, '0');

function diasNoMes(ano, mes /* 1-12 */) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// Soma meses a uma data 'YYYY-MM-DD' mantendo o dia (ajusta p/ meses mais curtos).
function somaMeses(dataStr, n, diaOriginal) {
  const [a, m, d] = dataStr.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(diaOriginal || d, diasNoMes(ano, mes));
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

function mesSeguinte(mesStr, n = 1) {
  return somaMeses(`${mesStr}-01`, n).slice(0, 7);
}

// Em qual fatura (mês de fechamento) cai uma compra feita em `dataStr`.
// Compra no dia do fechamento ou depois → próxima fatura.
function faturaDaCompra(dataStr, diaFechamento) {
  const [a, m, d] = dataStr.split('-').map(Number);
  const mes = `${a}-${pad(m)}`;
  const fech = Math.min(diaFechamento, diasNoMes(a, m));
  return d >= fech ? mesSeguinte(mes) : mes;
}

// Data de vencimento de uma fatura (mês de fechamento `mesStr`).
function vencimentoDaFatura(mesStr, diaFechamento, diaVencimento) {
  const mesVenc = diaVencimento > diaFechamento ? mesStr : mesSeguinte(mesStr);
  const [a, m] = mesVenc.split('-').map(Number);
  return `${mesVenc}-${pad(Math.min(diaVencimento, diasNoMes(a, m)))}`;
}

function fechamentoDaFatura(mesStr, diaFechamento) {
  const [a, m] = mesStr.split('-').map(Number);
  return `${mesStr}-${pad(Math.min(diaFechamento, diasNoMes(a, m)))}`;
}

function hojeISO() {
  // Data local de São Paulo, independente do fuso do servidor.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Converte o que vem do formulário ("1.234,56", "1234.56", 1234.56) em centavos.
function paraCentavos(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  if (typeof v !== 'string') return NaN;
  let s = v.trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

const ehData = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const ehMes = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

module.exports = {
  pad, diasNoMes, somaMeses, mesSeguinte, faturaDaCompra, vencimentoDaFatura,
  fechamentoDaFatura, hojeISO, paraCentavos, ehData, ehMes,
};
