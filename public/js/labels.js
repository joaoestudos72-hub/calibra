export const L = {
  vehicleType: [['carro', 'Carro'], ['moto', 'Moto'], ['caminhonete', 'Caminhonete'], ['van', 'Van'], ['caminhao', 'Caminhão'], ['outro', 'Outro']],
  maintCat: [['revisao', 'Revisão'], ['oleo', 'Óleo e filtros'], ['pneus', 'Pneus'], ['freios', 'Freios'], ['suspensao', 'Suspensão'], ['eletrica', 'Elétrica'], ['bateria', 'Bateria'], ['funilaria', 'Funilaria e pintura'], ['outros', 'Outros']],
  expCat: [['combustivel', 'Combustível'], ['seguro', 'Seguro'], ['ipva', 'IPVA'], ['licenciamento', 'Licenciamento'], ['estacionamento', 'Estacionamento'], ['pedagio', 'Pedágio'], ['acessorios', 'Acessórios'], ['outros', 'Outros']],
  washKind: [['simples', 'Simples'], ['completa', 'Completa'], ['interna', 'Interna'], ['a_seco', 'A seco'], ['polimento', 'Polimento']],
  fineStatus: [['pendente', 'Pendente'], ['paga', 'Paga'], ['em_recurso', 'Em recurso'], ['recurso_deferido', 'Recurso deferido'], ['recurso_indeferido', 'Recurso indeferido'], ['cancelada', 'Cancelada']],
  routineCat: [['saude', 'Saúde'], ['financas', 'Finanças'], ['casa', 'Casa'], ['trabalho', 'Trabalho'], ['estudos', 'Estudos'], ['pessoal', 'Pessoal'], ['outros', 'Outros']],
  priority: [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']],
  recurrence: [['none', 'Não repete'], ['daily', 'Diariamente'], ['weekly', 'Semanalmente'], ['monthly', 'Mensalmente'], ['yearly', 'Anualmente']],
  recUnit: { daily: 'dia(s)', weekly: 'semana(s)', monthly: 'mês(es)', yearly: 'ano(s)' },
  notifyDays: [['', 'Padrão da conta'], ['0', 'No dia'], ['1', '1 dia antes'], ['2', '2 dias antes'], ['3', '3 dias antes'], ['5', '5 dias antes'], ['7', '7 dias antes'], ['15', '15 dias antes'], ['30', '30 dias antes']],
  notifyDefault: [['0', 'No próprio dia'], ['1', '1 dia antes'], ['2', '2 dias antes'], ['3', '3 dias antes'], ['5', '5 dias antes'], ['7', '7 dias antes'], ['15', '15 dias antes'], ['30', '30 dias antes']],
};
export const label = (list, value) => (L[list].find(([v]) => v === value) || [value, value ?? ''])[1];
