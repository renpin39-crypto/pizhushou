import React, { useRef, useState } from 'react';
import { Settings, FileText, Key, Upload, CheckCircle, HelpCircle, History, Trash2, ChevronRight, RotateCcw } from 'lucide-react';
import { extractTextFromPdf } from '../services/fileParser';
import { MODEL_OPTIONS } from '../constants';
import { HistorySession } from '../types';
import clsx from 'clsx';

interface SidebarProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  customRules: string;
  setCustomRules: (rules: string) => void;
  // History Props
  historySessions: HistorySession[];
  onLoadSession: (session: HistorySession) => void;
  onDeleteSession: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  apiKey,
  setApiKey,
  selectedModel,
  setSelectedModel,
  customRules,
  setCustomRules,
  historySessions,
  onLoadSession,
  onDeleteSession
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('请上传有效的 PDF 文件。');
      return;
    }

    setIsProcessingPdf(true);
    try {
      const text = await extractTextFromPdf(file);
      setCustomRules(text);
    } catch (error) {
      alert('无法从 PDF 中提取文本');
    } finally {
      setIsProcessingPdf(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 h-screen flex flex-col fixed left-0 top-0 overflow-y-auto z-10">
      {/* Header with Tabs */}
      <div className="bg-slate-50 border-b border-slate-200 p-2">
        <div className="flex bg-slate-200/50 p-1 rounded-lg">
            <button
                onClick={() => setActiveTab('settings')}
                className={clsx(
                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === 'settings' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
            >
                <Settings className="w-4 h-4" />
                设置
            </button>
            <button
                onClick={() => setActiveTab('history')}
                className={clsx(
                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === 'history' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
            >
                <History className="w-4 h-4" />
                历史记录
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'settings' ? (
            <div className="p-6 space-y-8">
                <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-800">配置参数</h2>
                    <p className="text-xs text-slate-500">配置 API Key 与改写规则</p>
                </div>

                {/* API Key Section */}
                <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Google AI Studio Key
                </label>
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="输入 API Key"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                />
                <p className="text-xs text-slate-500">
                    访问 Gemini 模型所必需。
                </p>
                </div>

                {/* Model Selection */}
                <div className="space-y-3">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    选择模型
                    </label>
                    <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    >
                    {MODEL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                    </select>
                </div>

                {/* Rules Upload Section */}
                <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    规则文件 (PDF)
                </label>
                
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors group"
                >
                    <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handlePdfUpload}
                    />
                    <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2 group-hover:text-blue-500" />
                    <p className="text-sm text-slate-600 font-medium">点击上传 PDF</p>
                    <p className="text-xs text-slate-400 mt-1">自动提取规则文本</p>
                </div>

                {isProcessingPdf && (
                    <div className="text-xs text-blue-600 flex items-center gap-1 animate-pulse">
                    正在解析 PDF...
                    </div>
                )}

                {customRules && !isProcessingPdf && (
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="flex items-center gap-2 text-green-700 mb-1">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs font-semibold">规则已提取</span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-3 italic">
                        {customRules.substring(0, 100)}...
                    </p>
                    <button 
                        onClick={() => setCustomRules('')}
                        className="text-xs text-red-500 mt-2 hover:underline"
                    >
                        清除规则
                    </button>
                    </div>
                )}
                </div>
            </div>
        ) : (
            <div className="p-4 space-y-4">
                 <div className="space-y-1 px-2">
                    <h2 className="text-lg font-bold text-slate-800">历史记录</h2>
                    <p className="text-xs text-slate-500">点击加载旧记录（图片预览不保存）</p>
                </div>

                {historySessions.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                        <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">暂无历史记录</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {historySessions.map(session => (
                            <div key={session.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow group relative">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-slate-700">{session.name}</span>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if(confirm('确定要删除这条记录吗？')) onDeleteSession(session.id);
                                        }}
                                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                
                                <div className="flex gap-2 text-[10px] text-slate-500 mb-3">
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">总数: {session.stats.total}</span>
                                    <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded">成功: {session.stats.completed}</span>
                                </div>

                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if(window.confirm('加载历史记录将覆盖当前工作区的内容，确定吗？')) {
                                            onLoadSession(session);
                                        }
                                    }}
                                    className="w-full flex items-center justify-center gap-1 text-xs bg-blue-50 text-blue-600 py-1.5 rounded hover:bg-blue-100 transition-colors font-medium"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    加载数据
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </div>

      {activeTab === 'settings' && (
        <div className="bg-slate-50 p-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-800 mb-2">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm font-semibold">使用说明</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                <li>输入 API Key 并选择模型。</li>
                <li>上传 Excel 或图片进行处理。</li>
                <li>处理完成后可“保存记录”至历史页。</li>
            </ul>
        </div>
      )}
    </div>
  );
};