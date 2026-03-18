import { GoogleGenerativeAI } from '@google/generative-ai';
import { botTexts } from '../config/texts';

// Using Gemini API Key (Can be passed via OPENAI_API_KEY environment variable to avoid changing Easypanel config)
const genAI = new GoogleGenerativeAI(process.env.OPENAI_API_KEY || '');

export const getAIResponse = async (prompt: string, personality: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = personality;
    
    // Simpler prompt style for stability
    const fullPrompt = `${systemPrompt}\n\nO usuário falou: "${prompt}". Responda agora como o Filhote do Mohammed:`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    if (!text) throw new Error('Gemini returned empty text');

    return text;
  } catch (error: any) {
    // THIS LOG IS KEY: Check it on Easypanel
    console.error('[AI SERVICE ERROR]:', error.message || error);
    
    // If it's 401, the key is wrong.
    if (error.message?.includes('401')) {
        console.error('DETECTED: Your Gemini API Key seems to be WRONG/INVALID.');
    }
    
    return botTexts.ai.errorGeneric;
  }
};
