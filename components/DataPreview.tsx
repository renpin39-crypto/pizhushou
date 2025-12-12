import React, { useState, useMemo } from 'react';
import { CaptionRow } from '../types';
import { Loader2, AlertCircle, CheckCircle, Clock, ImageIcon, ToggleLeft, ToggleRight, Split, FileText } from 'lucide-react';
import clsx from 'clsx';
import * as Diff from 'diff';

interface DataPreviewProps {
  data: CaptionRow[];
  isProcessing: boolean;
}

// Helper to extract clean rewritten text from the analysis report
const extractRewrittenText = (fullText: string | null) => {
  if (!fullText) return '';
  // Regex looks for "改写caption" followed by colon, and grabs everything after until end of string.
  // Handles various punctuation: :, ：, **
  const match = fullText.match(/(?:改写caption|Rewritten Caption|改写后|Final Caption)\s*[:：]\s*([\s\S]+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return fullText;
};

interface DiffViewProps {
    original: string;
    rewritten: string;
    type: 'original' | 'rewritten';
}

const DiffView: React.FC<DiffViewProps> = ({ original, rewritten, type }) => {
    const cleanRewritten = useMemo(() => extractRewrittenText(rewritten), [rewritten]);
    
    const diff = useMemo(() => {
        // Use diffChars for character level diffing which works for mixed languages including Chinese
        return Diff.diffChars(original || '', cleanRewritten || '');
    }, [original, cleanRewritten]);

    return (
        <div className="whitespace-pre-wrap leading-relaxed break-words text-sm">
            {diff.map((part, index) => {
                if (type === 'original') {
                    // Original View Logic:
                    // Show text that existed in the original.
                    
                    // 1. If part was added in the new version, it wasn't in original -> Skip.
                    if (part.added) return null;
                    
                    // 2. If part was removed, it WAS in original but is gone now.
                    // User Request: Highlight deletions/changes in GREEN in the original column.
                    if (part.removed) {
                         return <span key={index} className="bg-green-200 text-slate-900 rounded-sm px-0.5 box-decoration-clone border-b-2 border-green-300">{part.value}</span>;
                    }
                    
                    // 3. Unchanged text
                    return <span key={index} className="text-slate-600">{part.value}</span>;
                } else {
                    // Rewritten View Logic:
                    // Show text that exists in the rewritten version.

                    // 1. If part was removed, it's not in the new version -> Skip.
                    if (part.removed) return null;

                    // 2. If part was added, it IS in the new version.
                    // User Request: Highlight additions in GREEN in the new column.
                    if (part.added) {
                        return <span key={index} className="bg-green-200 text-slate-900 rounded-sm px-0.5 box-decoration-clone border-b-2 border-green-300">{part.value}</span>;
                    }

                    // 3. Unchanged text
                    return <span key={index} className="text-slate-900">{part.value}</span>;
                }
            })}
        </div>
    );
};

export const DataPreview: React.FC<DataPreviewProps> = ({ data, isProcessing }) => {
  const [showDiff, setShowDiff] = useState(false);

  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-300px)]">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="w-2 h-6 bg-blue-600 rounded-full"></span>
          数据预览 ({data.length} 条)
        </h3>
        
        <div className="flex items-center gap-6">
            {/* Diff Toggle */}
            <button 
                onClick={() => setShowDiff(!showDiff)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
            >
                {showDiff ? <ToggleRight className="w-5 h-5 text-blue-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                <span className={clsx(showDiff && "text-blue-600")}>
                    高亮差异
                </span>
            </button>

            <div className="h-4 w-px bg-slate-300"></div>

            <div className="flex gap-4 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300"></span> 待处理</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> 处理中</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> 已完成</div>
            </div>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 custom-scrollbar relative">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-16 text-center">序号</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-24 text-center">图片</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">
                  {showDiff ? "原始 Caption (修改处高亮)" : "原始 Caption / 上下文"}
              </th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {showDiff ? "改写结果 (新增处高亮)" : "分析报告与改写结果"}
              </th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32 text-center">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, index) => (
              <tr key={row.id} className={clsx("hover:bg-slate-50 transition-colors", row.status === 'processing' && 'bg-blue-50/50')}>
                <td className="p-4 text-sm text-slate-500 text-center">{index + 1}</td>
                <td className="p-4 text-center">
                    {row.imageData ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 mx-auto bg-slate-100">
                             <img src={row.imageData} alt="preview" className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-16 h-16 rounded-lg border border-slate-200 mx-auto bg-slate-50 flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                        </div>
                    )}
                </td>
                <td className="p-4 text-sm text-slate-700 leading-relaxed align-top">
                  {row.imageData && !row.original ? (
                     <span className="text-slate-400 italic text-xs">等待从图片提取文本...</span>
                  ) : (
                     showDiff ? (
                        <DiffView original={row.original} rewritten={row.rewritten || ''} type="original" />
                     ) : (
                        <div className="whitespace-pre-wrap">{row.original}</div>
                     )
                  )}
                  {row.imagePath && (
                     <div className="mt-1 text-xs text-slate-400 font-mono bg-slate-100 inline-block px-1 rounded">
                        {row.imagePath}
                     </div>
                  )}
                </td>
                <td className="p-4 text-sm text-slate-900 leading-relaxed align-top">
                    {row.rewritten ? (
                        <>
                            {showDiff ? (
                                <DiffView original={row.original} rewritten={row.rewritten} type="rewritten" />
                            ) : (
                                <div className="whitespace-pre-wrap font-mono text-xs bg-slate-50 p-3 rounded border border-slate-100">
                                    {row.rewritten}
                                </div>
                            )}
                        </>
                    ) : (
                        <span className="text-slate-300 italic">等待处理...</span>
                    )}
                    {row.error && <p className="text-red-500 text-xs mt-1">{row.error}</p>}
                </td>
                <td className="p-4 text-center align-top">
                  <div className="flex justify-center">
                    {row.status === 'pending' && <Clock className="w-5 h-5 text-slate-300" />}
                    {row.status === 'processing' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                    {row.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {row.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};