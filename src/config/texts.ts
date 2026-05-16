export const botTexts = {
  persona: {
    name: "Filhote do Mohammed",
    style: "sarcástico, carismático, debochado, marrento e direto.",
    promptBase: "Você é o Filhote do Mohammed, personagem de WhatsApp sarcástico, carismático, debochado, marrento e direto. Responda de forma curta, natural, divertida e com cara de conversa real de WhatsApp. Use gírias brasileiras com leveza. Seja engraçado e provocador na medida certa, sem incentivar crimes, golpes, ameaças, violência ou qualquer atividade ilegal."
  },
  general: {
    menuHeader: "🌟 *FILHOTE DO MOHAMMED - O DONO DA BANCA* 🌟",
    menuFooter: "\n\n⚠️ _Se eu não responder, é porque tô ocupado sendo brabo. Tenta de novo._",
    vencimentoAtiva: "✅ *Assinatura ATIVA!* O Filhote tá na pista pra negócio.",
    vencimentoExpirada: "🫥 *Assinatura EXPIRADA.* O Filhote tá de greve, pô! Paga as contas aí pra eu voltar.",
    testReplies: [
      "Tô aqui, pô! Que que tu quer?",
      "Fala tu!",
      "O brabo tem nome.",
      "Quer um autógrafo?",
      "Tô ocupado sendo foda, fala rápido."
    ]
  },
  identity: {
    systemPrompt: "Você é o Filhote do Mohammed, personagem de WhatsApp sarcástico, carismático, debochado, marrento e direto. Responda de forma curta, natural, divertida e com cara de conversa real de WhatsApp. Use gírias brasileiras com leveza. Seja engraçado e provocador na medida certa, sem incentivar crimes, golpes, ameaças, violência ou qualquer atividade ilegal.",
    summaryPrompt: "Você é o Filhote do Mohammed. Resuma as mensagens abaixo de forma sarcástica, curta e direta, usando gírias de cria."
  },
  ai: {
    filhoteNoText: "❓ *FALA TU, PARCEIRO.* Escreve alguma coisa depois do comando pra eu te responder.",
    summarizeStart: "🧐 *Deixa eu ver o que essa rapaziada tá arrumando...* Peraí.",
    errorNoMessages: "❌ *Vazio igual minha conta bancária.* Não tem mensagem pra resumir aqui.",
    errorGeneric: "💀 *DEU RUIM NA MINHA CABEÇA.* A IA tá de folga. Tenta mais tarde."
  },
  user: {
    meusdadosHeader: "📊 *TEUS DADOS NA MINHA MÃO:*",
    bioSuccess: "✅ Bio salva! Agora todo mundo sabe que tu é cria.",
    niverSuccess: "🎂 Data guardada! O bolo é por tua conta no dia ",
    niverExcluir: "🗑️ Niver apagado. Ninguém vai te dar parabéns agora.",
    igSuccess: "📸 Insta na mão! Vou te dar um follow... mentira.",
    localSuccess: "📍 Local salvo! Já sei onde te buscar pra resenha: ",
    ignoreMe: "🛡️ Modo invisível: "
  },
  admin: {
    noPerm: "❌ *AÍ NÃO, PARCEIRO.* Tu não tem cargo pra essa braba aqui. Só quem manda fala.",
    promoted: "👑 Cargo de patrão agora pra você: ",
    demoted: "📉 Perdeu o cargo! Volta pra base, ",
    banned: "🧹 Varri você daqui. Sem massagem pro ",
    warned: "⚠️ Atenção parceiro, tu tomou uma advertência! Próxima é vala: ",
    removed: "👋 Valeu, falou! Voei com o ",
    unbanned: "🔓 Tá limpo! O Filhote te deu uma nova chance: "
  },
  fun: {
    chance: "📊 *CHANCE DO FILHOTE:* ",
    chanceNoText: "🎲 *CHANCE DE QUÊ?* Completa a frase aí, doidão.",
    chanceHeader: "📊 *O FILHOTE AVISA:* A chance de ",
    sorteio: "🏆 *SORTEADO DA VEZ:* ",
    versiculo: "📖 *FILHOTE TAMBÉM É SANTO:* ",
    sdia: "🍀 *SORTE DO DIA:* ",
    viadometro: "🌈 *VIADÔMETRO DO FILHOTE:* Você está *#RESULT%* viado! ",
    gadometro: "🐂 *GADÔMETRO DO FILHOTE:* Você está *#RESULT%* gado! ",
    bafometro: "🍻 *BAFÔMETRO DO FILHOTE:* Você está *#RESULT%* bêbado! ",
    detector: "🕵️ *DETECTOR DE MENTIRA:* Analisei o que tu disse... O resultado é: *#RESULT*!",
    casal: "💑 *CASAL DO ANO:* #USER1 e #USER2! Shipam?",
  },
  media: {
    figStart: "🚀 *Saindo uma figurinha do forno!* Espera aí, parceiro...",
    figErrorGeneric: "❌ *DEU RUIM.* Minha máquina de figurinha pifou. Tenta de novo mais tarde.",
    figErrorNoImage: "🙄 *QUALÉ, DOIDÃO?* Manda uma imagem ou marca uma pra eu fazer a figurinha.",
    musicaNoText: "🎵 *QUER OUVIR O QUÊ?* Manda o nome da música ou o link, não sou vidente.",
    musicaErrorNotFound: "🚫 *ACHEI FOI NADA.* Essa música aí nem existe na minha quebrada. Tenta outro nome.",
    musicaSearch: "🔍 *BUSCANDO BRABA:* \"$query\"... Já te mando o som!",
    musicaErrorGeneric: "💀 *ERRO NO SOM.* Não rolou baixar agora. Tenta de novo em 1 min.",
    musicaErrorYoutubeLogin: "🔐 *YouTube pediu login.* Atualize o cookies.json no app cobalt (File Mount) e redeploy.",
    musicaErrorYoutubeApi: "📛 *YouTube bloqueou o servidor.* Tente de novo ou atualize o cookies.json no cobalt.",
    musicaErrorNoSession: "⚠️ *yt-session sem token.* No cobalt REMOVA YOUTUBE_SESSION_SERVER (deixe só COOKIE_PATH). Ou aumente RAM do app yt-session e redeploy.",
    musicaBusy: "⏳ *Calma, parceiro.* Já tô baixando um som nesse grupo. Pera a anterior terminar.",
    downloadStart: "📥 *PEGANDO A BRABA:* Peraí que tô baixando o vídeo pra tu...",
    downloadErrorGeneric: "❌ *DEU RUIM NO DOWNLOAD.* Essa rede aí tá bloqueando o Filhote. Tenta outra.",
  },
  social: {
    roleCriado: "🔥 *NOVO ROLÊ NA PISTA!* Código: ",
    presenca: "✅ Confirmado! O Filhote já te colocou na lista do ",
    desistencia: "🤷 Já sabia que ia arregar... Saindo da lista do ",
    nichoEntrar: "🔥 Tu entrou pro bando! Agora tu é do nicho: ",
    nichoSair: "👋 Saiu do bando. O nicho ficou mais vazio sem você: ",
    igList: "📸 *LISTA DOS FAMOSINHOS DO INSTA:* ",
    igSuccess: "✅ *INSTA NA MÃO!* Vou te dar um follow... mentira. Salvei o @",
    localList: "📍 *ONDE A RAPAZIADA SE ESCONDE:* ",
    localSuccess: "📍 *LOCAL SALVO!* Já sei onde te buscar pra resenha: ",
    radio: "📻 *RÁDIO DO FILHOTE:* Curte a playlist aí: https://spotify.com",
    roles: "🎉 *ROLÊS MARCADOS:* "
  }
};
