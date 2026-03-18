import OpenAI from 'openai';
import { botTexts } from '../config/texts';

// Using Groq API Key through the OpenAI Client (Groq is compatible)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1', // Using Groq's super fast API
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
      model: "llama-3.1-70b-versatile", // Using Llama 3 on Groq (Fast and free)
      messages: [
        { role: "system", content: personality },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  } catch (error: any) {
    console.error('[GROQ AI ERROR]:', error.message || error);
    return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  }
};
