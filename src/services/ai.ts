import { GoogleGenerativeAI } from '@google/generative-ai';
import { botTexts } from '../config/texts';

// Using Gemini API Key (Can be passed via OPENAI_API_KEY environment variable to avoid changing Easypanel config)
const genAI = new GoogleGenerativeAI(process.env.OPENAI_API_KEY || '');

export const getAIResponse = async (prompt: string, personality: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = botTexts.identity.systemPrompt.replace('${personality}', personality);
    
    const fullPrompt = `${systemPrompt}\n\nUsuário: ${prompt}\n\nFilhote do Mohammed:`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return text || botTexts.ai.error;
  } catch (error) {
    console.error('Gemini Error:', error);
    return botTexts.ai.error;
  }
};
