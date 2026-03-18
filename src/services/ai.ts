import OpenAI from 'openai';
import { botTexts } from '../config/texts';

// Initialize OpenAI client with Groq support
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY?.trim() || '',
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
    if (!process.env.OPENAI_API_KEY) {
        console.error('[ROBOZAP ERROR]: OPENAI_API_KEY is missing!');
        return fallbackReplies[0];
    }

    const response = await openai.chat.completions.create({
      model: "llama3-8b-8192", // More stable free tier model
      messages: [
        { role: "system", content: personality },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    const reply = response.choices[0]?.message?.content;
    
    if (!reply) {
        throw new Error('Groq returned empty content');
    }

    return reply;
  } catch (error: any) {
    // CRITICAL: Look at your Easypanel logs for this!
    console.error('[GROQ FATAL ERROR]:', error.message || error);
    
    if (error.status === 401) {
        console.error('DETECTED: Your GSK API Key is Invalid/Expired.');
    }

    return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
  }
};
