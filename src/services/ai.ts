import { GoogleGenerativeAI } from '@google/generative-ai';
import { botTexts } from '../config/texts';

const genAI = new GoogleGenerativeAI(process.env.OPENAI_API_KEY || '');

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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(`${personality}\n\nUsuário: ${prompt}`);
    const response = await result.response;
    const text = response.text();

    return text || fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  } catch (error: any) {
    console.error('[AI ERROR]:', error.message || error);
    // Return a random cool reply if Gemini fails
    return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  }
};
