export const botTexts = {
  identity: {
    name: "Filhote do Mohammed",
    command: "filhote",
    systemPrompt: `Você é o Filhote do Mohammed, uma figura de WhatsApp sarcástica, carismática, debochada, marrenta e direta. Fale como um cria do RJ, com gírias brasileiras, postura debochada e respostas curtas, naturais e com cara de conversa real de WhatsApp. Seja engraçado, provocador na medida certa e sem parecer robótico. Nunca incentive crimes, ameaças, violência, golpes ou qualquer atividade ilegal.`,
    summaryPrompt: `Você é o Filhote do Mohammed. Sua tarefa é resumir a conversa desse grupo de WhatsApp de forma dinâmica, engraçada e sarcástica. Faça no estilo cria do RJ, com gírias, deboche e energia de resenha. Destaque as tretas, as piadas e os assuntos principais. Use emojis e mantenha um tom curto, solto e engraçado. Nunca incentive crimes, ameaças, violência, golpes ou qualquer atividade ilegal.`
  },

  general: {
    menu: `🌟 *FILHOTE DO MOHAMMED - Menu de Mandamentos* 🌟

🔅 *USO GERAL* 🔅

🤖 *.menu*
Exibe esse menu. Use *.menu off* para os administradores desativarem a chamada por membros.

🤖 *.vencimento*
Exibe o status da assinatura do FILHOTE no grupo.

🤖 *.filhote.ajuda* [pergunta]
Tira tuas dúvidas sobre os comandos fazendo uma pergunta pro brabo.

🤖 *.filhote*
Conversa com o cria mais debochado que tu já viu. 
* .filhote - Mostra modos de conversa.
* .filhote off off - Desativa conversa.
* .filhote on on - Ativa conversa real (IA) e natural.

🤖 *.resumir*
Puxa o resumão da resenha de forma dinâmica e engraçada.

📝 _*Informações pessoais*_
🤖 *.meusdados* - Teu status no grupo.
🤖 *.bio* - Configura teu perfil.
🤖 *.niver* [DD/MM] - Marca teu aniversário.
🤖 *.nivers* - Lista os aniversariantes (hoje/mês/ano).
🤖 *.signos* - Vê a constelação da rapaziada.
🤖 *.ig* [@user] - Teu Instagram na pista.
🤖 *.local* [bairro] - De onde tu é?
🤖 *.radio* - Playlist da rapaziada.
🤖 *.ignoreme* [on/off] - Instrua o bot a não te marcar.

👬 _*Interação social*_
🤖 *.roles* - Lista os rolês marcados.
🤖 *.role.vou* [ID] - Confirma tua presença.
🤖 *.role.nvou* [ID] - Desiste do rolê.
🤖 *.nicho.entrar* [código] - Entra numa lista/nicho.

🎁 _*Entretenimento*_
🤖 *.chance* [pergunta] - Vê se vai dar bom.
🤖 *.sortear* [texto] - Escolhe alguém do grupo.
🤖 *.dado* / *.moeda* - Joga a sorte pro alto.
🤖 *.versiculo* - Uma palavra amiga.
🤖 *.sortedodia* - Biscoito da sorte de cria.
🤖 *.musica* [nome] - Baixa do YT na hora.
🤖 *.fig* - Faz figurinha de foto/vídeo.

❓ _*Diversos*_
🤖 *.transcrever* - Ouve áudio por tu.
🤖 *.admins* - Chama os donos do morro.
🤖 *.teste* - Vê se o bot tá on.

_Dúvidas? Manda um zap pro Mohammed._`,
    
    vencimentoAtiva: "✅ Tua assinatura tá nesse pique aqui: Ativa (VIP Infinito) 🫥",
    vencimentoExpirada: "🫥 Tua assinatura expirou, paizão! Renova aí pra voltar o deboche.",
    menuDisabled: "⚠️ Os ADMs desativaram o menu geral pra não poluir. Manda no PV!"
  },

  ai: {
    filhoteNoText: "Qual foi, meu mano? Digita alguma coisa depois do .filhote aí.",
    summarizeStart: "🧐 Pera aí que eu vou pegar a visão do que essa rapaziada ficou falando...",
    errorBusy: "Tô embolado agora, volta daqui a pouco. ✨",
    errorGeneric: "Deu ruim aqui na minha mente, tenta de novo aí.",
    errorNoMessages: "Não tem nada pra resumir ainda, mó silêncio por aqui."
  },

  user: {
    meusdadosHeader: "📊 *Teus Dados no Grupo* 📊",
    bioSuccess: "✅ Bio atualizada certinho, meu cria!",
    niverSuccess: "✅ Teu aniversário ficou marcado pra ",
    niverExcluir: "🗑️ Teu niver foi varrido da lista.",
    igSuccess: "📸 Insta cadastrado: @",
    localSuccess: "📍 Local salvo: ",
    ignoreMe: "🛡️ Modo invisível: "
  },

  fun: {
    chanceHeader: "🔮 *Chance* de ",
    sortearResult: "🎉 Os sorteado da vez são: ",
    versiculo: "📖 *Versículo do Dia:* ",
    sortedodia: "🍪 *Biscoito do Cria:* "
  },

  admin: {
    removerSuccess: "🚀 Foi de arrasta pra fora do grupo!",
    banSuccess: "🚫 Já era, foi banido sem volta.",
    advSuccess: "⚠️ Advertência anotada pra ",
    advLimit: "❗ Passou do limite, paizão. Banindo...",
    promoverSuccess: "👑 Cargo de patrão agora pra você: ",
    rebaixarSuccess: "📉 Perdeu o cargo! Volta pra base.",
    marcaOnOff: "📢 Marcação geral: "
  }
};
