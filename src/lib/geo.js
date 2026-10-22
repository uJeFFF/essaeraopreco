// Base geografica sintetica: estados (27) e cidades (capitais + algumas extras).
// `id` de estado = codigo IBGE de 2 digitos; `id` de cidade = codigo IBGE de 7 digitos.
// `peso` = peso relativo usado para distribuir as notas de forma realista.

export const ESTADOS = [
  { id: 12, uf: 'AC', nome: 'Acre', peso: 0.4 },
  { id: 27, uf: 'AL', nome: 'Alagoas', peso: 1.6 },
  { id: 16, uf: 'AP', nome: 'Amapá', peso: 0.4 },
  { id: 13, uf: 'AM', nome: 'Amazonas', peso: 1.9 },
  { id: 29, uf: 'BA', nome: 'Bahia', peso: 7.1 },
  { id: 23, uf: 'CE', nome: 'Ceará', peso: 4.3 },
  { id: 53, uf: 'DF', nome: 'Distrito Federal', peso: 1.4 },
  { id: 32, uf: 'ES', nome: 'Espírito Santo', peso: 1.9 },
  { id: 52, uf: 'GO', nome: 'Goiás', peso: 3.4 },
  { id: 21, uf: 'MA', nome: 'Maranhão', peso: 3.4 },
  { id: 51, uf: 'MT', nome: 'Mato Grosso', peso: 1.8 },
  { id: 50, uf: 'MS', nome: 'Mato Grosso do Sul', peso: 1.3 },
  { id: 31, uf: 'MG', nome: 'Minas Gerais', peso: 10.1 },
  { id: 15, uf: 'PA', nome: 'Pará', peso: 3.9 },
  { id: 25, uf: 'PB', nome: 'Paraíba', peso: 1.9 },
  { id: 41, uf: 'PR', nome: 'Paraná', peso: 5.5 },
  { id: 26, uf: 'PE', nome: 'Pernambuco', peso: 4.6 },
  { id: 22, uf: 'PI', nome: 'Piauí', peso: 1.6 },
  { id: 33, uf: 'RJ', nome: 'Rio de Janeiro', peso: 8.2 },
  { id: 24, uf: 'RN', nome: 'Rio Grande do Norte', peso: 1.7 },
  { id: 43, uf: 'RS', nome: 'Rio Grande do Sul', peso: 5.4 },
  { id: 11, uf: 'RO', nome: 'Rondônia', peso: 0.8 },
  { id: 14, uf: 'RR', nome: 'Roraima', peso: 0.3 },
  { id: 42, uf: 'SC', nome: 'Santa Catarina', peso: 3.6 },
  { id: 35, uf: 'SP', nome: 'São Paulo', peso: 21.9 },
  { id: 28, uf: 'SE', nome: 'Sergipe', peso: 1.1 },
  { id: 17, uf: 'TO', nome: 'Tocantins', peso: 0.7 },
];

