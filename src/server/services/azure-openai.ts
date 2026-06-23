import type { Env } from "../types/env";
import { withRetry } from "../lib/retry";

export class AzureOpenAIService {
  private endpoint: string;
  private deploymentName: string;
  private apiKey: string;

  constructor(env?: Env) {
    this.endpoint =
      env?.AZURE_OPENAI_ENDPOINT ||
      (typeof process !== "undefined" ? process.env.AZURE_OPENAI_ENDPOINT : "") ||
      "https://monet-editor-resource.services.ai.azure.com/openai/v1";
    
    this.deploymentName =
      env?.AZURE_OPENAI_DEPLOYMENT ||
      (typeof process !== "undefined" ? process.env.AZURE_OPENAI_DEPLOYMENT : "") ||
      "gpt-4o-mini";
    
    this.apiKey =
      env?.AZURE_OPENAI_API_KEY ||
      (typeof process !== "undefined" ? process.env.AZURE_OPENAI_API_KEY : "") ||
      "";

    if (!this.apiKey) {
      throw new Error(
        "AZURE_OPENAI_API_KEY not found. Please add it to .dev.vars for local development."
      );
    }
  }

  async generateContentJSON<T = any>(params: {
    prompt: string | any[];
    systemInstruction?: string;
    temperature?: number;
    schema?: any;
  }): Promise<T> {
    return withRetry(async () => {
      const messages: any[] = [];
      
      let systemContent = params.systemInstruction || "";
      
      // If schema is provided, include it in the system instruction for better compliance
      if (params.schema) {
        systemContent += `\n\nYou MUST respond with valid JSON that strictly follows this schema:\n${JSON.stringify(params.schema, null, 2)}\n\nDo not include any fields not specified in the schema. Ensure all required fields are present.`;
      }
      
      if (systemContent) {
        messages.push({
          role: "system",
          content: systemContent,
        });
      }
      
      const userContent = typeof params.prompt === "string" 
        ? params.prompt 
        : JSON.stringify(params.prompt);
      
      messages.push({
        role: "user",
        content: userContent,
      });

      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: this.deploymentName,
          messages,
          temperature: params.temperature ?? 0.85,
          max_tokens: 8192,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error("Empty response from Azure OpenAI");
      }

      return JSON.parse(content) as T;
    }, {
      retries: 2,
      baseDelay: 500,
    });
  }

  async generateContent(params: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
  }): Promise<string> {
    const messages: any[] = [];
    
    if (params.systemInstruction) {
      messages.push({
        role: "system",
        content: params.systemInstruction,
      });
    }
    
    messages.push({
      role: "user",
      content: params.prompt,
    });

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.deploymentName,
        messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("Empty response from Azure OpenAI");
    }

    return content;
  }
}
