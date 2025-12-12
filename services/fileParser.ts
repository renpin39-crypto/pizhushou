import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import * as Diff from 'diff';

// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const parseExcel = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const extractTextFromPdf = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to clean text (duplicate of logic in DataPreview for consistency)
const extractRewrittenText = (fullText: string | null) => {
  if (!fullText) return '';
  const match = fullText.match(/(?:改写caption|Rewritten Caption|改写后|Final Caption)\s*[:：]\s*([\s\S]+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return fullText;
};

export const exportToCSV = (data: any[], filename: string) => {
  // We will intercept the data to build Rich Text objects for Excel
  // Note: Excel does not support partial background color in a cell, 
  // so we use Green Bold Text to indicate highlighting.

  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [
    ['ID', 'Original Caption (Diff)', 'Rewritten Caption (Diff)', 'Image Path', 'Status', 'Error'] // Header
  ];

  // We need to construct the worksheet manually to inject Rich Text objects
  // First, calculate all diffs and text runs
  const richTextRows: any[] = [];

  data.forEach(item => {
    const originalText = item['Original Caption'] || '';
    const rawRewritten = item['Rewritten Caption'] || '';
    const cleanRewritten = extractRewrittenText(rawRewritten);

    const diff = Diff.diffChars(originalText, cleanRewritten);

    // Build Original Column Rich Text (Show removals in Green)
    const originalRuns: any[] = [];
    diff.forEach(part => {
      if (part.added) return; // Skip added parts in original column
      if (part.removed) {
         // Highlight removed parts (Modified parts)
         originalRuns.push({ 
           t: part.value, 
           pr: { color: { rgb: "16A34A" }, b: true, u: true } // Green, Bold, Underline
         });
      } else {
         originalRuns.push({ t: part.value });
      }
    });

    // Build Rewritten Column Rich Text (Show additions in Green)
    const rewrittenRuns: any[] = [];
    diff.forEach(part => {
      if (part.removed) return; // Skip removed parts in rewritten column
      if (part.added) {
         // Highlight added parts
         rewrittenRuns.push({ 
           t: part.value, 
           pr: { color: { rgb: "16A34A" }, b: true } // Green, Bold
         });
      } else {
         rewrittenRuns.push({ t: part.value });
      }
    });

    richTextRows.push({
      original: originalRuns.length > 0 ? { r: originalRuns } : originalText,
      rewritten: rewrittenRuns.length > 0 ? { r: rewrittenRuns } : cleanRewritten,
      others: [item['ID'], item['Image Path'], item['Status'], item['Error']]
    });
  });

  // Create sheet with basic header
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Append Rich Text Rows
  richTextRows.forEach((row, idx) => {
    const rowIndex = idx + 1; // 0 is header
    
    // Column A: ID
    XLSX.utils.sheet_add_aoa(ws, [[row.others[0]]], { origin: { r: rowIndex, c: 0 } });
    
    // Column B: Original (Rich Text)
    const cellRefOriginal = XLSX.utils.encode_cell({ r: rowIndex, c: 1 });
    ws[cellRefOriginal] = { t: 's', ...row.original as any }; // Direct assignment for Rich Text

    // Column C: Rewritten (Rich Text)
    const cellRefRewritten = XLSX.utils.encode_cell({ r: rowIndex, c: 2 });
    ws[cellRefRewritten] = { t: 's', ...row.rewritten as any }; // Direct assignment for Rich Text

    // Columns D, E, F
    XLSX.utils.sheet_add_aoa(ws, [[row.others[1], row.others[2], row.others[3]]], { origin: { r: rowIndex, c: 3 } });
  });

  // Set column widths
  ws['!cols'] = [
    { wch: 30 }, // ID
    { wch: 60 }, // Original
    { wch: 60 }, // Rewritten
    { wch: 20 }, // Path
    { wch: 10 }, // Status
    { wch: 20 }  // Error
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Rewritten Captions");
  XLSX.writeFile(wb, filename);
};