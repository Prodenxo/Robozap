export const botTexts = {
  identity: {
    name: "Filhote do Mohammed",
    command: "filhote",
    systemPrompt: `Você é o Filhote do Mohammed, uma figura de WhatsApp sarcástica, carismática, debochada, marrenta e direta. Fale como um cria do RJ, com gírias brasileiras, postura debochada e respostas curtas, naturais e com cara de conversa real de WhatsApp. Seja engraçado, provocador na medida certa e sem parecer robótico. Nunca incentive crimes, ameaças, violência, golpes ou qualquer atividade ilegal.`,
    summaryPrompt: `Você é o Filhote do Mohammed. Sua tarefa é resumir a conversa desse grupo de WhatsApp de forma dinâmica, engraçada e sarcástica. Faça no estilo cria do RJ, com gírias, deboche e energia de resenha. Destaque as tretas, as piadas e os assuntos principais. Use emojis e mantenha um tom curto, solto e engraçado. Nunca incentive crimes, ameaças, violência, golpes ou qualquer atividade ilegal.`
  },

  general: {
    menu: `🌟 *BOT - Comandos Disponíveis* 🌟

🔅 *USO GERAL* 🔅

📝 _*Ajuda*_
🤖 *.menu*
Mostra essa visão aí pra tu.

🤖 *.vencimento*
Mostra como tá tua assinatura.

🤖 *.ajuda* [pergunta]
Tira tua dúvida sem enrolação.

🤖 *.filhote*
Troca ideia com o Filhote.

🤖 *.resumir*
Puxa o resumão da resenha.

(e muitos outros comandos disponíveis...)`,

    testReplies: [
      "Fala tu!",
      "Salve, cria!",
      "Tô na área!",
      "Manda a visão!",
      "Tô por aqui, pô!",
      "Qual foi?"
    ],
    ajudaUsage: ".ajuda [pergunta]",
    ajudaPlaceholder: "Manda tua dúvida sobre o bot que eu desenrolo.",
    vencimentoPlaceholder: "Tua assinatura tá nesse pique aqui: [status]."
  },

  ai: {
    filhoteNoText: "Qual foi, meu mano? Digita alguma coisa depois do .filhote aí.",
    summarizeStart: "🧐 Pera aí que eu vou pegar a visão do que essa rapaziada ficou falando...",
    errorBusy: "Tô embolado agora, volta daqui a pouco. ✨",
    errorGeneric: "Deu ruim aqui na minha mente, tenta de novo aí.",
    errorNoMessages: "Não tem nada pra resumir ainda, mó silêncio por aqui."
  },

  user: {
    meusdadosNoData: "Ainda não peguei teus dados, não. Mande umas mensagens primeiro!",
    meusdadosHeader: "📊 *Teus Dados no Grupo* 📊",
    bioNoText: "Solta tua bio aí depois do comando .bio",
    bioSuccess: "✅ Bio atualizada certinho, meu cria!",
    niverFormatError: "Manda a data no formato DD/MM, pô. Ex: .niver 15/08",
    niverSuccess: "✅ Teu aniversário ficou marcado pra "
  },

  fun: {
    chanceNoText: "🎲 .chance [manda tua pergunta aí]",
    chanceHeader: "🔮 *Chance* de ",
    sortearResult: "🎉 Os sorteado da vez são: ",
    dadoResult: "🎲 Joguei o *D$sides* aqui e caiu: ",
    moedaResult: "🪙 Girei a moeda... caiu "
  },

  social: {
    igList: "📸 Lista dos Insta:",
    igSuccess: "📸 Insta cadastrado certinho: @",
    localList: "📍 Local da rapaziada:",
    localSuccess: "📍 Local salvo: ",
    radio: `🎵 *Rádio da Rapaziada* 🎵\n\nLink: [Spotify](https://spotify.com/playlist/...)`,
    roles: `👬 *Rolê marcado* 👬\n\n- Cod: R001: Churrasco no Sábado\n- Cod: R002: Cinema na Sexta`
  },

  media: {
    figStart: "⏳ Já vou transformar tua imagem em figurinha, segura aí...",
    figErrorNoImage: "❌ Manda uma imagem ou responde uma com .fig, pô.",
    figErrorGeneric: "❌ Deu ruim na hora de fazer a figurinha.",
    musicaNoText: "❌ Manda o nome da música ou joga o link do YouTube aí.",
    musicaSearch: "🔍 Tô caçando \"$query\" no YouTube...",
    musicaSending: "🚀 Já tô mandando o áudio aí...",
    musicaErrorNotFound: "❌ Não achei nada com esse nome, não.",
    musicaErrorGeneric: "❌ Deu ruim pra baixar a música."
  },

  admin: {
    noMention: "Tem que marcar ou responder a pessoa pra remover ou banir, meu mano.",
    removerSuccess: "🚀 Foi de arrasta pra fora do grupo!",
    banSuccess: "🚫 Já era, foi banido sem volta.",
    advSuccess: "⚠️ Advertência anotada pra ",
    advLimit: "❗ Passou do limite, paizão. Banindo..."
  }
};
