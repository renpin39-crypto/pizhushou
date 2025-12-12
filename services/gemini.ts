import { GoogleGenAI, Schema } from "@google/genai";
import { DEFAULT_SYSTEM_PROMPT } from "../constants";

export interface RewriteResult {
  rewritten: string;
  extractedOriginal?: string;
}

// Helper for OpenAI Compatible APIs (DeepSeek, Kimi/Moonshot)
const callOpenAICompatibleApi = async (
    apiKey: string,
    modelName: string,
    input: { text?: string; imageData?: string },
    systemInstruction: string
): Promise<RewriteResult> => {
    
    // DeepSeek and Kimi primarily support Text-to-Text via this endpoint structure.
    // They do not support standard Base64 Image Injection in the "messages" array in the same way Gemini or GPT-4o does reliably across providers.
    if (input.imageData) {
        throw new Error(`${modelName} 目前仅支持纯文本改写 (Excel 模式)。如需处理图片，请切换回 Gemini 模型。`);
    }

    if (!input.text) {
        throw new Error("No text input provided for text-only model.");
    }

    let baseUrl = '';
    if (modelName.includes('deepseek')) {
        baseUrl = 'https://api.deepseek.com/chat/completions';
    } else if (modelName.includes('moonshot')) {
        baseUrl = 'https://api.moonshot.cn/v1/chat/completions';
    } else {
        throw new Error("Unknown model provider");
    }

    const messages = [
        { role: "system", content: systemInstruction },
        { 
            role: "user", 
            content: `原始 Caption: "${input.text}"\n\n请严格按照系统指令（图片Caption审核与改写专家）的格式要求进行审核和改写。` 
        }
    ];

    try {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: 0.3,
                stream: false
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "No response generated";

        return {
            rewritten: content,
            extractedOriginal: input.text
        };

    } catch (error: any) {
        console.error("OpenAI Compatible API Error:", error);
        throw new Error(error.message || "Failed to rewrite caption via external provider");
    }
};

export const rewriteCaption = async (
  apiKey: string,
  modelName: string,
  input: { text?: string; imageData?: string }, // imageData is full data URL
  customRules: string = ""
): Promise<RewriteResult> => {
  if (!apiKey) throw new Error("API Key is missing");

  // Combine default system prompt with custom rules extracted from PDF
  const systemInstruction = customRules 
    ? `${DEFAULT_SYSTEM_PROMPT}\n\n附加规则文件内容:\n${customRules}`
    : DEFAULT_SYSTEM_PROMPT;

  // ROUTING LOGIC
  const isGoogleModel = modelName.includes('gemini');

  if (!isGoogleModel) {
      return callOpenAICompatibleApi(apiKey, modelName, input, systemInstruction);
  }

  // --- GOOGLE GEMINI SDK LOGIC ---
  const ai = new GoogleGenAI({ apiKey });

  try {
    // Mode 1 & 3: Image Analysis (With or Without explicit text)
    if (input.imageData) {
      const base64Data = input.imageData.split(',')[1];
      const mimeType = input.imageData.substring(input.imageData.indexOf(':') + 1, input.imageData.indexOf(';'));

      let promptText = `请分析这张图片。`;

      if (input.text) {
        // Mode 3: Image + Provided Text (Match Mode)
        promptText += `\n\n用户提供的原始Caption: "${input.text}"\n\n任务：请根据系统指令（图片Caption审核与改写专家），基于图片内容对上述用户提供的"原始Caption"进行严格审核与改写。请指指出原始描述与图片不符、遗漏或不规范之处。`;
      } else {
        // Mode 1: Image Only (Extraction Mode)
        promptText += `\n\n任务1：识别图片中已有的文字描述（caption），例如截图中的文案、底部字幕等。提取这些文字作为"extractedOriginal"。如果图片中没有明显的描述性文案，请返回空字符串。
任务2：根据系统指令（图片Caption审核与改写专家），观察图片视觉内容，生成完整的审核与改写报告。`;
      }

      promptText += `\n\n请以JSON格式返回：
{
  "extractedOriginal": "${input.text ? '用户提供的原始文案' : '提取的原始文案（如有）'}",
  "rewritten": "这里填入完整的输出内容（包含'原始caption分析'、'改写要点'和'改写caption'三部分，严格遵守系统指令的格式要求，保留换行符）"
}`;

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { 
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              },
              { text: promptText }
            ]
          }
        ],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.3,
        }
      });

      const jsonText = response.text || "{}";
      try {
        const parsed = JSON.parse(jsonText);
        return {
          rewritten: parsed.rewritten || "Failed to generate caption",
          extractedOriginal: parsed.extractedOriginal || input.text || ""
        };
      } catch (e) {
        console.warn("Failed to parse JSON response from Gemini, falling back to raw text", jsonText);
        return { rewritten: jsonText, extractedOriginal: input.text };
      }
    } 
    
    // Mode 2: Text Rewrite Only (Excel mode without images)
    else if (input.text) {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: `原始 Caption: "${input.text}"\n\n请严格按照系统指令（图片Caption审核与改写专家）的格式要求进行审核和改写。` }]
          }
        ],
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.3, 
        }
      });

      return {
        rewritten: response.text || "No response generated",
        extractedOriginal: input.text
      };
    }

    throw new Error("No input provided");

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to rewrite caption");
  }
};