export const CIDADES = [
  // Norte
  { id: 1200401, nome: 'Rio Branco', uf: 'AC', peso: 1.0 },
  { id: 1600303, nome: 'Macapá', uf: 'AP', peso: 1.0 },
  { id: 1302603, nome: 'Manaus', uf: 'AM', peso: 1.0 },
  { id: 1501402, nome: 'Belém', uf: 'PA', peso: 1.0 },
  { id: 1500800, nome: 'Ananindeua', uf: 'PA', peso: 0.5 },
  { id: 1506807, nome: 'Santarém', uf: 'PA', peso: 0.4 },
  { id: 1100205, nome: 'Porto Velho', uf: 'RO', peso: 1.0 },
  { id: 1400100, nome: 'Boa Vista', uf: 'RR', peso: 1.0 },
  { id: 1721000, nome: 'Palmas', uf: 'TO', peso: 1.0 },
  // Nordeste
  { id: 2704302, nome: 'Maceió', uf: 'AL', peso: 1.0 },
  { id: 2927408, nome: 'Salvador', uf: 'BA', peso: 1.0 },
  { id: 2910800, nome: 'Feira de Santana', uf: 'BA', peso: 0.5 },
  { id: 2933307, nome: 'Vitória da Conquista', uf: 'BA', peso: 0.35 },
  { id: 2304400, nome: 'Fortaleza', uf: 'CE', peso: 1.0 },
  { id: 2303709, nome: 'Caucaia', uf: 'CE', peso: 0.4 },
  { id: 2307304, nome: 'Juazeiro do Norte', uf: 'CE', peso: 0.3 },
  { id: 2111300, nome: 'São Luís', uf: 'MA', peso: 1.0 },
  { id: 2105302, nome: 'Imperatriz', uf: 'MA', peso: 0.4 },
  { id: 2507507, nome: 'João Pessoa', uf: 'PB', peso: 1.0 },
  { id: 2611606, nome: 'Recife', uf: 'PE', peso: 1.0 },
  { id: 2607901, nome: 'Jaboatão dos Guararapes', uf: 'PE', peso: 0.5 },
  { id: 2609600, nome: 'Olinda', uf: 'PE', peso: 0.35 },
  { id: 2211001, nome: 'Teresina', uf: 'PI', peso: 1.0 },
  { id: 2408102, nome: 'Natal', uf: 'RN', peso: 1.0 },
  { id: 2800308, nome: 'Aracaju', uf: 'SE', peso: 1.0 },
  // Centro-Oeste
  { id: 5300108, nome: 'Brasília', uf: 'DF', peso: 1.0 },
  { id: 5208707, nome: 'Goiânia', uf: 'GO', peso: 1.0 },
  { id: 5201405, nome: 'Aparecida de Goiânia', uf: 'GO', peso: 0.5 },
  { id: 5201108, nome: 'Anápolis', uf: 'GO', peso: 0.35 },
  { id: 5103403, nome: 'Cuiabá', uf: 'MT', peso: 1.0 },
  { id: 5002704, nome: 'Campo Grande', uf: 'MS', peso: 1.0 },
  // Sudeste
  { id: 3106200, nome: 'Belo Horizonte', uf: 'MG', peso: 1.0 },
  { id: 3170206, nome: 'Uberlândia', uf: 'MG', peso: 0.5 },
  { id: 3118601, nome: 'Contagem', uf: 'MG', peso: 0.4 },
  { id: 3136702, nome: 'Juiz de Fora', uf: 'MG', peso: 0.35 },
  { id: 3205309, nome: 'Vitória', uf: 'ES', peso: 1.0 },
  { id: 3205002, nome: 'Serra', uf: 'ES', peso: 0.5 },
  { id: 3205200, nome: 'Vila Velha', uf: 'ES', peso: 0.4 },
  { id: 3304557, nome: 'Rio de Janeiro', uf: 'RJ', peso: 1.0 },
  { id: 3303302, nome: 'Niterói', uf: 'RJ', peso: 0.5 },
  { id: 3303500, nome: 'Nova Iguaçu', uf: 'RJ', peso: 0.4 },
  { id: 3550308, nome: 'São Paulo', uf: 'SP', peso: 1.0 },
  { id: 3509502, nome: 'Campinas', uf: 'SP', peso: 0.55 },
  { id: 3518800, nome: 'Guarulhos', uf: 'SP', peso: 0.5 },
  { id: 3548500, nome: 'Santos', uf: 'SP', peso: 0.4 },
  { id: 3543402, nome: 'Ribeirão Preto', uf: 'SP', peso: 0.35 },
  // Sul
  { id: 4106902, nome: 'Curitiba', uf: 'PR', peso: 1.0 },
  { id: 4113700, nome: 'Londrina', uf: 'PR', peso: 0.5 },
  { id: 4115200, nome: 'Maringá', uf: 'PR', peso: 0.4 },
  { id: 4205407, nome: 'Florianópolis', uf: 'SC', peso: 1.0 },
  { id: 4209102, nome: 'Joinville', uf: 'SC', peso: 0.5 },
  { id: 4202404, nome: 'Blumenau', uf: 'SC', peso: 0.35 },
  { id: 4314902, nome: 'Porto Alegre', uf: 'RS', peso: 1.0 },
  { id: 4305108, nome: 'Caxias do Sul', uf: 'RS', peso: 0.45 },
  { id: 4314407, nome: 'Pelotas', uf: 'RS', peso: 0.3 },
];

const ESTADO_POR_UF = new Map(ESTADOS.map((e) => [e.uf, e]));
const ESTADO_POR_ID = new Map(ESTADOS.map((e) => [e.id, e]));

// Soma dos pesos das cidades por estado, para normalizar e o total de cada
// estado respeitar exatamente o peso populacional (independente de quantas
// cidades cadastramos).
const SOMA_PESOS_POR_ESTADO = new Map();
for (const cidade of CIDADES) {
  SOMA_PESOS_POR_ESTADO.set(cidade.uf, (SOMA_PESOS_POR_ESTADO.get(cidade.uf) || 0) + cidade.peso);
}

// Enriquece as cidades com estadoId e peso combinado (estado * cidade normalizado).
for (const cidade of CIDADES) {
  const estado = ESTADO_POR_UF.get(cidade.uf);
  cidade.estadoId = estado.id;
  cidade.pesoCombinado = (estado.peso * cidade.peso) / SOMA_PESOS_POR_ESTADO.get(cidade.uf);
}

export function estadoPorUf(uf) {
  return ESTADO_POR_UF.get(uf);
}

export function estadoPorId(id) {
  return ESTADO_POR_ID.get(Number(id));
}
