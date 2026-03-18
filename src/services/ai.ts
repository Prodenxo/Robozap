import OpenAI from 'openai';
import { botTexts } from '../config/texts';

// Function to clean environment variables (removing potential quotes)
const cleanKey = (key: string | undefined) => key?.replace(/['"]+/g, '').trim() || '';

const openai = new OpenAI({
  apiKey: cleanKey(process.env.OPENAI_API_KEY),
  baseURL: 'https://api.groq.com/openai/v1',
});

const fallbackReplies = [
  "Qual foi, cria? Tô na área, manda a visão!",
  "Fala tu! O que pega de bom hoje?",
  "Tô aqui, pô. Pergunta aí que eu desenrolo.",
  "Manda a boa! O Filhote tá on.",
  "Suave? O que tu quer saber, paizão?",
  "Deboche on-line. Manda a visão!"
];

export const getAIResponse = async (prompt: string, personality: string): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: personality },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || fallbackReplies[0];
  } catch (error: any) {
    console.error('[GROQ ERROR]:', error.message || error);
    return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  }
};
