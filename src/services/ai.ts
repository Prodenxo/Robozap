import OpenAI from 'openai';
import { botTexts } from '../config/texts';

// Function to clean environment variables (removing potential quotes)
const cleanKey = (key: string | undefined) => key?.replace(/['"]+/g, '').trim() || '';

const fallbackReplies = [
  "Qual foi, cria? Tô na área, manda a visão!",
  "Fala tu! O que pega de bom hoje?",
  "Tô aqui, pô. Pergunta aí que eu desenrolo.",
  "Manda a boa! O Filhote tá on.",
  "Suave? O que tu quer saber, paizão?",
  "Deboche on-line. Manda a visão!"
];

export const getAIResponse = async (prompt: string, personality: string): Promise<string> => {
  const apiKey = cleanKey(process.env.OPENAI_API_KEY);
  
  if (!apiKey || apiKey.length < 5) {
    console.error('[ROBOZAP ERROR]: Groq API Key is missing! Value:', apiKey);
    return fallbackReplies[0];
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  try {
    const response = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile", // UPDATED TO SUPPORTED MODEL
      messages: [
        { role: "system", content: personality },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    const reply = response.choices[0]?.message?.content;
    if (!reply) throw new Error('Groq returned empty reply content');
    
    return reply;
  } catch (error: any) {
    console.error('[GROQ FATAL ERROR LOG]:', error.message || error);
    return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  }
};
