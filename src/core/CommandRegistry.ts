import { handleGeneralCommands } from '../commands/general';
import { handleAICommands } from '../commands/ai';
import { handleUserCommands } from '../commands/user';
import { handleAdminCommands } from '../commands/admin';
import { handleFunCommands } from '../commands/fun';
import { handleSocialCommands } from '../commands/social';
import { handleMediaCommands } from '../commands/media';
import { PermissionGuard } from './Guards';

export const COMMAND_MAP: Record<string, Function> = {
  // GERAL
  'menu': handleGeneralCommands,
  'vencimento': handleGeneralCommands,
  'ajuda': handleGeneralCommands,
  'filhote.ajuda': handleGeneralCommands,

  // IA
  'filhote': handleAICommands,
  'resumir': handleAICommands,
  'resume': handleAICommands,
  'resumo': handleAICommands,

  // PESSOAL
  'meusdados': handleUserCommands,
  'dados': handleUserCommands,
  'bio': handleUserCommands,
  'niver': handleUserCommands,
  'niver.excluir': handleUserCommands,
  'nivers': handleUserCommands,
  'signos': handleUserCommands,
  'ig': handleUserCommands,
  'ig.excluir': handleUserCommands,
  'local': handleUserCommands,
  'local.excluir': handleUserCommands,
  'radio': handleUserCommands,
  'radio.excluir': handleUserCommands,
  'ignoreme': handleUserCommands,
  'meignore': handleUserCommands,

  // SOCIAL
  'roles': handleSocialCommands,
  'role.vou': handleSocialCommands,
  'role.nvou': handleSocialCommands,
  'resenha': handleSocialCommands,

  // ALIASES DE NICHO / LISTA (TODOS OS 10 SOLICITADOS)
  'lista.entrar': handleSocialCommands,
  'nicho.entrar': handleSocialCommands,
  'lista.sim': handleSocialCommands,
  'nicho.sim': handleSocialCommands,
  'lista.participar': handleSocialCommands,
  'nicho.participar': handleSocialCommands,
  'lista.quero': handleSocialCommands,
  'nicho.quero': handleSocialCommands,
  'lista.todentro': handleSocialCommands,
  'nicho.todentro': handleSocialCommands,

  // ALIASES DE SAIR DE NICHO
  'lista.sair': handleSocialCommands,
  'nicho.sair': handleSocialCommands,
  'lista.nao': handleSocialCommands,
  'nicho.nao': handleSocialCommands,
  'lista.nparticipar': handleSocialCommands,
  'nicho.nparticipar': handleSocialCommands,
  'lista.nquero': handleSocialCommands,
  'nicho.nquero': handleSocialCommands,
  'lista.tofora': handleSocialCommands,
  'nicho.tofora': handleSocialCommands,

  // ENTRETENIMENTO
  'chance': handleFunCommands,
  'sortear': handleFunCommands,
  'dado': handleFunCommands,
  'moeda': handleFunCommands,
  'd4': handleFunCommands,
  'd6': handleFunCommands,
  'd8': handleFunCommands,
  'd10': handleFunCommands,
  'd12': handleFunCommands,
  'd20': handleFunCommands,
  'versiculo': handleFunCommands,
  'biblia': handleFunCommands,
  'jesus': handleFunCommands,
  'sortedodia': handleFunCommands,
  'sdd': handleFunCommands,
  'amg.lembrar': handleFunCommands,

  // MEDIA
  'musica': handleMediaCommands,
  'tocar': handleMediaCommands,
  'fig': handleMediaCommands,
  'transcrever': handleMediaCommands,
  'ouvir': handleMediaCommands,

  // ADMIN
  'admins': handleAdminCommands,
  'adms': handleAdminCommands,
  'remover': handleAdminCommands,
  'ban': handleAdminCommands,
  'banir': handleAdminCommands,
  'desban': handleAdminCommands,
  'desbanir': handleAdminCommands,
  'adv': handleAdminCommands,
  'promover': handleAdminCommands,
  'rebaixar': handleAdminCommands,
  'apagar': handleAdminCommands,
  'marcar': handleAdminCommands,
  'alertar': handleAdminCommands,

  // TESTES
  'teste': handleGeneralCommands,
  'bomdia': handleGeneralCommands,
  'boatarde': handleGeneralCommands,
  'boanoite': handleGeneralCommands,
  'oi': handleGeneralCommands,

  // ESTATÍSTICAS
  'mensagens': handleGeneralCommands,
  'ativos': handleGeneralCommands,
  'desocupados': handleGeneralCommands,
  'inativos': handleGeneralCommands,
  'passivos': handleGeneralCommands,
};
