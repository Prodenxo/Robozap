import OpenAI from 'openai';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { botTexts } from '../config/texts';

dotenv.config();

const prisma = new PrismaClient();

export class AIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async getMiltonResponse(prompt: string, personality: string = 'sarcastic') {
    const systemPrompt = botTexts.identity.systemPrompt;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error in Filhote response:', error);
      return botTexts.ai.errorBusy;
    }
  }

  async summarizeGroup(groupJid: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { jid: groupJid },
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 100 // Summarize last 100 messages
          }
        }
      });

      if (!group || group.messages.length === 0) {
        return botTexts.ai.errorNoMessages;
      }

      const conversationText = group.messages
        .reverse()
        .map((m: any) => `${m.userJid}: ${m.text}`)
        .join('\n');

      const systemPrompt = botTexts.identity.summaryPrompt;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Resuma isso aqui:\n\n${conversationText}` }
        ]
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error summarizing group:', error);
      return botTexts.ai.errorGeneric;
    }
  }
}
