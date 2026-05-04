import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Settings, Scissors, FileText, AlertCircle, Loader2, LayoutGrid, Receipt, SortAsc, Save, ChevronDown, ChevronUp, Maximize, Printer, Files, X, Plus } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// Define types for external libraries loaded via CDN
declare global {
  interface Window {
    pdfjsLib: any;
    PDFLib: any;
  }
}

export default function App() {
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  // Merge Feature States
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [settings, setSettings] = useState({
    outputFormat: 'a4-grid' as 'a4-grid' | 'thermal', 
    sortBy: 'original',     
    separateInvoice: false, 
  });

  const [showCropSettings, setShowCropSettings] = useState(false);
  const [showMarginSettings, setShowMarginSettings] = useState(false);

  // Default Crop Settings
  const defaultCrop = { x: 32.0, y: 3.0, width: 36.0, height: 42.5 };
  const [crop, setCrop] = useState(() => {
    try {
      const saved = localStorage.getItem('fk_crop_settings_v2');
      return saved ? JSON.parse(saved) : defaultCrop;
    } catch (e) {
      return defaultCrop;
    }
  });

  // Updated Default Margin Settings
  const defaultMargins = {
    page: { top: 0.3, bottom: 0.0, left: 0.0, right: 0.0 },
    label: { top: 0.0, bottom: 0.0, left: 0.0, right: 0.0 }
  };
  
  const [margins, setMargins] = useState(() => {
    try {
      const saved = localStorage.getItem('fk_margin_settings_v4');
      if (saved) return JSON.parse(saved);
      return defaultMargins;
    } catch (e) {
      return defaultMargins;
    }
  });

  // Load PDF.js (for preview/OCR) and PDF-Lib (for true vector cropping/merging)
  useEffect(() => {
    let pdfLoaded = !!window.pdfjsLib;
    let pdfLibLoaded = !!window.PDFLib;

    const checkAllLoaded = () => {
      if (window.pdfjsLib && window.PDFLib) setLibrariesLoaded(true);
    };

    if (!pdfLoaded) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = () => {
        fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js')
          .then(res => res.text())
          .then(workerCode => {
            const blob = new Blob([workerCode], { type: 'text/javascript' });
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
            checkAllLoaded();
          })
          .catch(() => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            checkAllLoaded();
          });
      };
      document.body.appendChild(script);
    }

    if (!pdfLibLoaded) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
      script.async = true;
      script.onload = checkAllLoaded;
      document.body.appendChild(script);
    }
    
    checkAllLoaded();
  }, []);

  useEffect(() => {
    if (pdfFile && showCropSettings && window.pdfjsLib) {
      renderPreview();
    }
  }, [pdfFile, showCropSettings]);

  const renderPreview = async () => {
    try {
      if (!pdfFile) return;
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const containerWidth = Math.min(window.innerWidth - 60, 400); 
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    } catch (err) {
      console.error("Preview render failed:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError("Please upload a valid PDF file.");
      return;
    }
    setError("");
    setPdfFile(file);
    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setTotalPages(pdf.numPages);
    } catch (err) {
      setError("Could not read the PDF. It might be password protected.");
    }
  };

  const handleCropChange = (e: React.ChangeEvent<any>, field: string) => {
    let val = e.target.value;
    if (val === '') { setCrop({ ...crop, [field]: '' }); return; }
    const numVal = parseFloat(val);
    if (!isNaN(numVal)) setCrop({ ...crop, [field]: numVal });
  };

  const handleCropBlur = (field: string) => {
    let val = parseFloat(crop[field]);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 100) val = 100;
    setCrop({ ...crop, [field]: val });
  };

  const handleMarginChange = (e: React.ChangeEvent<any>, type: 'page' | 'label', field: string) => {
    let val = e.target.value;
    if (val === '') { 
      setMargins({ ...margins, [type]: { ...margins[type], [field]: '' } }); 
      return; 
    }
    const numVal = parseFloat(val);
    if (!isNaN(numVal)) {
      setMargins({ ...margins, [type]: { ...margins[type], [field]: numVal } });
    }
  };

  const handleMarginBlur = (type: 'page' | 'label', field: string) => {
    let val = parseFloat(margins[type][field]);
    if (isNaN(val) || val < 0) val = 0;
    setMargins({ ...margins, [type]: { ...margins[type], [field]: val } });
  };

  const saveSettingsToStorage = () => {
    try {
      const validCrop = {
        x: parseFloat(crop.x as any) || 0, 
        y: parseFloat(crop.y as any) || 0,
        width: parseFloat(crop.width as any) || 0, 
        height: parseFloat(crop.height as any) || 0,
      };
      const validMargins = {
        page: {
          top: parseFloat(margins.page.top as any) || 0, 
          bottom: parseFloat(margins.page.bottom as any) || 0,
          left: parseFloat(margins.page.left as any) || 0, 
          right: parseFloat(margins.page.right as any) || 0,
        },
        label: {
          top: parseFloat(margins.label.top as any) || 0, 
          bottom: parseFloat(margins.label.bottom as any) || 0,
          left: parseFloat(margins.label.left as any) || 0, 
          right: parseFloat(margins.label.right as any) || 0,
        }
      };
      setCrop(validCrop);
      setMargins(validMargins);
      localStorage.setItem('fk_crop_settings_v2', JSON.stringify(validCrop));
      localStorage.setItem('fk_margin_settings_v4', JSON.stringify(validMargins));
      setSaveMessage("Settings saved!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (e) {
      setError("Failed to save settings to device storage.");
    }
  };

  // --- Merge Logic ---
  const handleMergeFilesAdded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setMergeFiles(prev => [...prev, ...pdfFiles]);
    if (mergeInputRef.current) mergeInputRef.current.value = '';
  };

  const executeMerge = async () => {
    if (mergeFiles.length === 0 || !window.PDFLib) return;
    setIsProcessing(true);
    setStatusText("Merging PDFs...");
    try {
      const { PDFDocument } = window.PDFLib;
      const mergedPdf = await PDFDocument.create();
      
      for (let i = 0; i < mergeFiles.length; i++) {
        const buffer = await mergeFiles[i].arrayBuffer();
        const doc = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach((page: any) => mergedPdf.addPage(page));
        setProgress(Math.round(((i + 1) / mergeFiles.length) * 100));
      }

      const mergedBytes = await mergedPdf.save();
      const newFile = new File([mergedBytes], "Merged_Document.pdf", { type: "application/pdf" });
      
      setPdfFile(newFile);
      setFileName("Merged_Document.pdf");
      
      const pdfJS = await window.pdfjsLib.getDocument({ data: mergedBytes }).promise;
      setTotalPages(pdfJS.numPages);
      
      setIsMergeModalOpen(false);
      setMergeFiles([]);
      setError("");
    } catch (err) {
      console.error(err);
      alert("Error merging files. Ensure none are password protected.");
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setStatusText("");
    }
  };

  const downloadPdf = async (bytes: Uint8Array, suffix: string) => {
    const finalFileName = `${fileName.replace('.pdf', '')}_${suffix}.pdf`;
    
    // CAPACITOR NATIVE SHARING (Best for APKs)
    if (Capacitor.isNativePlatform()) {
      try {
        setStatusText("Preparing file for share...");
        
        // 1. Convert Bytes to Base64
        let base64 = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          base64 += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)));
        }
        const base64Data = btoa(base64);

        // 2. Save to temporary directory
        const result = await Filesystem.writeFile({
          path: finalFileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        // 3. Share the saved file
        await Share.share({
          title: finalFileName,
          url: result.uri,
        });
        
        return; 
      } catch (err) {
        console.error("Capacitor share failed:", err);
        // If native share fails, we continue to web fallback
      }
    }

    // WEB SHARING (navigator.share)
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], finalFileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: finalFileName,
        });
        return; 
      } catch (err) {
        console.log("Web share failed/cancelled:", err);
      }
    }

    // STANDARD DOWNLOAD (Fallback)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processPDF = async () => {
    if (!pdfFile || !window.pdfjsLib || !window.PDFLib) return;
    
    setIsProcessing(true);
    setError("");

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfJS = await window.pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const numPages = pdfJS.numPages;
      let pagesMetadata: {pageIndex: number, sku: string, orderId: string}[] = [];

      setStatusText("Scanning pages and extracting data...");
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfJS.getPage(i);
        let sku = "";
        let orderId = "";

        if (settings.sortBy !== 'original') {
          try {
            const textContent = await page.getTextContent();
            const textString = textContent.items.map((item: any) => item.str).join(' ');
            
            const skuMatch = textString.match(/SKU\s*[:\-]?\s*([A-Za-z0-9\-_/]+)/i);
            const orderMatch = textString.match(/Order\s*(?:ID|No)?\s*[:\-]?\s*([A-Za-z0-9\-_]+)/i) || textString.match(/(?:OD|FMPC)\d+/i);
            
            if (skuMatch) sku = skuMatch[1];
            if (orderMatch) orderId = orderMatch[1] || orderMatch[0];
          } catch (e) {
            console.warn("Text extraction failed for page", i);
          }
        }
        pagesMetadata.push({ pageIndex: i, sku, orderId });
        setProgress(Math.round((i / numPages) * 20)); 
      }

      setStatusText("Sorting labels...");
      if (settings.sortBy === 'sku') {
        pagesMetadata.sort((a, b) => a.sku.localeCompare(b.sku));
      } else if (settings.sortBy === 'orderId') {
        pagesMetadata.sort((a, b) => a.orderId.localeCompare(b.orderId));
      }

      setStatusText("Processing True Vector PDF...");
      const { PDFDocument, PageSizes } = window.PDFLib;
      
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      const labelsDoc = await PDFDocument.create();
      const invoiceDoc = settings.separateInvoice ? await PDFDocument.create() : null;

      // Ensure margins are numbers, converted to points (1 inch = 72 points)
      const pmTop = (parseFloat(margins.page.top as any) || 0) * 72;
      const pmBot = (parseFloat(margins.page.bottom as any) || 0) * 72;
      const pmLeft = (parseFloat(margins.page.left as any) || 0) * 72;
      const pmRight = (parseFloat(margins.page.right as any) || 0) * 72;

      const lmTop = (parseFloat(margins.label.top as any) || 0) * 72;
      const lmBot = (parseFloat(margins.label.bottom as any) || 0) * 72;
      const lmLeft = (parseFloat(margins.label.left as any) || 0) * 72;
      const lmRight = (parseFloat(margins.label.right as any) || 0) * 72;

      for (let i = 0; i < pagesMetadata.length; i++) {
        const { pageIndex } = pagesMetadata[i];
        const sourcePage = sourceDoc.getPage(pageIndex - 1);
        const { width, height } = sourcePage.getSize(); 

        const cx = parseFloat(crop.x as any) || 0;
        const cy = parseFloat(crop.y as any) || 0;
        const cw = parseFloat(crop.width as any) || 100;
        const ch = parseFloat(crop.height as any) || 100;

        const left = width * (cx / 100);
        const right = left + (width * (cw / 100));
        const top = height - (height * (cy / 100));
        const bottom = top - (height * (ch / 100));

        const embeddedLabel = await labelsDoc.embedPage(sourcePage, { left, bottom, right, top });
        const srcW = right - left;
        const srcH = top - bottom;

        if (settings.outputFormat === 'thermal') {
          const newPage = labelsDoc.addPage([288, 432]);
          // For thermal, combine page + label margins to determine printable area
          const tLeft = pmLeft + lmLeft;
          const tRight = pmRight + lmRight;
          const tTop = pmTop + lmTop;
          const tBot = pmBot + lmBot;

          const maxW = Math.max(10, 288 - tLeft - tRight);
          const maxH = Math.max(10, 432 - tTop - tBot);
          
          const scale = Math.min(maxW / srcW, maxH / srcH);
          const drawW = srcW * scale;
          const drawH = srcH * scale;
          
          newPage.drawPage(embeddedLabel, {
            x: tLeft + (maxW - drawW) / 2, 
            y: tBot + (maxH - drawH) / 2, 
            width: drawW,
            height: drawH,
          });
        } else {
          // A4 Grid
          const pos = i % 4;
          let gridPage;
          if (pos === 0) gridPage = labelsDoc.addPage(PageSizes.A4);
          else gridPage = labelsDoc.getPages()[labelsDoc.getPageCount() - 1];

          // Calculate printable page area after outer Page Margins
          const printableW = PageSizes.A4[0] - pmLeft - pmRight;
          const printableH = PageSizes.A4[1] - pmTop - pmBot;

          // Divide printable area into 4 cells
          const cellW = printableW / 2;
          const cellH = printableH / 2;

          // Calculate grid cell origin
          const gridX = pmLeft + (pos % 2) * cellW;
          const gridY = pmBot + (pos < 2 ? cellH : 0); 

          // Apply inner Label Margins inside the cell
          const maxW = Math.max(10, cellW - lmLeft - lmRight);
          const maxH = Math.max(10, cellH - lmTop - lmBot);

          const scale = Math.min(maxW / srcW, maxH / srcH);
          const drawW = srcW * scale;
          const drawH = srcH * scale;

          gridPage.drawPage(embeddedLabel, {
            x: gridX + lmLeft + (maxW - drawW) / 2,
            y: gridY + lmBot + (maxH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }

        // Invoice Processing
        if (settings.separateInvoice && invoiceDoc) {
          const invLeft = 0;
          const invRight = width;
          const invTop = height * 0.50; 
          const invBottom = 0;

          const embeddedInvoice = await invoiceDoc.embedPage(sourcePage, {
            left: invLeft, bottom: invBottom, right: invRight, top: invTop
          });
          const invSrcW = invRight - invLeft;
          const invSrcH = invTop - invBottom;

          const invPos = i % 2;
          let invPage;
          if (invPos === 0) invPage = invoiceDoc.addPage(PageSizes.A4);
          else invPage = invoiceDoc.getPages()[invoiceDoc.getPageCount() - 1];

          // Apply Page Margins to the Invoice Page too
          const printableW = PageSizes.A4[0] - pmLeft - pmRight;
          const printableH = PageSizes.A4[1] - pmTop - pmBot;

          const cellW = printableW;
          const cellH = printableH / 2;
          const gridY = pmBot + (invPos === 0 ? cellH : 0);

          // Fixed minor padding inside invoice cell
          const maxW = cellW - 14.4;
          const maxH = cellH - 14.4;
          const scale = Math.min(maxW / invSrcW, maxH / invSrcH);
          const drawW = invSrcW * scale;
          const drawH = invSrcH * scale;

          invPage.drawPage(embeddedInvoice, {
            x: pmLeft + 7.2 + (maxW - drawW) / 2,
            y: gridY + 7.2 + (maxH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }

        setProgress(20 + Math.round(((i + 1) / pagesMetadata.length) * 80));
      }

      setStatusText("Saving files...");
      const labelsPdfBytes = await labelsDoc.save();
      downloadPdf(labelsPdfBytes, settings.outputFormat);
      
      if (settings.separateInvoice && invoiceDoc) {
        setTimeout(async () => {
          const invoicePdfBytes = await invoiceDoc.save();
          downloadPdf(invoicePdfBytes, 'Invoices');
        }, 1000); 
      }

    } catch (err) {
      console.error(err);
      setError("An error occurred. Make sure your PDF is not encrypted.");
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setStatusText("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-10 selection:bg-blue-200">
      
      {/* Merge Modal Overlay */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-bold flex items-center text-slate-700"><Files className="w-5 h-5 mr-2 text-[#047BD5]"/> Merge Multiple PDFs</h2>
              <button onClick={() => setIsMergeModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 flex-grow overflow-y-auto space-y-3">
              <div 
                onClick={() => mergeInputRef.current?.click()}
                className="border-2 border-dashed border-[#047BD5]/40 hover:bg-blue-50 cursor-pointer rounded-xl p-6 flex flex-col items-center justify-center text-center transition"
              >
                <Plus className="w-8 h-8 text-[#047BD5] mb-2" />
                <p className="text-sm font-bold text-slate-600">Tap to add PDF files</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">You can select multiple at once, or tap repeatedly to add them one by one.</p>
                <input type="file" multiple={true} accept=".pdf,application/pdf" ref={mergeInputRef} onChange={handleMergeFilesAdded} className="hidden" />
              </div>
              
              {mergeFiles.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase">Files to Merge ({mergeFiles.length})</h3>
                  {mergeFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-xs font-medium text-slate-700 truncate mr-2">{f.name}</span>
                      <button onClick={() => setMergeFiles(mergeFiles.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4"/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button 
                onClick={executeMerge}
                disabled={mergeFiles.length < 2 || isProcessing}
                className={`w-full py-3 rounded-xl font-bold text-white transition flex items-center justify-center
                  ${mergeFiles.length < 2 ? 'bg-slate-300' : 'bg-[#047BD5] hover:bg-blue-600 shadow-md'}`}
              >
                {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin mr-2"/> Merging {progress}%</> : 'Merge & Use Result'}
              </button>
              {mergeFiles.length < 2 && <p className="text-[10px] text-center text-slate-400 mt-2">Select at least 2 files to merge</p>}
            </div>
          </div>
        </div>
      )}

      <header className="bg-[#047BD5] text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Scissors className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">FK Label Master</h1>
          </div>
          <button 
            onClick={() => setIsMergeModalOpen(true)}
            className="flex items-center text-xs font-bold bg-white/20 hover:bg-white/30 transition px-3 py-1.5 rounded-lg backdrop-blur-sm"
          >
            <Files className="w-4 h-4 mr-1.5" /> Merge PDFs
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-5 mt-2">
        {!librariesLoaded && (
          <div className="flex items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-slate-200">
            <Loader2 className="w-5 h-5 animate-spin text-[#047BD5] mr-3" />
            <span className="text-sm font-medium text-slate-600">Initializing Vector Engine...</span>
          </div>
        )}

        {/* Upload Section */}
        <div className={`transition-all ${pdfFile && !showCropSettings && !showMarginSettings ? 'opacity-80 scale-[0.98]' : 'opacity-100'}`}>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Step 1: Upload File</h2>
          <div 
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all bg-white shadow-sm
              ${pdfFile ? 'border-green-400 bg-green-50' : 'border-[#047BD5]/40 hover:bg-blue-50 cursor-pointer'}`}
          >
            {pdfFile ? (
              <>
                <FileText className="w-10 h-10 text-green-500 mb-2" />
                <p className="font-bold text-slate-700 text-center">{fileName}</p>
                <p className="text-xs text-slate-500">{totalPages} Orders Detected</p>
                {!isProcessing && (
                  <button onClick={(e) => { e.stopPropagation(); setPdfFile(null); }} className="mt-3 text-xs text-[#047BD5] font-semibold bg-blue-100 px-4 py-1.5 rounded-full hover:bg-blue-200 transition">
                    Change File
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-[#047BD5]/10 rounded-full flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7 text-[#047BD5]" />
                </div>
                <h2 className="text-base font-bold text-slate-700 mb-1">Tap to select PDF</h2>
                <p className="text-xs text-slate-500 text-center max-w-xs">
                  Upload your raw Flipkart shipping labels (A4 size).
                </p>
              </>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,application/pdf" className="hidden" />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start shadow-sm">
            <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Configuration Section */}
        {pdfFile && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider ml-2">Step 2: Configuration</h2>
              </div>
              <div className="p-5 space-y-6">
                
                {/* Format Options */}
                <div>
                  <label className="flex items-center text-sm font-bold text-slate-700 mb-3">
                    <LayoutGrid className="w-4 h-4 mr-2 text-blue-500" /> Output Format
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSettings({...settings, outputFormat: 'a4-grid'})}
                      className={`py-3 px-2 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center justify-center gap-1
                        ${settings.outputFormat === 'a4-grid' ? 'border-[#047BD5] bg-blue-50 text-[#047BD5]' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                    >
                      <LayoutGrid className="w-5 h-5 mb-1" />
                      <span>A4 Sticky Page</span>
                      <span className="text-[10px] opacity-70">4 labels per page</span>
                    </button>
                    <button
                      onClick={() => setSettings({...settings, outputFormat: 'thermal'})}
                      className={`py-3 px-2 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center justify-center gap-1
                        ${settings.outputFormat === 'thermal' ? 'border-[#047BD5] bg-blue-50 text-[#047BD5]' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                    >
                      <Printer className="w-5 h-5 mb-1" />
                      <span>Thermal Printer</span>
                      <span className="text-[10px] opacity-70">4x6 inch format</span>
                    </button>
                  </div>
                </div>

                {/* Sorting */}
                <div>
                  <label className="flex items-center text-sm font-bold text-slate-700 mb-3">
                    <SortAsc className="w-4 h-4 mr-2 text-blue-500" /> Smart Sorting
                  </label>
                  <select 
                    value={settings.sortBy}
                    onChange={(e) => setSettings({...settings, sortBy: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-[#047BD5] focus:border-[#047BD5] block p-3 outline-none"
                  >
                    <option value="original">Original Order (No sorting)</option>
                    <option value="sku">Sort alphabetically by SKU</option>
                    <option value="orderId">Sort by Order ID</option>
                  </select>
                </div>

                {/* Invoice Toggle */}
                <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50">
                  <div className="flex items-start">
                    <Receipt className="w-5 h-5 mr-3 text-blue-500 mt-0.5" />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">Separate Invoices</span>
                      <span className="text-[11px] text-slate-500 mt-0.5 leading-tight">Create a 2nd PDF with bottom tax invoices</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings({...settings, separateInvoice: !settings.separateInvoice})}
                    className={`${settings.separateInvoice ? 'bg-[#047BD5]' : 'bg-slate-300'} relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out`}
                  >
                    <span className={`${settings.separateInvoice ? 'translate-x-5' : 'translate-x-0'} inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ease-in-out`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Comprehensive Margin Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <button 
                onClick={() => setShowMarginSettings(!showMarginSettings)}
                className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition"
              >
                <div className="flex items-center text-sm font-bold text-slate-700">
                  <LayoutGrid className="w-4 h-4 mr-2 text-slate-400" /> Margin Settings (Inches)
                </div>
                {showMarginSettings ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {showMarginSettings && (
                <div className="p-5 pt-0 border-t border-slate-100 space-y-6">
                  
                  {/* A4 Page Margins */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 bg-slate-200 p-2 rounded-lg mb-3">A4 Page Margins (Outer Edges)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Top", field: "top" },
                        { label: "Bottom", field: "bottom" },
                        { label: "Left", field: "left" },
                        { label: "Right", field: "right" }
                      ].map((item) => (
                        <div key={`page-${item.field}`}>
                          <label className="text-[11px] font-bold text-slate-500 block mb-1">{item.label}</label>
                          <input 
                            type="number" step="0.05" min="0" value={margins.page[item.field as keyof typeof margins.page]} 
                            onChange={(e) => handleMarginChange(e, 'page', item.field)} 
                            onBlur={() => handleMarginBlur('page', item.field)}
                            className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#047BD5]" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Label Margins */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 bg-slate-200 p-2 rounded-lg mb-3">Label Margins (Inside Grid Cell)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Top", field: "top" },
                        { label: "Bottom", field: "bottom" },
                        { label: "Left", field: "left" },
                        { label: "Right", field: "right" }
                      ].map((item) => (
                        <div key={`label-${item.field}`}>
                          <label className="text-[11px] font-bold text-slate-500 block mb-1">{item.label}</label>
                          <input 
                            type="number" step="0.05" min="0" value={margins.label[item.field as keyof typeof margins.label]} 
                            onChange={(e) => handleMarginChange(e, 'label', item.field)} 
                            onBlur={() => handleMarginBlur('label', item.field)}
                            className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#047BD5]" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button onClick={saveSettingsToStorage} className="flex items-center bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-200 transition">
                      <Save className="w-3 h-3 mr-1.5" /> Save Margins
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Decimal Crop Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <button 
                onClick={() => setShowCropSettings(!showCropSettings)}
                className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition"
              >
                <div className="flex items-center text-sm font-bold text-slate-700">
                  <Settings className="w-4 h-4 mr-2 text-slate-400" /> Advanced Crop Settings (%)
                </div>
                {showCropSettings ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>

              {showCropSettings && (
                <div className="p-5 pt-0 border-t border-slate-100 space-y-6">
                  
                  <div className="bg-slate-100 rounded-xl p-3 flex flex-col items-center justify-center mt-4">
                    <h3 className="text-xs font-bold text-slate-500 mb-2 w-full flex items-center"><Maximize className="w-3 h-3 mr-1" /> Live Preview (Page 1)</h3>
                    <div className="relative shadow-md overflow-hidden bg-white">
                      <canvas ref={previewCanvasRef} className="block max-w-full h-auto bg-white" />
                      <div 
                        className="absolute border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none"
                        style={{
                          top: `${parseFloat(crop.y as any) || 0}%`,
                          left: `${parseFloat(crop.x as any) || 0}%`,
                          width: `${parseFloat(crop.width as any) || 0}%`,
                          height: `${parseFloat(crop.height as any) || 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-5">
                    {[
                      { label: "Top Position", field: "y", min: 0 },
                      { label: "Left Position", field: "x", min: 0 },
                      { label: "Crop Height", field: "height", min: 10 },
                      { label: "Crop Width", field: "width", min: 10 }
                    ].map((item) => (
                      <div key={item.field}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-bold text-slate-600">{item.label}</label>
                          <input 
                            type="number" step="0.1" value={crop[item.field as keyof typeof crop]} 
                            onChange={(e) => handleCropChange(e, item.field)} 
                            onBlur={() => handleCropBlur(item.field)}
                            className="w-24 px-2 py-1 text-right text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#047BD5]" 
                          />
                        </div>
                        <input type="range" min={item.min} max="100" step="0.1" value={crop[item.field as keyof typeof crop] === '' ? item.min : crop[item.field as keyof typeof crop]} onChange={(e) => handleCropChange(e, item.field)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#047BD5]" />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button onClick={() => setCrop(defaultCrop)} className="text-xs text-slate-500 underline py-2 hover:text-slate-800">
                      Reset to Default
                    </button>
                    <button onClick={saveSettingsToStorage} className="flex items-center bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-200 transition">
                      <Save className="w-3 h-3 mr-1.5" /> Save Crop
                    </button>
                  </div>
                  {saveMessage && <p className="text-xs text-green-600 font-medium text-right mt-1">{saveMessage}</p>}
                </div>
              )}
            </div>

            {/* Action Button */}
            <button 
              onClick={processPDF}
              disabled={isProcessing}
              className={`w-full flex flex-col items-center justify-center py-4 px-4 rounded-xl text-white transition-all shadow-md mt-4
                ${isProcessing ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#047BD5] hover:bg-blue-600 hover:shadow-lg active:scale-[0.98]'}`}
            >
              {isProcessing ? (
                <>
                  <div className="flex items-center space-x-2 font-bold mb-1">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing {progress}%</span>
                  </div>
                  <span className="text-[10px] font-medium opacity-90">{statusText}</span>
                  <div className="w-full bg-slate-600/20 rounded-full h-1.5 mt-2">
                    <div className="bg-white h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-2 font-bold text-base">
                  <Download className="w-5 h-5" />
                  <span>Process & Download</span>
                </div>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
