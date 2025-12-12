import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // 加载环境变量，第二个参数 '.' 表示当前目录
    const env = loadEnv(mode, '.', '');

    return {
      // 1. 显式指定 base 路径，防止 Vercel 有时候找不到资源
      base: '/',

      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      
      // 2. 环境变量注入
      // 这里做了一个安全处理：(env.XX || '')
      // 如果你在 Vercel 里忘了填 Key，这行代码会填入空字符串，防止应用直接崩溃白屏
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
