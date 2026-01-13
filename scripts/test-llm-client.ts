/**
 * Quick test script for the LLM client
 */
import 'dotenv/config';
import { z } from 'zod';
import { createLLMClient } from '../src/llm/client.js';

const GreetingSchema = z.object({
  greeting: z.string(),
  number: z.number(),
});

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('Creating LLM client...');
  const client = createLLMClient(apiKey);

  console.log('Client ready:', client.isReady());

  console.log('\nTesting invokeStructured...');
  try {
    const result = await client.invokeStructured(
      [{ role: 'user', content: 'Return only valid JSON: {"greeting": "hello", "number": 42}' }],
      GreetingSchema
    );

    console.log('Response:', result.data);
    console.log('Tokens used:', result.usage);
    console.log('\n✓ LLM client is working!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
