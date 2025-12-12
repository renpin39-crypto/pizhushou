import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DataPreview } from './components/DataPreview';
import { parseExcel, exportToCSV, fileToDataURL } from './services/fileParser';
import { rewriteCaption } from './services/gemini';
import { getSessions, saveSession, deleteSession } from './services/storage';
import { CaptionRow, HistorySession } from './types';
import { Upload, FileSpreadsheet, Play, Download, Trash2, StopCircle, Image as ImageIcon, FileText, Link as LinkIcon, PlusCircle, PenTool, X, Save } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

type UploadMode = 'excel' | 'image' | 'match' | 'manual';

function App() {
  // REMOVED HARDCODED KEY: Initialize as empty string to force user input
  const [apiKey, setApiKey] = useState('');
  const [customRules, setCustomRules] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3-pro-preview');
  
  const [uploadMode, setUploadMode] = useState<UploadMode>('excel');
  const [data, setData] = useState<CaptionRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStats, setProcessingStats] = useState({ total: 0, completed: 0, failed: 0 });
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  
  // Manual Input State
  const [manualText, setManualText] = useState('');
  const [manualImage, setManualImage] = useState<File | null>(null);
  const [manualImagePreview, setManualImagePreview] = useState<string | null>(null);

  const stopProcessingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const matchImageInputRef = useRef<HTMLInputElement>(null);
  const manualImageInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    setHistorySessions(getSessions());
  }, []);

  // History Handlers
  const handleSaveHistory = () => {
    if (data.length === 0) return;
    try {
        const newSession = saveSession(data, processingStats);
        setHistorySessions(prev => [newSession, ...prev]);
        alert('记录已保存至历史列表。');
    } catch (e: any) {
        alert(e.message);
    }
  };

  const handleDeleteSession = (id: string) => {
      const updated = deleteSession(id);
      setHistorySessions(updated);
  };

  const handleLoadSession = (session: HistorySession) => {
      try {
          if (!session.data || !Array.isArray(session.data) || session.data.length === 0) {
              alert('该历史记录数据为空或格式错误，无法加载。');
              return;
          }
          
          // Deep copy data to ensure React detects state change and re-renders
          const newData = session.data.map(item => ({ ...item }));
          
          // Update State
          setData(newData);
          setProcessingStats(session.stats);
          
          // Reset UI states
          setIsProcessing(false);
          stopProcessingRef.current = false;
          setUploadMode('excel'); 
          
      } catch (error: any) {
          console.error("Load session error:", error);
          alert(`加载失败: ${error.message}`);
      }
  };

  // Handle Excel Upload
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const jsonData = await parseExcel(file);
      
      const processedData: CaptionRow[] = jsonData.map((row: any): CaptionRow => {
        const captionKey = Object.keys(row).find(k => 
          k.toLowerCase().includes('caption') || 
          k.toLowerCase().includes('desc') ||
          k.toLowerCase().includes('描述')
        ) || Object.keys(row)[0];
        
        const imageKey = Object.keys(row).find(k => 
            k.toLowerCase().includes('path') || 
            k.toLowerCase().includes('image') || 
            k.toLowerCase().includes('img') ||
            k.toLowerCase().includes('图片')
        );

        return {
          id: uuidv4(),
          original: String(row[captionKey] || ''),
          rewritten: null,
          status: 'pending',
          imagePath: imageKey ? String(row[imageKey]) : undefined
        };
      }).filter(item => item.original && item.original.trim() !== '');

      setData(processedData);
      setProcessingStats({ total: processedData.length, completed: 0, failed: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error) {
      console.error(error);
      alert("解析 Excel 文件失败。请确保文件是有效的 .xlsx 或 .xls 格式。");
    }
  };

  // Handle Image Upload (Pure Image Mode)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newRows: CaptionRow[] = [];
      
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file.type.startsWith('image/')) continue;

          try {
              const dataUrl = await fileToDataURL(file);
              newRows.push({
                  id: uuidv4(),
                  original: '', 
                  rewritten: null,
                  status: 'pending',
                  imageData: dataUrl,
                  imagePath: file.name
              });
          } catch (err) {
              console.error("Failed to read image", file.name, err);
          }
      }

      setData(prev => [...prev, ...newRows]);
      setProcessingStats(prev => ({ 
          ...prev, 
          total: prev.total + newRows.length 
      }));
      
      if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Handle Matching Images Upload (Match Mode)
  const handleMatchImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileMap = new Map<string, File>();
    for (let i = 0; i < files.length; i++) {
        fileMap.set(files[i].name, files[i]);
    }

    let matchedCount = 0;
    const newData = [...data];
    
    const findMatch = (path: string | undefined): File | undefined => {
        if (!path) return undefined;
        if (fileMap.has(path)) return fileMap.get(path);
        for (const [name, file] of fileMap.entries()) {
            if (path.endsWith(name) || path.endsWith('/' + name) || path.endsWith('\\' + name)) {
                return file;
            }
        }
        return undefined;
    };

    const updates: {index: number, dataUrl: string}[] = [];

    for (let i = 0; i < newData.length; i++) {
        if (newData[i].imageData) continue;
        const file = findMatch(newData[i].imagePath);
        if (file) {
            try {
                const dataUrl = await fileToDataURL(file);
                updates.push({ index: i, dataUrl });
                matchedCount++;
            } catch (err) {
                console.error("Failed to read matched image", file.name);
            }
        }
    }

    updates.forEach(u => {
        newData[u.index].imageData = u.dataUrl;
    });

    setData(newData);
    alert(`已匹配并加载 ${matchedCount} 张图片。`);
    if (matchImageInputRef.current) matchImageInputRef.current.value = '';
  };

  // Handle Manual Image Select
  const handleManualImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setManualImage(file);
      const url = await fileToDataURL(file);
      setManualImagePreview(url);
  };

  // Add Manual Entry
  const addManualEntry = () => {
      if (!manualImagePreview && !manualText.trim()) {
          alert("请提供文本或图片。");
          return;
      }

      const newItem: CaptionRow = {
          id: uuidv4(),
          original: manualText,
          rewritten: null,
          status: 'pending',
          imageData: manualImagePreview || undefined,
          imagePath: manualImage?.name
      };

      setData(prev => [...prev, newItem]);
      setProcessingStats(prev => ({ ...prev, total: prev.total + 1 }));
      
      // Reset manual form
      setManualText('');
      setManualImage(null);
      setManualImagePreview(null);
      if (manualImageInputRef.current) manualImageInputRef.current.value = '';
  };

  const clearData = () => {
    setData([]);
    setProcessingStats({ total: 0, completed: 0, failed: 0 });
    setIsProcessing(false);
    stopProcessingRef.current = false;
  };

  const startProcessing = async () => {
    if (!apiKey) {
      alert("请在左侧【设置】栏中输入您的 Gemini API Key 才能开始。\n\n您可以前往 aistudio.google.com 免费申请。");
      return;
    }
    if (data.length === 0) return;

    setIsProcessing(true);
    stopProcessingRef.current = false;
    
    const itemsToProcess = data.map((item, index) => ({ item, index }))
      .filter(({ item }) => item.status === 'pending' || item.status === 'error');

    const CONCURRENCY = 3;
    let index = 0;

    const worker = async () => {
        if (stopProcessingRef.current) return;
        
        while (index < itemsToProcess.length) {
             if (stopProcessingRef.current) break;
             const currentIndex = index++;
             if (currentIndex >= itemsToProcess.length) break;

             const { item, index: originalIndex } = itemsToProcess[currentIndex];

             setData(prev => {
                const newData = [...prev];
                newData[originalIndex] = { ...newData[originalIndex], status: 'processing', error: undefined };
                return newData;
             });

             try {
                const input = {
                    text: item.original || undefined,
                    imageData: item.imageData || undefined
                };

                const result = await rewriteCaption(apiKey, selectedModel, input, customRules);
                
                setData(prev => {
                    const newData = [...prev];
                    newData[originalIndex] = { 
                        ...newData[originalIndex], 
                        status: 'completed', 
                        rewritten: result.rewritten,
                        original: result.extractedOriginal || newData[originalIndex].original
                    };
                    return newData;
                });
                
                setProcessingStats(prev => ({ ...prev, completed: prev.completed + 1 }));

             } catch (err: any) {
                 console.error(err);
                 setData(prev => {
                    const newData = [...prev];
                    newData[originalIndex] = { 
                        ...newData[originalIndex], 
                        status: 'error', 
                        error: err.message 
                    };
                    return newData;
                 });
                 setProcessingStats(prev => ({ ...prev, failed: prev.failed + 1 }));
             }
        }
    };

    const workers = Array(CONCURRENCY).fill(null).map(() => worker());
    await Promise.all(workers);

    setIsProcessing(false);
  };

  const stopProcessing = () => {
    stopProcessingRef.current = true;
    setIsProcessing(false);
  };

  const handleDownload = () => {
    const exportData = data.map(item => ({
        'ID': item.id,
        'Original Caption': item.original,
        'Rewritten Caption': item.rewritten || '',
        'Image Path': item.imagePath || '',
        'Status': item.status,
        'Error': item.error || ''
    }));
    exportToCSV(exportData, `caption_rewrites_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const progressPercentage = processingStats.total > 0 
    ? Math.round(((processingStats.completed + processingStats.failed) / processingStats.total) * 100) 
    : 0;

  const matchedImagesCount = data.filter(r => !!r.imageData).length;

  const getModeLabel = (mode: UploadMode) => {
      switch(mode) {
          case 'excel': return 'Excel 批量';
          case 'match': return 'Excel + 图片';
          case 'image': return '纯图片分析';
          case 'manual': return '手动输入';
          default: return mode;
      }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar 
        apiKey={apiKey}
        setApiKey={setApiKey}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        customRules={customRules}
        setCustomRules={setCustomRules}
        historySessions={historySessions}
        onLoadSession={handleLoadSession}
        onDeleteSession={handleDeleteSession}
      />

      <div className="ml-80 flex-1 p-8 flex flex-col h-screen">
        
        {/* Header Area */}
        <div className="flex justify-between items-start mb-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-800 mb-2">AI Caption 改写助手</h1>
                <p className="text-slate-500">智能图像描述分析与改写工具。</p>
            </div>
            
            <div className="flex items-center gap-3">
                 {data.length > 0 && (
                    <button 
                        onClick={handleSaveHistory}
                        className="flex items-center gap-2 px-4 py-2 text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                        title="保存当前结果到历史记录"
                    >
                        <Save className="w-4 h-4" />
                        保存记录
                    </button>
                 )}
                 {data.length > 0 && (
                    <button 
                        onClick={clearData}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        <Trash2 className="w-4 h-4" />
                        清空
                    </button>
                 )}
                 {data.length > 0 && (
                    <button 
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        导出结果
                    </button>
                 )}
            </div>
        </div>

        {/* Upload Mode Tabs */}
        {data.length === 0 && (
            <div className="flex justify-center mb-6">
                <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 inline-flex">
                    <button
                        onClick={() => setUploadMode('excel')}
                        className={clsx(
                            "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                            uploadMode === 'excel' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                        )}
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel 批量
                    </button>
                    <button
                        onClick={() => setUploadMode('match')}
                        className={clsx(
                            "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                            uploadMode === 'match' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                        )}
                    >
                        <LinkIcon className="w-4 h-4" />
                        Excel + 图片
                    </button>
                    <button
                        onClick={() => setUploadMode('image')}
                        className={clsx(
                            "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                            uploadMode === 'image' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                        )}
                    >
                        <ImageIcon className="w-4 h-4" />
                        纯图片分析
                    </button>
                    <button
                        onClick={() => setUploadMode('manual')}
                        className={clsx(
                            "px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                            uploadMode === 'manual' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                        )}
                    >
                        <PenTool className="w-4 h-4" />
                        手动输入
                    </button>
                </div>
            </div>
        )}

        {/* Upload/Input Area */}
        {data.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl bg-white m-4 hover:border-blue-400 transition-colors relative">
                
                {/* Manual Input Form */}
                {uploadMode === 'manual' ? (
                     <div className="w-full max-w-2xl p-8">
                         <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">手动录入 Caption</h2>
                         
                         <div className="flex gap-6">
                             {/* Image Upload Box */}
                             <div className="w-1/3 flex-shrink-0">
                                 <label className="block text-sm font-medium text-slate-700 mb-2">图片 (可选)</label>
                                 <div 
                                    onClick={() => manualImageInputRef.current?.click()}
                                    className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-blue-500 transition-all relative overflow-hidden bg-slate-50"
                                 >
                                     {manualImagePreview ? (
                                         <>
                                            <img src={manualImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
                                                更换图片
                                            </div>
                                         </>
                                     ) : (
                                         <div className="text-center p-4">
                                             <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                             <span className="text-xs text-slate-500">点击上传</span>
                                         </div>
                                     )}
                                     <input 
                                        ref={manualImageInputRef}
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handleManualImageSelect}
                                     />
                                 </div>
                                 {manualImagePreview && (
                                     <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setManualImage(null);
                                            setManualImagePreview(null);
                                            if (manualImageInputRef.current) manualImageInputRef.current.value = '';
                                        }}
                                        className="text-xs text-red-500 mt-2 flex items-center gap-1 hover:underline"
                                     >
                                         <X className="w-3 h-3" /> 移除图片
                                     </button>
                                 )}
                             </div>

                             {/* Text Input */}
                             <div className="flex-1 flex flex-col">
                                 <label className="block text-sm font-medium text-slate-700 mb-2">原始 Caption</label>
                                 <textarea
                                     value={manualText}
                                     onChange={(e) => setManualText(e.target.value)}
                                     placeholder="请输入原始 caption..."
                                     className="flex-1 w-full p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm leading-relaxed"
                                 />
                             </div>
                         </div>

                         <div className="mt-8 flex justify-end">
                             <button
                                 onClick={addManualEntry}
                                 disabled={!manualText && !manualImagePreview}
                                 className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                             >
                                 <PlusCircle className="w-5 h-5" />
                                 添加到列表
                             </button>
                         </div>
                     </div>
                ) : (
                    <div className="text-center p-10 max-w-md">
                        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                            {uploadMode === 'image' ? <ImageIcon className="w-8 h-8 text-blue-600" /> : <FileSpreadsheet className="w-8 h-8 text-blue-600" />}
                        </div>
                        
                        <h2 className="text-xl font-bold text-slate-800 mb-2">
                            {uploadMode === 'image' ? "上传图片" : "上传 Excel 文件"}
                        </h2>
                        
                        <p className="text-slate-500 mb-8">
                            {uploadMode === 'excel' && "拖放 .xlsx 文件到此处。"}
                            {uploadMode === 'image' && "拖放图片到此处以提取并改写。"}
                            {uploadMode === 'match' && "先上传 Excel 文件，然后关联图片。"}
                        </p>
                        
                        {uploadMode === 'image' ? (
                            <>
                                <button 
                                    onClick={() => imageInputRef.current?.click()}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:scale-105"
                                >
                                    选择图片
                                </button>
                                <input 
                                    ref={imageInputRef}
                                    type="file" 
                                    accept="image/png, image/jpeg, image/jpg, image/webp"
                                    multiple
                                    className="hidden" 
                                    onChange={handleImageUpload}
                                />
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:scale-105"
                                >
                                    选择 Excel 文件
                                </button>
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept=".xlsx, .xls"
                                    className="hidden" 
                                    onChange={handleExcelUpload}
                                />
                            </>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* Main Content Area (Data & Controls) */}
        {data.length > 0 && (
            <div className="flex flex-col gap-6 h-full">
                
                {/* Stats Bar */}
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-500 text-xs font-semibold uppercase">总条目</p>
                        <p className="text-2xl font-bold text-slate-800">{processingStats.total}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-500 text-xs font-semibold uppercase">已处理</p>
                        <p className="text-2xl font-bold text-blue-600">{processingStats.completed}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <p className="text-slate-500 text-xs font-semibold uppercase">失败</p>
                        <p className="text-2xl font-bold text-red-500">{processingStats.failed}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                         <div className="flex-1">
                            <p className="text-slate-500 text-xs font-semibold uppercase mb-1">进度</p>
                            <div className="w-full bg-slate-100 rounded-full h-2.5">
                                <div 
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                                    style={{ width: `${progressPercentage}%` }}
                                ></div>
                            </div>
                         </div>
                         <span className="ml-3 text-lg font-bold text-slate-700">{progressPercentage}%</span>
                    </div>
                </div>

                {/* Control Bar */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between gap-4">
                    <div>
                        <h3 className="font-semibold text-slate-800">准备就绪</h3>
                        <div className="text-sm text-slate-500 flex items-center gap-2">
                           模式: <span className="font-semibold text-slate-700 uppercase">{getModeLabel(uploadMode)}</span>
                           {uploadMode === 'match' && (
                               <span className={clsx("text-xs px-2 py-0.5 rounded-full", matchedImagesCount === data.length ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700")}>
                                   {matchedImagesCount} / {data.length} 图片已关联
                               </span>
                           )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                         {/* Match Mode: Button to Upload Images */}
                         {uploadMode === 'match' && (
                             <>
                                <button 
                                    onClick={() => matchImageInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 font-medium transition-colors"
                                >
                                    <LinkIcon className="w-4 h-4" />
                                    关联图片
                                </button>
                                <input 
                                    ref={matchImageInputRef}
                                    type="file" 
                                    accept="image/png, image/jpeg, image/jpg, image/webp"
                                    multiple
                                    className="hidden" 
                                    onChange={handleMatchImageUpload}
                                />
                             </>
                         )}

                         {/* Image Mode: Button to Add More Images */}
                         {uploadMode === 'image' && (
                            <button 
                                onClick={() => imageInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-3 bg-white text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-50 font-medium transition-colors"
                            >
                                <PlusCircle className="w-4 h-4" />
                                添加更多
                            </button>
                         )}

                         {/* Manual Mode: Add Another */}
                         {uploadMode === 'manual' && (
                            <button 
                                onClick={() => {}}
                                className="hidden" 
                            >
                                添加更多
                            </button>
                         )}

                        {isProcessing ? (
                            <button 
                                onClick={stopProcessing}
                                className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-semibold transition-colors"
                            >
                                <StopCircle className="w-5 h-5" />
                                停止
                            </button>
                        ) : (
                            <button 
                                onClick={startProcessing}
                                disabled={processingStats.completed === processingStats.total && processingStats.total > 0 && processingStats.failed === 0}
                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                                <Play className="w-5 h-5" />
                                {processingStats.completed > 0 ? '继续处理' : '开始处理'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <DataPreview data={data} isProcessing={isProcessing} />
            </div>
        )}

      </div>
    </div>
  );
}

export default App;